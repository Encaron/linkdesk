/**
 * 插件加载器——共享状态层。
 * E5.8#0d.10-1a：自 loader.ts 拆出——模块级状态 + 访问器 + 共享工具。
 * 所有 pluginLoader 子模块（manifest/contributions/runtime/lifecycle-ops）只从这里读状态，
 * 不互相持有——状态单一真源，防各模块各自 new Set/Map 失同步。
 */

import type { PluginManifest } from "../../core/api/types";
import type { PluginDiscoveryEntry } from "../../core/api/linkdesk-api/types";
import { getViewPlugin } from "../contributions/viewRegistry";
import { getPluginStateValue, setPluginStateValue, APP_PLUGIN_ID } from "../../core/services/plugins/PluginStateService";
import { createLogChannel } from "../../core/services/ui/LogChannel";

// Electron IPC——window.linkdesk 由 preload-shell.ts 注入
const linkdesk = () => window.linkdesk;

// E5.7#97：loader 只在壳进程运行——壳 preload 注入全量 plugins 面（resolvePath + listDirs/
// listDisabledDirs/readManifest），池 preload 仅 resolvePath。类型面上读面三法标 `?` 壳独有——
// 此处一处守卫断言替代全文件 6 处 ?. 噪音（运行时失败 = loader 跑错了进程，响亮报错正确）。
const pluginsApi = () => {
  const plugins = window.linkdesk.plugins;
  if (!plugins?.listDirs || !plugins?.listDisabledDirs || !plugins?.readManifest ||
      !plugins?.listAll || !plugins?.readAllManifests) {
    throw new Error("[pluginLoader] 壳 preload plugins 面缺失——loader 只能在壳进程运行");
  }
  // 守卫后逐成员重建——窄化进返回值类型（plugins 对象上的 ? 成员不随局部守卫传播）
  return {
    resolvePath: plugins.resolvePath,
    listDirs: plugins.listDirs,
    listAll: plugins.listAll,
    listDisabledDirs: plugins.listDisabledDirs,
    readManifest: plugins.readManifest,
    readAllManifests: plugins.readAllManifests,
  };
};

/* ── B6 fix：pluginLoader 日志频道——替代 console.log（对标 VS Code Output panel） */
const log = createLogChannel("app", "pluginLoader", "pluginLoader");

/** catch 变量统一转消息——strict 模式下 catch 参数为 unknown（E5.7#98 清零 : any 后） */
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/* ── 插件入口文件映射（Vite import.meta.glob） ── */

// Vite 在构建时展开 glob，生成所有插件的入口映射。
// E2c #19j-structure-a：同时支持平铺结构和 src/ 子目录结构——过渡期内两种都匹配。
// E4 #86：插件分离到 builtin/ 和 user/ 两个子目录——每个 glob 拆为两份。
// E5#35b: 子目录/入口文件约定见 utils/plugin/pluginPaths.ts（PLUGIN_SUBDIRS / PLUGIN_ENTRY_FILES，E5.8#0d.11 自 core/ 根归位）。
// Vite import.meta.glob 需字符串字面量做静态分析，工厂函数不兼容——保持 spread 写法。
const pluginModules = {
  ...import.meta.glob<{ default: React.ComponentType<{ isActive: boolean }> }>(
    "../../../plugins/builtin/*/index.tsx",
    { eager: false }
  ),
  ...import.meta.glob<{ default: React.ComponentType<{ isActive: boolean }> }>(
    "../../../plugins/builtin/*/src/index.tsx",
    { eager: false }
  ),
  ...import.meta.glob<{ default: React.ComponentType<{ isActive: boolean }> }>(
    "../../../plugins/user/*/index.tsx",
    { eager: false }
  ),
  ...import.meta.glob<{ default: React.ComponentType<{ isActive: boolean }> }>(
    "../../../plugins/user/*/src/index.tsx",
    { eager: false }
  ),
};

const pluginStatusBarModules = {
  ...import.meta.glob<{ default: React.ComponentType }>(
    "../../../plugins/builtin/*/statusBar.tsx",
    { eager: false }
  ),
  ...import.meta.glob<{ default: React.ComponentType }>(
    "../../../plugins/builtin/*/src/statusBar.tsx",
    { eager: false }
  ),
  ...import.meta.glob<{ default: React.ComponentType }>(
    "../../../plugins/user/*/statusBar.tsx",
    { eager: false }
  ),
  ...import.meta.glob<{ default: React.ComponentType }>(
    "../../../plugins/user/*/src/statusBar.tsx",
    { eager: false }
  ),
  ...import.meta.glob<{ default: React.ComponentType }>(
    "../../../plugins/builtin/*/src/components/statusBar.tsx",
    { eager: false }
  ),
  ...import.meta.glob<{ default: React.ComponentType }>(
    "../../../plugins/user/*/src/components/statusBar.tsx",
    { eager: false }
  ),
};

// E5#114d: 视图 render 文件 glob——替代 /* @vite-ignore */ 动态 import。
// contributes.views 的 render 路径（如 src/views/FoldersView.tsx）在 dev 模式靠 Vite 服务端解析，
// 但打包后源码路径不存在于 ASAR 中。用 import.meta.glob 让 Vite 构建时映射到正确 chunk。
const viewRenderModules = {
  ...import.meta.glob<{ default: React.ComponentType }>(
    "../../../plugins/builtin/*/src/views/**/*.tsx",
    { eager: false }
  ),
  ...import.meta.glob<{ default: React.ComponentType }>(
    "../../../plugins/user/*/src/views/**/*.tsx",
    { eager: false }
  ),
};

const pluginManifests = {
  ...import.meta.glob<PluginManifest>(
    "../../../plugins/builtin/*/plugin.json",
    { eager: true }
  ),
  ...import.meta.glob<PluginManifest>(
    "../../../plugins/user/*/plugin.json",
    { eager: true }
  ),
};

/* ── E6#9：权威 manifest 索引 + 启动发现（pluginId → PluginManifest）── */

/**
 * E6#9c：plugin.json 权威 manifest 索引——键 pluginId（替代旧「glob path 键 + extractPluginId 推导」）。
 *
 * 数据源两路（同一批 plugin.json，按运行环境二选一）：
 *   ① Electron：initPluginLoader 经 discoverInstalled() → plugins:readAllManifests IPC 全量水合
 *      （主进程直扫 plugins/ 全子目录——打包/市场安装插件 glob 看不到；单一真源，幂等覆盖）。
 *   ② 纯浏览器预览（无 pluginsApi）：seedManifestIndexFromGlob()——上方 eager glob 兜底，行为同旧。
 *
 * 上方 pluginManifests glob 对象保留双职：Vite 源码树成员判据（isRuntime = 不在源码树，
 * #9e：dev 保留 glob 作即时代码分割）+ 纯浏览器预览种子；manifest 内容一律走本索引。
 */
const manifestIndex = new Map<string, PluginManifest>();

/** readAllManifests 全量水合（Electron 主发现；幂等——同 id 覆盖）。仅 discoverInstalled 内部调，不外发。 */
function hydrateManifestIndex(records: Record<string, PluginManifest>): void {
  for (const [id, manifest] of Object.entries(records)) manifestIndex.set(id, manifest);
}

/** 纯浏览器预览兜底——从 DEV eager glob 种子填充（loader 无 pluginsApi 时调）。仅 discoverInstalled 内部调，不外发。 */
function seedManifestIndexFromGlob(): void {
  for (const [path, manifest] of Object.entries(pluginManifests)) {
    manifestIndex.set(extractPluginId(path), manifest);
  }
}

/** 索引直查——消费方一律 getManifestById(id)，不再 Object.keys(pluginManifests)+extractPluginId 推导。 */
export function getManifestById(pluginId: string): PluginManifest | undefined {
  return manifestIndex.get(pluginId);
}

/** 全量遍历——消费方需扫索引时经此导出（勿另持索引副本，防双源漂移；E6#9c）。 */
export function getAllManifestEntries(): Array<[string, PluginManifest]> {
  return [...manifestIndex.entries()];
}

/**
 * E6#9a：启动发现单源——plugins:listAll（主进程直扫 plugins/ 全子目录，含打包/市场安装插件，
 * 返回 [{ pluginId, entry, manifest }]）∪ plugins:readAllManifests 水合索引。
 * 纯浏览器预览（无 pluginsApi）回退 eager glob，行为同旧。
 */
export async function discoverInstalled(): Promise<PluginDiscoveryEntry[]> {
  try {
    const api = pluginsApi();
    const [entries, records] = await Promise.all([api.listAll(), api.readAllManifests()]);
    hydrateManifestIndex(records);
    return entries;
  } catch {
    seedManifestIndexFromGlob();
    return Object.entries(pluginManifests).map(([path, manifest]) => ({
      pluginId: extractPluginId(path),
      entry: manifest.entry,
      manifest,
    }));
  }
}

/* ── 已加载插件集合 + 并发/延迟状态 ── */

/** 已成功加载的插件 ID 集合（用于文件监听检测新插件） */
const loadedPluginIds = new Set<string>();
/** 🔥 硬约束 13：async init 竞态守卫——loadPlugin concurrent 调用时第二次返回第一次的 Promise */
const _loadingPromises = new Map<string, Promise<void>>();
/** 延迟激活的插件——有 activationEvents（非 "*"），manifest 已注册但 JS 未 import */
const _deferredPlugins = new Map<string, PluginManifest>();
/** E5.8#14：缺依赖挂起的插件——pluginId → manifest（依赖就绪后 sweep 补载需要 manifest 重查）。
 *  park 在 runtime.loadPlugin dep-check，sweep 在 runtime.sweepPendingDependencies——共享状态单一真源。 */
const _pendingPlugins = new Map<string, PluginManifest>();

/* ── 辅助：从路径提取 pluginId ── */

/** 从 glob key 提取插件 ID——"../../../plugins/<builtin|user>/<id>/..." → "<id>" */
function extractPluginId(path: string): string {
  // 找到 "plugins" 目录，后面可能是 builtin/user 子目录 → 再跳一段才是 pluginId
  const parts = path.split("/");
  const idx = parts.indexOf("plugins");
  if (idx < 0) return parts[parts.length - 2];
  const next = parts[idx + 1];
  if (next === "builtin" || next === "user") {
    return idx + 2 < parts.length ? parts[idx + 2] : parts[parts.length - 2];
  }
  return idx + 1 < parts.length ? parts[idx + 1] : parts[parts.length - 2];
}

/* ── 插件元数据缓存 ── */

/**
 * B2 fix：插件元数据缓存层——解决"卸载后无法浏览插件详情"。
 *
 * 根因：marketplace 从文件系统读 plugin.json，卸载后目录被移走 → 元数据消失。
 * VS Code 有服务端 marketplace + 本地缓存，浏览和安装是独立操作。
 *
 * 方案：安装/发现时存一份 plugin.json 元数据副本到 PluginStateService。
 * 卸载/禁用只改状态字段（不删条目）。marketplace 从缓存读，不依赖文件系统。
 *
 * 缓存键：app.pluginMetadataCache → Record<pluginId, CachedPluginMeta>
 *
 * E5.8#156：export——loader.pruneUninstalledCache 纯函数签名需引用该类型（差集清理）。
 */
export interface CachedPluginMeta {
  pluginId: string;
  name: string;
  description?: string;
  version?: string;
  /** 缓存状态：installed=已加载, disabled=已禁用但文件在, uninstalled=已卸载到.disabled/ */
  status: "installed" | "disabled" | "uninstalled";
  /** 完整 manifest——卸载后详情页仍可展示完整信息（G14 fix v2） */
  manifest?: PluginManifest;
}

function getMetadataCache(): Record<string, CachedPluginMeta> {
  try {
    return getPluginStateValue<Record<string, CachedPluginMeta>>(APP_PLUGIN_ID, "pluginMetadataCache") ?? {};
  } catch {
    return {};
  }
}

function cachePluginMetadata(
  pluginId: string,
  manifest: PluginManifest,
  status: CachedPluginMeta["status"],
): void {
  try {
    const cache = getMetadataCache();
    cache[pluginId] = {
      pluginId,
      name: manifest.name || pluginId,
      description: manifest.description,
      version: manifest.version,
      status,
      manifest, // G14 fix v2：存完整 manifest——卸载后详情页仍可展示完整信息
    };
    // 异步落盘——不阻塞
    setPluginStateValue(APP_PLUGIN_ID, "pluginMetadataCache", cache).catch((e) => { console.error("[loader] 保存插件元数据缓存失败:", e); });
  } catch {
    /* 非关键路径 */
  }
}

/* ── 禁用列表持久化 ── */

function getDisabledList(): string[] {
  try {
    // Phase 5f：PluginStateService 唯一真源（PreferenceService 兜底读已清除）
    return getPluginStateValue<string[]>(APP_PLUGIN_ID, "disabledPlugins") ?? [];
  } catch {
    return [];
  }
}

async function saveDisabledList(list: string[]): Promise<void> {
  try {
    // Phase 5：写入 PluginStateService（新路径）
    await setPluginStateValue(APP_PLUGIN_ID, "disabledPlugins", list);
  } catch { /* 静默 */ }
}

/* ── manifest 查找 ── */

/** 查找已加载插件的 manifest——含视图和非视图插件（主题/语言等）+ 运行时加载的插件 */
function getLoadedManifest(pluginId: string): PluginManifest | undefined {
  // 1. 先查视图插件
  const viewEntry = getViewPlugin(pluginId);
  if (viewEntry) return viewEntry.manifest;
  // 2. E6#9c：再查 manifestIndex（单一真源——覆盖 glob + 运行时/打包插件；loadedPluginIds 中有但不属于视图注册表）
  const indexed = manifestIndex.get(pluginId);
  if (indexed && loadedPluginIds.has(pluginId)) {
    return indexed;
  }
  // 3. 元数据缓存兜底（禁用/已卸载等未入索引的条目）
  const meta = getMetadataCache()[pluginId];
  if (meta?.status === "installed" && meta.manifest && loadedPluginIds.has(pluginId)) {
    return meta.manifest;
  }
  return undefined;
}

export {
  linkdesk,
  pluginsApi,
  log,
  errMsg,
  pluginModules,
  pluginStatusBarModules,
  viewRenderModules,
  pluginManifests,
  loadedPluginIds,
  _loadingPromises,
  _deferredPlugins,
  _pendingPlugins,
  extractPluginId,
  getMetadataCache,
  cachePluginMetadata,
  getDisabledList,
  saveDisabledList,
  getLoadedManifest,
};
