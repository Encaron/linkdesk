/**
 * 标签页身份元数据 —— 标签页系统内部逻辑。
 *
 * Phase 5g：singleton/confirmOnClose 已迁移到 plugin.json tabBehavior——
 *           getTabBehavior() 合并 plugin.json 声明 + 本表 builtin（isFallback）。
 *
 * E2c #19d：TAB_IDENTITY 硬编码表消灭——identityField 从 plugin.json tabBehavior 声明，
 *           generateId 自动推导，fallbackLabel 从 manifest.name 读取。
 *           壳内部类型（plugin-detail / welcome）保留最小特殊处理。
 *
 * 新插件不需要在此加任何代码——getMeta() 从 viewRegistry 自动推导。
 *
 * VS Code 对标：EditorInput.matches() —— 一个方法定义 editor 身份。
 *
 * findTabByIdentity / isSameTabIdentity / getDefaultLabel / resolveLegacyPluginId
 * 全部引用此模块。
 */

import i18n from "../i18n";
import { getViewPlugin, hasKeepSidebarOnFocus } from "../pluginLoader/viewRegistry";
import type { Tab } from "./useTabManager";
import type { CreateTabOptions } from "../core/types";
import { FALLBACK_PLUGIN_ID } from "../utils/fallbackPluginId";

/* ── 元数据接口 ── */

interface TabIdentityMeta {
  /** 是否为保底标签页（全场无标签时自动创建，不可关闭）。
   *  仅欢迎页声明——它没有 plugin.json，由本模块提供。 */
  isFallback?: boolean;
  /** 身份字段——同 type+同此字段值=同一标签页。null=允许多实例不去重 */
  identityField: string | null;
  /** 生成标签页 ID——每种类型有自己的策略 */
  generateId: (opts?: CreateTabOptions) => string;
  /** viewRegistry 不可用时的兜底标签名 */
  fallbackLabel: string;
  /** 旧 type→pluginId 映射（Phase 4 过渡期）*/
  legacyPluginId?: string;
}

/* ── 统一计数器 ── */

const _counters: Record<string, number> = {};

function nextCounter(type: string): number {
  const n = (_counters[type] ?? 0) + 1;
  _counters[type] = n;
  return n;
}

export function resetTerminalCounter(n = 0): void { _counters["terminal"] = n; }
export function resetWorkspaceCounter(n = 0): void { _counters["workspace"] = n; }
export function resetFallbackCounter(_n = 0): void {
  // 清除所有计数器——测试 beforeEach 用
  for (const k of Object.keys(_counters)) delete _counters[k];
}

/**
 * G3：恢复布局后同步计数器——扫描所有 tab ID 提取最大值。
 * 防止 F5 后计数器归零、新建 tab 与恢复的旧 tab ID 碰撞。
 *
 * E2c #19d：泛化——不再按 terminal/workspace/fallback 硬编码分支，
 * 统一用 `${type}-(\d+)` 模式匹配。
 */
export function syncCountersAfterRestore(tabs: { id: string; type: string }[]): void {
  for (const tab of tabs) {
    const m = tab.id.match(/^(.+)-(\d+)$/);
    if (m) {
      const prefix = m[1];
      const n = parseInt(m[2]);
      _counters[prefix] = Math.max(_counters[prefix] ?? 0, n);
    }
  }
}

/* ── generateId 自动推导 ── */

/** 根据 identityField 自动生成 generateId 函数。 */
function makeGenerateId(type: string, identityField: string | null): (opts?: CreateTabOptions) => string {
  if (!identityField) {
    return () => `${type}-${nextCounter(type)}`;
  }
  return (opts) => {
    const value = opts
      ? (opts as Record<string, unknown>)[identityField] as string | undefined
      : undefined;
    if (value) {
      // 文件名类字段需 sanitize（如 editor 的 filePath 含 / \ 空格）
      const sanitized = value.replace(/[^a-zA-Z0-9一-鿿_-]/g, "_");
      return `${type}-${sanitized}`;
    }
    return `${type}-${nextCounter(type)}`;
  };
}

/* ── 壳内部视图类型（Shell-rendered, not plugins）──
 * 这些类型不由插件注册表渲染——壳自己处理（MainContent renderTabContent）。
 * 新插件不需要加到这里。这是封闭集合——只有壳级视图。 */

const SHELL_RENDERED_TYPES = new Set(["plugin-detail", FALLBACK_PLUGIN_ID]);

/* ── 壳内部类型元数据（最小特殊处理——仅 plugin-detail 和 welcome）── */

const SHELL_META: Record<string, TabIdentityMeta> = {
  "plugin-detail": {
    identityField: "detailPluginId",
    fallbackLabel: "插件详情",
    generateId: (opts) =>
      `plugin-detail-${opts?.detailPluginId ?? opts?.pluginId ?? Date.now()}`,
  },
};

/** viewRegistry 不可用时的兜底元数据——仅测试/极端边界用到。
 *  插件正常运行时所有信息从 manifest 推导。
 *  此处只保留无法从代码推导的信息：中文标签名 + identityField（身份匹配策略）。 */
const FALLBACK_META: Record<string, { label: string; identityField?: string | null }> = {
  terminal:    { label: "终端",    identityField: null },
  workspace:   { label: "工作台",  identityField: "workspaceName" },
  settings:    { label: "设置",    identityField: null },
  marketplace: { label: "插件市场", identityField: null },
  oled:        { label: "OLED",   identityField: null },
  editor:      { label: "编辑器",  identityField: "filePath" },
};

/* ── 核心：getMeta —— 从声明推导，不查表 ── */

export function getMeta(type: string): TabIdentityMeta {
  // 1. 壳内部类型
  if (type in SHELL_META) return SHELL_META[type];

  // 2. 欢迎页（FALLBACK_PLUGIN_ID）——无 plugin.json，内置
  if (type === FALLBACK_PLUGIN_ID) {
    return {
      isFallback: true,
      identityField: null,
      fallbackLabel: "欢迎",
      generateId: () => `${FALLBACK_PLUGIN_ID}-${nextCounter(FALLBACK_PLUGIN_ID)}`,
    };
  }

  // 3. 插件视图——从 plugin.json tabBehavior 推导
  const plugin = getViewPlugin(type);
  if (plugin) {
    const identityField = plugin.manifest.tabBehavior?.identityField ?? null;
    return {
      identityField,
      fallbackLabel: plugin.manifest.name,
      legacyPluginId: type,
      generateId: makeGenerateId(type, identityField),
    };
  }

  // 4. 未知类型——合理默认值（新插件不需要在本模块加代码）
  const fb = FALLBACK_META[type];
  const identityField = fb?.identityField ?? null;
  return {
    identityField,
    fallbackLabel: fb?.label ?? type,
    generateId: makeGenerateId(type, identityField),
  };
}

/** 获取内置行为——仅 isFallback 仍在本模块（welcome 无 plugin.json）。
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
 * 标签名——viewRegistry 优先，无则用 fallback。
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
