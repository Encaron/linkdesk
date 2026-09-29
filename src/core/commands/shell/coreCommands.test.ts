/**
 * coreCommands——工作区导入 handler 的校验与反馈单测（04「工作区导入导出-布局恢复断线」）。
 *
 * 旧实现 catch 后静默——成功/失败都无提示、坏文件进来看不出任何反应（04 档案 §一）。
 * 本文件钉住修后的分支（§五.3 最小校验）：
 * ① JSON 坏 ⇒ error「不是有效的工作区文件」；② 版本不识别 ⇒ error「不支持的工作区文件版本」；
 * ③ 无 layout 且无 settings ⇒ error「没有可恢复的内容」；④ 合法 ⇒ dispatch RESTORE_WORKSPACE
 *    ＋ info「工作区已导入」（布局恢复本体在 lifecycle 监听器，另见其接线）；
 * ⑤ 取消（主进程 dialog 返回 null）⇒ 无动作无提示。
 *
 * 🔴 文件选择走 **主进程 dialog**（`dialog.openWorkspaceImport` 壳私有扩展）——不在渲染侧
 *    `input.click()`：菜单点击的手势在 pool 树、handler 在壳树，user gesture 不跨 WebContents
 *    ⇒ Chromium 静默拒绝（04 实测「点了没反应」的第二根因）——本文件桩的就是这条桥。
 *
 * fixture 全虚构（硬约束 21）：设置键 `demo.setting`、值 `演示值`。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../services/ui/toast", () => ({ pushToast: vi.fn(() => "mock-toast-id") }));
import { pushToast } from "../../services/ui/toast";
import { CUSTOM_EVENTS } from "../../react/events/CoreEvents";
import { ensureCoreCommands } from "./coreCommands";
import { updateCoreCallbacks, type CoreCallbacks } from "../infra/CoreCallbacks";

const pushToastMock = vi.mocked(pushToast);

/** `dialog.openWorkspaceImport` 的返回值——每用例自己决定（null = 用户取消） */
let picked: { path: string; content: string } | null;

/** 派发到 window 的 RESTORE_WORKSPACE 事件计数——「布局恢复是否被触发」的唯一判据 */
let dispatched: number;

beforeEach(() => {
  pushToastMock.mockClear();
  dispatched = 0;
  picked = null;
  window.addEventListener(CUSTOM_EVENTS.RESTORE_WORKSPACE, countDispatch);
  (window as unknown as { linkdesk: unknown }).linkdesk = {
    commands: {
      executeCommand: () => undefined,
    },
    dialog: {
      openWorkspaceImport: async () => picked,
    },
  };
  ensureCoreCommands();
});

afterEach(() => {
  window.removeEventListener(CUSTOM_EVENTS.RESTORE_WORKSPACE, countDispatch);
  delete (window as unknown as { linkdesk?: unknown }).linkdesk;
  vi.restoreAllMocks();
});

function countDispatch(): void {
  dispatched += 1;
}

/** 触发口：命令面板可执行的「导入工作区」命令——与用户从菜单点它同一条路 */
async function runImport(): Promise<void> {
  const { getCommand } = await import("../../registry/commands/CommandRegistry");
  const cmd = getCommand("workbench.action.importWorkspace");
  if (!cmd) throw new Error("导入工作区命令未注册");
  await cmd.handler();
}

const LEGIT = JSON.stringify({
  version: 1,
  layout: { tabs: { groups: [], activeGroupId: "" }, cards: [] },
  settings: { "demo.setting": "演示值" },
});

describe("工作区导入（校验与反馈——04 布局恢复断线修后）", () => {
  it("JSON 坏 ⇒ error toast，且**不**触发布局恢复（不静默）", async () => {
    picked = { path: "demo.linkdesk-workspace", content: "{ 不是 JSON" };
    await runImport();

    expect(pushToastMock).toHaveBeenCalledTimes(1);
    expect(pushToastMock.mock.calls[0]?.[0]).toMatchObject({ severity: "error", source: "workspace" });
    expect(dispatched).toBe(0);
  });

  it("版本不识别 ⇒ error toast（version 字段是导出侧写下的承诺——不认识就明确报错）", async () => {
    picked = { path: "demo.linkdesk-workspace", content: JSON.stringify({ version: 99, layout: {}, settings: {} }) };
    await runImport();

    expect(pushToastMock).toHaveBeenCalledTimes(1);
    expect(pushToastMock.mock.calls[0]?.[0]?.message).toContain("导入失败：不支持的工作区文件版本");
    expect(dispatched).toBe(0);
  });

  it("无 layout 且无 settings ⇒ error toast（空壳文件不值得一次恢复动作）", async () => {
    picked = { path: "demo.linkdesk-workspace", content: JSON.stringify({ version: 1 }) };
    await runImport();

    expect(pushToastMock).toHaveBeenCalledTimes(1);
    expect(pushToastMock.mock.calls[0]?.[0]?.message).toContain("导入失败：文件里没有可恢复的内容");
    expect(dispatched).toBe(0);
  });

  it("合法文件 ⇒ 触发 RESTORE_WORKSPACE ＋ info toast（成功也要出声——旧实现两头都哑）", async () => {
    picked = { path: "demo.linkdesk-workspace", content: LEGIT };
    await runImport();

    expect(dispatched).toBe(1);
    expect(pushToastMock).toHaveBeenCalledTimes(1);
    expect(pushToastMock.mock.calls[0]?.[0]).toMatchObject({ severity: "info", source: "workspace" });
  });

  it("用户取消（dialog 返回 null）⇒ 无动作无提示", async () => {
    picked = null;
    await runImport();

    expect(dispatched).toBe(0);
    expect(pushToastMock).not.toHaveBeenCalled();
  });
});

/* ── M2 生长格 AI#55：分屏命令的回执（`ok` 之外还得说清「跑了没变」和「为什么」）──
 * 旧状：这两条命令 handler 无返回值 ⇒ 门③（`exec`）拿到 `ok=true`，与实际做没做无关——
 * 分屏被拒（源组只剩一条）和分屏成功在外部**同形**。本组钉三个读数：
 *   ① 调用方没给 tabId ⇒ `{ok:false, noop:true, reason:"no-tab-id"}`——这次是**调用**有问题；
 *   ② 宿主已注册 ⇒ reducer 的回执**原样透出**（命令层不吞、不重算——唯一权威在 reducer）；
 *   ③ 没宿主 ⇒ `{ok:false, noop:true, reason:"no-callbacks"}`，不抛。 */

/** 桩一个只实现 splitTab 的回调表——本组只走分屏这一条路（形态照 manualCommands.test.ts 的先例） */
function registerSplitCallbacks(splitTab: (tabId: string, direction: "horizontal" | "vertical") => unknown): void {
  updateCoreCallbacks({ splitTab } as unknown as CoreCallbacks);
}

async function runSplit(commandId: "core.splitDown" | "core.splitRight", ctx?: unknown): Promise<unknown> {
  const { getCommand } = await import("../../registry/commands/CommandRegistry");
  const cmd = getCommand(commandId);
  if (!cmd) throw new Error(`${commandId} 命令未注册`);
  return cmd.handler(ctx);
}

describe("分屏命令的回执（AI#55——「跑了没变」不再静默）", () => {
  it("缺 tabId ⇒ ok:false ＋ noop ＋ reason:'no-tab-id'", async () => {
    registerSplitCallbacks(vi.fn());

    await expect(runSplit("core.splitDown")).resolves.toEqual({ ok: false, noop: true, reason: "no-tab-id" });
    await expect(runSplit("core.splitDown", {})).resolves.toEqual({ ok: false, noop: true, reason: "no-tab-id" });
  });

  it("已注册宿主 ⇒ reducer 回执原样透出（single-tab 也照透，不当成功吞掉）", async () => {
    const splitTab = vi.fn(() => ({ ok: true, noop: true, reason: "single-tab" }));
    registerSplitCallbacks(splitTab);

    await expect(runSplit("core.splitDown", { tabId: "t-1" })).resolves.toEqual({
      ok: true,
      noop: true,
      reason: "single-tab",
    });
    expect(splitTab).toHaveBeenCalledWith("t-1", "vertical"); // 向下分屏 = vertical
  });

  it("向右分屏走 horizontal——两条命令同一份回执形状（不各写一份判定）", async () => {
    const splitTab = vi.fn(() => ({ ok: true }));
    registerSplitCallbacks(splitTab);

    await expect(runSplit("core.splitRight", { tabId: "t-1" })).resolves.toEqual({ ok: true });
    expect(splitTab).toHaveBeenCalledWith("t-1", "horizontal");
  });

  it("宿主没注册（无标签页管理器的宿主）⇒ ok:false ＋ reason:'no-callbacks'，不抛", async () => {
    updateCoreCallbacks(null as unknown as CoreCallbacks);

    await expect(runSplit("core.splitRight", { tabId: "t-1" })).resolves.toEqual({
      ok: false,
      noop: true,
      reason: "no-callbacks",
    });
  });
});
