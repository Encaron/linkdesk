/**
 * ToolbarSlot —— toolbar 角色 view 的渲染容器。
 * E36#ROLE5：从 SidePanel 提取——每种角色管自己的状态，互不泄漏。
 *
 * 对标 VS Code：toolbar view 粘在侧栏顶部，z-index 高于所有 section header。
 * 组件销毁 → height state 跟着销毁 → 不残留到其他容器。
 */

import { useRef, useLayoutEffect, useState } from "react";
import type { ViewDescriptor } from "../../core/ViewContainerService";
import ErrorBoundary from "./ErrorBoundary";

interface ToolbarSlotProps {
  views: ViewDescriptor[];
  pluginId: string;
  onHeightChange: (h: number) => void;
}

export default function ToolbarSlot({ views, pluginId, onHeightChange }: ToolbarSlotProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  /* ResizeObserver——toolbar 高度变化时通知父组件 */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) { setHeight(0); onHeightChange(0); return; }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h !== height) { setHeight(h); onHeightChange(h); }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [views, height, onHeightChange]);

  if (views.length === 0) return null;

  return (
    <div
      ref={ref}
      className="side-panel-toolbar"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 2,
        background: "var(--bg-side-panel)",
        overflow: "hidden",
      }}
    >
      {views.map((view) => (
        <ErrorBoundary key={view.id} pluginId={pluginId}>
          <view.render />
        </ErrorBoundary>
      ))}
    </div>
  );
}
