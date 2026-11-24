/**
 * 两步确认编排单测（D1′）——`prepareInstall` / `commitInstall` / `discardInstall` 的**行为契约**。
 *
 * 盯死四件事（这四条一破，"UI 归市场"就变成"市场能绕过确认"）：
 *   ① `prepare` 零副作用（不执行、不写账本、不弹 UI）；
 *   ② 不 `commit` ⇒ 什么都不发生；
 *   ③ `commit` 一次性（第二次 `unknown-plan`）；
 *   ④ `requestInstall` 快捷路径 = prepare + 默认卡 + commit，取消则 0 执行。
 *
 * 依赖全 mock：执行端口（`setInstallExecutor`）、渲染器（`setConfirmRenderer`）、
 * 账本/信任（I/O 面）、通知与 i18n（与判定无关）。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginConfirmPlan, PluginInstallRequest } from "../../../api/linkdesk-api/types";

const executed: string[] = [];
const recorded: string[] = [];

// 账本：demo-plugin 记着"来自官方源"（= 同源更新场景）；其余插件无记录（= 首装/来源变更）
const KNOWN_OFFICIAL = {
  sourceId: "official",
  sourceUrl: "https://example.dev/marketplace.json",
  repo: undefined,
  publisher: undefined,
  version: "1.0.0",
  sha256: undefined,
  installedAt: "2026-11-01T00:00:00.000Z",
  seenAt: "2026-11-01T00:00:00.000Z",
};

vi.mock("./ledger", () => ({
  getSourceIdentity: vi.fn(async (id: string) => (id === "demo-plugin" ? KNOWN_OFFICIAL : null)),
  recordSourceIdentity: vi.fn(async (id: string) => {
    recorded.push(id);
  }),
}));

vi.mock("./trust", () => ({
  DEFAULT_POLICY: { silentOfficial: true, silentTrustedSources: false },
  POLICY_KEYS: { silentOfficial: "a", silentTrustedSources: "b", trustedSources: "c" },
  getUpdatePolicy: () => ({ silentOfficial: true, silentTrustedSources: false }),
  setUpdatePolicy: vi.fn(async () => ({ silentOfficial: true, silentTrustedSources: false })),
  isSourceTrusted: () => false,
  sourceLabel: (s: { id: string }) => s.id,
  listSourceTrust: vi.fn(async () => []),
  trustSource: vi.fn(async () => []),
  untrustSource: vi.fn(async () => []),
}));

vi.mock("../../ui/DialogService", () => ({ confirm: vi.fn(async () => true) }));
vi.mock("../../ui/NotificationService", () => ({ pushToast: vi.fn(), showTransientToast: vi.fn() }));
vi.mock("../../../../i18n", () => ({ default: { t: (k: string) => k } }));

import {
  commitInstall,
  discardInstall,
  prepareInstall,
  prepareUpdateBatch,
  requestInstall,
  setConfirmRenderer,
  setInstallExecutor,
} from "./confirm-service";
import { __resetPlanHandlesForTests } from "./plan-handles";
import { __resetInstallTokensForTests } from "./token";

const REQ: PluginInstallRequest = {
  mode: "install",
  pluginId: "demo-plugin",
  version: "1.0.0",
  downloadUrl: "https://example.dev/demo.zip",
  sha256: "a".repeat(64),
  source: { id: "official", url: "https://example.dev/marketplace.json" },
  display: { name: "Demo" },
};

const UPD: PluginInstallRequest = { ...REQ, mode: "update", version: "2.0.0", pluginId: "demo-plugin" };

function executor(installed: string | null = "1.0.0") {
  return {
    install: vi.fn(async (r: PluginInstallRequest) => {
      executed.push(`install:${r.pluginId}`);
      return { success: true };
    }),
    update: vi.fn(async (r: PluginInstallRequest) => {
      executed.push(`update:${r.pluginId}`);
      return { success: true };
    }),
    installedVersion: vi.fn(async () => installed),
  };
}

beforeEach(() => {
  executed.length = 0;
  recorded.length = 0;
  __resetPlanHandlesForTests();
  __resetInstallTokensForTests();
  setInstallExecutor(null);
  setConfirmRenderer(null);
});

describe("prepareInstall / commitInstall", () => {
  it("prepare 零副作用：不执行、不记账", async () => {
    const ex = executor(null);
    setInstallExecutor(ex);
    const { planId, plan } = await prepareInstall(REQ);
    expect(planId).toMatch(/^plan-/);
    expect(plan.totals.ask).toBe(1);
    expect(plan.ask[0].reason).toBe("first-install");
    expect(ex.install).not.toHaveBeenCalled();
    expect(recorded).toHaveLength(0);
  });

  it("不 commit ⇒ 什么都不发生（只 prepare 不执行）", async () => {
    const ex = executor(null);
    setInstallExecutor(ex);
    await prepareInstall(REQ);
    expect(ex.install).not.toHaveBeenCalled();
  });

  it("commit 执行一次并记来源；第二次 = unknown-plan（一次性）", async () => {
    const ex = executor(null);
    setInstallExecutor(ex);
    const { planId } = await prepareInstall(REQ);
    expect(await commitInstall(planId)).toEqual({ confirmed: true, ok: true, error: undefined });
    expect(ex.install).toHaveBeenCalledTimes(1);
    expect(recorded).toEqual(["demo-plugin"]);
    expect(await commitInstall(planId)).toEqual({ confirmed: false, reason: "unknown-plan" });
  });

  it("discard 后 commit ⇒ unknown-plan，且从未执行", async () => {
    const ex = executor(null);
    setInstallExecutor(ex);
    const { planId } = await prepareInstall(REQ);
    await discardInstall(planId);
    expect(await commitInstall(planId)).toEqual({ confirmed: false, reason: "unknown-plan" });
    expect(ex.install).not.toHaveBeenCalled();
  });

  it("commit({confirmed:false}) = 用户取消：不执行", async () => {
    const ex = executor(null);
    setInstallExecutor(ex);
    const { planId } = await prepareInstall(REQ);
    expect(await commitInstall(planId, { confirmed: false })).toEqual({
      confirmed: false,
      cancelled: true,
      reason: "user-cancelled",
    });
    expect(ex.install).not.toHaveBeenCalled();
  });

  it("被拒的计划（同版本）⇒ commit 回 rejected，不执行", async () => {
    const ex = executor("9.9.9");
    setInstallExecutor(ex);
    const { planId, plan } = await prepareInstall({ ...UPD, version: "9.9.9" });
    expect(plan.totals.total).toBe(0);
    expect(await commitInstall(planId)).toEqual({ confirmed: false, reason: "rejected" });
    expect(ex.update).not.toHaveBeenCalled();
  });

  it("用句柄里的**原请求**执行（⛔ 调用方另传参数改不了目标版本）", async () => {
    const ex = executor("1.0.0");
    setInstallExecutor(ex);
    const { planId } = await prepareInstall(UPD);
    await commitInstall(planId);
    const passed = ex.update.mock.calls[0][0] as PluginInstallRequest;
    expect(passed.version).toBe("2.0.0");
    expect(passed.downloadUrl).toBe(UPD.downloadUrl);
  });
});

describe("prepareUpdateBatch", () => {
  it("一张计划含 ask/silent/分组；commit 批量全部执行并出汇总", async () => {
    const ex = executor("1.0.0");
    setInstallExecutor(ex);
    const third: PluginInstallRequest = {
      ...UPD,
      pluginId: "third-a",
      source: { id: "lab", url: "https://lab.dev/m.json", repo: "lab/m" },
    };
    const { planId, plan } = await prepareUpdateBatch([UPD, third]);
    // demo-plugin 账本记着官方源 ⇒ 同源更新免问；third-a 无账本记录 ⇒ 按来源变更问
    expect(plan.totals).toEqual({ total: 2, ask: 1, silent: 1 });
    expect(plan.groups.map((g) => g.sourceId)).toEqual(["lab", "official"]);
    expect(await commitInstall(planId)).toEqual({ confirmed: true, ok: true });
    expect(ex.update).toHaveBeenCalledTimes(2);
  });

  it("批量 commit 后句柄同样一次性", async () => {
    const ex = executor("1.0.0");
    setInstallExecutor(ex);
    const { planId } = await prepareUpdateBatch([UPD]);
    await commitInstall(planId);
    expect(await commitInstall(planId)).toEqual({ confirmed: false, reason: "unknown-plan" });
  });
});

describe("requestInstall 快捷路径（= prepare + 默认卡 + commit）", () => {
  it("用户确认 ⇒ 执行一次", async () => {
    const ex = executor(null);
    setInstallExecutor(ex);
    setConfirmRenderer({ present: vi.fn(async () => true) });
    expect(await requestInstall(REQ)).toMatchObject({ confirmed: true, ok: true });
    expect(ex.install).toHaveBeenCalledTimes(1);
  });

  it("用户取消 ⇒ 0 执行、句柄释放", async () => {
    const ex = executor(null);
    setInstallExecutor(ex);
    const present = vi.fn(async () => false);
    setConfirmRenderer({ present });
    expect(await requestInstall(REQ)).toEqual({ confirmed: false, cancelled: true, reason: "user-cancelled" });
    expect(present).toHaveBeenCalledTimes(1);
    expect(ex.install).not.toHaveBeenCalled();
  });

  it("被拒的请求根本不弹卡", async () => {
    const ex = executor("2.0.0");
    setInstallExecutor(ex);
    const present = vi.fn(async (_p: PluginConfirmPlan) => true);
    setConfirmRenderer({ present });
    const r = await requestInstall({ ...UPD, version: "1.5.0" }); // 降级未放行
    expect(r).toEqual({ confirmed: false, reason: "invalid" });
    expect(present).not.toHaveBeenCalled();
  });
});
