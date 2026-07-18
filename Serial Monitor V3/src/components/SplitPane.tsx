/**
 * SplitPane — 纯 CSS 分屏容器，替代 allotment。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §4.2 备选方案]
 *
 * 使用 CSS grid + 可拖拽分割条。无外部依赖。
 * resize 手柄最小宽度 4px，hover 时 6px 高亮。
 */

import { useRef, useCallback, useEffect, useState } from "react";
import "./SplitPane.css";

interface SplitPaneProps {
  direction: "horizontal" | "vertical";
  sizes: [number, number]; // 百分比
  onResize?: (sizes: [number, number]) => void;
  children: [React.ReactNode, React.ReactNode];
}

export default function SplitPane({
  direction,
  sizes,
  onResize,
  children,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [localSizes, setLocalSizes] = useState<[number, number]>(sizes);

  // 同步外部 sizes 变化
  useEffect(() => {
    setLocalSizes(sizes);
  }, [sizes]);

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const isHorizontal = direction === "horizontal";
      const total = isHorizontal ? rect.width : rect.height;
      const pos = isHorizontal ? e.clientX - rect.left : e.clientY - rect.top;
      const pct = Math.min(80, Math.max(20, (pos / total) * 100));
      const newSizes: [number, number] = [pct, 100 - pct];
      setLocalSizes(newSizes);
    };
    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      onResize?.(localSizes);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [direction, localSizes, onResize]);

  const isHorizontal = direction === "horizontal";

  return (
    <div
      ref={containerRef}
      className={`split-pane ${isHorizontal ? "horizontal" : "vertical"}`}
      style={{
        gridTemplateColumns: isHorizontal ? `${localSizes[0]}% 4px 1fr` : "1fr",
        gridTemplateRows: isHorizontal ? "1fr" : `${localSizes[0]}% 4px 1fr`,
      }}
    >
      <div className="split-pane-child" style={{ overflow: "hidden" }}>
        {children[0]}
      </div>
      <div
        className="split-pane-handle"
        onMouseDown={onHandleMouseDown}
        style={{
          cursor: isHorizontal ? "col-resize" : "row-resize",
        }}
      />
      <div className="split-pane-child" style={{ overflow: "hidden" }}>
        {children[1]}
      </div>
    </div>
  );
}
