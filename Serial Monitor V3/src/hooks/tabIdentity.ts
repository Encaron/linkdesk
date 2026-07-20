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
  /** 身份字段——同 type+同此字段值=同一标签页。null=允许多实例不去重 */
  identityField: "detailPluginId" | "workspaceName" | "filePath" | null;
  /** viewRegistry 不可用时的兜底标签名 */
  fallbackLabel: string;
  /** 旧 type→pluginId 映射（Phase 4 过渡期）*/
  legacyPluginId?: string;
}

const TAB_IDENTITY: Record<string, TabIdentityMeta> = {
  terminal:        { singleton: false, identityField: null,               fallbackLabel: "终端",   legacyPluginId: "terminal" },
  workspace:       { singleton: false, identityField: "workspaceName",   fallbackLabel: "工作台", legacyPluginId: "workspace" },
  settings:        { singleton: true,  identityField: null,               fallbackLabel: "设置",   legacyPluginId: "settings" },
  marketplace:     { singleton: true,  identityField: null,               fallbackLabel: "插件市场", legacyPluginId: "marketplace" },
  "plugin-detail": { singleton: false, identityField: "detailPluginId",  fallbackLabel: "插件详情" },
  welcome:         { singleton: false, identityField: null,               fallbackLabel: "欢迎" },
  oled:            { singleton: false, identityField: null,               fallbackLabel: "OLED",   legacyPluginId: "oled" },
  editor:          { singleton: false, identityField: "filePath",        fallbackLabel: "编辑器", legacyPluginId: "editor" },
};

function getMeta(type: string): TabIdentityMeta {
  return TAB_IDENTITY[type] ?? { singleton: false, identityField: null, fallbackLabel: type };
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

/**
 * 旧 type→pluginId 映射（Phase 4 过渡期——旧布局 JSON 不含 pluginId）。
 * 替代 types.ts 的 LEGACY_TYPE_TO_PLUGIN_ID。
 */
export function resolveLegacyPluginId(type: string): string | undefined {
  return getMeta(type).legacyPluginId;
}
