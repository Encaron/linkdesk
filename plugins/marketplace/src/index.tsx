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
import { useMarketplacePlugins } from "./services/marketplaceShared";
import "./styles/MarketplaceView.css";

const lk = () => window.linkdesk;
const pm = () => window.linkdesk?.pluginManager;

/* ── 模块级：注册 marketplace 命令（Phase 5f 归一化——替代手写 gear 菜单） ── */

let _marketplaceCommandsRegistered = false;

function ensureMarketplaceCommands(): void {
  if (_marketplaceCommandsRegistered) return;
  _marketplaceCommandsRegistered = true;

  // E5.7#56：零 @src/core import——插件入口模块双进程执行（壳 glob loader + 池视图渲染）。
  // 注册走 window.linkdesk.commands：壳侧半程 → commands:registerShell → 壳注册表真实条目
  // （handler 存壳 preload 页面世界代理，执行 _executeShellLocal 桥回）；池侧半程 →
  // commands:register → 元数据同步 + 池 _poolCommands 存 handler。两半程幂等汇合
  // （registerShellLocalCommand / registerPoolCommandMetadata 各有已有条目分支）。
  // 菜单 slot ID 用字符串字面量（serial-monitor E5.6#11.5h 同款——MenuId 不再 import）。
  const reg = lk().commands?.registerCommand;
  if (!reg) return; // 双进程执行——壳/池 preload 均含 commands 命名空间（#56 后），守卫防旧环境

  // handler 不声明 _token——两半程 infra 均已剥离 token 占位后才调 handler：
  // 池侧 executeCommand 剥 undefined 占位；壳侧 registerShellLocalCommand 桥剥 _token。
  // handler 直接收 realArgs（file-tree E5.6 池侧注册同款约定）。
  reg(
    "marketplace.enable",
    async (...args: unknown[]) => {
      const ctx = args[0] as { pluginId?: string } | undefined;
      if (ctx?.pluginId) await pm().enable(ctx.pluginId);
    },
    { title: "启用" },
  );

  reg(
    "marketplace.disable",
    async (...args: unknown[]) => {
      const ctx = args[0] as { pluginId?: string } | undefined;
      if (ctx?.pluginId) await pm().disable(ctx.pluginId);
    },
    { title: "禁用" },
  );

  reg(
    "marketplace.uninstall",
    async (...args: unknown[]) => {
      const ctx = args[0] as { pluginId?: string } | undefined;
      if (ctx?.pluginId) await pm().uninstall(ctx.pluginId);
    },
    { title: "卸载" },
  );

  lk().menu?.registerItems?.("marketplaceItemGear", "marketplace", [
    { command: "core.openSettings", group: "navigation", when: "extensionHasConfiguration" },
    { command: "theme.pick", group: "navigation", when: "extensionHasThemes" }, // E5.8#50.24：theme.pick 归一化命令 id
    { command: "workbench.action.selectLanguage", group: "navigation", when: "extensionHasLanguages" },
    { command: "workbench.action.selectIconTheme", group: "navigation", when: "extensionHasIconThemes" },
    { command: "workbench.action.openExtensionKeybindings", group: "navigation", when: "extensionHasKeybindings" },
    { command: "marketplace.enable", group: "navigation", when: "pluginDisabled" },
    { command: "marketplace.disable", group: "navigation", when: "!pluginDisabled" },
    { command: "marketplace.uninstall", group: "delete" },
  ]);
}

/* 模块加载时注册——幂等（_marketplaceCommandsRegistered guard）。
 * 🔥 双进程执行：壳进程经 glob loader 在启动时执行（命令实时可用的保障），
 * 池进程在插件市场标签页渲染时执行（handler 进池 _poolCommands）。
 * 两半程都走 window.linkdesk.* —— 零 @src/core import（E5.7#56）。 */
ensureMarketplaceCommands();

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
