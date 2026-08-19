/**
 * PluginLifecycle 事件总线——loader.ts 行为归一化。
 *
 * 🔥 为什么存在：
 *   5 个生命周期函数（install/uninstall/reinstall/enable/disable）各自独立维护
 *   5-6 个副作用（viewRegistry + configRegistry + iconOrder + toast + loadedIds + tabCleanup）
 *   = 30 个维护点。80 个 commit 修同一个伤口：改一个函数漏另一个。
 *
 * VS Code 模式：生产者只 fire 事件，消费端各自订阅。新增/删除消费端不改生产者。
 *
 * 设计依据：[[Phase5h-PluginLifecycle-行为归一化]]
 *
 * @see loader.ts —— 5 个函数只管触发此总线的事件
 */

import { CUSTOM_EVENTS } from "../core/react/events/CoreEvents";
import { pushToast, TOAST_TTL_ERROR, TOAST_TTL_INFO } from "../core/services/ui/NotificationService";
import { getPluginStateValue, setPluginStateValueSync, APP_PLUGIN_ID } from "../core/services/plugins/PluginStateService";
import { unregisterConfiguration, unregisterConfigurationDefaults } from "../core/registry/ConfigurationRegistry";
import { unregisterPluginCommands } from "../core/registry/commands/CommandRegistry";
import { unregisterPluginKeybindings } from "../core/registry/commands/KeybindingRegistry";
import { unregisterPluginMenus, unregisterPluginTitleBarContributions } from "../core/registry/commands/MenuRegistry";
import { unregisterPluginChannels } from "../core/services/ui/LogChannel";
import { unregisterPluginThemes } from "../core/services/ui/ThemeEngine";
import { ThemeRegistry } from "../core/registry/appearance/ThemeRegistry";
import { unregisterStatusBarPlugin } from "../core/services/ui/StatusBarService";
import { unregisterPluginLanguageBundles } from "./i18nResources";

// E5.8#9：事件定义抽到轻模块 lifecycle-events.ts——registrationTracker 直接 import 它，
// 避免 CommandRegistry → tracker → lifecycle → CommandRegistry 循环依赖。
// 本地 import（notifyPluginViews 引用 onPluginLifecycleChange）+ 重导出（既有调用面零改动）。
import { PluginLifecycle, onPluginLifecycleChange } from "./lifecycle-events";
export { PluginLifecycle, onPluginLifecycleChange } from "./lifecycle-events";
// 只重导出有消费方的类型——PluginUninstallEvent 全仓零 import（knip 实锤），不重导出
export type { PluginInstallEvent } from "./lifecycle-events";

/* ── 视图刷新——Emitter 模式（对标 viewRegistry 的 onDidRegister） ── */

function notifyPluginViews(): void {
  onPluginLifecycleChange.fire();
}

/* ── 消费端初始化（模块加载时注册，不依赖 App 启动顺序） ── */

let _consumersInitialized = false;

export function initLifecycleConsumers(): void {
  if (_consumersInitialized) return;
  _consumersInitialized = true;

  /* ─── 消费端 1：图标排序 ─── */

  PluginLifecycle.onDidInstall.event(({ pluginId, reason }) => {
    if (reason === "install" || reason === "reinstall") {
      // 新装/重装 → 追加到图标栏末尾
      updateIconOrder(pluginId, "append");
    }
    // 'enable'/'startup' → 保持原位——不操作 iconOrder
  });

  PluginLifecycle.onWillUninstall.event(({ pluginId, reason }) => {
    if (reason === "uninstall") {
      // 卸载 → 从 iconOrder 移除（下次重装时排到末尾）
      updateIconOrder(pluginId, "remove");
    }
    // 'disable' → 保留 iconOrder 位置（下次启用时恢复原位）
  });

  /* ─── 消费端 2：配置注册清理 ─── */

  PluginLifecycle.onWillUninstall.event(({ pluginId }) => {
    // B70 教训：卸载/禁用时必须清理配置注册——不管 reason
    unregisterConfiguration(pluginId);
    unregisterConfigurationDefaults(pluginId);
  });

  /* ─── 消费端 2b：注册表全量清理（Phase 5 验收 B2——6 个 unregister* 从未被调用） ─── */

  PluginLifecycle.onWillUninstall.event(({ pluginId }) => {
    // 卸载/禁用时清理全部注册表——和消费端 2（config）覆盖所有 9 个注册表
    // E36#4.7: ViewContainerService 显式清理（RegistryBase 自动处理程序已覆盖，idempotent）
    // 动态 import——避免静态 import 形成 lifecycle ↔ RegistryBase 循环依赖
    import("../core/services/layout/ViewContainerService").then(({ ViewContainerService }) => {
      ViewContainerService.unregisterAll(pluginId);
    }).catch(() => {}); // 非关键操作——清理注册表，失败不阻塞卸载流程
    unregisterPluginCommands(pluginId);
    unregisterPluginKeybindings(pluginId);
    unregisterPluginMenus(pluginId);
    unregisterPluginTitleBarContributions(pluginId);
    // E5.7#49：unregisterPluginProtocols 已删——ProtocolRegistry 唯一实例在主进程，
    // 卸载清理由 loader 的 plugins:rescanManifests → 主进程全清全重扫覆盖（壳实例已空，此处成死写）
    // E5.7#45.7：unregisterPluginCards 已删——CardRegistry 整删（Phase 5 柱子 5 骨架，
    // registerCard 全仓零调用，卡片工作台插件从未存在于此树；未来重建走插件自持注册表）
    unregisterPluginChannels(pluginId);
    // E5.7#50：unregisterPluginFileAssociations 已删——FileAssociationService 唯一实例在主进程，
    // 卸载清理由 plugins:rescanManifests → 主进程全清全重扫覆盖（壳实例已空，此处成死写）
    unregisterPluginThemes(pluginId);
    ThemeRegistry.unregisterPlugin(pluginId);
    unregisterStatusBarPlugin(pluginId);
    // H6 升级（重装契约修复）：语言资源清理收敛于 i18nResources 单一实现——
    // 原只删 pluginId 命名空间 → translation 命名空间死键残留；现按剩余插件整份重建。
    unregisterPluginLanguageBundles(pluginId);
  });

  /* ─── 消费端 3：toast 通知 ─── */

  PluginLifecycle.onDidInstall.event(({ pluginId, manifest, reason }) => {
    const name = manifest?.name ?? pluginId;
    if (reason === "startup") return; // 启动加载不弹 toast
    const msg = reason === "enable" ? `已启用：${name}` : `已安装：${name}`;
    pushToast({
      message: `${msg}（即时生效）`,
      source: pluginId,
      severity: "info",
      ttl: TOAST_TTL_INFO,
    });
  });

  PluginLifecycle.onDidUninstall.event(({ pluginId, reason, displayName }) => {
    const name = displayName ?? pluginId;
    const msg = reason === "uninstall" ? `已卸载：${name}` : `已禁用：${name}`;
    pushToast({
      message: msg,
      source: pluginId,
      severity: "info",
      ttl: TOAST_TTL_ERROR,
      actions: reason === "uninstall"
        ? [{ label: "撤销", isPrimary: true, onClick: () => {
            // 动态 import 避免循环依赖
            import("./loader").then((m) => m.reinstallPlugin(pluginId))
              .catch((e) => console.error("[lifecycle] 撤销卸载——模块加载失败:", e));
          }}]
        : [{ label: "撤销", isPrimary: true, onClick: () => {
            import("./loader").then((m) => m.enablePlugin(pluginId))
              .catch((e) => console.error("[lifecycle] 撤销禁用——模块加载失败:", e));
          }}],
    });
  });

  /* ─── 消费端 4：标签页清理 ─── */

  PluginLifecycle.onWillUninstall.event(({ pluginId }) => {
    // 通知壳关闭使用此插件的标签页——必须在 unregisterViewPlugin 之前
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.PLUGIN_REMOVED, { detail: { pluginId } }));
  });

  /* ─── 消费端 5：视图刷新通知（CustomEvent + 版本标记双保险） ─── */

  PluginLifecycle.onDidUninstall.event(() => { notifyPluginViews(); });
  PluginLifecycle.onDidInstall.event(() => { notifyPluginViews(); });

  /* ─── 消费端 6：IPC 广播——安装/卸载通知到唯一 Pool（E5.7#83） ─── */

  // plugin:installed / plugin:uninstalled 带 pluginId 载荷——池侧按插件精确反应
  // （全量刷新走泛化 nudge plugin-lifecycle:changed；本通道供按插件消费方）。
  // 链：壳 events.emit → 主进程 onPluginEmit → broadcast → 池 events.on（同 plugin:installProgress）。
  // 只在 install/reinstall/uninstall 触发——enable/disable/startup 是状态切换非装卸，不进。
  PluginLifecycle.onDidInstall.event(({ pluginId, manifest, reason }) => {
    if (reason !== "install" && reason !== "reinstall") return;
    try {
      window.linkdesk?.events?.emit("plugin:installed", {
        pluginId,
        version: manifest?.version,
        reason,
      });
    } catch { /* 广播失败不阻塞生命周期 */ }
  });

  PluginLifecycle.onDidUninstall.event(({ pluginId, reason }) => {
    if (reason !== "uninstall") return;
    try {
      window.linkdesk?.events?.emit("plugin:uninstalled", { pluginId, reason });
    } catch { /* 广播失败不阻塞生命周期 */ }
  });
}

/* ── 图标排序辅助（和 loader.ts 共享——放在这里归一化） ── */

/**
 * B72/B77 归一化：图标排序更新——"append" 追加到末尾，"remove" 从列表中移除。
 * 同步写内存缓存——确保 React 渲染前生效。
 */
function updateIconOrder(pluginId: string, mode: "append" | "remove"): void {
  try {
    const order = getPluginStateValue<string[]>(APP_PLUGIN_ID, "iconOrder") ?? [];
    const filtered = order.filter((id) => id !== pluginId);
    if (mode === "append") filtered.push(pluginId);
    setPluginStateValueSync(APP_PLUGIN_ID, "iconOrder", filtered);
    // 异步落盘——不阻塞
    import("../core/services/plugins/PluginStateService").then(({ setPluginStateValue }) => {
      setPluginStateValue(APP_PLUGIN_ID, "iconOrder", filtered).catch((e) => { console.error("[lifecycle] 保存图标排序失败:", e); });
    });
  } catch { /* 非关键路径 */ }
}
