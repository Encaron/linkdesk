/**
 * commands — marketplace 命令组 + gear 菜单注册（模块级幂等，随任一市场池面激活）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketplaceShared.ts` 原样搬出，零行为变更。
 *
 * 依赖方向：installFlow → 本文件（重试命令的 handler 落点）。本文件是依赖链末端，无人 import 它。
 * 本模块**靠被 import 生效**（模块底自调用）——故 `marketplaceShared.ts` 门面必须 `import "./commands"`，
 * 否则命令组静默不注册（71g 实机 bug 的同款症状）。
 */

import { retryMarketInstall, retryMarketUpdate } from "./installFlow";

const lk = () => window.linkdesk;

const pm = () => window.linkdesk?.pluginManager;

/* ═══ E6#71g marketplace 命令组注册（模块级——原 index.tsx 迁入，注册随任一市场视图激活） ═══
 * 背景：marketplace.enable/disable/uninstall/retryInstall + gear 菜单原只在 index.tsx 模块顶注册
 * （市场落地页标签打开才执行）。但安装/卸载失败 toast 在 DetailView/ExploreView 触发（import 本模块，
 * 不经 index.tsx）→ 壳 executeCommand 需壳 CommandRegistry 占位（池 commands:register 同步元数据）——
 * 落地页未打开 = 未注册 = console.warn no-op → toast [重试] 点击无反应（71g 实机 bug 根因）。
 * 本模块被全部市场池面 import（侧栏已装/禁用/内置、探索、详情、落地页）——迁移后注册随任一视图
 * 激活即生效，池侧 handler 进 _poolCommands；壳进程经 glob loader 执行 marketplace entry（index →
 * marketplaceShared）启动即注册 → toast 落点自给自足，不再依赖落地页打开。 */
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

  // E6#30.9b：失败 toast [重试] 主动作落点（消费 E6#13.5f actions）——args 带 pluginId+downloadUrl
  // （settleInstallFailure 构造），自给自足。E6#73c 第 2 步起**不再回落会话读取**（会话单例已拆）——
  // 缺任一参数即静默不发（[重试] 的构造点必带两者，缺 = 不是本命令的调用）。
  reg(
    "marketplace.retryInstall",
    async (...args: unknown[]) => {
      const ctx = (args[0] ?? {}) as { pluginId?: string; downloadUrl?: string } | undefined;
      if (ctx?.pluginId && ctx.downloadUrl) await retryMarketInstall(ctx.pluginId, ctx.downloadUrl);
    },
    { title: "重试安装" },
  );

  // E6#73j：更新失败 toast [重试] 的落点（settleUpdateFailure 构造，args 自带 pluginId+downloadUrl+
  // displayName，自给自足）。与安装同款：仍过一次确认门（E6#71k）。
  reg(
    "marketplace.retryUpdate",
    async (...args: unknown[]) => {
      const ctx = (args[0] ?? {}) as { pluginId?: string; downloadUrl?: string; displayName?: string } | undefined;
      if (ctx?.pluginId && ctx.downloadUrl) await retryMarketUpdate(ctx.pluginId, ctx.downloadUrl, ctx.displayName);
    },
    { title: "重试更新" },
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

/* E6#71g：命令注册随模块加载执行（幂等 guard）——任意市场池面 import 本模块即注册（含壳进程 startup） */
ensureMarketplaceCommands();
