/**
 * SidebarRenderer——E5.6#7b。
 *
 * SidebarPool 的 React 渲染器。接收壳推送的 SidebarLayout，
 * visible + viewId → 加载对应插件视图，否则空状态。
 */

import PluginComponent from "./PluginComponent";
import type { SidebarLayout } from "./pool-main";

interface SidebarRendererProps {
  sidebar?: SidebarLayout;
}

export default function SidebarRenderer({ sidebar }: SidebarRendererProps) {
  // 侧栏不可见——不渲染
  if (!sidebar?.visible) {
    return null;
  }

  // 侧栏可见但无视图——空状态
  if (!sidebar.viewId) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--text-muted, #888)",
          fontSize: 13,
          userSelect: "none",
        }}
      >
        此容器没有已注册的视图
      </div>
    );
  }

  return (
    <div style={{ width: sidebar.width, height: "100%", overflow: "hidden" }}>
      <PluginComponent pluginId={sidebar.viewId} isActive={true} />
    </div>
  );
}
