/**
 * AI 发起的安装/更新——**可辨认**（2026-11-25 线 1 拍板 + 线 3 落地）。
 *
 * 三条判据：
 *   ① `requestedBy`/`aiReason` 随 request 进 plan（卡片/命令面同源）；
 *   ② AI 理由**壳侧 500 字硬截断**（不可信自由文本，只在 `buildConfirmPlan` 收口一次）；
 *   ③ 卡片 VM 里多出「发起方：AI」行与「AI 说明」块；非 AI 请求**一个都不多**。
 */

import { describe, expect, it } from "vitest";
import type { PluginInstallRequest, PluginSourceIdentity } from "../../../api/linkdesk-api/types";
import { buildConfirmPlan } from "../install/batch";
import { OFFICIAL_SOURCE_ID } from "../install/policy";
import type { PolicyContext } from "../install/types";
import { buildInstallVM } from "../../../../components/shared/plugin-install-confirm/buildViewModel";
import type { PluginInstallConfirmLabels } from "../../../../components/shared/plugin-install-confirm/types";

const OFFICIAL: PluginSourceIdentity = {
  id: OFFICIAL_SOURCE_ID,
  url: "https://github.com/Encaron/linkdesk-marketplace",
  repo: "Encaron/linkdesk-marketplace",
  publisher: "Encaron",
};

function req(extra: Partial<PluginInstallRequest> = {}): PluginInstallRequest {
  return {
    mode: "update",
    pluginId: "demo-plugin",
    version: "1.1.0",
    downloadUrl: "https://example.dev/demo.linkdesk-plugin",
    sha256: "a".repeat(64),
    source: OFFICIAL,
    display: { name: "演示插件", size: 2048 },
    ...extra,
  };
}

function ctxFor(_r: PluginInstallRequest, silentOfficial = false): PolicyContext {
  return {
    policy: { silentOfficial, silentTrustedSources: false },
    isTrusted: (id: string) => id === OFFICIAL_SOURCE_ID,
    labelOf: (s: PluginSourceIdentity) => (s.id === OFFICIAL_SOURCE_ID ? "官方目录" : (s.repo ?? s.id)),
    facts: () => ({ installedVersion: "1.0.0", knownSource: OFFICIAL, missingDeps: [] }),
    forceAsk: false,
  } as unknown as PolicyContext;
}

const L = new Proxy({}, { get: (_t, k) => String(k) }) as unknown as PluginInstallConfirmLabels;

describe("requestedBy / aiReason 进 plan 与卡片", () => {
  it("AI 请求：plan item 带原话，VM 出「发起方」行 + 「AI 说明」块", () => {
    const plan = buildConfirmPlan([req({ requestedBy: "ai", aiReason: "用户让我升级这个插件" })], ctxFor(req()));
    const item = plan.ask[0];
    expect(item.request.requestedBy).toBe("ai");

    const vm = buildInstallVM(plan, L, "0.9.0");
    expect(vm.rows.some((r) => r.k === "originLabel" && r.v === "originAI")).toBe(true);
    expect(vm.aiNote?.body).toBe("用户让我升级这个插件");
  });

  it("用户请求：不出发起方行、不出 AI 说明块", () => {
    const plan = buildConfirmPlan([req()], ctxFor(req()));
    const vm = buildInstallVM(plan, L, "0.9.0");
    expect(vm.rows.some((r) => r.k === "originLabel")).toBe(false);
    expect(vm.aiNote).toBeUndefined();
  });

  it("aiReason 超 500 字 ⇒ 壳侧截断（且只截一次，卡片拿到的是截断后的）", () => {
    const long = "理".repeat(600);
    const plan = buildConfirmPlan([req({ requestedBy: "ai", aiReason: long })], ctxFor(req()));
    const body = plan.ask[0].request.aiReason ?? "";
    expect(body.length).toBe(501); // 500 + 省略号
    expect(body.endsWith("…")).toBe(true);
    expect(buildInstallVM(plan, L, null).aiNote?.body).toBe(body);
  });

  it("requestedBy 不是 ai 时 aiReason 不被采用（不出块）", () => {
    const plan = buildConfirmPlan([req({ aiReason: "混进来的理由" })], ctxFor(req()));
    const vm = buildInstallVM(plan, L, null);
    expect(vm.aiNote).toBeUndefined();
  });
});
