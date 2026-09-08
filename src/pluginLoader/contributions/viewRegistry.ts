/**
 * 视图插件注册表。
 * 核心不认 pluginId——渲染时查此注册表获取 React 组件。
 * 设计依据：[[phase4-design-decisions]] 第 4 条。
 */

import type { ViewPluginEntry, TabBehavior, StatusBarItem, ContributesFloatingPanel } from "../../core/api/types";
import { getBuiltinTabBehavior } from "../../core/utils/tabIdentity";
import { Emitter } from "../../core/react/events/CoreEvents";
import { compareVersions } from "../../core/utils/plugin/semverUtils";
import { FALLBACK_PLUGIN_ID } from "../../core/utils/plugin/fallbackPluginId";
import { showConfirm } from "../../core/services/ui/DialogService";
import { trackRegistration } from "../../core/registry/registrationTracker";


const registry = new Map<string, ViewPluginEntry>();

/* ── Phase 5h Step 1：注册/注销事件——IconBar 响应式刷新 ── */

/** 插件注册事件——IconBar/StatusBar 等消费者订阅以即时更新 UI */
export const onDidRegister = new Emitter<ViewPluginEntry>();

/** 插件注销事件——IconBar 等消费者订阅以移除图标 */
export const onDidUnregister = new Emitter<string>();

/** 注册视图插件。同名插件优先高版本（P1-6 #7）。
 *  E5.8#10：返 disposer + track——引用级删除；低/等版本被忽略时返 no-op（首注册者持删除权）；
 *  高版本覆盖后旧 disposer 不删新 entry（registry.get 守卫）。 */
export function registerViewPlugin(entry: ViewPluginEntry): () => void {
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
      return () => {}; // 未新增条目——首注册者的 disposer 持有删除权
    }
  }
  registry.set(entry.pluginId, entry);
  // Phase 5h Step 1：通知所有消费者（IconBar/StatusBar 等）插件已注册
  onDidRegister.fire(entry);

  return trackRegistration(entry.pluginId, () => {
    if (registry.get(entry.pluginId) === entry) {
      registry.delete(entry.pluginId);
      onDidUnregister.fire(entry.pluginId);
    }
  });
}


/** 获取单个视图插件 */
export function getViewPlugin(pluginId: string): ViewPluginEntry | undefined {
  return registry.get(pluginId);
}

/** 获取所有已注册视图插件 */
export function getViewPlugins(): ViewPluginEntry[] {
  return Array.from(registry.values());
}

/** 读取插件的壳内悬浮面板声明（E5.8#39.5 类型 B）——contributes.floatingPanel.viewId。
 *  声明制（I8-3）：声明即出现——标签页右键「在悬浮面板中打开」注入条件 = 本函数非 null。
 *  未声明 / 声明非字符串 → null（不注入）。声明寻址解析在 App revealFloatingPanel（resolve→toggle→push）。 */
export function getFloatingPanelViewId(pluginId: string): string | null {
  const declaration = registry.get(pluginId)?.manifest?.contributes?.floatingPanel as ContributesFloatingPanel | undefined;
  return typeof declaration?.viewId === "string" ? declaration.viewId : null;
}

/** 获取标签页行为声明——plugin.json 声明覆盖内置规则 */
export function getTabBehavior(pluginId: string): TabBehavior {
  const pluginDeclaration = registry.get(pluginId)?.manifest?.tabBehavior ?? {};
  const builtin = getBuiltinTabBehavior(pluginId);
  return { ...builtin, ...pluginDeclaration };
}

/**
 * 执行标签页关闭前的检查与副作用——归一化入口。
 * 读取 tabBehavior 声明，依次执行 confirmOnClose 弹窗和 invokeBeforeClose 命令。
 * TabBar [×]/中键/Ctrl+W 三条关闭路径统一调此函数。
 *
 * E5#63 → E5.7#43：invokeBeforeClose 否决回路已停用（requestToPlugin 链删除）——声明保留待未来池侧 requests 命名空间。
 * confirmOnClose 弹窗仍生效。返 false = 阻止关闭。
 * @returns true = 继续关闭，false = 用户取消
 */
export async function invokeBeforeCloseTab(pluginId: string): Promise<boolean> {
  const behavior = getTabBehavior(pluginId);
  // confirmOnClose——静态确认文本（壳弹窗）
  if (behavior.confirmOnClose && !await showConfirm(behavior.confirmOnClose)) return false;
  // E5#63 → E5.7#43：invokeBeforeClose 否决回路停用——requestToPlugin 链已删
  // （池侧无 plugin:request 接收端；声明保留在 TabBehavior/schema，恢复需未来池侧 requests 命名空间任务）
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
    // E5.8#37.9.2.3：fallback 须有 entry（标签页渲染靠 entry）——entryless 纯贡献插件不参与
    if (entry.manifest.tabBehavior?.isFallback && entry.manifest.entry) return { pluginId: entry.pluginId };
  }
  // 内置 fallback：欢迎页
  return { pluginId: FALLBACK_PLUGIN_ID };
}

/** 清空注册表（测试用） */
export function clearRegistry(): void {
  registry.clear();
}

/* ── Phase 5g：插件元数据查询——替代硬编码特殊判断 ── */

/** 图标在图标栏的位置——appearsIn.iconBar 优先，旧字段 iconLocation 兜底。无声明返回 undefined。 */
export function getIconLocation(pluginId: string): "top" | "bottom" | undefined {
  const m = registry.get(pluginId)?.manifest;
  return m?.appearsIn?.iconBar ?? m?.iconLocation;
}

/**
 * 获取可创建为标签页的视图插件——appearsIn.tabBar === true 且有 entry 声明。
 * 消费端：WelcomeView 快捷卡片、TabBar [+] 菜单、命令面板"打开视图"等。
 * 🔥 2026-09-06 契约纠偏 + E6#62e：可创建 ≠ 已注册组件——registry 条目恒为元数据
 * （壳不 import 任何插件 JS，视图渲染唯一执行者 = 池 PluginComponent 按 renderPath /
 * resolveEntry URL 独立加载）。故 loader Step4 只注册元数据 stub 照常列出——点击交池渲染
 * （成不成由池的加载链/错误边界决定）。过滤只查 appearsIn.tabBar + entry 声明。
 */
export function getTabCreatableViews(): ViewPluginEntry[] {
  return Array.from(registry.values()).filter(
    (entry) => entry.manifest.appearsIn?.tabBar === true && !!entry.manifest.entry
  );
}

// E5.8#2：hasKeepSidebarOnFocus 已删——零消费（唯一消费方 shouldKeepSidebarOnFocus 同批删除，
// 侧栏保持判定由消费方直读 manifest.keepSidebarOnFocus）
