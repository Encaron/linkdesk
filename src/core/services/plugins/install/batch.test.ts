/**
 * 批量计划单测——分组/排序/计数/去重/溢出（spec §五、§5.1、§5.2）。
 */

import { describe, expect, it } from "vitest";
import type { PluginInstallRequest, PluginSourceIdentity } from "../../../api/linkdesk-api/types";
import { buildConfirmPlan } from "./batch";
import { OFFICIAL_SOURCE_ID } from "./policy";
import type { PolicyContext } from "./types";

const OFFICIAL: PluginSourceIdentity = {
  id: OFFICIAL_SOURCE_ID,
  url: "https://github.com/Encaron/linkdesk-marketplace",
  repo: "Encaron/linkdesk-marketplace",
  publisher: "Encaron",
};
const THIRD: PluginSourceIdentity = {
  id: "example-source",
  url: "https://example.dev/source",
  repo: "example/market",
  publisher: "example",
};

function req(pluginId: string, source: PluginSourceIdentity, version = "2.0.0"): PluginInstallRequest {
  return {
    mode: "update",
    pluginId,
    version,
    downloadUrl: `https://example.dev/${pluginId}.zip`,
    sha256: "a".repeat(64),
    source,
    display: { name: pluginId },
  };
}

/**
 * 假的判定上下文——默认「已装 1.0.0 且来源与请求一致」（= 同源更新场景）；
 * 要构造首装/来源变更，把 `known` 里对应项设成 null / 另一个身份。
 */
function ctxFor(
  reqs: readonly PluginInstallRequest[],
  opts: {
    installed?: Record<string, string | null>;
    known?: Record<string, PluginSourceIdentity | null>;
    silentOfficial?: boolean;
    silentTrustedSources?: boolean;
    trusted?: string[];
  } = {},
): PolicyContext {
  const known = new Map<string, PluginSourceIdentity | null>(
    reqs.map((r) => [r.pluginId, opts.known?.[r.pluginId] !== undefined ? opts.known[r.pluginId] : r.source]),
  );
  return {
    policy: {
      silentOfficial: opts.silentOfficial ?? true,
      silentTrustedSources: opts.silentTrustedSources ?? false,
    },
    isTrusted: (id) => id === OFFICIAL_SOURCE_ID || (opts.trusted ?? []).includes(id),
    labelOf: (s) => (s.id === OFFICIAL_SOURCE_ID ? "官方目录" : (s.repo ?? s.id)),
    facts: (pluginId) => ({
      installedVersion: opts.installed?.[pluginId] !== undefined ? opts.installed[pluginId] : "1.0.0",
      knownSource: known.get(pluginId) ?? null,
    }),
  };
}

describe("buildConfirmPlan —— 分组与排序", () => {
  it("混合来源：ask 组在前、silent 组在后；组内保持请求顺序", () => {
    const reqs = [
      req("official-a", OFFICIAL),
      req("third-a", THIRD),
      req("official-b", OFFICIAL),
      req("third-b", THIRD),
    ];
    const plan = buildConfirmPlan(reqs, ctxFor(reqs, { silentOfficial: true, silentTrustedSources: false }));

    // 官方免问 → silent；第三方未信任 → ask
    expect(plan.ask.map((i) => i.request.pluginId)).toEqual(["third-a", "third-b"]);
    expect(plan.silent.map((s) => s.pluginId)).toEqual(["official-a", "official-b"]);
    // 分组：ask 组（第三方）在前
    expect(plan.groups.map((g) => g.sourceId)).toEqual([THIRD.id, OFFICIAL_SOURCE_ID]);
    expect(plan.groups[0]).toMatchObject({
      label: "example/market",
      trusted: false,
      silentAllowed: false,
      askCount: 2,
      silentCount: 0,
    });
    expect(plan.groups[1]).toMatchObject({
      label: "官方目录",
      trusted: true,
      silentAllowed: true,
      askCount: 0,
      silentCount: 2,
    });
  });

  it("全免问：ask 为空（调用方据此不弹卡，spec §五.3）", () => {
    const reqs = [req("official-a", OFFICIAL)];
    const plan = buildConfirmPlan(reqs, ctxFor(reqs, { silentOfficial: true }));
    expect(plan.ask).toHaveLength(0);
    expect(plan.silent).toHaveLength(1);
    expect(plan.totals).toEqual({ total: 1, ask: 0, silent: 1 });
  });

  it("全要问：silent 为空、只列 ask", () => {
    const reqs = [req("third-a", THIRD), req("third-b", THIRD)];
    const plan = buildConfirmPlan(reqs, ctxFor(reqs));
    expect(plan.ask).toHaveLength(2);
    expect(plan.silent).toHaveLength(0);
  });

  it("第三方已信任 + 开关开 → 整批不弹（spec §5.1 第二行）", () => {
    const reqs = [req("official-a", OFFICIAL), req("third-a", THIRD)];
    const plan = buildConfirmPlan(
      reqs,
      ctxFor(reqs, { silentOfficial: true, silentTrustedSources: true, trusted: ["example-source"] }),
    );
    expect(plan.ask).toHaveLength(0);
    expect(plan.silent).toHaveLength(2);
  });

  it("silentAllowed 反映开关（渲染体照抄，⛔ 自己按开关推）", () => {
    const reqs = [req("official-a", OFFICIAL)];
    const plan = buildConfirmPlan(reqs, ctxFor(reqs, { silentOfficial: false }));
    expect(plan.groups[0].silentAllowed).toBe(false);
    expect(plan.groups[0].trusted).toBe(true);
  });

  it("首装项带 first-install 原因；同批其余按同源规则", () => {
    const reqs = [req("fresh", THIRD), req("official-a", OFFICIAL)];
    const plan = buildConfirmPlan(reqs, ctxFor(reqs, { known: { fresh: null }, installed: { fresh: null } }));
    expect(plan.ask[0]).toMatchObject({ reason: "first-install" });
    expect(plan.silent.map((s) => s.pluginId)).toEqual(["official-a"]);
  });
});

describe("buildConfirmPlan —— 去重与拒项", () => {
  it("同 pluginId 第二次出现 → rejected(duplicate-request)，且只入 plan 一次", () => {
    // 夹具 id 走常量（硬约束 10：壳代码里不出现裸 pluginId 比较——测试同受此约束）
    const DUP_ID = "demo-dup";
    const reqs = [req(DUP_ID, OFFICIAL), req(DUP_ID, OFFICIAL)];
    const plan = buildConfirmPlan(reqs, ctxFor(reqs));
    expect(plan.silent.filter((s) => s.pluginId === DUP_ID)).toHaveLength(1);
    expect(plan.rejected).toEqual([{ pluginId: DUP_ID, reason: "invalid", message: "duplicate-request" }]);
    expect(plan.totals.total).toBe(1);
  });

  it("拒项不进分组、不进 totals", () => {
    const reqs = [req("same", OFFICIAL, "1.0.0")];
    const plan = buildConfirmPlan(reqs, ctxFor(reqs));
    expect(plan.rejected).toHaveLength(1);
    expect(plan.groups).toHaveLength(0);
    expect(plan.totals).toEqual({ total: 0, ask: 0, silent: 0 });
  });
});

describe("buildConfirmPlan —— 20+ 溢出（spec §5.2：不截断，滚动区由渲染体负责）", () => {
  it("24 条全部进计划，计数正确", () => {
    const reqs = [
      ...Array.from({ length: 3 }, (_, i) => req(`third-${i}`, THIRD)),
      ...Array.from({ length: 21 }, (_, i) => req(`official-${i}`, OFFICIAL)),
    ];
    const plan = buildConfirmPlan(reqs, ctxFor(reqs, { silentOfficial: true }));
    expect(plan.totals).toEqual({ total: 24, ask: 3, silent: 21 });
    expect(plan.ask).toHaveLength(3);
    expect(plan.silent).toHaveLength(21);
  });

  it("顺序稳定：连续两次构建结果一致（派生数据可复现）", () => {
    const reqs = [req("a", THIRD), req("b", OFFICIAL), req("c", THIRD)];
    const ctx = ctxFor(reqs);
    expect(buildConfirmPlan(reqs, ctx)).toEqual(buildConfirmPlan(reqs, ctx));
  });
});
