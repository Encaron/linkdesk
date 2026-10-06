/**
 * @vitest-environment jsdom
 * E5#27e：InlineInput 单元测试。
 * 渲染/selectMode/onConfirm/onCancel/自动 focus/清理恢复/Enter+Blur 竞态防线
 * ＋ 两个**加性**可选 prop（`ariaLabel` / `syncValue`，C5 卡内过滤框要用；缺省＝原行为）
 *
 * 🔥 E5.5#7-p5：零 @src/core import——测试 mock window.linkdesk.* 替代旧 ContextKeyService/setKeybindingCaptureActive
 */

import { useState } from "react";
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
    expect(compact.className).toContain("ldk-inline-input--compact");

    const normal = renderInput({ size: "normal" }).input;
    expect(normal.className).toContain("ldk-inline-input--normal");
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

  // ── 6b. 🔴 常驻输入框（过滤框：反复聚焦/失焦，不随确认卸载）二次失效 ──

  it("反复 聚焦→失焦：每轮失焦都恢复全局状态（`isActive` latch 必须随聚焦复位）", () => {
    const { input } = renderInput();
    // 第一轮：聚焦 → 失焦（blur 走确认分支 → isActive→false → 清理 effect 恢复）
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(mockSetValue).toHaveBeenLastCalledWith("inputFocus", false);
    flushRAF();
    expect(mockSetCapture).toHaveBeenLastCalledWith(false);
    // 第二轮：再聚焦 → 再失焦——`isActive` 若停在 false，blur 不进确认分支、
    // 清理 effect 也不重跑 ⇒ inputFocus/capture 永久卡 true（captureActive=true 吞掉全部全局快捷键）
    mockSetValue.mockClear();
    mockSetCapture.mockClear();
    fireEvent.focus(input);
    expect(mockSetValue).toHaveBeenLastCalledWith("inputFocus", true);
    fireEvent.blur(input);
    expect(mockSetValue).toHaveBeenLastCalledWith("inputFocus", false);
    flushRAF();
    expect(mockSetCapture).toHaveBeenLastCalledWith(false);
  });

  // ── 7. 两个加性可选 prop（缺省＝今天的行为，⛔ 既有调用方零改动） ──

  it("ariaLabel 给了 ⇒ 挂 aria-label；缺省 ⇒ ⛔ 不挂该属性", () => {
    const labeled = renderInput({ ariaLabel: "过滤文件类型" }).input;
    expect(labeled.getAttribute("aria-label")).toBe("过滤文件类型");
    const plain = renderInput().input;
    expect(plain.hasAttribute("aria-label")).toBe(false);
  });

  it("syncValue 缺省＝**一次性种子**（rename 语义）：父侧 value 变了也不覆盖正在打的字", () => {
    const { input, rerender } = renderInput({ value: "old.txt" });
    fireEvent.change(input, { target: { value: "typing.txt" } });
    rerender(<InlineInput size="compact" value="parent-changed.txt" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(input.value).toBe("typing.txt");
  });

  it("syncValue ⇒ 受控回灌：父侧清空（Esc → onCancel 那条路）时输入框**真清空**", () => {
    // 忠实接线（＝C5 过滤框那条链）：父侧持值、`onChange` 回灌、`onCancel` 清空——
    // 缺省语义下 `onCancel` 清得掉父侧值，却清不掉输入框里已经打上的字（界面残留已过滤的词、行已回全量）
    const Wrapper = () => {
      const [v, setV] = useState("");
      return (
        <InlineInput
          size="compact"
          value={v}
          syncValue
          onChange={setV}
          onConfirm={vi.fn()}
          onCancel={() => setV("")}
        />
      );
    };
    const { container } = render(<Wrapper />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "py" } });
    expect(input.value).toBe("py");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
  });

  it("syncValue ＋ 父侧回灌 ⇒ 打字不被吞（onChange 即时通知，value 跟着回来）", () => {
    const Wrapper = () => {
      const [v, setV] = useState("se");
      return (
        <InlineInput
          size="compact"
          value={v}
          syncValue
          onChange={setV}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );
    };
    const { container } = render(<Wrapper />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "sear" } });
    expect(input.value).toBe("sear");
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
  });
});
