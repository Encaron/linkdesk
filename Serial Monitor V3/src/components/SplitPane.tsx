/**
 * SplitPane — 绝对定位平铺分屏。
 *
 * ⚠️ 反直觉但正确：所有面板是 MainContent 平级兄弟（key=groupId 永远同级），
 * 树只用来算 x/y/w/h 百分比。不要改回递归 flex 嵌套——
 * 递归嵌套 = 树变化时面板 DOM 深度改变 → React unmount → CM6/Monaco 状态丢（B22 教训）。
 *
 * 平铺代价：z-index / 焦点边框 / 活跃面板标识需要显式管理，
 * 不像递归嵌套那样"层级 = 视觉"天然继承。
 */

import { useRef, useCallback, useMemo } from "react";
import type { SplitNode } from "../hooks/splitTree";
import type { TabGroup } from "../hooks/useTabManager";
import "./SplitPane.css";

interface SplitPaneProps {
  node: SplitNode;
  groups: TabGroup[];
  renderGroup: (group: TabGroup) => React.ReactNode;
  onResize?: (anchorGroupId: string, sizes: [number, number]) => void;
}

interface PanelRect {
  groupId: string;
  x: number; y: number; w: number; h: number;
}

interface HandleRect {
  id: string;
  anchorGroupId: string;
  x: number; y: number; w: number; h: number;
  direction: "horizontal" | "vertical";
}

/** 子树第一个 leaf 的 groupId */
function firstLeafId(node: SplitNode): string {
  return node.type === "leaf" ? node.groupId : firstLeafId(node.children[0]);
}

/** 从树递归算所有面板 + 分割条的百分比 rect */
function computeLayout(
  node: SplitNode, x: number, y: number, w: number, h: number
): { panels: PanelRect[]; handles: HandleRect[] } {
  if (node.type === "leaf") {
    return { panels: [{ groupId: node.groupId, x, y, w, h }], handles: [] };
  }

  const [s0, s1] = node.sizes;
  const handlePct = 0.4;
  const anchorId = firstLeafId(node.children[0]);

  if (node.direction === "horizontal") {
    const w0 = w * s0 / 100;
    const w1 = w * s1 / 100;
    const left = computeLayout(node.children[0], x, y, w0, h);
    const right = computeLayout(node.children[1], x + w0 + handlePct, y, w1, h);
    const handle: HandleRect = {
      id: `h-${anchorId}`, anchorGroupId: anchorId,
      x: x + w0, y, w: handlePct, h, direction: "horizontal",
    };
    return { panels: [...left.panels, ...right.panels], handles: [...left.handles, handle, ...right.handles] };
  } else {
    const h0 = h * s0 / 100;
    const h1 = h * s1 / 100;
    const top = computeLayout(node.children[0], x, y, w, h0);
    const bottom = computeLayout(node.children[1], x, y + h0 + handlePct, w, h1);
    const handle: HandleRect = {
      id: `h-${anchorId}`, anchorGroupId: anchorId,
      x, y: y + h0, w, h: handlePct, direction: "vertical",
    };
    return { panels: [...top.panels, ...bottom.panels], handles: [...top.handles, handle, ...bottom.handles] };
  }
}

/* 分割条 */
function AbsoluteHandle({
  rect, onResize,
}: {
  rect: HandleRect;
  onResize?: (anchorGroupId: string, sizes: [number, number]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isH = rect.direction === "horizontal";

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!onResize || !ref.current) return;
    const parent = ref.current.parentElement;
    if (!parent) return;
    const pr = parent.getBoundingClientRect();
    const total = isH ? pr.width : pr.height;

    const mm = (ev: MouseEvent) => {
      const pos = isH ? ev.clientX - pr.left : ev.clientY - pr.top;
      const pct = Math.min(80, Math.max(20, (pos / total) * 100));
      onResize(rect.anchorGroupId, [pct, 100 - pct]);
    };
    const mu = () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
  }, [isH, rect.anchorGroupId, onResize]);

  return (
    <div
      ref={ref}
      className="split-pane-handle"
      onMouseDown={onMouseDown}
      onDoubleClick={() => onResize?.(rect.anchorGroupId, [50, 50])}
      style={{
        position: "absolute", left: `${rect.x}%`, top: `${rect.y}%`,
        width: `${rect.w}%`, height: `${rect.h}%`,
        cursor: isH ? "col-resize" : "row-resize", zIndex: 10,
      }}
    />
  );
}

export default function SplitPane({
  node, groups, renderGroup, onResize,
}: SplitPaneProps) {
  const layout = useMemo(() => computeLayout(node, 0, 0, 100, 100), [node]);

  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      {layout.panels.map((p) => {
        const group = groups.find((g) => g.id === p.groupId);
        if (!group) return null;
        return (
          <div
            key={p.groupId}
            style={{
              position: "absolute", left: `${p.x}%`, top: `${p.y}%`,
              width: `${p.w}%`, height: `${p.h}%`,
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}
          >
            {renderGroup(group)}
          </div>
        );
      })}
      {layout.handles.map((h) => (
        <AbsoluteHandle key={h.id} rect={h} onResize={onResize} />
      ))}
    </div>
  );
}
