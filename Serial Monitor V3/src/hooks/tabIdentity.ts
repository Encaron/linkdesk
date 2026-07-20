/**
 * 标签页身份元数据 —— 单一真相来源。
 * VS Code 对标：EditorInput.matches() —— 一个方法定义 editor 身份。
 *
 * findTabByIdentity / isSameTabIdentity / getDefaultLabel / resolveLegacyPluginId
 * 全部引用此表。新增标签页类型只需在此加一行。
 */

import i18n from "../i18n";
import { getViewPlugin } from "../pluginLoader/viewRegistry";
import type { Tab } from "./useTabManager";
import type { CreateTabOptions } from "../core/types";

/* ── 元数据表 ── */

interface TabIdentityMeta {
  /** 是否为单例（全局只允许一个实例）*/
  singleton: boolean;
  /** 是否为保底标签页（全场无标签时自动创建，不可关闭）*/
  isFallback?: boolean;
  /** 关闭前确认提示文本（如终端"关闭此标签页将断开串口连接"）*/
  confirmOnClose?: string;
  /** 身份字段——同 type+同此字段值=同一标签页。null=允许多实例不去重 */
  identityField: "detailPluginId" | "workspaceName" | "filePath" | null;
  /** 生成标签页 ID——每种类型有自己的策略 */
  generateId: (opts?: CreateTabOptions) => string;
  /** viewRegistry 不可用时的兜底标签名 */
  fallbackLabel: string;
  /** 旧 type→pluginId 映射（Phase 4 过渡期）*/
  legacyPluginId?: string;
}

/* ── 终端计数器 ── */

let _terminalCounter = 0;
export function resetTerminalCounter(n = 0): void { _terminalCounter = n; }

const TAB_IDENTITY: Record<string, TabIdentityMeta> = {
  terminal:        { singleton: false, confirmOnClose: "关闭此标签页将断开串口连接", identityField: null,               fallbackLabel: "终端",   legacyPluginId: "terminal",
    generateId: () => { _terminalCounter++; return `terminal-${_terminalCounter}`; } },
  workspace:       { singleton: false, identityField: "workspaceName",                                          fallbackLabel: "工作台", legacyPluginId: "workspace",
    generateId: (opts) => opts?.workspaceName ? `workspace-${opts.workspaceName}` : "workspace" },
  settings:        { singleton: true,  identityField: null,                                                      fallbackLabel: "设置",   legacyPluginId: "settings",
    generateId: () => "settings" },
  marketplace:     { singleton: true,  identityField: null,                                                      fallbackLabel: "插件市场", legacyPluginId: "marketplace",
    generateId: () => "marketplace" },
  "plugin-detail": { singleton: false, identityField: "detailPluginId",                                         fallbackLabel: "插件详情",
    generateId: (opts) => `plugin-detail-${(opts?.detailPluginId ?? opts?.pluginId) ?? Date.now()}` },
  welcome:         { singleton: false, isFallback: true, identityField: null,                                    fallbackLabel: "欢迎",
    generateId: () => "welcome" },
  oled:            { singleton: false, identityField: null,                                                      fallbackLabel: "OLED",   legacyPluginId: "oled",
    generateId: () => "oled" },
  editor:          { singleton: false, identityField: "filePath",                                               fallbackLabel: "编辑器", legacyPluginId: "editor",
    generateId: (opts) => opts?.filePath ? `editor-${opts.filePath.replace(/[^a-zA-Z0-9]/g, "_")}` : "editor" },
};

export function getMeta(type: string): TabIdentityMeta {
  return TAB_IDENTITY[type] ?? {
    singleton: false,
    identityField: null,
    fallbackLabel: type,
    generateId: () => type,  // 未知类型用 type 本身当 ID
  };
}

/** 获取内置类型的行为声明——替代 viewRegistry.ts 的 BUILTIN_TAB_BEHAVIOR。
 *  plugin.json 的 tabBehavior 字段会覆盖此返回值。 */
export function getBuiltinTabBehavior(type: string): { singleton?: boolean; isFallback?: boolean; confirmOnClose?: string } {
  const meta = getMeta(type);
  const result: { singleton?: boolean; isFallback?: boolean; confirmOnClose?: string } = {};
  if (meta.singleton) result.singleton = true;
  if (meta.isFallback) result.isFallback = true;
  if (meta.confirmOnClose) result.confirmOnClose = meta.confirmOnClose;
  return result;
}

/* ── 公开 API（四个函数，全部引用 TAB_IDENTITY）── */

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

  if (meta.singleton) {
    return all.find((t) => t.type === type || t.pluginId === type);
  }

  if (meta.identityField) {
    const field = meta.identityField;
    // 从 opts 或 type 推断 identity 值
    const value = opts
      ? (opts as Record<string, unknown>)[field] as string | undefined
        // plugin-detail 特殊：detailPluginId 通常来自 opts.pluginId
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
 * 同一身份 → 预览不替换（已由 findTabByIdentity 聚焦）。
 * 不同身份 → 替换预览。
 */
export function isSameTabIdentity(t: Tab, type: string, opts?: CreateTabOptions): boolean {
  if (t.type !== type) return false;
  const meta = getMeta(type);

  // singleton 或 identityField 为 null：身份 = type 本身
  if (meta.singleton || !meta.identityField) return true;

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
    if (type === "plugin-detail") return `${plugin.manifest.name} (介绍)`;
    if (type === "workspace" && workspaceName) return workspaceName;
    return plugin.manifest.name;
  }

  // fallback
  if (type === "workspace" && workspaceName) return workspaceName;
  if (type === "editor" && filePath) return filePath;
  return i18n.t(getMeta(type).fallbackLabel);
}

/* ── 语义函数：给类型字符串比较起名（AI 读到函数名即知意图）── */

/** 壳自己渲染的标签页（不走插件路由）*/
export function isShellRenderedTab(type: string): boolean {
  return type === "plugin-detail" || type === "welcome";
}

/** 纯侧栏视图——点击图标 toggle 侧栏，不打开标签页。
 *  当前只有 marketplace。未来可从 plugin.json 声明 sidebarOnly 字段。 */
export function isSidebarOnlyView(pluginId: string): boolean {
  return pluginId === "marketplace";
}

/** 聚焦此标签页时是否保留当前侧栏（不清除 sidebarView）*/
export function shouldKeepSidebarOnFocus(tab: { type: string }): boolean {
  return tab.type === "plugin-detail";
}

/**
 * 旧 type→pluginId 映射（Phase 4 过渡期——旧布局 JSON 不含 pluginId）。
 * 替代 types.ts 的 LEGACY_TYPE_TO_PLUGIN_ID。
 */
export function resolveLegacyPluginId(type: string): string | undefined {
  return getMeta(type).legacyPluginId;
}
