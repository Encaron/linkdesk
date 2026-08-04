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

import { Emitter, CUSTOM_EVENTS } from "../core/react/CoreEvents";
import { pushToast, TOAST_TTL_ERROR, TOAST_TTL_INFO } from "../core/services/NotificationService";
import { getPluginStateValue, setPluginStateValueSync, APP_PLUGIN_ID } from "../core/services/PluginStateService";
import { unregisterConfiguration, unregisterConfigurationDefaults } from "../core/registry/ConfigurationRegistry";
import { unregisterPluginCommands } from "../core/registry/CommandRegistry";
import { unregisterPluginKeybindings } from "../core/registry/KeybindingRegistry";
import { unregisterPluginMenus, unregisterPluginTitleBarContributions } from "../core/registry/MenuRegistry";
import { unregisterPluginProtocols } from "../core/registry/ProtocolRegistry";
import { unregisterPluginCards } from "../core/CardRegistry";
import { unregisterPluginChannels } from "../core/LogChannel";
import { unregisterPluginFileAssociations } from "../core/services/FileAssociationService";
import { unregisterPluginThemes } from "../core/ThemeEngine";
import { ThemeRegistry } from "../core/registry/ThemeRegistry";
import { unregisterStatusBarPlugin } from "../core/registry/StatusBarService";
import i18n from "../i18n";
import type { PluginManifest } from "../core/api/types";

/* ── 事件类型 ── */

export interface PluginInstallEvent {
  pluginId: string;
  manifest: PluginManifest;
  /** 'install' | 'reinstall' = 新装/重装 → 追加到图标末尾；'enable' = 恢复 → 保持原位；'startup' = 启动加载 → 保持原位 */
  reason: "install" | "reinstall" | "enable" | "startup";
}

export interface PluginUninstallEvent {
  pluginId: string;
  /** 'uninstall' = 卸载 → 从 iconOrder 移除；'disable' = 禁用 → 保留 iconOrder 位置 */
  reason: "uninstall" | "disable";
  /** 显示名称——onDidUninstall 触发时 viewRegistry 已注销，提前传入避免 toast 显示 pluginId */
  displayName?: string;
}

/* ── 事件定义 ── */

export const PluginLifecycle = {
  /** 插件已安装并注册完成（install/reinstall/enable/startup）*/
  onDidInstall: new Emitter<PluginInstallEvent>(),

  /** 插件即将卸载/禁用——在 viewRegistry 注销之前 */
  onWillUninstall: new Emitter<PluginUninstallEvent>(),

  /** 插件已卸载/禁用完成——在 viewRegistry 注销之后 */
  onDidUninstall: new Emitter<PluginUninstallEvent>(),
};

/* ── 视图刷新——Emitter 模式（对标 viewRegistry 的 onDidRegister） ── */

export const onPluginLifecycleChange = new Emitter<void>();

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
    // 卸载/禁用时清理全部注册表——和消费端 2（config）覆盖所有 10 个注册表
    // E36#4.7: ViewContainerService 显式清理（RegistryBase 自动处理程序已覆盖，idempotent）
    // 动态 import——避免静态 import 形成 lifecycle ↔ RegistryBase 循环依赖
    import("../core/ViewContainerService").then(({ ViewContainerService }) => {
      ViewContainerService.unregisterAll(pluginId);
    }).catch(() => {});
    unregisterPluginCommands(pluginId);
    unregisterPluginKeybindings(pluginId);
    unregisterPluginMenus(pluginId);
    unregisterPluginTitleBarContributions(pluginId);
    unregisterPluginProtocols(pluginId);
    unregisterPluginCards(pluginId);
    unregisterPluginChannels(pluginId);
    unregisterPluginFileAssociations(pluginId);
    unregisterPluginThemes(pluginId);
    ThemeRegistry.unregisterPlugin(pluginId);
    unregisterStatusBarPlugin(pluginId);
    // H6：清理语言插件注册的 i18n 资源（按 pluginId 命名空间追踪）
    for (const lang of i18n.languages ?? []) {
      i18n.removeResourceBundle(lang, pluginId);
    }
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
    import("../core/services/PluginStateService").then(({ setPluginStateValue }) => {
      setPluginStateValue(APP_PLUGIN_ID, "iconOrder", filtered).catch(() => {});
    });
  } catch { /* 非关键路径 */ }
}
