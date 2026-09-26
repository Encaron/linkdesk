/**
 * coreCommands——工作区导入 handler 的校验与反馈单测（04「工作区导入导出-布局恢复断线」）。
 *
 * 旧实现 catch 后静默——成功/失败都无提示、坏文件进来看不出任何反应（04 档案 §一）。
 * 本文件钉住修后的四条分支（§五.3 最小校验）：
 * ① JSON 坏 ⇒ error「不是有效的工作区文件」；② 版本不识别 ⇒ error「不支持的工作区文件版本」；
 * ③ 无 layout 且无 settings ⇒ error「没有可恢复的内容」；④ 合法 ⇒ dispatch RESTORE_WORKSPACE
 *    ＋ info「工作区已导入」（布局恢复本体在 lifecycle 监听器，另见其接线）。
 *
 * fixture 全虚构（硬约束 21）：设置键 `demo.setting`、值 `演示值`。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../services/ui/toast", () => ({ pushToast: vi.fn(() => "mock-toast-id") }));
import { pushToast } from "../../services/ui/toast";
import { CUSTOM_EVENTS } from "../../react/events/CoreEvents";
import { ensureCoreCommands } from "./coreCommands";

const pushToastMock = vi.mocked(pushToast);

/** handler 创建的隐藏 input **不挂 DOM**——桩住 `click()` 捕获实例，再手动喂文件触发 onchange */
let captured: HTMLInputElement | null = null;

async function pickFile(content: string): Promise<void> {
  if (!captured) throw new Error("导入 handler 没有创建文件输入框");
  const file = new File([content], "workspace.linkdesk-workspace");
  Object.defineProperty(captured, "files", { value: [file], configurable: true });
  await captured.onchange?.(new Event("change"));
}

/** 派发到 window 的 RESTORE_WORKSPACE 事件计数——「布局恢复是否被触发」的唯一判据 */
let dispatched: number;

beforeEach(() => {
  pushToastMock.mockClear();
  dispatched = 0;
  captured = null;
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
    captured = this;
  });
  window.addEventListener(CUSTOM_EVENTS.RESTORE_WORKSPACE, countDispatch);
  ensureCoreCommands();
});

afterEach(() => {
  window.removeEventListener(CUSTOM_EVENTS.RESTORE_WORKSPACE, countDispatch);
});

function countDispatch(): void {
  dispatched += 1;
}

/* ── 触发口：命令面板可执行的「导入工作区」命令 ── */

async function runImport(): Promise<void> {
  // 命令注册表里拿 handler 直接调——与用户从菜单/命令面板点它同一条路
  const mod = await import("./coreCommands");
  void mod;
  const { getCommand } = await import("../../registry/commands/CommandRegistry");
  const cmd = getCommand("workbench.action.importWorkspace");
  if (!cmd) throw new Error("导入工作区命令未注册");
  await cmd.handler();
}

describe("工作区导入（校验与反馈——04 布局恢复断线修后）", () => {
  it("JSON 坏 ⇒ error toast，且**不**触发布局恢复（不静默）", async () => {
    await runImport();
    await pickFile("{ 不是 JSON");

    expect(pushToastMock).toHaveBeenCalledTimes(1);
    expect(pushToastMock.mock.calls[0]?.[0]).toMatchObject({ severity: "error", source: "workspace" });
    expect(dispatched).toBe(0);
  });

  it("版本不识别 ⇒ error toast（version 字段是导出侧写下的承诺——不认识就明确报错）", async () => {
    await runImport();
    await pickFile(JSON.stringify({ version: 99, layout: {}, settings: {} }));

    expect(pushToastMock).toHaveBeenCalledTimes(1);
    expect(pushToastMock.mock.calls[0]?.[0]?.message).toContain("导入失败：不支持的工作区文件版本");
    expect(dispatched).toBe(0);
  });

  it("无 layout 且无 settings ⇒ error toast（空壳文件不值得一次恢复动作）", async () => {
    await runImport();
    await pickFile(JSON.stringify({ version: 1 }));

    expect(pushToastMock).toHaveBeenCalledTimes(1);
    expect(pushToastMock.mock.calls[0]?.[0]?.message).toContain("导入失败：文件里没有可恢复的内容");
    expect(dispatched).toBe(0);
  });

  it("合法文件 ⇒ 触发 RESTORE_WORKSPACE ＋ info toast（成功也要出声——旧实现两头都哑）", async () => {
    await runImport();
    await pickFile(JSON.stringify({
      version: 1,
      layout: { tabs: { groups: [], activeGroupId: "" }, cards: [] },
      settings: { "demo.setting": "演示值" },
    }));

    expect(dispatched).toBe(1);
    expect(pushToastMock).toHaveBeenCalledTimes(1);
    expect(pushToastMock.mock.calls[0]?.[0]).toMatchObject({ severity: "info", source: "workspace" });
  });
});
