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
import { clearMenus, clearTitleBarContributions, getTitleBarContributions } from "../../registry/commands/MenuRegistry";
import { clearRegistrationLayers } from "../../registry/registrationTracker";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import type { UpdateInfo, UpdateState } from "../../types/ipc/update";
import { registerUpdateCommands, isUpdateActionable, updateButtonKeyFor } from "./updateCommands";

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
  clearTitleBarContributions(); // E6#57.11：本模块现在还注册一条 TitleBar 声明，不清会逐用例累积
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

/**
 * E6#57.11：九态 → TitleBar 按钮（显隐 + 文字）。
 *
 * 🔴 这一格最容易写成**两份真相源**（一条 switch 出显隐、另一条 switch 出文字）⇒ 早晚一个改了
 * 另一个没改（按钮亮着却没文字）。实现上 `isUpdateActionable` 由 `updateButtonKeyFor` **派生**，
 * 下表逐条把两列一起钉住——改任何一列都必须同时满足另一列。
 */
describe("E6#57.11 九态 → 按钮文字/显隐映射", () => {
  it("九态全表逐条（含用户拍板补的第四格 `updating`）", () => {
    const TABLE: Array<{ state: UpdateState; actionable: boolean; label: string }> = [
      { state: { type: "available", update: INFO }, actionable: true, label: "下载更新" },
      {
        state: { type: "downloading", update: INFO, progress: { transferred: 0, total: 1, percent: 0 } },
        actionable: true,
        label: "更新中",
      },
      { state: { type: "downloaded", update: INFO }, actionable: true, label: "重新启动" },
      { state: { type: "ready", update: INFO }, actionable: true, label: "重新启动" },
      // 🔴 `updating` = 「更新中」而不是隐藏（2026-09-12 用户拍板）——点完「重新启动」到软件真正退出
      // 之间那段安装期，按钮抽掉会让人以为「点了没反应」。注意**点击仍是 no-op**（上方用例钉着）。
      { state: { type: "updating", update: INFO }, actionable: true, label: "更新中" },
      // 其余五态：无更新可处理 ⇒ **不占位**。尤其 `idle`——它同时承载「已是最新」与「上次失败了」，
      // 两者都不该把这个按钮点亮（失败有它自己的出声面）。
      { state: { type: "uninitialized" }, actionable: false, label: "" },
      { state: { type: "disabled", reason: "demo-disabled" }, actionable: false, label: "" },
      { state: { type: "idle" }, actionable: false, label: "" },
      { state: { type: "checking" }, actionable: false, label: "" },
    ];

    for (const row of TABLE) {
      expect(isUpdateActionable(row.state), `${row.state.type} 的显隐`).toBe(row.actionable);
      expect(updateButtonKeyFor(row.state) ?? "", `${row.state.type} 的文字`).toBe(row.label);
    }
  });
});

/**
 * E6#57.11：TitleBar 声明面——**声明写歪了 UI 上完全看不出来**（按钮不出现/显示键名），
 * 所以逐字段钉住。`$` 前缀尤其要点名：漏了它按钮会显示字面 `updateButtonLabel`。
 */
describe("E6#57.11 TitleBar 声明面", () => {
  it("恰好一条右槽贡献：命令 id / label 带 `$` 前缀 / when 键名 / 归属壳", () => {
    const right = getTitleBarContributions("right");
    expect(right).toHaveLength(1);
    expect(right[0]).toMatchObject({
      command: "update.openUpdateFlow",
      label: "$updateButtonLabel",
      when: "updateActionable",
      pluginId: APP_PLUGIN_ID,
    });
    expect(getTitleBarContributions("left")).toHaveLength(0);
  });
});
