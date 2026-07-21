/**
 * 标签页身份元数据 —— 标签页系统内部逻辑。
 *
 * Phase 5g：singleton/confirmOnClose 已迁移到 plugin.json tabBehavior——
 *           getTabBehavior() 合并 plugin.json 声明 + 本表 builtin（isFallback）。
 *           本表只保留身份匹配策略（identityField/generateId）+ fallbackLabel。
 *
 * 新插件不需要在此加行——getMeta() 提供合理默认值。
 * 只有需要特殊身份匹配策略的已知类型才需要在此声明。
 *
 * VS Code 对标：EditorInput.matches() —— 一个方法定义 editor 身份。
 *
 * findTabByIdentity / isSameTabIdentity / getDefaultLabel / resolveLegacyPluginId
 * 全部引用此表。
 */

import i18n from "../i18n";
import { getViewPlugin, isSidebarPrimaryView, hasKeepSidebarOnFocus } from "../pluginLoader/viewRegistry";
import type { Tab } from "./useTabManager";
import type { CreateTabOptions } from "../core/types";

/* ── 元数据接口 ── */

interface TabIdentityMeta {
  /** 是否为保底标签页（全场无标签时自动创建，不可关闭）。
   *  仅欢迎页声明——它没有 plugin.json，由本表提供。 */
  isFallback?: boolean;
  /** 身份字段——同 type+同此字段值=同一标签页。null=允许多实例不去重 */
  identityField: "detailPluginId" | "workspaceName" | "filePath" | null;
  /** 生成标签页 ID——每种类型有自己的策略 */
  generateId: (opts?: CreateTabOptions) => string;
  /** viewRegistry 不可用时的兜底标签名 */
  fallbackLabel: string;
  /** 旧 type→pluginId 映射（Phase 4 过渡期）*/
  legacyPluginId?: string;
}

/* ── 计数器 ── */

let _terminalCounter = 0;
export function resetTerminalCounter(n = 0): void { _terminalCounter = n; }

// B78: workspace generateId 硬编码 "workspace" → 多实例 id 碰撞（双聚焦/关一关俩/标签卡中间）。
// 在标签页命名功能就位前，用计数器兜底。标签页命名上线后 workspaceName 分支接管，计数器不再调用。
let _workspaceCounter = 0;
export function resetWorkspaceCounter(n = 0): void { _workspaceCounter = n; }

/** 未知类型的全局计数器——确保 generateId 不重复 */
let _fallbackCounter = 0;
export function resetFallbackCounter(n = 0): void { _fallbackCounter = n; }

/**
 * B78 同类：不需要特殊 id 格式的条目统一走此 helper。
 * `${prefix}-${counter}` — 每次调用递增，保证多实例不碰撞。
 * 和 getMeta fallback 同一模式——唯一区别是 prefix = type 名显式传入。
 */
function autoId(prefix: string) {
  return () => `${prefix}-${++_fallbackCounter}`;
}

/* ── 壳内部视图类型（Shell-rendered, not plugins）──
 * 这些类型不由插件注册表渲染——壳自己处理（MainContent renderTabContent）。
 * 新插件不需要加到这里。这是封闭集合——只有壳级视图。 */

const SHELL_RENDERED_TYPES = new Set(["plugin-detail", "welcome"]);

/* ── 元数据表 ── */

const TAB_IDENTITY: Record<string, TabIdentityMeta> = {
  // ── 插件视图（singleton/confirmOnClose 在 plugin.json tabBehavior 声明）──
  terminal:    { identityField: null,               fallbackLabel: "终端",   legacyPluginId: "terminal",
    generateId: () => { _terminalCounter++; return `terminal-${_terminalCounter}`; } },
  workspace:   { identityField: "workspaceName",    fallbackLabel: "工作台", legacyPluginId: "workspace",
    // B78: 无 workspaceName 时用计数器避免 id 碰撞（标签页命名上线后此分支不再触发）
    generateId: (opts) => opts?.workspaceName ? `workspace-${opts.workspaceName}` : `workspace-${++_workspaceCounter}` },
  settings:    { identityField: null,               fallbackLabel: "设置",   legacyPluginId: "settings",
    generateId: autoId("settings") },
  marketplace: { identityField: null,               fallbackLabel: "插件市场", legacyPluginId: "marketplace",
    generateId: autoId("marketplace") },

  // ── 壳内部视图 ──
  "plugin-detail": { identityField: "detailPluginId", fallbackLabel: "插件详情",
    generateId: (opts) => `plugin-detail-${(opts?.detailPluginId ?? opts?.pluginId) ?? Date.now()}` },
  welcome:         { isFallback: true, identityField: null, fallbackLabel: "欢迎",
    generateId: autoId("welcome") },

  // ── 预留（Phase 6+ 壳实现）──
  oled:   { identityField: null, fallbackLabel: "OLED",   legacyPluginId: "oled",
    generateId: autoId("oled") },
  editor: { identityField: "filePath", fallbackLabel: "编辑器", legacyPluginId: "editor",
    generateId: (opts) => opts?.filePath ? `editor-${opts.filePath.replace(/[^a-zA-Z0-9]/g, "_")}` : "editor" },
};

export function getMeta(type: string): TabIdentityMeta {
  const entry = TAB_IDENTITY[type];
  if (entry) return entry;
  // 未知类型默认值——新插件不需要在这里加行
  return {
    identityField: null,
    fallbackLabel: type,
    generateId: () => `${type}-${++_fallbackCounter}`,
  };
}

/** 获取内置行为——仅 isFallback 仍在本表（welcome 无 plugin.json）。
 *  singleton/confirmOnClose 已迁移到 plugin.json tabBehavior，getTabBehavior() 合并两者。 */
export function getBuiltinTabBehavior(type: string): { singleton?: boolean; isFallback?: boolean; confirmOnClose?: string } {
  const meta = getMeta(type);
  const result: { singleton?: boolean; isFallback?: boolean; confirmOnClose?: string } = {};
  if (meta.isFallback) result.isFallback = true;
  return result;
}

/* ── 公开 API ── */

/**
 * VS Code findEditor 对标：查找身份匹配的已有标签页。
 * - singleton → 匹配 type 或 pluginId
 * - identityField 有值 → 匹配 type + 该字段值
 * - identityField 为 null → 不去重（允许多实例，如 terminal）
 */
export function findTabByIdentity(
  all: Tab[],
  type: string,
  opts?: CreateTabOptions
): Tab | undefined {
  const meta = getMeta(type);

  // singleton 去重由 reduceCreateTab Step 2 负责（getTabBehavior().singleton ——
  //   合并 viewRegistry plugin.json + builtin isFallback）。
  // 本函数只负责 identityField 身份匹配——避免同一 workspace/file 重复打开。

  if (meta.identityField) {
    const field = meta.identityField;
    const value = opts
      ? (opts as Record<string, unknown>)[field] as string | undefined
        ?? (field === "detailPluginId" ? (opts as Record<string, unknown>)["pluginId"] as string | undefined : undefined)
      : undefined;
    if (value) {
      return all.find((t) =>
        t.type === type &&
        (t as unknown as Record<string, unknown>)[field] === value
      );
    }
  }

  // identityField 为 null：允许多实例，不去重
  return undefined;
}

/**
 * VS Code isPinned 对标：判断已有标签页 t 是否与要创建的 (type, opts) 同一身份。
 */
export function isSameTabIdentity(t: Tab, type: string, opts?: CreateTabOptions): boolean {
  if (t.type !== type) return false;
  const meta = getMeta(type);

  // singleton 或 identityField 为 null：身份 = type 本身
  const isSingleton = getViewPlugin(type)?.manifest?.tabBehavior?.singleton === true;
  if (isSingleton || !meta.identityField) return true;

  // identityField 有值：身份 = type + 字段值
  const field = meta.identityField;
  const newValue = opts
    ? (opts as Record<string, unknown>)[field] as string | undefined
      ?? (field === "detailPluginId" ? (opts as Record<string, unknown>)["pluginId"] as string | undefined : undefined)
    : undefined;
  return (t as unknown as Record<string, unknown>)[field] === newValue;
}

/**
 * 标签名——viewRegistry 优先，无则用 TAB_IDENTITY fallback。
 */
export function getDefaultLabel(
  type: string,
  workspaceName?: string,
  filePath?: string,
  targetPluginId?: string,
): string {
  const plugin = getViewPlugin(targetPluginId ?? type);
  if (plugin) {
    // 特殊标签格式：插件详情页 → "插件名 (介绍)"
    if (type === "plugin-detail") return `${plugin.manifest.name} (介绍)`;
    // 工作台 → 显示 workspaceName 而非插件名
    if (type === "workspace" && workspaceName) return workspaceName;
    return plugin.manifest.name;
  }

  // fallback：viewRegistry 不可用
  if (type === "workspace" && workspaceName) return workspaceName;
  if (type === "editor" && filePath) return filePath;
  return i18n.t(getMeta(type).fallbackLabel);
}

/* ── 语义函数：给类型字符串比较起名（AI 读到函数名即知意图）── */

/** 壳自己渲染的标签页（不走插件路由）。封闭集合——新插件不在此列。 */
export function isShellRenderedTab(type: string): boolean {
  return SHELL_RENDERED_TYPES.has(type);
}

/** 是否为插件详情视图——壳内部类型，展示另一个插件的元数据。 */
export function isPluginDetailView(type: string): boolean {
  return type === "plugin-detail";
}

/**
 * 纯侧栏视图——点击图标 toggle 侧栏，不打开标签页。
 * Phase 5g：从 plugin.json viewRole 字段读取。marketplace 声明 viewRole: "sidebarPrimary"。
 */
export function isSidebarOnlyView(pluginId: string): boolean {
  return isSidebarPrimaryView(pluginId);
}

/** 聚焦此标签页时是否保留当前侧栏（不清除 sidebarView）。
 *  Phase 5g：优先读 plugin.json keepSidebarOnFocus，shell 内部类型兜底。 */
export function shouldKeepSidebarOnFocus(tab: { type: string; pluginId?: string }): boolean {
  if (tab.pluginId && hasKeepSidebarOnFocus(tab.pluginId)) return true;
  // plugin-detail 是壳内部类型——它的侧栏展示的是被查看插件的侧栏，不应清除
  return tab.type === "plugin-detail";
}

/**
 * 旧 type→pluginId 映射（Phase 4 过渡期——旧布局 JSON 不含 pluginId）。
 */
export function resolveLegacyPluginId(type: string): string | undefined {
  return getMeta(type).legacyPluginId;
}
