/**
 * 视图插件注册表。
 * 核心不认 pluginId——渲染时查此注册表获取 React 组件。
 * 设计依据：[[phase4-design-decisions]] 第 4 条。
 */

import type { ViewPluginEntry, TabBehavior, StatusBarItem } from "../core/types";
import { getBuiltinTabBehavior } from "../hooks/tabIdentity";
import { Emitter } from "../core/CoreEvents";
import { compareVersions } from "./semverUtils";
import { FALLBACK_PLUGIN_ID } from "../utils/fallbackPluginId";
// Electron IPC——window.linkdesk 由 preload-shell.ts 注入
const linkdesk = () => (window as any).linkdesk;
import { showConfirm } from "../core/DialogService";


const registry = new Map<string, ViewPluginEntry>();

/* ── Phase 5h Step 1：注册/注销事件——IconBar 响应式刷新 ── */

/** 插件注册事件——IconBar/StatusBar 等消费者订阅以即时更新 UI */
export const onDidRegister = new Emitter<ViewPluginEntry>();

/** 插件注销事件——IconBar 等消费者订阅以移除图标 */
export const onDidUnregister = new Emitter<string>();

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
  // Phase 5h Step 1：通知所有消费者（IconBar/StatusBar 等）插件已注册
  onDidRegister.fire(entry);
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

/**
 * E5#48：求值 confirmCondition——插件声明式确认条件。
 * 格式 `"namespace:field"` → 调 `linkdesk[namespace].getStatus()` → 查 `result[field]`。
 * 通用机制——不认插件 ID，不认条件名。如 `"serial:isOpen"` = 串口打开时才确认。
 */
async function evaluateConfirmCondition(condition: string): Promise<boolean> {
  const colon = condition.indexOf(":");
  if (colon === -1) return true; // 格式错误——保守确认
  const namespace = condition.slice(0, colon);
  const field = condition.slice(colon + 1);
  try {
    const api = (window as any).linkdesk?.[namespace];
    if (!api?.getStatus) return true;
    const status = await api.getStatus();
    return status?.[field] === true;
  } catch { /* IPC 失败——保守确认 */ }
  return true;
}

/**
 * 执行标签页关闭前的检查与副作用——归一化入口。
 * 读取 tabBehavior 声明，依次执行 confirmOnClose 弹窗和 invokeBeforeClose 命令。
 * TabBar [×]/中键/Ctrl+W 三条关闭路径统一调此函数。
 * @returns true = 继续关闭，false = 用户取消
 */
export async function invokeBeforeCloseTab(pluginId: string): Promise<boolean> {
  const behavior = getTabBehavior(pluginId);
  // E5#48：confirmCondition——插件声明式确认条件，满足才弹 confirmOnClose
  if (behavior.confirmOnClose) {
    let shouldConfirm = true;
    if (behavior.confirmCondition) {
      shouldConfirm = await evaluateConfirmCondition(behavior.confirmCondition);
    }
    if (shouldConfirm && !await showConfirm(behavior.confirmOnClose)) return false;
  }
  if (behavior.invokeBeforeClose) {
    try { await linkdesk().commands.execute(behavior.invokeBeforeClose); } catch {}
  }
  return true;
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

/** 查找保底标签页——先查 viewRegistry，无则返回内置欢迎页 */
export function findFallbackPlugin(): { pluginId: string } | undefined {
  for (const entry of registry.values()) {
    if (entry.manifest.tabBehavior?.isFallback) return { pluginId: entry.pluginId };
  }
  // 内置 fallback：欢迎页
  return { pluginId: FALLBACK_PLUGIN_ID };
}

/** 注销视图插件。安装/卸载/禁用时调用。 */
export function unregisterViewPlugin(pluginId: string): boolean {
  const deleted = registry.delete(pluginId);
  // Phase 5h Step 1：通知消费者（仅在真正删除时——避免空事件导致 UI 无效刷新）
  if (deleted) {
    onDidUnregister.fire(pluginId);
    // #58d：插件注销→销毁对应 WebContentsView（释放内存）
    try { linkdesk()?.pluginViews?.destroy?.(pluginId); } catch { /* IPC 不可用时静默 */ }
  }
  return deleted;
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

/**
 * 获取可作为标签页直接创建的视图插件列表。
 * 过滤规则：有 viewsContainers 声明的插件通过图标栏开侧栏访问，
 * 不出现在 WelcomeView 快捷卡片 / TabBar [+] 菜单中。
 * 消费端：WelcomeView 快捷卡片、TabBar [+] 菜单、命令面板"打开视图"等。
 */
export function getTabCreatableViews(): ViewPluginEntry[] {
  return Array.from(registry.values()).filter(
    (entry) => !entry.manifest.contributes?.viewsContainers
  );
}

/** 聚焦此视图时是否保留当前侧栏不清除。从 plugin.json 读取。 */
export function hasKeepSidebarOnFocus(pluginId: string): boolean {
  return registry.get(pluginId)?.manifest.keepSidebarOnFocus === true;
}
