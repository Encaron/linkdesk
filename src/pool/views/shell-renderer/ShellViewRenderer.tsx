/**
 * ShellViewRenderer——E5.6#16.7k-1。
 *
 * Pool 侧壳级视图路由——根据 tab.shellType 渲染对应组件。
 * 这些视图不是插件——是壳的保底 UI（欢迎页/插件详情/输出面板）。
 *
 * 所有数据走 window.linkdesk.* IPC（不 import @src/core——Path B 合规）。
 */

import { useTranslation } from "react-i18next";
import type { PoolTab } from "../../../core/types/pool/poolLayout";
import type { CreatableViewMeta } from "../../../core/types/pool/poolLayout";
import WelcomePoolView from "../welcome/WelcomePoolView";
import PluginDetailPoolView from "../plugin-detail/PluginDetailPoolView";
import OutputPoolView from "../output/OutputPoolView";

/**
 * E5.7#71：壳视图类型常量表——路由契约字符串集中此表。
 * 契约上游：core/types/pool/poolLayout.ts shellType 字段（壳侧 isShellRenderedTab 判壳视图，推送 shellRendered 标志）。
 * 池侧 Path B 不得 value-import @src/core，故契约在池内本地声明——字符串即契约。
 * 壳侧同义集合见 core/utils/tabIdentity.ts SHELL_RENDERED_TYPES（两侧独立声明，新增壳视图需同步）。
 */
const SHELL_VIEWS = {
  /** 欢迎页——壳保底 UI */
  Welcome: "welcome",
  /** 插件详情页 */
  PluginDetail: "plugin-detail",
  /** 输出面板 */
  Output: "output",
} as const;

interface ShellViewRendererProps {
  tab: PoolTab;
  isActive: boolean;
  creatableViews?: CreatableViewMeta[];
}

export default function ShellViewRenderer({ tab, isActive, creatableViews }: ShellViewRendererProps) {
  const { t } = useTranslation();
  const shellType = tab.shellType ?? tab.pluginId;

  switch (shellType) {
    case SHELL_VIEWS.Welcome:
      return <WelcomePoolView isActive={isActive} creatableViews={creatableViews} />;
    case SHELL_VIEWS.PluginDetail:
      return <PluginDetailPoolView pluginId={tab.detailPluginId} />;
    case SHELL_VIEWS.Output:
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
          {shellType ? t("未知壳视图: {{shellType}}", { shellType }) : t("壳视图")}
        </div>
      );
  }
}
