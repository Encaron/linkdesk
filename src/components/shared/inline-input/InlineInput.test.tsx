/**
 * @vitest-environment jsdom
 * E5#27e：InlineInput 单元测试。
 * 渲染/selectMode/onConfirm/onCancel/自动 focus/清理恢复/Enter+Blur 竞态防线
 *
 * 🔥 E5.5#7-p5：零 @src/core import——测试 mock window.linkdesk.* 替代旧 ContextKeyService/setKeybindingCaptureActive
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

// ── mock window.linkdesk —— 替代旧 ContextKeyService / setKeybindingCaptureActive ──
const { mockSetValue, mockSetCapture } = vi.hoisted(() => ({
  mockSetValue: vi.fn(),
  mockSetCapture: vi.fn(),
}));

// E5.5#7-p5：组件走 window.linkdesk.* IPC，测试 mock linkdesk 对象
Object.defineProperty(window, "linkdesk", {
  value: {
    contextKey: {
      set: (...args: unknown[]) => mockSetValue(...args),
    },
    keybindings: {
      setKeybindingCaptureActive: (v: boolean) => mockSetCapture(v),
    },
  },
  writable: true,
  configurable: true,
});

import { InlineInput } from "./InlineInput"; // E5.8#0d.7-4：InlineInput 迁 shared/inline-input/，测试随 #0d.7-8 同夹

// ── 模拟 rAF —— 同步执行回调，方便断言 ──
const rafCallbacks: Array<(t: number) => void> = [];
const origRAF = globalThis.requestAnimationFrame;
const origCAF = globalThis.cancelAnimationFrame;

function mockRAF(cb: (t: number) => void): number {
  rafCallbacks.push(cb);
  return rafCallbacks.length - 1;
}
function mockCAF(id: number): void {
  rafCallbacks[id] = () => {};
}
function flushRAF(): void {
  const cbs = rafCallbacks.splice(0);
  cbs.forEach((cb) => cb(0));
}

beforeEach(() => {
  rafCallbacks.length = 0;
  mockSetValue.mockClear();
  mockSetCapture.mockClear();
  globalThis.requestAnimationFrame = mockRAF as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = mockCAF as typeof cancelAnimationFrame;
});

afterEach(() => {
  cleanup();
  globalThis.requestAnimationFrame = origRAF;
  globalThis.cancelAnimationFrame = origCAF;
});

// ── 辅助函数 ──

function renderInput(overrides: Record<string, unknown> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const props = {
    size: "compact" as const,
    value: "test.txt",
    onConfirm,
    onCancel,
    ...overrides,
  };
  const result = render(<InlineInput {...props} />);
  const input = result.container.querySelector("input")!;
  return { ...result, input, onConfirm, onCancel };
}

describe("InlineInput", () => {
  // ── 1. 基础渲染 ──

  it("渲染初始 value", () => {
    const { input } = renderInput({ value: "hello.ts" });
    expect(input.value).toBe("hello.ts");
  });

  it("size prop → className", () => {
    const compact = renderInput({ size: "compact" }).input;
    expect(compact.className).toContain("inline-input--compact");

    const normal = renderInput({ size: "normal" }).input;
    expect(normal.className).toContain("inline-input--normal");
  });

  // ── 2. selectMode ──

  it("autoFocus + selectMode='all' → rAF 后全选", () => {
    const { input } = renderInput({ autoFocus: true, selectMode: "all" });
    expect(document.activeElement).toBe(input);
    const selectSpy = vi.spyOn(input, "select");
    flushRAF();
    expect(selectSpy).toHaveBeenCalled();
  });

  it("autoFocus + selectMode='nameOnly' → rAF 后只选文件名", () => {
    const { input } = renderInput({ autoFocus: true, selectMode: "nameOnly", value: "hello.ts" });
    expect(document.activeElement).toBe(input);
    const selSpy = vi.spyOn(input, "setSelectionRange");
    flushRAF();
    expect(selSpy).toHaveBeenCalledWith(0, 5); // "hello" 不含 ".ts"
  });

  // ── 3. Enter / Escape ──

  it("Enter → onConfirm + 输入值", () => {
    const { input, onConfirm, onCancel } = renderInput({ value: "hello.ts" });
    fireEvent.change(input, { target: { value: "world.ts" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledWith("world.ts");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Escape → onCancel", () => {
    const { input, onConfirm, onCancel } = renderInput();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // ── 4. Blur ──

  it("Blur → onConfirm", () => {
    const { input, onConfirm } = renderInput({ value: "hello.ts" });
    fireEvent.blur(input);
    expect(onConfirm).toHaveBeenCalledWith("hello.ts");
  });

  it("onChange 即时回调——每次按键通知父组件", () => {
    const onChange = vi.fn();
    const { input } = renderInput({ value: "hello.ts", onChange });
    fireEvent.change(input, { target: { value: "h" } });
    expect(onChange).toHaveBeenCalledWith("h");
    fireEvent.change(input, { target: { value: "he" } });
    expect(onChange).toHaveBeenCalledWith("he");
    // onConfirm 不受影响
    fireEvent.keyDown(input, { key: "Enter" });
  });

  // ── 5. 🔥 E5-18a 防线：Enter + Blur 不重复 onConfirm ──

  it("Enter 后再 blur——onConfirm 只调一次", () => {
    const { input, onConfirm } = renderInput();
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  // ── 6. 清理恢复 ──

  it("isActive → false 后恢复 inputFocus + keybindingCapture", () => {
    const { input } = renderInput();
    fireEvent.keyDown(input, { key: "Enter" });
    // inputFocus 同步恢复
    expect(mockSetValue).toHaveBeenCalledWith("inputFocus", false);
    // keybindingCapture 在 rAF 后恢复
    flushRAF();
    expect(mockSetCapture).toHaveBeenCalledWith(false);
  });

  it("组件卸载恢复全局状态", () => {
    const { input, unmount } = renderInput();
    // focus → inputFocus=true + capture=true
    fireEvent.focus(input);
    expect(mockSetValue).toHaveBeenCalledWith("inputFocus", true);
    expect(mockSetCapture).toHaveBeenCalledWith(true);
    // 卸载 → 恢复
    unmount();
    expect(mockSetValue).toHaveBeenCalledWith("inputFocus", false);
    expect(mockSetCapture).toHaveBeenCalledWith(false);
  });
});
