/**
 * SplitPane — 递归分屏容器。
 * Phase 3.x：替代扁平 2-pane，支持 SplitNode 树的任意深度渲染。
 * 每个 branch 节点有独立的可拖拽分割条。
 * 设计依据：[V3-Phase3-补充-递归分屏.md §4]
 */

import { useRef, useCallback, useEffect, useState } from "react";
import type { SplitNode } from "../hooks/splitTree";
import type { TabGroup } from "../hooks/useTabManager";
import { getAllLeafGroupIds } from "../hooks/splitTree";
import "./SplitPane.css";

interface SplitPaneProps {
  node: SplitNode;
  groups: TabGroup[];
  renderGroup: (group: TabGroup) => React.ReactNode;
  onResize?: (anchorGroupId: string, sizes: [number, number]) => void;
}

export default function SplitPane({
  node,
  groups,
  renderGroup,
  onResize,
}: SplitPaneProps) {
  /* ── Leaf ── */
  if (node.type === "leaf") {
    const group = groups.find((g) => g.id === node.groupId);
    if (!group) return null;
    return <>{renderGroup(group)}</>;
  }

  /* ── Branch ── */
  const [child0, child1] = node.children;

  // 找到 child0 中任意一个 leaf groupId 作为 resize 锚点
  const anchorGroupId =
    child0.type === "leaf"
      ? child0.groupId
      : getAllLeafGroupIds(child0)[0];

  return (
    <BranchPane
      direction={node.direction}
      sizes={node.sizes}
      anchorGroupId={anchorGroupId}
      onResize={onResize}
    >
      <SplitPane node={child0} groups={groups} renderGroup={renderGroup} onResize={onResize} />
      <SplitPane node={child1} groups={groups} renderGroup={renderGroup} onResize={onResize} />
    </BranchPane>
  );
}

/* ── BranchPane：单个分屏层的容器 + 拖拽分割条 ── */

function BranchPane({
  direction,
  sizes,
  anchorGroupId,
  onResize,
  children,
}: {
  direction: "horizontal" | "vertical";
  sizes: [number, number];
  anchorGroupId: string;
  onResize?: (anchorGroupId: string, sizes: [number, number]) => void;
  children: [React.ReactNode, React.ReactNode];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [resizing, setResizing] = useState(false);
  const [localSizes, setLocalSizes] = useState<[number, number]>(sizes);
  const localSizesRef = useRef<[number, number]>(sizes);

  // 同步外部 sizes 变化
  useEffect(() => {
    setLocalSizes(sizes);
    localSizesRef.current = sizes;
  }, [sizes[0], sizes[1]]);

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    setResizing(true);
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const total = direction === "horizontal" ? rect.width : rect.height;
      const pos = direction === "horizontal" ? e.clientX - rect.left : e.clientY - rect.top;
      const pct = Math.min(80, Math.max(20, (pos / total) * 100));
      const newSizes: [number, number] = [pct, 100 - pct];
      localSizesRef.current = newSizes;
      setLocalSizes(newSizes);
    };
    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      setResizing(false);
      if (localSizesRef.current[0] !== sizes[0]) {
        onResize?.(anchorGroupId, localSizesRef.current);
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [direction, sizes, anchorGroupId, onResize]);

  return (
    <div
      ref={containerRef}
      className={`split-pane ${direction === "horizontal" ? "horizontal" : "vertical"}${resizing ? " resizing" : ""}`}
      style={{
        display: "flex",
        flexDirection: direction === "horizontal" ? "row" : "column",
        flex: 1,
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <div style={{ flex: localSizes[0], overflow: "hidden", minWidth: 0, minHeight: 0 }}>
        {children[0]}
      </div>
      <div
        className="split-pane-handle"
        onMouseDown={onHandleMouseDown}
        style={{
          flexShrink: 0,
          cursor: direction === "horizontal" ? "col-resize" : "row-resize",
        }}
      />
      <div style={{ flex: localSizes[1], overflow: "hidden", minWidth: 0, minHeight: 0 }}>
        {children[1]}
      </div>
    </div>
  );
}
