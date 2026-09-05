/**
 * PluginLifecycle 事件定义——轻模块（无重依赖）。
 *
 * 🔥 为什么拆出来：E5.8#9 可逆注册——registrationTracker.ts 需要订阅
 *   PluginLifecycle.onWillUninstall 做自动逆序回滚。若从 lifecycle.ts 直接 import，
 *   会形成 CommandRegistry → tracker → lifecycle → CommandRegistry 循环依赖
 *   （lifecycle.ts 静态 import 了 CommandRegistry 做消费端 2b 的 unregister* 清理）。
 *   本模块只放 Emitter 定义 + 事件类型——不 import 任何注册表/服务。
 *
 * 消费方路径：lifecycle.ts `export { PluginLifecycle } from "./lifecycle-events"`
 *   重导出——既有 `import { PluginLifecycle } from "./lifecycle"` 调用面零改动。
 */

import { Emitter } from "../../core/react/events/CoreEvents";
import type { PluginManifest } from "../../core/api/types";

/* ── 事件类型 ── */

export interface PluginInstallEvent {
  pluginId: string;
  manifest: PluginManifest;
  /** 'install' | 'reinstall' = 新装/重装 → 追加到图标末尾；'enable' = 恢复 → 保持原位；'startup' = 启动加载 → 保持原位；'update' = 更新（E6#11c）→ 保持原位 */
  reason: "install" | "reinstall" | "enable" | "startup" | "update";
}

export interface PluginUninstallEvent {
  pluginId: string;
  /** 'uninstall' = 卸载 → 从 iconOrder 移除；'disable' = 禁用 → 保留 iconOrder 位置；'update' = 更新前退旧实例（E6#11c，原子替换前 unload 同一机械路径）→ 保留 iconOrder 位置 */
  reason: "uninstall" | "disable" | "update";
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

/** 视图刷新通知（对标 viewRegistry 的 onDidRegister）——消费方见 runtime.ts */
export const onPluginLifecycleChange = new Emitter<void>();
