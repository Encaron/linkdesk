/**
 * 视图插件注册表。
 * 核心不认 pluginId——渲染时查此注册表获取 React 组件。
 * 设计依据：[[phase4-design-decisions]] 第 4 条。
 */

import type { ViewPluginEntry, TabBehavior, StatusBarItem } from "../core/types";
import { getBuiltinTabBehavior } from "../hooks/tabIdentity";

const registry = new Map<string, ViewPluginEntry>();

/** 注册视图插件。同名插件优先高版本（P1-6 #7）。 */
export function registerViewPlugin(entry: ViewPluginEntry): void {
  const existing = registry.get(entry.pluginId);
  if (existing) {
    const newVer = entry.manifest.version;
    const oldVer = existing.manifest.version;
    if (compareVersions(newVer, oldVer) > 0) {
      console.warn(
        `[viewRegistry] 插件 "${entry.pluginId}" 重复——使用高版本 v${newVer} 替代 v${oldVer}`
      );
    } else {
      console.warn(
        `[viewRegistry] 插件 "${entry.pluginId}" 重复——保留已有 v${oldVer}，忽略 v${newVer}`
      );
      return;
    }
  }
  registry.set(entry.pluginId, entry);
}

/** 简单 semver 比较：返回 >0 如果 a > b，<0 如果 a < b，0 如果相等 */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

/** 获取单个视图插件 */
export function getViewPlugin(pluginId: string): ViewPluginEntry | undefined {
  return registry.get(pluginId);
}

/** 获取所有已注册视图插件 */
export function getViewPlugins(): ViewPluginEntry[] {
  return Array.from(registry.values());
}

/** 获取标签页行为声明——plugin.json 声明覆盖内置规则 */
export function getTabBehavior(pluginId: string): TabBehavior {
  const pluginDeclaration = registry.get(pluginId)?.manifest?.tabBehavior ?? {};
  const builtin = getBuiltinTabBehavior(pluginId);
  return { ...builtin, ...pluginDeclaration };
}

/** 获取所有插件的状态栏贡献（按加载顺序，已去重） */
export function getStatusBarContributions(): Array<StatusBarItem & { pluginId: string }> {
  const items: Array<StatusBarItem & { pluginId: string }> = [];
  for (const [pluginId, entry] of registry) {
    for (const item of entry.manifest.statusBar ?? []) {
      items.push({ ...item, pluginId });
    }
  }
  return items;
}

/** 查找保底标签页——先查 viewRegistry，无则返回内置 "welcome" */
export function findFallbackPlugin(): { pluginId: string } | undefined {
  for (const entry of registry.values()) {
    if (entry.manifest.tabBehavior?.isFallback) return { pluginId: entry.pluginId };
  }
  // 内置 fallback：欢迎页
  return { pluginId: "welcome" };
}

/** 注销视图插件。安装/卸载/禁用时调用。 */
export function unregisterViewPlugin(pluginId: string): boolean {
  return registry.delete(pluginId);
}

/** 清空注册表（测试用） */
export function clearRegistry(): void {
  registry.clear();
}

/* ── Phase 5g：插件元数据查询——替代硬编码特殊判断 ── */

/** 图标在图标栏的位置——默认 top。settings 等管理型图标声明 bottom。 */
export function getIconLocation(pluginId: string): "top" | "bottom" {
  return registry.get(pluginId)?.manifest.iconLocation ?? "top";
}

/** 视图角色——声明此视图如何和壳交互。默认 tabOnly（纯标签页）。 */
export function getViewRole(pluginId: string): "sidebarPrimary" | "tabPrimary" | "tabOnly" {
  return registry.get(pluginId)?.manifest.viewRole ?? "tabOnly";
}

/**
 * 纯侧栏视图——点击图标 toggle 侧栏，不自动打开标签页。
 * 替代 isSidebarOnlyView 硬编码。从 plugin.json viewRole 字段读取。
 */
export function isSidebarPrimaryView(pluginId: string): boolean {
  return registry.get(pluginId)?.manifest.viewRole === "sidebarPrimary";
}

/** 聚焦此视图时是否保留当前侧栏不清除。从 plugin.json 读取。 */
export function hasKeepSidebarOnFocus(pluginId: string): boolean {
  return registry.get(pluginId)?.manifest.keepSidebarOnFocus === true;
}
