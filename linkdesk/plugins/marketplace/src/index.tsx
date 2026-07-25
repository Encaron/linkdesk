/**
 * MarketplaceView — 插件市场主区（导航页）。
 * Phase 4 UX：对标 VS Code——侧栏是插件列表，主区是详情/引导。
 *   点 🧩 → 侧栏展示列表，主区保持当前标签页不动。
 *   点侧栏某插件 → 主区新标签页打开 PluginDetailView。
 *
 * 此组件仅在用户手动创建插件市场标签页时渲染（欢迎/引导页）。
 */

import { useTranslation } from "react-i18next";
import { getLoadedPluginManifests } from "@src/pluginLoader/loader";
import "./MarketplaceView.css";

function MarketplaceView({ isActive: _isActive }: { isActive: boolean }) {
  const { t } = useTranslation();
  const count = getLoadedPluginManifests().length;

  return (
    <div className="marketplace-view">
      <div className="marketplace-hero">
        <span className="marketplace-hero-icon">🧩</span>
        <h2 className="marketplace-hero-title">{t("插件管理")}</h2>
        <p className="marketplace-hero-desc">
          {t("已安装 {{count}} 个插件", { count })}
        </p>
        <p className="marketplace-hero-hint">
          {t("在左侧侧栏中浏览和管理插件。点击插件可查看详情。")}
        </p>
      </div>
    </div>
  );
}

export default MarketplaceView;
