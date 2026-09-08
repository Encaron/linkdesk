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
import { parseManifestJson } from "../jsonc"; // E6#55：glob 原文统一走唯一解析入口

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
    // E6#11/#13（1.2-5）：包安装流主进程 fs/net 段——壳 preload 独有（download/extract handler 只对壳暴露），
    // 选填随 preload 注入；lifecycle installPackageFromSource 的 packageOps 判存在再调（loader 只在壳跑，运行时恒在）。
    packageDownload: plugins.packageDownload,
    packageExtract: plugins.packageExtract,
    // E6#11c/#13b/c（段 B）：安全更新三段主进程 handler——选填随 preload 注入；updatePlugin/checkPluginUpdates
    // 的 packageOps 判存在再调（loader 只在壳跑，运行时恒在；缺 = 壳 preload 面版本不匹配 → 响亮报错）。
    packageUpdateCheck: plugins.packageUpdateCheck,
    packageStageUpdate: plugins.packageStageUpdate,
    packageCommitUpdate: plugins.packageCommitUpdate,
  };
};

/* ── B6 fix：pluginLoader 日志频道——替代 console.log（对标 VS Code Output panel） */
const log = createLogChannel("app", "pluginLoader", "pluginLoader");

/** catch 变量统一转消息——strict 模式下 catch 参数为 unknown（E5.7#98 清零 : any 后） */
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/* ── 插件 manifest 原文 glob（Vite import.meta.glob ?raw） ── */

// E6#62a/#62b（2026-09-08）：源码 glob 轨退役——双 glob 双职全拆。
// ① pluginModules 入口 glob 已删——壳不再 import 任何插件入口 JS（#17d 注册纯声明化后 loadPluginComponent
//    随 #62b 退役；壳 build 不再 emit 插件入口 chunk = #15f 终态「壳 bundle 零插件 JS 源码」）。
// ② 组件加载唯一执行者 = 池（PluginComponent 的 mis-root 恒空 glob 已随 #62b 删，见 pool 注；
//    PoolStatusBarComponent 的真 glob 属 #62d 拆）。
// ③ pluginManifestRaw 保留**单职** = 纯浏览器预览种子（无 pluginsApi 时 discoverInstalled 回退 enumerate
//    源码树；Electron 运行时零消费本 glob——isRuntime/源码树成员判据已随 #62b 全删，manifest 单一真源 =
//    IPC listAll/readManifest）。eager ?raw 使壳 bundle 内嵌各 plugin.json 文本——元数据非 JS 源码，
//    「预览兜底另行评估」结论 = 保留（唯一消费者 = 本模块内部预览回退）。
const pluginManifestRaw = {
  ...import.meta.glob<string>(
    "../../../plugins/*/plugin.json",
    { query: "?raw", import: "default", eager: true }
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
 * pluginManifestRaw glob 仅作**纯浏览器预览种子**（seedManifestIndexFromGlob）——Electron 运行时 manifest
 * 内容一律走本索引（IPC readAllManifests 水合，jsonc 单入口解析）。源码树成员判据/即时代码分割已随
 * E6#62a/b 退役（#62b 前 dev 内置源码树也由 readAllManifests 覆盖，glob 判据纯冗余）。
 */
const manifestIndex = new Map<string, PluginManifest>();

/** readAllManifests 全量水合（Electron 主发现；幂等——同 id 覆盖）。仅 discoverInstalled 内部调，不外发。 */
function hydrateManifestIndex(records: Record<string, PluginManifest>): void {
  for (const [id, manifest] of Object.entries(records)) manifestIndex.set(id, manifest);
}

/** 纯浏览器预览兜底——从 DEV ?raw glob 原文种子填充（loader 无 pluginsApi 时调）。仅 discoverInstalled 内部调，不外发。 */
function seedManifestIndexFromGlob(): void {
  for (const [path, raw] of Object.entries(pluginManifestRaw)) {
    manifestIndex.set(extractPluginId(path), parseManifestJson(raw));
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
    return Object.entries(pluginManifestRaw).map(([path, raw]) => {
      const manifest = parseManifestJson(raw);
      return { pluginId: extractPluginId(path), entry: manifest.entry, manifest };
    });
  }
}

/* ── 已加载插件集合 + 并发/延迟状态 ── */

/** 已成功加载的插件 ID 集合（用于文件监听检测新插件） */
const loadedPluginIds = new Set<string>();

/** 🔥 硬约束 13：async init 竞态守卫——loadPlugin concurrent 调用时第二次返回第一次的 Promise */
const _loadingPromises = new Map<string, Promise<void>>();
/** E5.8#14：缺依赖挂起的插件——pluginId → manifest（依赖就绪后 sweep 补载需要 manifest 重查）。
 *  park 在 runtime.loadPlugin dep-check，sweep 在 runtime.sweepPendingDependencies——共享状态单一真源。 */
const _pendingPlugins = new Map<string, PluginManifest>();

/* ── 辅助：从路径提取 pluginId ── */

/** 从 glob key 提取插件 ID——"../../../plugins/<id>/..." → "<id>"（2026-09-05 塌平单根：plugins 后直接是插件目录） */
function extractPluginId(path: string): string {
  // 找到 "plugins" 目录，后面直接就是 pluginId（无 builtin/user 子目录层）
  const parts = path.split("/");
  const idx = parts.indexOf("plugins");
  if (idx < 0) return parts[parts.length - 2];
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
 * 形状仅本模块内部使用——loader/lifecycle-ops 消费 cachePluginMetadata/getMetadataCache（函数），
 * marketplace 经 PluginStateService 读 app.pluginMetadataCache（IPC 形状 = Record<pluginId, CachedPluginMeta>，
 * 序列化子集），均不 import 本类型 → 非 export（knip：无外部类型消费者）。
 */
interface CachedPluginMeta {
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
  loadedPluginIds,
  _loadingPromises,
  _pendingPlugins,
  getMetadataCache,
  cachePluginMetadata,
  getDisabledList,
  saveDisabledList,
  getLoadedManifest,
};
