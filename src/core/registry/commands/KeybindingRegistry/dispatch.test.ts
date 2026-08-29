/**
 * dispatch.handleKeyInput —— 主进程转发路径（E5.8#46.8）测试。
 * 锁住透传链末端：转发载荷的 sourceWindowId 作为 { sourceWindowId } 追加到命令 args 末尾
 * （closeActiveTab 等壳命令按聚焦窗裁决）；DOM 路径（无 sourceWindowId）不附加，现有 args 索引零影响。
 * 测试夹具全用虚构值（硬约束 21：demo-plugin，非真实插件）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerCommand, clearCommands } from "../CommandRegistry";
import { registerKeybinding } from "./registry";
import { handleKeyInput, handleKeyEvent, clearKeybindings } from "./dispatch";

/** 记录 handler 收到的 args */
function spyCommand(id: string) {
  const handler = vi.fn(async () => {});
  registerCommand("demo-plugin", { id, title: "Demo View", handler });
  return handler;
}

const CTRL_W = { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key: "w", code: "KeyW" };

/** 断言命令 handler 已触发且 args 末位收到 { sourceWindowId }（handler(...args) 展开——calls[0] 即 args 数组） */
async function expectSourceWindowIdLastArg(handler: ReturnType<typeof vi.fn>): Promise<void> {
  await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
  const args = handler.mock.calls[0] as unknown[];
  expect(args[args.length - 1]).toEqual({ sourceWindowId: "det-1" });
}

describe("dispatch.handleKeyInput —— E5.8#46.8 sourceWindowId 透传", () => {
  beforeEach(() => {
    clearKeybindings();
    clearCommands();
  });

  it("主进程转发（带 sourceWindowId）→ 命令 args 末位收到 { sourceWindowId }", async () => {
    const handler = spyCommand("demo.closeTab");
    registerKeybinding({ key: "ctrl+w", command: "demo.closeTab", source: "plugin", pluginId: "demo-plugin" });
    handleKeyInput({ ...CTRL_W, sourceWindowId: "det-1" });
    await expectSourceWindowIdLastArg(handler);
  });

  it("DOM 路径（handleKeyEvent，无 sourceWindowId）→ args 为空数组，不附加", async () => {
    const handler = spyCommand("demo.closeTab");
    registerKeybinding({ key: "ctrl+w", command: "demo.closeTab", source: "plugin", pluginId: "demo-plugin" });
    handleKeyEvent(new KeyboardEvent("keydown", { key: "w", ctrlKey: true, bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    expect(handler.mock.calls[0]).toEqual([]);
  });

  it("chord 第二键转发也带 sourceWindowId（chord 状态机不丢来源）", async () => {
    const handler = spyCommand("demo.chordCmd");
    registerKeybinding({ key: "ctrl+k ctrl+w", command: "demo.chordCmd", source: "plugin", pluginId: "demo-plugin" });
    handleKeyInput({ ...CTRL_W, key: "k", code: "KeyK", sourceWindowId: "det-1" });
    handleKeyInput({ ...CTRL_W, sourceWindowId: "det-1" });
    await expectSourceWindowIdLastArg(handler);
  });
});
