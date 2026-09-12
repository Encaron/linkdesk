/**
 * updateCommands 测试——E6#57.10 主软件更新入口命令。
 *
 * 逐条钉住 `updateCommands.ts` 的三条设计约束——它们**全是"写错了也照样能跑"的那种**：
 *   ① `update.checkForUpdates` 必须带 `context=true`（手动）——传 false 会把自己降级成后台检查，
 *      UI 上完全看不出来，只是「顺手一点这个入口什么都不发生」；
 *   ② `update.openUpdateFlow` 必须**读权威态**（`getState()`）再分支，不是读壳侧缓存；
 *   ③ 九态映射里 `downloading` / `updating` / 其余态**必须无动作**——尤其 `downloading`
 *      重复调 `downloadUpdate()` 会再起一条下载链（负控用例钉住）。
 * 外加命令注册面（两条 id / 恒显无 when / category「帮助」）与非壳环境退化（不抛）。
 *
 * fixture 全虚构（硬约束 21）：版本号 9.9.9 / 0.0.1，URL 走 `.invalid` 保留域。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { executeCommand, clearCommands, getCommand } from "../../registry/commands/CommandRegistry";
import { clearMenus } from "../../registry/commands/MenuRegistry";
import { clearRegistrationLayers } from "../../registry/registrationTracker";
import type { UpdateInfo, UpdateState } from "../../types/ipc/update";
import { registerUpdateCommands } from "./updateCommands";

/** 更新描述桩——字段值全虚构（`.invalid` = RFC 2606 保留域，永不解析） */
const INFO: UpdateInfo = {
  version: "9.9.9",
  currentVersion: "0.0.1",
  publishedAt: "2026-01-01T00:00:00Z",
  releaseNotesUrl: "https://demo.invalid/releases/v9.9.9",
};

interface Calls {
  checkForUpdates: boolean[];
  downloadUpdate: number;
  quitAndInstall: number;
}

/**
 * 装壳 preload 的 `window.linkdesk.update` 桩——`state` 决定 `getState()` 回什么
 * （② 的被测点：分支依据必须来自这里，不是别处）。
 */
function installStub(state: UpdateState): Calls {
  const calls: Calls = { checkForUpdates: [], downloadUpdate: 0, quitAndInstall: 0 };
  const update = {
    getState: async () => state,
    onStateChanged: () => () => {},
    checkForUpdates: async (context: boolean) => { calls.checkForUpdates.push(context); return state; },
    downloadUpdate: async () => { calls.downloadUpdate += 1; return state; },
    quitAndInstall: async () => { calls.quitAndInstall += 1; },
  };
  (window as unknown as { linkdesk: unknown }).linkdesk = { update };
  return calls;
}

beforeEach(() => {
  clearRegistrationLayers();
  clearCommands();
  clearMenus();
  registerUpdateCommands();
});

afterEach(() => {
  delete (window as unknown as { linkdesk?: unknown }).linkdesk;
  vi.restoreAllMocks();
});

describe("registerUpdateCommands——命令注册面（E6#57.10）", () => {
  it("注册恰好两条命令，id/title/category 如上（帮助菜单引用同一条）", () => {
    expect(getCommand("update.checkForUpdates")).toMatchObject({ title: "检查更新…", category: "帮助" });
    expect(getCommand("update.openUpdateFlow")).toMatchObject({ title: "处理更新", category: "帮助" });
  });

  it("两条命令都恒显——when 未设（入口存在 ≠ 能力承诺，manual 档不禁手动检查）", () => {
    expect(getCommand("update.checkForUpdates")?.when).toBeUndefined();
    expect(getCommand("update.openUpdateFlow")?.when).toBeUndefined();
  });
});

describe("update.checkForUpdates", () => {
  it("执行 → checkForUpdates(true)：手动语境（false 会静默降级成后台检查，UI 看不出）", async () => {
    const calls = installStub({ type: "idle" });

    await executeCommand("update.checkForUpdates");

    expect(calls.checkForUpdates).toEqual([true]);
  });

  it("无壳 update 面（vitest 裸 jsdom / 纯 Vite 预览）→ 静默 no-op，不抛", async () => {
    await expect(executeCommand("update.checkForUpdates")).resolves.toBeUndefined();
  });
});

describe("update.openUpdateFlow——九态分支（③ 尤其钉住不重复触发）", () => {
  it("available → 开始下载；不碰安装", async () => {
    const calls = installStub({ type: "available", update: INFO });

    await executeCommand("update.openUpdateFlow");

    expect(calls.downloadUpdate).toBe(1);
    expect(calls.quitAndInstall).toBe(0);
  });

  it("downloaded → 重启并安装；不重下", async () => {
    const calls = installStub({ type: "downloaded", update: INFO });

    await executeCommand("update.openUpdateFlow");

    expect(calls.quitAndInstall).toBe(1);
    expect(calls.downloadUpdate).toBe(0);
  });

  it("ready（downloaded 的提示态）→ 同样重启并安装", async () => {
    const calls = installStub({ type: "ready", update: INFO });

    await executeCommand("update.openUpdateFlow");

    expect(calls.quitAndInstall).toBe(1);
    expect(calls.downloadUpdate).toBe(0);
  });

  it("🔴 downloading → 两个都不调（进度已在跑，重复触发 = 再起一条下载链）", async () => {
    const calls = installStub({
      type: "downloading",
      update: INFO,
      progress: { transferred: 1, total: 10, percent: 10 },
    });

    await executeCommand("update.openUpdateFlow");

    expect(calls.downloadUpdate).toBe(0);
    expect(calls.quitAndInstall).toBe(0);
  });

  it.each<UpdateState>([
    { type: "uninitialized" },
    { type: "disabled", reason: "demo-disabled" },
    { type: "idle" },
    { type: "checking" },
    { type: "updating", update: INFO },
  ])("$type → 无动作可做（静默 no-op，不抛）", async (state) => {
    const calls = installStub(state);

    await expect(executeCommand("update.openUpdateFlow")).resolves.toBeUndefined();

    expect(calls.downloadUpdate).toBe(0);
    expect(calls.quitAndInstall).toBe(0);
  });

  it("无壳 update 面 → 静默 no-op，不抛", async () => {
    await expect(executeCommand("update.openUpdateFlow")).resolves.toBeUndefined();
  });
});
