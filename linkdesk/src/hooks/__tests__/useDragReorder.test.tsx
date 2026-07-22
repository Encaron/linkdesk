/**
 * @vitest-environment jsdom
 * useDragReorder 核心测试——reorder↔split 状态机 + threshold + cancel。
 * Phase 3 的 15 个拖拽 bug 一半出在这个 hook 里。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDragReorder } from "../useDragReorder";

/* ── Helpers ── */

function fireWindowMouseMove(x: number, y: number) {
  act(() => { window.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true })); });
}
function fireWindowMouseUp(x: number, y: number, shiftKey = false) {
  act(() => { window.dispatchEvent(new MouseEvent("mouseup", { clientX: x, clientY: y, shiftKey, bubbles: true })); });
}
function fireWindowKeyDown(key: string) {
  act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });
}

function createMockMouseEvent(x: number, y: number): React.MouseEvent {
  return { clientX: x, clientY: y, preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;
}

describe("useDragReorder", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    // jsdom 缺以下 API——mock
    if (!document.elementFromPoint) {
      (document as any).elementFromPoint = () => null;
    }
    if (!HTMLElement.prototype.closest) {
      HTMLElement.prototype.closest = () => null;
    }
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  function setup(opts?: Partial<Parameters<typeof useDragReorder>[1]>) {
    const onReorder = vi.fn();
    const onDropSplit = vi.fn();
    const onMoveToOther = vi.fn();
    const onDragDropZone = vi.fn();
    const onDraggingChange = vi.fn();
    const computeInsertIndex = vi.fn((_x, _y, _el, _from, _count) => 0);
    const isInPureEditor = vi.fn(() => false);
    const computeSplitZone = vi.fn(() => null) as any;

    const ref = { current: container };
    const { result } = renderHook(() =>
      useDragReorder(ref as any, {
        itemCount: 5,
        onReorder,
        onDropSplit,
        onMoveToOther,
        onDragDropZone,
        onDraggingChange,
        computeInsertIndex,
        isInPureEditor,
        computeSplitZone,
        threshold: 5,
        splitThreshold: 15,
        ...opts,
      })
    );

    return { result, onReorder, onDropSplit, onMoveToOther, onDragDropZone, onDraggingChange, computeInsertIndex, isInPureEditor, computeSplitZone };
  }

  /* ── Threshold ── */

  it("mousedown 不超阈值时不拎起标签页", () => {
    const { result, onDragDropZone } = setup();
    act(() => { result.current.startDrag("tab-1", 0, createMockMouseEvent(100, 100)); });
    // 移动 3px（< 阈值 5px）
    fireWindowMouseMove(103, 100);
    // draggingId 仍为 null
    expect(result.current.draggingId).toBeNull();
    expect(onDragDropZone).not.toHaveBeenCalled();
  });

  it("超过阈值后拎起标签页", () => {
    const { result } = setup();
    act(() => { result.current.startDrag("tab-1", 0, createMockMouseEvent(100, 100)); });
    fireWindowMouseMove(106, 100); // 6px > 5px
    expect(result.current.draggingId).toBe("tab-1");
  });

  /* ── reorder → split 双向切换 ── */

  it("垂直移动超过 splitThreshold 且鼠标在编辑器区域时切换到 split", () => {
    const { result, onDraggingChange, isInPureEditor } = setup();
    isInPureEditor.mockReturnValue(true); // 鼠标在编辑器上空

    act(() => { result.current.startDrag("tab-1", 0, createMockMouseEvent(100, 100)); });
    fireWindowMouseMove(110, 100); // 先拎起
    fireWindowMouseMove(110, 120); // 向下 20px > 15px → split
    expect(onDraggingChange).toHaveBeenCalledWith(true);
  });

  it("split 模式下鼠标回到标签栏时切回 reorder", () => {
    let inEditor = true;
    const isInPureEditor = vi.fn(() => inEditor);
    const onDraggingChange = vi.fn();
    const onDragDropZone = vi.fn();

    const ref = { current: container };
    const { result } = renderHook(() =>
      useDragReorder(ref as any, {
        itemCount: 5, threshold: 5, splitThreshold: 15,
        onReorder: vi.fn(), onDraggingChange, onDragDropZone,
        isInPureEditor,
      })
    );

    act(() => { result.current.startDrag("tab-1", 0, createMockMouseEvent(100, 100)); });
    fireWindowMouseMove(110, 100); // 拎起
    fireWindowMouseMove(110, 120); // → split：dy=20 > 15
    expect(onDraggingChange).toHaveBeenCalledWith(true);

    // 鼠标回到标签栏
    inEditor = false;
    fireWindowMouseMove(110, 100);
    expect(onDragDropZone).toHaveBeenCalledWith(null);
    expect(onDraggingChange).toHaveBeenCalledWith(false);
  });

  /* ── Escape 取消 ── */

  it("Escape 取消拖拽，重置所有状态", () => {
    const { result } = setup();
    act(() => { result.current.startDrag("tab-1", 0, createMockMouseEvent(100, 100)); });
    fireWindowMouseMove(110, 100); // 拎起
    expect(result.current.draggingId).toBe("tab-1");

    fireWindowKeyDown("Escape");
    expect(result.current.draggingId).toBeNull();
    expect(result.current.insertIndex).toBeNull();
    expect(result.current.previewPos).toBeNull();
  });

  /* ── mouseup: reorder ── */

  it("reorder 模式 mouseup 触发 onReorder", () => {
    const { result, onReorder, computeInsertIndex } = setup();
    computeInsertIndex.mockReturnValue(2); // 插入到位置 2

    act(() => { result.current.startDrag("tab-1", 0, createMockMouseEvent(100, 100)); });
    fireWindowMouseMove(200, 100); // 水平移动 → 重排
    fireWindowMouseUp(200, 100);

    expect(onReorder).toHaveBeenCalledWith("tab-1", 2);
  });

  /* ── mouseup: split ── */

  it("split 模式 mouseup 触发 onDropSplit", () => {
    const { result, onDropSplit, isInPureEditor, computeSplitZone } = setup();
    isInPureEditor.mockReturnValue(true);
    computeSplitZone.mockReturnValue({ zone: "right", targetGroupId: "g2" });

    act(() => { result.current.startDrag("tab-1", 0, createMockMouseEvent(100, 100)); });
    fireWindowMouseMove(110, 100); // 拎起
    fireWindowMouseMove(110, 120); // → split
    fireWindowMouseUp(110, 120);

    expect(onDropSplit).toHaveBeenCalledWith("tab-1", "right", "g2");
  });

  /* ── Shift+拖复制 ── */

  it("Shift+mouseup split 触发 onDropCopySplit", () => {
    const onDropCopySplit = vi.fn();
    const { result, isInPureEditor, computeSplitZone } = setup({ onDropCopySplit });
    isInPureEditor.mockReturnValue(true);
    computeSplitZone.mockReturnValue({ zone: "right", targetGroupId: "g2" });

    act(() => { result.current.startDrag("tab-1", 0, createMockMouseEvent(100, 100)); });
    fireWindowMouseMove(110, 100);
    fireWindowMouseMove(110, 120);
    fireWindowMouseUp(110, 120, true); // Shift!

    expect(onDropCopySplit).toHaveBeenCalledWith("tab-1", "right", "g2");
  });

  /* ── center zone = 移动 ── */

  it("center zone mouseup 触发 onMoveToOther", () => {
    const { result, onMoveToOther, isInPureEditor, computeSplitZone } = setup();
    isInPureEditor.mockReturnValue(true);
    computeSplitZone.mockReturnValue({ zone: "center", targetGroupId: "g2" });

    act(() => { result.current.startDrag("tab-1", 0, createMockMouseEvent(100, 100)); });
    fireWindowMouseMove(110, 100);
    fireWindowMouseMove(110, 120);
    fireWindowMouseUp(110, 120);

    expect(onMoveToOther).toHaveBeenCalledWith("tab-1", "g2");
  });
});
