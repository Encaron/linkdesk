/**
 * 标签页身份元数据 —— 标签页系统内部逻辑。
 *
 * Phase 5g：singleton/confirmOnClose 已迁移到 plugin.json tabBehavior——
 *           getTabBehavior() 合并 plugin.json 声明 + 本表 builtin（isFallback）。
 *
 * E2c #19d：TAB_IDENTITY 硬编码表消灭——identityField 从 plugin.json tabBehavior 声明，
 *           generateId 自动推导，fallbackLabel 从 manifest.name 读取。
 *           壳内部类型（plugin-detail / welcome）保留最小特殊处理。
 * E5.7#67：FALLBACK_META 兜底表整删（terminal/workspace/editor 等插件 ID 硬编码表，
 *           硬约束 10 违例）——identityField 唯一来源 = plugin.json tabBehavior.identityField，
 *           viewRegistry 不可用时走通用兜底 null。测试模拟插件声明（useTabManager.test.ts beforeEach）。
 *
 * 新插件不需要在此加任何代码——getMeta() 从 viewRegistry 自动推导。
 *
 * VS Code 对标：EditorInput.matches() —— 一个方法定义 editor 身份。
 *
 * findTabByIdentity / isSameTabIdentity / getDefaultLabel / resolveLegacyPluginId
 * 全部引用此模块。
 */

import i18n from "../../i18n";
import { getViewPlugin } from "../../pluginLoader/contributions/viewRegistry";
import type { Tab } from "../../hooks/useTabManager";
import type { CreateTabOptions } from "../api/types";
import { normalizePath } from "./path/pathUtils";
import { FALLBACK_PLUGIN_ID } from "./plugin/fallbackPluginId";

/* ── 元数据接口 ── */

interface TabIdentityMeta {
  /** 是否为保底标签页（全场无标签时自动创建，不可关闭）。
   *  仅欢迎页声明——它没有 plugin.json，由本模块提供。 */
  isFallback?: boolean;
  /**
   * 单例——同 type 只允许一个标签页。**本字段是壳视图的出口**：插件的单例走
   * `plugin.json tabBehavior.singleton`，壳视图没有 plugin.json（E6#57.13 实证），
   * 只能在此声明。两处在 `getTabBehavior()` 合并。
   */
  singleton?: boolean;
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

export function resetPluginCounter(pluginId: string, n = 0): void { _counters[pluginId] = n; }
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

const SHELL_RENDERED_TYPES = new Set(["plugin-detail", FALLBACK_PLUGIN_ID, "output", "release-notes", "about"]); // E3f #54 / E6#57.13 / E6#57.14

/** 发行说明壳视图的类型串——**壳/池两侧共用的契约字符串**。
 *  池侧同义常量见 `src/pool/views/shell-renderer/ShellViewRenderer.tsx` 的 SHELL_VIEWS.ReleaseNotes
 *  （Path B：池不得 value-import @src/core，故两侧各自声明，新增壳视图需同步——那条注释也这么写）。
 *  壳侧四处消费（命令/通知面/首启自动弹/菜单）统一取本常量，**不写字面量**。 */
export const RELEASE_NOTES_TAB_TYPE = "release-notes";

/** 关于壳视图的类型串——E6#57.14。与 `RELEASE_NOTES_TAB_TYPE` 同款：池侧同义常量见
 *  `ShellViewRenderer.tsx` 的 `SHELL_VIEWS.About`（两侧各自声明，新增壳视图需同步）。
 *  壳侧消费方 = `aboutCommands.ts`（打开 + 复制两条命令），**不写字面量**。 */
export const ABOUT_TAB_TYPE = "about";

/* ── 壳内部类型元数据（最小特殊处理——plugin-detail / 欢迎 / 发行说明）── */

const SHELL_META: Record<string, TabIdentityMeta> = {
  "plugin-detail": {
    identityField: "detailPluginId",
    fallbackLabel: "插件详情",
    generateId: (opts) =>
      `plugin-detail-${opts?.detailPluginId ?? opts?.pluginId ?? Date.now()}`,
  },
  /**
   * E6#57.13：发行说明标签页——壳直渲染视图（对标欢迎页先例）。
   *
   * 🔴 **任务书原文订正**：`#57.13a` 写「appearsIn.tabBar + tabBehavior.singleton」——
   * 那是 plugin.json 的词汇，而**本视图不是插件、没有 plugin.json**，两个字段无从写起；
   * 且 `entry` 门（`getTabCreatableViews`）只决定 [+] 菜单是否列出，壳视图本就不进 [+]（它是壳自己
   * 经 `openOrFocusTab` 打开的）。真正管用的是本表 + 上面的封闭集合 SHELL_RENDERED_TYPES。
   *
   * `identityField: null` ⇒ 身份 = type 本身（`isSameTabIdentity` 对 null 恒真）——
   * 这正是单例要的语义；`singleton: true` 再挡住 `tabs.create` 那条旁路（`reduceOpenOrFocus`
   * 已在 Step 1 按 type 去重，但 `createTab` 不查 identity，得靠 behavior.singleton 拦）。
   */
  [RELEASE_NOTES_TAB_TYPE]: {
    singleton: true,
    identityField: null,
    fallbackLabel: "发行说明",
    /** 定值 ID——单例只有一个，用递增计数器只会让恢复布局后的 ID 漂移（无谓的不确定性）。 */
    generateId: () => RELEASE_NOTES_TAB_TYPE,
  },
  /**
   * E6#57.14：关于标签页——壳直渲染视图，与发行说明**逐字段同形**（同一张表里的两个实例）。
   *
   * `fallbackLabel` 就是标签页标题（`getDefaultLabel` → `i18n.t(fallbackLabel)`），
   * 06 §4.2 的标题行写的是「关于 LinkDesk」——**品牌名进 i18n key 是有意的**：
   * 它是**软件名**（`t()` 查不到就原样返回，见 parseMissingKeyHandler），
   * 换品牌只改这一处 + `product.json` 的 `nameLong`。
   */
  [ABOUT_TAB_TYPE]: {
    singleton: true,
    identityField: null,
    fallbackLabel: "关于 LinkDesk",
    generateId: () => ABOUT_TAB_TYPE,
  },
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
  //    E5.7#67：FALLBACK_META 硬编码表整删——identityField 唯一来源是
  //    plugin.json tabBehavior.identityField（editor 早已声明 filePath），未知类型走 null。
  const identityField = null;
  return {
    identityField,
    fallbackLabel: type,
    generateId: makeGenerateId(type, identityField),
  };
}

/** 获取内置行为——isFallback（欢迎页）与 singleton（**无 plugin.json 的壳视图**）仍在本模块。
 *  插件的 singleton/confirmOnClose 走 plugin.json tabBehavior，getTabBehavior() 合并两者。 */
export function getBuiltinTabBehavior(type: string): { singleton?: boolean; isFallback?: boolean; confirmOnClose?: string } {
  const meta = getMeta(type);
  const result: { singleton?: boolean; isFallback?: boolean; confirmOnClose?: string } = {};
  if (meta.isFallback) result.isFallback = true;
  // E6#57.13：壳视图的单例出口（`SHELL_META` 声明）——此前本函数只认 isFallback，
  // 于是「壳视图想声明单例」无处可写（plugin.json 那扇门对它不存在）。两者语义相同，同样向外合并。
  if (meta.singleton) result.singleton = true;
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
      // filePath 大小写不敏感——Windows 驱动器字母 TS 返回 e:/ 文件树是 E:/
      const matchValue = field === "filePath" ? normalizePath(value).toLowerCase() : value;
      return all.find((t) => {
        const tabVal = (t as unknown as Record<string, unknown>)[field] as string | undefined;
        if (!tabVal) return false;
        const matchTabVal = field === "filePath" ? normalizePath(tabVal).toLowerCase() : tabVal;
        const matched = t.type === type && matchTabVal === matchValue;
        return matched;
      });
    }
  }

  // identityField 为 null：允许多实例，不去重
  return undefined;
}

/**
 * E5.8#46.1：判断目标组已有标签页中是否存在与被拖标签同一身份——跨窗口合并去重。
 * VS Code EditorInput.matches() 对标：组内每资源唯一——松手并窗瞬间消除被拖的。
 *
 * ⚠️ 不能复用 isSameTabIdentity——它对 identityField null 返回 true（reduceCreateTab preview
 * 替换语义），合并去重会误杀多实例类型（两个不同 terminal 并窗被消除一个）。正确语义 = findTabByIdentity
 * （identityField 有值才匹配）+ singleton 补充：
 *   - singleton → 类型级唯一（组内已有同 type → 同身份）
 *   - identityField 有值 → 同 type + 同字段值（editor 文件路径 / 插件详情 / 按插件声明）
 *   - identityField null → 允许多实例，不去重（terminal）
 * 范围 = 目标组（不是整窗）——分屏两栏各放同文件是 VS Code 允许的。
 */
export function tabsShareIdentity(existingTabs: Tab[], dragged: Tab): boolean {
  // singleton：组内已有同 type → 同身份（settings 等全局唯一类型，getViewPlugin 同款判定）
  if (getViewPlugin(dragged.type)?.manifest?.tabBehavior?.singleton === true) {
    return existingTabs.some((t) => t.type === dragged.type);
  }
  const meta = getMeta(dragged.type);
  if (!meta.identityField) return false; // 多实例类型不去重（terminal）
  const field = meta.identityField;
  const value = (dragged as unknown as Record<string, unknown>)[field] as string | undefined;
  if (!value) return false;
  return existingTabs.some((t) => {
    if (t.type !== dragged.type) return false;
    const tabVal = (t as unknown as Record<string, unknown>)[field] as string | undefined;
    if (!tabVal) return false;
    // filePath 大小写不敏感——Windows 驱动器字母（findTabByIdentity 同款）
    if (field === "filePath") {
      return normalizePath(tabVal).toLowerCase() === normalizePath(value).toLowerCase();
    }
    return tabVal === value;
  });
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
  // filePath 大小写不敏感——Windows 驱动器字母
  if (field === "filePath" && typeof newValue === "string") {
    const tabVal = (t as unknown as Record<string, unknown>)[field] as string | undefined;
    return normalizePath(tabVal ?? "").toLowerCase() === normalizePath(newValue).toLowerCase();
  }
  return (t as unknown as Record<string, unknown>)[field] === newValue;
}

/**
 * 标签名——声明式推导，壳不知道具体插件是什么。
 *
 * 优先级：
 * 1. opts.label（调用方显式指定）
 * 2. identityField 的值——路径类取最后一段（文件名），非路径类取原值
 * 3. plugin.manifest.name（viewRegistry 可用时）
 * 4. fallbackLabel（viewRegistry 不可用时）
 *
 * 🔥 新插件声明 tabBehavior.identityField 即可——不需要在此函数加分支。
 */
export function getDefaultLabel(
  type: string,
  opts?: CreateTabOptions,
): string {
  // E6#30.7a：plugin-detail 目标插件 = detailPluginId ?? pluginId（调用方全传 pluginId——对齐
  // findTabByIdentity/isSameTabIdentity 的 detailPluginId pluginId 兜底 :187/:255）
  const targetPluginId = opts?.detailPluginId ?? opts?.pluginId;
  const plugin = getViewPlugin(targetPluginId ?? type);
  const idField = getMeta(type).identityField;
  const idValue = idField && opts
    ? (opts as Record<string, unknown>)[idField] as string | undefined
    : undefined;

  if (plugin) {
    // 壳内部类型：插件详情页——E6#30.7b 标签文本 = 插件名（不带「介绍」后缀；name 即 t() key）。
    // 去后缀同时保证 resolvePoolTabTitle 二次解析幂等（label === manifestName 才能语言切换重解析）
    if (type === "plugin-detail") return i18n.t(plugin.manifest.name);

    // 声明式：identityField 有值 → 用其值作为标签
    if (idValue) {
      // 路径类（含 / 或 \）→ 取最后一段（文件名/目录名），非路径类 → 取原值
      // 壳不知道"这是文件路径还是工作区名"——只看字符串长什么样
      if (idValue.includes("/") || idValue.includes("\\")) {
        const normalized = normalizePath(idValue);
        const segments = normalized.split("/");
        return segments[segments.length - 1] || idValue;
      }
      return idValue;
    }

    // E5.8#37.9.1：插件显示名 = 用户可见文本——t() 解析后落盘（iconbar 同款 t(manifest.name)；
    // 缺 key → parseMissingKeyHandler 原样返回 → 第三方插件名字不翻是插件作者责任）
    return i18n.t(plugin.manifest.name);
  }

  // fallback：viewRegistry 不可用（测试/极端边界）
  if (idValue) return idValue;
  return i18n.t(getMeta(type).fallbackLabel);
}

/* ── 语义函数：给类型字符串比较起名（AI 读到函数名即知意图）── */

/**
 * 池 tab DTO title 解析——E5.8#37.9.1。
 *
 * 背景：tab.label 落盘时已 t()（getDefaultLabel），但**已存在标签页/恢复的旧标签页**在语言切换后
 * 仍是旧语言快照（label 存于 tab state，语言切换只触发重推不重建 tab）。此处推流时二次解析：
 *   - label === manifest.name（仍是中文原名——zh 创建 / zh 保存后切 en 恢复）→ t(manifest.name) 现语言
 *   - label === t(manifest.name)（已是翻译名——en 保存后切 zh 恢复）→ 重解析回现语言（t() 幂等）
 *   - 否则（identityField 派生名/自定义 label——文件名、工作区名）→ 原样不动
 * 纯函数 t 注入（测序同 buildPanelViewMetas 字典 mock 先例）——壳 t() 解析后推流，池哑渲染（铁律）。
 */
export function resolvePoolTabTitle(
  label: string,
  manifestName: string | undefined,
  t: (key: string) => string,
): string {
  if (!manifestName) return label;
  if (label === manifestName || label === t(manifestName)) return t(manifestName);
  return label;
}

/** 壳自己渲染的标签页（不走插件路由）。封闭集合——新插件不在此列。 */
export function isShellRenderedTab(type: string): boolean {
  return SHELL_RENDERED_TYPES.has(type);
}

/** 是否为插件详情视图——壳内部类型，展示另一个插件的元数据。 */
export function isPluginDetailView(type: string): boolean {
  return type === "plugin-detail";
}

// E5.8#2：shouldKeepSidebarOnFocus 已删——零消费（判定逻辑已内联 viewRegistry.hasKeepSidebarOnFocus）

/**
 * 旧 type→pluginId 映射（Phase 4 过渡期——旧布局 JSON 不含 pluginId）。
 */
export function resolveLegacyPluginId(type: string): string | undefined {
  return getMeta(type).legacyPluginId;
}
