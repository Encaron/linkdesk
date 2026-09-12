/**
 * ShellViewRenderer——E5.6#16.7k-1。
 *
 * Pool 侧壳级视图路由——根据 tab.shellType 渲染对应组件。
 * 这些视图的底座是壳的保底 UI（欢迎页/插件详情/输出面板）。plugin-detail 例外（E6#30.10b）：
 * 市场 UI 归市场插件所有——活跃 marketplace 插件经 contributes.views.main[] 贡献详情渲染面，
 * ShellViewRenderer 解析 plugin-detail tab 时把渲染让给插件贡献（PluginDetailViewHost 三态路由），
 * 壳 PluginDetailPoolView 降级为保底宿主（无贡献/贡献加载失败时兜底）。
 *
 * 所有数据走 window.linkdesk.* IPC（不 import @src/core——Path B 合规）。
 */

import { useTranslation } from "react-i18next";
import type { PoolTab } from "../../../core/types/pool/poolLayout";
import type { CreatableViewMeta } from "../../../core/types/pool/poolLayout";
import WelcomePoolView from "../welcome/WelcomePoolView";
import PluginDetailViewHost from "../plugin-detail/PluginDetailViewHost";
import OutputPoolView from "../output/OutputPoolView";
import ReleaseNotesPoolView from "../release-notes/ReleaseNotesPoolView";
import AboutView from "../about/AboutView";

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
  /** 发行说明（E6#57.13）——壳取数、池只画，数据走 `PoolTab.releaseNotes` */
  ReleaseNotes: "release-notes",
  /** 关于（E6#57.14）——同款：壳取数、池只画，数据走 `PoolTab.about` */
  About: "about",
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
      // E6#30.10b：主区详情贡献三态路由（贡献渲染/加载失败保底/无贡献保底）——PluginDetailPoolView 迁入宿主内部
      return <PluginDetailViewHost tab={tab} isActive={isActive} />;
    case SHELL_VIEWS.Output:
      return <OutputPoolView />;
    case SHELL_VIEWS.ReleaseNotes:
      // E6#57.13：数据在壳侧取好（`useReleaseNotes`），本视图只画 `tab.releaseNotes`
      return <ReleaseNotesPoolView tab={tab} isActive={isActive} />;
    case SHELL_VIEWS.About:
      // E6#57.14：同款——数据在壳侧取好（`useAbout`），本视图只画 `tab.about`
      return <AboutView tab={tab} isActive={isActive} />;
    default:
      return (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--text-muted)",
          fontSize: "var(--font-size-sm)", /* E5.8 Phase 12 #171：12→sm */
          userSelect: "none",
        }}>
          {shellType ? t("未知壳视图 {{shellType}}", { shellType }) : t("壳视图")}
        </div>
      );
  }
}
