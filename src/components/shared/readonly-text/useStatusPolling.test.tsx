/**
 * useStatusPolling ＋ ReadOnlyText 轮询模式单测（「设置控件-词表正典与共享化」阶段 3.3）。
 *
 * 六组——前五组钉 01 §一·1.3 的三条护栏与 02 E5/E6/E7 的行为，第六组钉 ReadOnlyText 组装契约：
 *   ① 节奏：挂载即取一次 → 按 intervalMs 轮询；缺省 = DEFAULT_POLL_INTERVAL_MS；无命令不建表
 *   ② 去重：同一 statusCommand 多实例共享一个定时器（每拍只执行一次）；最后一个退订才真停
 *   ③ 可见才轮询：隐藏即停表；回可见**立即刷一次**再续节奏（E6 明示的行为差异）
 *   ④ 卸载清理：停表 ＋ registry 腾空 ＋ `visibilitychange` 监听摘掉（硬约束 19 同款：绑/解对称）
 *   ⑤ 抛错保现值：命令抛错 / 返回非字符串 ⇒ 保持现值，连广播都不发（E7）
 *   ⑥ 组装：轮询值优先于 value / 空值不占位 / 轮询值含换行自动多行 / 无命令时静态值路径不变
 *
 * 手法：假执行句柄（`vi.fn`）＋ 假定时器；`document.visibilityState` 是只读 getter，
 * 只能 `defineProperty` 覆盖（afterEach 按原描述符还原）。
 * fixture 全虚构（硬约束 21）——命令 id 与读数都是编的，不对应任何真实命令。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, renderHook, act, cleanup } from "@testing-library/react";
import { DEFAULT_POLL_INTERVAL_MS, useStatusPolling } from "./useStatusPolling";
import ReadOnlyText from "./ReadOnlyText";

/** 假命令 id ＋ 假读数（全虚构） */
const CMD = "demo.statusLine";
const READING = "127.0.0.1:9333";
/** 静态 value 分支用的假文案（模块级常量——JSX 属性直接写中文会被 no-hardcoded-chinese 拦） */
const STATIC_VALUE = "静态值";

const runCommand = vi.fn<(id: string) => Promise<string | null>>();

/** 改可见性并广播（jsdom 的 visibilityState 是只读 getter） */
function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

/** 还原 jsdom 原生的 visibilityState 描述符（可能是 own accessor，也可能只在原型上） */
function restoreVisibility(original: PropertyDescriptor | undefined): void {
  if (original) Object.defineProperty(document, "visibilityState", original);
  else delete (document as unknown as { visibilityState?: unknown }).visibilityState;
}

let originalVisibility: PropertyDescriptor | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  originalVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
  runCommand.mockReset();
  runCommand.mockResolvedValue(READING);
});

afterEach(() => {
  cleanup(); // 卸载全部消费者 ⇒ registry 随空而收 ＋ 摘监听
  vi.useRealTimers();
  vi.restoreAllMocks();
  restoreVisibility(originalVisibility);
});

describe("① 节奏", () => {
  it("挂载即取一次，之后每 intervalMs 一次", async () => {
    const { result } = renderHook(() => useStatusPolling(CMD, runCommand, 1000));
    expect(runCommand).toHaveBeenCalledTimes(1); // 挂载即取一次（同步发起）
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(runCommand).toHaveBeenCalledTimes(1); // 未到点不取
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(runCommand).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(runCommand).toHaveBeenCalledTimes(4);
    expect(result.current).toBe(READING);
  });

  it("缺省间隔 = DEFAULT_POLL_INTERVAL_MS", async () => {
    renderHook(() => useStatusPolling(CMD, runCommand));
    expect(runCommand).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(DEFAULT_POLL_INTERVAL_MS - 1); });
    expect(runCommand).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(runCommand).toHaveBeenCalledTimes(2);
  });

  it("未声明 statusCommand ⇒ 一条定时器都不建、值恒 null", async () => {
    const { result } = renderHook(() => useStatusPolling(undefined, runCommand, 1000));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(runCommand).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });
});

describe("② 同命令去重（E5）", () => {
  it("两实例共享一个定时器：每拍只执行一次；一个退订另一个仍在", async () => {
    const a = renderHook(() => useStatusPolling(CMD, runCommand, 1000));
    const b = renderHook(() => useStatusPolling(CMD, runCommand, 1000));
    expect(runCommand).toHaveBeenCalledTimes(2); // 各挂载各读一次（与升级前逐行一致）
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(runCommand).toHaveBeenCalledTimes(3); // 一拍一次——不是两次
    expect(a.result.current).toBe(READING);
    expect(b.result.current).toBe(READING);

    a.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(runCommand).toHaveBeenCalledTimes(4); // 退订者不再拖表，留守者照轮询

    b.unmount();
    const after = runCommand.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(runCommand).toHaveBeenCalledTimes(after); // 全退 ⇒ 真停
  });
});

describe("③ 可见才轮询（E6）", () => {
  it("隐藏时不起表；回可见立即刷一次再续节奏", async () => {
    await act(async () => { setVisibility("hidden"); });
    renderHook(() => useStatusPolling(CMD, runCommand, 1000));
    expect(runCommand).toHaveBeenCalledTimes(1); // 挂载即取一次照旧
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(runCommand).toHaveBeenCalledTimes(1); // 隐藏 ⇒ 表没起

    await act(async () => { setVisibility("visible"); });
    expect(runCommand).toHaveBeenCalledTimes(2); // 回可见立即刷一次
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(runCommand).toHaveBeenCalledTimes(3); // 续上节奏
  });

  it("可见中途转隐藏 ⇒ 停表（隐藏本身不取数）", async () => {
    renderHook(() => useStatusPolling(CMD, runCommand, 1000));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(runCommand).toHaveBeenCalledTimes(2);

    await act(async () => { setVisibility("hidden"); });
    expect(runCommand).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(runCommand).toHaveBeenCalledTimes(2);
  });
});

describe("④ 卸载清理（硬约束 19：绑/解对称）", () => {
  it("最后一个消费者卸载 ⇒ 停表 ＋ 摘掉 visibilitychange 监听", async () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useStatusPolling(CMD, runCommand, 1000));
    expect(addSpy.mock.calls.filter(([type]) => type === "visibilitychange")).toHaveLength(1);

    unmount();
    expect(removeSpy.mock.calls.filter(([type]) => type === "visibilitychange")).toHaveLength(1);
    const after = runCommand.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(runCommand).toHaveBeenCalledTimes(after); // 表真停了
  });

  it("registry 不留僵尸：卸载后同命令再挂仍是活的新项", async () => {
    const first = renderHook(() => useStatusPolling(CMD, runCommand, 1000));
    first.unmount();
    const { result } = renderHook(() => useStatusPolling(CMD, runCommand, 1000));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current).toBe(READING);
  });
});

describe("⑤ 抛错 / 非字符串保现值（E7）", () => {
  it("首读成功、次读抛错 ⇒ 保持上次读数", async () => {
    const { result } = renderHook(() => useStatusPolling(CMD, runCommand, 1000));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current).toBe(READING);

    runCommand.mockRejectedValue(new Error("命令不在"));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(result.current).toBe(READING);
  });

  it("返回非字符串（null）⇒ 保持现值", async () => {
    const { result } = renderHook(() => useStatusPolling(CMD, runCommand, 1000));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current).toBe(READING);

    runCommand.mockResolvedValue(null);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current).toBe(READING);
  });

  it("首次即抛 ⇒ 保持空（不猜、不写死）", async () => {
    runCommand.mockRejectedValue(new Error("命令不在"));
    const { result } = renderHook(() => useStatusPolling(CMD, runCommand, 1000));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(result.current).toBeNull();
  });

  it("空串是合法值（照收；占不占位交给显示层）", async () => {
    runCommand.mockResolvedValue("");
    const { result } = renderHook(() => useStatusPolling(CMD, runCommand, 1000));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current).toBe("");
  });
});

describe("⑥ ReadOnlyText 组装契约", () => {
  const never: Promise<string | null> = new Promise(() => {});

  it("轮询优先：statusCommand 与 value 同给 ⇒ 渲染轮询值", async () => {
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(<ReadOnlyText value={STATIC_VALUE} statusCommand={CMD} runCommand={runCommand} />);
    });
    expect(view.container.textContent).toBe(READING);
  });

  it("空值不占位：首读未到手 ⇒ 一个节点都不渲染", async () => {
    runCommand.mockReturnValue(never);
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(<ReadOnlyText statusCommand={CMD} runCommand={runCommand} />);
    });
    expect(view.container.innerHTML).toBe("");
  });

  it("轮询值含换行 ⇒ 自动多行块（multiline）", async () => {
    const multilineReading = "开放范围:\n- README.md\n- docs/";
    runCommand.mockResolvedValue(multilineReading);
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(<ReadOnlyText statusCommand={CMD} runCommand={runCommand} />);
    });
    const el = view.container.querySelector(".ldk-readonly-text");
    expect(el?.classList.contains("multiline")).toBe(true);
    expect(el?.textContent).toBe(multilineReading);
  });

  it("静态值路径不变：无 statusCommand ⇒ 用 value、不建表", async () => {
    const { container } = render(<ReadOnlyText value="static" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(runCommand).not.toHaveBeenCalled();
    expect(container.textContent).toBe("static");
  });
});
