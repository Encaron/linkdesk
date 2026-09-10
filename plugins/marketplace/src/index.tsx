/**
 * MarketplaceView — 插件市场主区（导航页）。
 * Phase 4 UX：对标 VS Code——侧栏是插件列表，主区是详情/引导。
 *   点 🧩 → 侧栏展示列表，主区保持当前标签页不动。
 *   点侧栏某插件 → 主区新标签页打开 PluginDetailView。
 *
 * 此组件仅在用户手动创建插件市场标签页时渲染（欢迎/引导页）。
 *
 * E3.6 E36#7.8：marketplace 命令注册从 sidebar.tsx 移至此文件模块级——
 * SidePanel 走 ViewContainer 后旧 MarketplaceSidebar 不再渲染。
 * E6#71g：命令组注册已迁 marketplaceShared 模块顶（ensureMarketplaceCommands）——
 * 本文件只留视图本身；命令随任一市场视图 import marketplaceShared 即注册（toast [重试] 落点不再依赖落地页）。
 */

import { useTranslation } from "react-i18next";
import { useMarketplacePlugins } from "./services/marketplaceShared";
import "./styles/MarketplaceView.css";

function MarketplaceView({ isActive: _isActive }: { isActive: boolean }) {
  const { t } = useTranslation();
  // E5.7#56：count 改走 useMarketplacePlugins（与 InstalledListView 同款数据源）。
  // 原 getLoadedPluginManifests import 在池进程解析到空 loader 实例 → 恒 0 的隐性 bug。
  const { installed, loading } = useMarketplacePlugins();
  const count = installed.length;

  return (
    <div className="marketplace-view">
      <div className="marketplace-hero">
        <span className="marketplace-hero-icon">🧩</span>
        <h2 className="marketplace-hero-title">{t("插件管理")}</h2>
        <p className="marketplace-hero-desc">
          {loading ? t("加载中...") : t("已安装 {{count}} 个插件", { count })}
        </p>
        <p className="marketplace-hero-hint">
          {t("在左侧侧栏中浏览和管理插件。点击插件可查看详情。")}
        </p>
      </div>
    </div>
  );
}

export default MarketplaceView;
