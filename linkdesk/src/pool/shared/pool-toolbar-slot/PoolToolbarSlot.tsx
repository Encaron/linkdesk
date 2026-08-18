/**
 * PoolToolbarSlot——E5.6#11f。
 *
 * 对标 ToolbarSlot.tsx。toolbar 角色 view 的渲染容器。
 * 池版差别：prop SidebarViewMeta[]（非 ViewDescriptor[]），
 * 渲染 PluginComponent（非 view.render()），组件通过 renderPath 加载。
 *
 * ResizeObserver → onHeightChange——toolbar 高度变化时通知父组件。
 */

import { useRef, useLayoutEffect, useState } from "react";
import type { SidebarViewMeta } from "../../../core/types/pool/poolLayout";
import ErrorBoundary from "../error-boundary/ErrorBoundary"; // E5.7#20：池侧版（不 import 壳 components 目录）
import PluginComponent from "../plugin-component/PluginComponent";

interface PoolToolbarSlotProps {
  views: SidebarViewMeta[];
  onHeightChange: (h: number) => void;
}

export default function PoolToolbarSlot({ views, onHeightChange }: PoolToolbarSlotProps) {
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
    <div ref={ref} className="side-panel-toolbar">
      {views.map((view) => (
        <ErrorBoundary key={view.id} pluginId={view.pluginId}>
          <PluginComponent
            pluginId={view.pluginId}
            renderPath={view.renderPath}
            isActive={true}
          />
        </ErrorBoundary>
      ))}
    </div>
  );
}
