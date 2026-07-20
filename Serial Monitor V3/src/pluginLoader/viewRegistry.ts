/**
 * 视图插件注册表。
 * 核心不认 pluginId——渲染时查此注册表获取 React 组件。
 * 设计依据：[[phase4-design-decisions]] 第 4 条。
 */

import type { ViewPluginEntry, TabBehavior, StatusBarItem } from "../core/types";

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

/** 内置类型的 tabBehavior——欢迎页/设置不是插件，核心自带其行为定义 */
const BUILTIN_TAB_BEHAVIOR: Record<string, TabBehavior> = {
  welcome: { isFallback: true },
  settings: { singleton: true },
};

/** 获取标签页行为声明——先查 viewRegistry，再查内置 fallback */
export function getTabBehavior(pluginId: string): TabBehavior {
  return registry.get(pluginId)?.manifest?.tabBehavior
    ?? BUILTIN_TAB_BEHAVIOR[pluginId]
    ?? {};
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
