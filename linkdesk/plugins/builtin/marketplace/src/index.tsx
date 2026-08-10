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
 */

import { useTranslation } from "react-i18next";
import { getLoadedPluginManifests } from "@src/pluginLoader/loader";
import { registerCommand } from "@src/core/registry/CommandRegistry";
import { MenuId } from "@src/core/registry/MenuRegistry";
import "./styles/MarketplaceView.css";

const pm = () => (window as any).linkdesk?.pluginManager;

/* ── 模块级：注册 marketplace 命令（Phase 5f 归一化——替代手写 gear 菜单） ── */

let _marketplaceCommandsRegistered = false;

function ensureMarketplaceCommands(): void {
  if (_marketplaceCommandsRegistered) return;
  _marketplaceCommandsRegistered = true;

  registerCommand("marketplace", {
    id: "marketplace.enable",
    title: "启用",
    handler: async (_token, ...args) => {
      const ctx = args[0] as { pluginId?: string } | undefined;
      if (ctx?.pluginId) await pm().enable(ctx.pluginId);
    },
  });

  registerCommand("marketplace", {
    id: "marketplace.disable",
    title: "禁用",
    handler: async (_token, ...args) => {
      const ctx = args[0] as { pluginId?: string } | undefined;
      if (ctx?.pluginId) await pm().disable(ctx.pluginId);
    },
  });

  registerCommand("marketplace", {
    id: "marketplace.uninstall",
    title: "卸载",
    handler: async (_token, ...args) => {
      const ctx = args[0] as { pluginId?: string } | undefined;
      if (ctx?.pluginId) await pm().uninstall(ctx.pluginId);
    },
  });

  (window as any).linkdesk?.menu?.registerItems(MenuId.MarketplaceItemGear, "marketplace", [
    { command: "core.openSettings", group: "navigation", when: "extensionHasConfiguration" },
    { command: "workbench.action.selectTheme", group: "navigation", when: "extensionHasThemes" },
    { command: "workbench.action.selectLanguage", group: "navigation", when: "extensionHasLanguages" },
    { command: "workbench.action.selectIconTheme", group: "navigation", when: "extensionHasIconThemes" },
    { command: "workbench.action.openExtensionKeybindings", group: "navigation", when: "extensionHasKeybindings" },
    { command: "marketplace.enable", group: "navigation", when: "pluginDisabled" },
    { command: "marketplace.disable", group: "navigation", when: "!pluginDisabled" },
    { command: "marketplace.uninstall", group: "delete" },
  ]);
}

/* 模块加载时注册——幂等（_marketplaceCommandsRegistered guard）。
 * 🔥 此文件由壳的 loader 加载（glob 插件——isRuntime=false），非池插件。
 * 因此仍使用 @src/core/registry/CommandRegistry 直接注册，不走 lk.commands.registerCommand。
 * lk.commands.registerCommand 仅存在于 preload-pool.ts——壳 preload 不支持。 */
ensureMarketplaceCommands();

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
