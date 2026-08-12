/**
 * ShellViewRenderer——E5.6#16.7k-1。
 *
 * Pool 侧壳级视图路由——根据 tab.shellType 渲染对应组件。
 * 这些视图不是插件——是壳的保底 UI（欢迎页/插件详情/输出面板）。
 *
 * 所有数据走 window.linkdesk.* IPC（不 import @src/core——Path B 合规）。
 */

import type { PoolTab } from "../../core/types/poolLayout";
import type { CreatableViewMeta } from "../../core/types/poolLayout";
import WelcomePoolView from "./WelcomePoolView";
import PluginDetailPoolView from "./PluginDetailPoolView";
import OutputPoolView from "./OutputPoolView";

interface ShellViewRendererProps {
  tab: PoolTab;
  isActive: boolean;
  creatableViews?: CreatableViewMeta[];
}

export default function ShellViewRenderer({ tab, isActive, creatableViews }: ShellViewRendererProps) {
  const shellType = tab.shellType ?? tab.pluginId;

  switch (shellType) {
    case "welcome":
      return <WelcomePoolView isActive={isActive} creatableViews={creatableViews} />;
    case "plugin-detail":
      return <PluginDetailPoolView pluginId={tab.detailPluginId} />;
    case "output":
      return <OutputPoolView />;
    default:
      return (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--text-muted)",
          fontSize: 12,
          userSelect: "none",
        }}>
          {shellType ? `未知壳视图: ${shellType}` : "壳视图"}
        </div>
      );
  }
}
