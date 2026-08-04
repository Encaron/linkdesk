/**
 * 插件加载器。
 * Phase 4：Vite 构建时独立打包 + import() 运行时加载。
 * 设计依据：[[phase4-design-decisions]] 第 1-3 条。
 *
 * 加载时机：App 启动 initPrefs() 完成后调用 initPluginLoader()。
 * 加载顺序：先源码自带 → 再外部安装 → 错误不阻断。
 *
 * P1-4：theme/language 注册（ThemeEngine + i18next）
 * P1-5：文件监听（轮询 list_plugin_dirs）
 * P1-6：7 种错误处理 + minAppVersion 版本检查 + 同名去重
 * Phase 4.3：安装/卸载/禁用/启用完整生命周期
 *
 * 🔒 E3j #72-#73：IPC 时序保护——loader 中的四条高风险路径已覆盖：
 *   - 插件加载/卸载 → plugins:call 走 #72 请求队列（FIFO 串行）
 *   - 主题切换       → bridge:broadcast 走 #27 push 队列（顺序交付）
 *   - 语言切换       → bridge:broadcast 走 #27 push 队列（顺序交付）
 *   - 生命周期事件   → shell Emitter 同步触发（不经过 IPC）
 *   本文件不直接调用 ipcRenderer.invoke——走 window.linkdesk 桥接层，
 *   主进程自动排队，loader 代码无需感知队列存在。
 */

// Electron IPC——window.linkdesk 由 preload-shell.ts 注入
const linkdesk = () => (window as any).linkdesk;
import type { PluginManifest, ViewPluginEntry } from "../core/types";
import { registerViewPlugin, unregisterViewPlugin } from "./viewRegistry";
import { registerTheme, getAvailableThemes, findTheme } from "../core/ThemeEngine";
import { ThemeRegistry } from "../core/registry/ThemeRegistry";
import { IconRegistry } from "../core/registry/IconRegistry";
import { LanguageRegistry } from "../core/registry/LanguageRegistry";
import type { ThemeContribution, IconThemeContribution, IconContribution, LanguageContribution } from "../core/types";
import { pushToast, TOAST_TTL_ERROR, TOAST_TTL_SUCCESS } from "../core/services/NotificationService";
// Phase 5f：PreferenceService 双写已清除——PluginStateService/ConfigurationService 是唯一真源
// Phase 5：插件状态管理迁移到 PluginStateService
import { getPluginStateValue, setPluginStateValue, APP_PLUGIN_ID } from "../core/services/PluginStateService";
// Phase 5h 行为归一化：副作用（iconOrder/toast/config/tab）集中到 lifecycle.ts 消费端
import { PluginLifecycle, initLifecycleConsumers, onPluginLifecycleChange, type PluginInstallEvent } from "./lifecycle";
// Phase 5：contributes 解析——静态导入，确保同步注册（异步 import 会晚于组件 mount → placeholder 覆盖真实 handler）
import { registerConfiguration, registerConfigurationDefaults, updateConfigurationEnum } from "../core/registry/ConfigurationRegistry";
import { getConfigurationValue, setConfigurationValue } from "../core/services/ConfigurationService";
import type { ManifestMenuItem, TitleBarContribution } from "../core/registry/MenuRegistry";
import { registerMenuItems, registerTitleBarContribution } from "../core/registry/MenuRegistry";
import { registerCommand } from "../core/registry/CommandRegistry";
import { registerFileAssociation } from "../core/services/FileAssociationService";
import { registerLangDef } from "../core/registry/LangDefRegistry";
import { registerKeybinding } from "../core/registry/KeybindingRegistry";
import { versionGte } from "./semverUtils";
import i18n from "../i18n";
import { createLogChannel } from "../core/LogChannel";

/* ── B6 fix：pluginLoader 日志频道——替代 console.log（对标 VS Code Output panel） */
const log = createLogChannel("app", "pluginLoader", "pluginLoader");

/* ── 插件入口文件映射（Vite import.meta.glob） ── */

// Vite 在构建时展开 glob，生成所有插件的入口映射。
// E2c #19j-structure-a：同时支持平铺结构和 src/ 子目录结构——过渡期内两种都匹配。
// E4 #86：插件分离到 builtin/ 和 user/ 两个子目录——每个 glob 拆为两份。
const pluginModules = {
  ...import.meta.glob<{ default: React.ComponentType<{ isActive: boolean }> }>(
    "../../plugins/builtin/*/index.tsx",
    { eager: false }
  ),
  ...import.meta.glob<{ default: React.ComponentType<{ isActive: boolean }> }>(
    "../../plugins/builtin/*/src/index.tsx",
    { eager: false }
  ),
  ...import.meta.glob<{ default: React.ComponentType<{ isActive: boolean }> }>(
    "../../plugins/user/*/index.tsx",
    { eager: false }
  ),
  ...import.meta.glob<{ default: React.ComponentType<{ isActive: boolean }> }>(
    "../../plugins/user/*/src/index.tsx",
    { eager: false }
  ),
};

const pluginStatusBarModules = {
  ...import.meta.glob<{ default: React.ComponentType }>(
    "../../plugins/builtin/*/statusBar.tsx",
    { eager: false }
  ),
  ...import.meta.glob<{ default: React.ComponentType }>(
    "../../plugins/builtin/*/src/statusBar.tsx",
    { eager: false }
  ),
  ...import.meta.glob<{ default: React.ComponentType }>(
    "../../plugins/user/*/statusBar.tsx",
    { eager: false }
  ),
  ...import.meta.glob<{ default: React.ComponentType }>(
    "../../plugins/user/*/src/statusBar.tsx",
    { eager: false }
  ),
};

const pluginManifests = {
  ...import.meta.glob<PluginManifest>(
    "../../plugins/builtin/*/plugin.json",
    { eager: true }
  ),
  ...import.meta.glob<PluginManifest>(
    "../../plugins/user/*/plugin.json",
    { eager: true }
  ),
};

/* ── 辅助：从路径提取 pluginId ── */

/** 从 glob key 提取插件 ID——"../../plugins/<builtin|user>/<id>/..." → "<id>" */
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

/** 从主题 JSON 数据中提取扁平化 colors——归一化 #36j2。消两处重复。 */
function extractThemeColors(data: Record<string, unknown>): Record<string, string> {
  const raw = data.colors;
  if (!raw || typeof raw !== "object") return {};
  const colors: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") colors[k] = v;
  }
  return colors;
}

/** 查找已加载插件的 manifest——含视图和非视图插件（主题/语言等）+ 运行时加载的插件 */
function getLoadedManifest(pluginId: string): PluginManifest | undefined {
  // 1. 先查视图插件
  const viewEntry = getViewPlugin(pluginId);
  if (viewEntry) return viewEntry.manifest;
  // 2. 再查 glob 中的非视图插件（loadedPluginIds 中有但不属于视图注册表）
  for (const [path, manifest] of Object.entries(pluginManifests)) {
    if (extractPluginId(path) === pluginId && loadedPluginIds.has(pluginId)) {
      return manifest;
    }
  }
  // 3. 运行时加载的插件（loadPluginRuntime 缓存了完整 manifest）
  const meta = getMetadataCache()[pluginId];
  if (meta?.status === "installed" && meta.manifest && loadedPluginIds.has(pluginId)) {
    return meta.manifest;
  }
  return undefined;
}

/* ── 当前应用版本（从 package.json 读取） ── */

/** TODO Phase 6：从 package.json 动态读取（需要 Vite define 或 import.meta.env）。
 *  当前硬编码——发版前手动更新此行。B10 fix：注释说明实际情况。 */
function getAppVersion(): string {
  return "3.0.0";
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
    setPluginStateValue(APP_PLUGIN_ID, "pluginMetadataCache", cache).catch(() => {});
  } catch {
    /* 非关键路径 */
  }
}

/* ── 初始化 ── */

let _initialized = false;
/** initPluginLoader 的进行中 Promise——StrictMode 双重 effect 时第二次调用等第一次完成 */
let _loadingPromise: Promise<void> | null = null;
/** 已成功加载的插件 ID 集合（用于文件监听检测新插件） */
const loadedPluginIds = new Set<string>();
/** 🔥 硬约束 13：async init 竞态守卫——loadPlugin concurrent 调用时第二次返回第一次的 Promise */
const _loadingPromises = new Map<string, Promise<void>>();
/** 延迟激活的插件——有 activationEvents（非 "*"），manifest 已注册但 JS 未 import */
const _deferredPlugins = new Map<string, PluginManifest>();

export async function initPluginLoader(): Promise<void> {
  // 🔥 #59c fix：StrictMode 双重 effect 第二次调用时等第一次 Promise 完成
  if (_initialized) return _loadingPromise ?? Promise.resolve();
  _initialized = true;

  return (_loadingPromise = (async () => {
  // Phase 5h 行为归一化：注册 lifecycle 消费端（iconOrder/toast/config/tab——只注册一次）
  initLifecycleConsumers();

  // #44：注册命令预激活钩子——CommandRegistry 执行命令前检查是否需要先激活延迟插件
  // 🔥 必须 await——否则钩子在 initPluginLoader 返回后才挂上，用户首次命令执行时钩子未就绪
  const { setPreActivateHook } = await import("../core/registry/CommandRegistry");
  setPreActivateHook(async (commandId: string) => {
    const pluginId = findDeferredByCommand(commandId);
    if (pluginId) await activatePlugin(pluginId);
  });

  const errors: string[] = [];
  const disabled = getDisabledList();

  // 1. 收集所有已安装插件（从 import.meta.glob 的 plugin.json 键）
  const installed = new Set<string>();
  for (const path of Object.keys(pluginManifests)) {
    installed.add(extractPluginId(path));
  }

  // 2. 对标 VS Code：运行时扫描文件系统，过滤掉已卸载的插件
  //    import.meta.glob 是构建时打包的——文件被 Rust 移走后 glob 仍保留旧路径。
  //    VS Code 的做法是启动时 scan extensions 目录，目录里没有的自然不加载。
  let fsInstalled = new Set<string>();
  try {
    const dirs = await linkdesk().plugins.listDirs();
    fsInstalled = new Set(dirs);
  } catch {
    // 非 Tauri 环境（npm run dev 浏览器模式）——无 invoke，回退到 glob 全量加载
  }

  // 3. 加载每个插件（跳过禁用 + 跳过文件系统不存在的）
  console.log(`[pluginLoader] pluginManifests keys: ${Object.keys(pluginManifests).length}, installed: ${[...installed].join(', ')}`);
  for (const pluginId of installed) {
    if (disabled.includes(pluginId)) {
      log.appendLine(`插件 "${pluginId}" 已禁用——跳过`);
      // B2 fix: 种子缓存——禁用插件元数据从 glob 入缓存，marketplace 不依赖文件系统
      const dKey = Object.keys(pluginManifests).find((k) => extractPluginId(k) === pluginId);
      if (dKey) {
        cachePluginMetadata(pluginId, pluginManifests[dKey], "disabled");
      }
      continue;
    }
    if (fsInstalled.size > 0 && !fsInstalled.has(pluginId)) {
      log.appendLine(`插件 "${pluginId}" 已卸载（文件系统不存在）——跳过`);
      // B2 fix: 种子缓存——已卸载的glob 中的插件元数据入缓存（F5 后仍可浏览详情）
      const uKey = Object.keys(pluginManifests).find((k) => extractPluginId(k) === pluginId);
      if (uKey) {
        cachePluginMetadata(pluginId, pluginManifests[uKey], "uninstalled");
      }
      continue;
    }
    try {
      // #44：activationEvents——非 "*" 时延迟 JS import，只注册 manifest
      const mKey = Object.keys(pluginManifests).find((k) => extractPluginId(k) === pluginId);
      const manifest = mKey ? pluginManifests[mKey] : null;
      const defer = manifest && manifest.activationEvents?.length
        && !manifest.activationEvents.includes("*");
      await loadPlugin(pluginId, "startup", { skipView: !!defer });
      if (defer && manifest) _deferredPlugins.set(pluginId, manifest);
    } catch (e: any) {
      errors.push(`${pluginId}: ${e?.message || e}`);
    }
  }

  // 4. Phase 5h：加载glob 外的插件（文件系统存在但不在 glob 中的）
  for (const pluginId of fsInstalled) {
    if (installed.has(pluginId)) continue;  // 已在 glob 中加载
    if (disabled.includes(pluginId)) continue;
    try {
      await loadPluginRuntime(pluginId);
    } catch (e: any) {
      errors.push(`${pluginId} (runtime): ${e?.message || e}`);
    }
  }

  // 5. 错误汇总
  if (errors.length > 0) {
    console.warn("[pluginLoader] 以下插件加载失败:", errors);
    pushToast({
      message: `${errors.length} 个插件加载失败`,
      ttl: TOAST_TTL_ERROR,
    });
  }

  // 6. 清理僵尸缓存——status="installed" 但未真正加载的条目（插件目录已删除）
  const cache = getMetadataCache();
  let staleCount = 0;
  for (const [id, meta] of Object.entries(cache)) {
    if (meta.status === "installed" && !loadedPluginIds.has(id)) {
      delete cache[id];
      staleCount++;
    }
  }
  if (staleCount > 0) {
    try {
      setPluginStateValue(APP_PLUGIN_ID, "pluginMetadataCache", cache);
      log.appendLine(`🧹 清理 ${staleCount} 条僵尸缓存`);
    } catch { /* 非关键路径 */ }
  }
  })());
}

/* ── Phase 5：parseContributions——对标 VS Code package.json contributes ── */

/**
 * 解析插件的 contributes 声明，分发到各 Registry。
 * 按 key 逐项检测，不认识的 key 静默跳过。
 * Phase 6 加 contributes.themes / contributes.languages 时此处只需加一个 if——不崩。
 */
function parseContributions(pluginId: string, c: Record<string, unknown>): void {
  // contributes.configuration → ConfigurationRegistry
  if (c.configuration) {
    const config = c.configuration as { title: string; properties: Record<string, unknown> };
    registerConfiguration(pluginId, {
      title: config.title,
      properties: config.properties as Record<string, import("../core/registry/ConfigurationRegistry").ConfigurationProperty>,
    });
  }

  // contributes.commands → CommandRegistry
  // Phase 5c fix：静态导入替代动态 import()——动态 import 的 .then() 晚于组件 mount，
  // 导致 terminal 组件注册的真实 handler 被 placeholder 覆盖。
  if (c.commands) {
    const cmds = c.commands as Array<{ id: string; title: string; category?: string; when?: string }>;
    for (const cmd of cmds) {
      registerCommand(pluginId, {
        id: cmd.id,
        title: cmd.title,
        category: cmd.category,
        when: cmd.when,
        handler: async () => {
          console.warn(`[pluginLoader] 命令 "${cmd.id}" 尚未绑定 handler——请在组件 mount 时注册`);
        },
      });
    }
  }

  // contributes.menus → MenuRegistry
  if (c.menus) {
    const menus = c.menus as Record<string, ManifestMenuItem[]>;
    for (const [menuId, items] of Object.entries(menus)) {
      registerMenuItems(menuId as any, pluginId, items);
    }
  }

  // contributes.keybindings → KeybindingRegistry
  if (c.keybindings) {
    const kbs = c.keybindings as Array<{ command: string; key: string; when?: string }>;
    for (const kb of kbs) {
      registerKeybinding({ command: kb.command, key: kb.key, when: kb.when, source: "plugin", pluginId });
    }
  }

  // contributes.configurationDefaults → ConfigurationRegistry（盲区 2：弱默认值）
  if (c.configurationDefaults) {
    registerConfigurationDefaults(pluginId, c.configurationDefaults as Record<string, unknown>);
  }

  // contributes.themes → ThemeRegistry（metadata only——数据在 loadPlugin/loadPluginRuntime 中异步加载）
  if (c.themes) {
    const themeList = c.themes as ThemeContribution[];
    for (const tc of themeList) {
      ThemeRegistry.register(tc, pluginId);
    }
  }

  // contributes.iconThemes → IconRegistry
  if (c.iconThemes) {
    const list = c.iconThemes as IconThemeContribution[];
    for (const it of list) {
      IconRegistry.register(it, pluginId);
    }
  }

  // contributes.icons → IconRegistry（共享图标）
  if (c.icons) {
    const map = c.icons as Record<string, IconContribution>;
    for (const [iconId, contribution] of Object.entries(map)) {
      IconRegistry.registerIcon(iconId, contribution, pluginId);
    }
  }

  // contributes.languages → LanguageRegistry（metadata only——数据在 loadPlugin/loadPluginRuntime 中异步加载）
  if (c.languages) {
    const langList = c.languages as LanguageContribution[];
    for (const lc of langList) {
      LanguageRegistry.register(lc, pluginId);
    }
  }

  // E3h #66：contributes.titleBar → MenuRegistry（TitleBar 左右槽位按钮）
  if (c.titleBar) {
    const tb = c.titleBar as { left?: TitleBarContribution[]; right?: TitleBarContribution[] };
    if (tb.left) {
      for (const item of tb.left) {
        registerTitleBarContribution(pluginId, "left", item);
      }
    }
    if (tb.right) {
      for (const item of tb.right) {
        registerTitleBarContribution(pluginId, "right", item);
      }
    }
  }

  // E3.6：contributes.viewsContainers → ViewContainerService（同步）
  if (c.viewsContainers) {
    const containers = c.viewsContainers as Record<string, { title: string; icon?: string; location?: string; hideIfEmpty?: boolean; order?: number; mergeHeaderWhenSingle?: boolean }>;
    void (async () => {
      const { ViewContainerService } = await import("../core/ViewContainerService");
      for (const [containerId, desc] of Object.entries(containers)) {
        ViewContainerService.registerViewContainer(pluginId, {
          id: containerId,
          title: desc.title,
          icon: desc.icon,
          location: (desc.location as "sidebar" | "panel" | "auxiliarybar") ?? "sidebar",
          hideIfEmpty: desc.hideIfEmpty,
          order: desc.order,
          mergeHeaderWhenSingle: desc.mergeHeaderWhenSingle,
        });
      }
    })().catch((e) => console.error("[loader] viewsContainers 注册失败:", e));
  }

  // E3.6：contributes.views → ViewContainerService（异步——动态 import view 组件）
  if (c.views) {
    const views = c.views as Record<string, Array<{ id: string; title?: string; render: string; role?: "toolbar" | "section"; when?: string; order?: number; collapsed?: boolean; canToggleVisibility?: boolean; canMoveView?: boolean; hideByDefault?: boolean; singleViewPaneContainerTitle?: string; titleDescription?: string; showActions?: string; titleTooltip?: string; minHeight?: number }>>;
    void (async () => {
      const { ViewContainerService } = await import("../core/ViewContainerService");
      for (const [containerId, viewDefs] of Object.entries(views)) {
        for (const viewDef of viewDefs) {
          try {
            const renderModule = await import(viewDef.render);
            const RenderComponent = renderModule.default ?? renderModule;
            ViewContainerService.registerView(pluginId, containerId, {
              id: viewDef.id,
              title: viewDef.title ?? "",
              render: RenderComponent,
              role: viewDef.role,
              order: viewDef.order,
              collapsed: viewDef.collapsed,
              when: viewDef.when,
              canToggleVisibility: viewDef.canToggleVisibility,
              canMoveView: viewDef.canMoveView,
              hideByDefault: viewDef.hideByDefault,
              singleViewPaneContainerTitle: viewDef.singleViewPaneContainerTitle,
              titleDescription: viewDef.titleDescription,
              showActions: viewDef.showActions as "always" | "whenExpanded" | "default" | undefined,
              titleTooltip: viewDef.titleTooltip,
              minHeight: viewDef.minHeight,
            });
          } catch (e) {
            console.error(
              `[loader] ❌ 加载 view 失败: plugin="${pluginId}" container="${containerId}" render="${viewDef.render}"`,
              e
            );
          }
        }
      }
    })().catch((e) => console.error("[loader] views 注册失败:", e));
  }

  // contributes.fileAssociations → FileAssociationService（E2c #13a）
  if (c.fileAssociations) {
    const list = c.fileAssociations as Array<{
      extension: string;
      pluginId: string;
      command?: string;
      displayName?: string;
    }>;
    for (const fa of list) {
      registerFileAssociation({
        extension: fa.extension,
        pluginId: pluginId,
        command: fa.command,
        displayName: fa.displayName,
      });
    }
  }

  // contributes.langDefs → LangDefRegistry（E4V#40s5b）
  if (c.langDefs) {
    const list = c.langDefs as Array<{
      id: string;
      extensions: string[];
      aliases?: string[];
      monarch?: { tokenizer: Record<string, unknown> };
      lsp?: { command: string; args?: string[] };
    }>;
    for (const def of list) {
      registerLangDef(pluginId, def);
    }
  }
}

/* ── #45：extensionDependencies 检查 ── */

/**
 * 检查插件的 extensionDependencies——所有依赖必须已安装且未被禁用。
 * 共享函数——loadPlugin 和 loadPluginRuntime 都走这条路。
 * @returns true = 依赖满足或无需依赖，false = 缺失（已 toast）
 */
function _checkDependencies(pluginId: string, manifest: PluginManifest): boolean {
  if (!manifest.extensionDependencies?.length) return true;

  const disabled = getDisabledList();
  const installed = new Set<string>();
  for (const k of Object.keys(pluginManifests)) installed.add(extractPluginId(k));
  for (const [id] of _deferredPlugins) installed.add(id);
  for (const id of loadedPluginIds) installed.add(id);

  const missing = manifest.extensionDependencies.filter(
    (dep) => dep !== pluginId && (!installed.has(dep) || disabled.includes(dep)),
  );
  if (missing.length === 0) return true;

  const reason = missing.map((d) => `"${d}"`).join("、");
  pushToast({
    message: `插件 "${manifest.name}" 缺少依赖: ${reason}——已跳过`,
    ttl: TOAST_TTL_ERROR,
  });
  console.warn(`[pluginLoader] 依赖缺失 — "${pluginId}" 需要 ${reason}`);
  return false;
}

async function loadPlugin(
  pluginId: string,
  reason: PluginInstallEvent["reason"] = "startup",
  opts?: { skipView?: boolean },
): Promise<void> {
  if (loadedPluginIds.has(pluginId)) return;
  // 🔥 硬约束 13：竞态守卫——两次 concurrent 调用 → 第二次等第一次的 Promise
  if (_loadingPromises.has(pluginId)) { await _loadingPromises.get(pluginId)!; return; }

  const manifestKey = Object.keys(pluginManifests).find(
    (k) => extractPluginId(k) === pluginId
  );
  if (!manifestKey) {
    throw new Error(`找不到 plugin.json`);
  }

  const promise = (async () => {
  let manifest: PluginManifest;
  try {
    manifest = pluginManifests[manifestKey];
  } catch {
    pushToast({ message: `插件 "${pluginId}" 的 plugin.json 格式错误，已跳过` });
    console.warn(`[pluginLoader] plugin.json 格式错误 — "${pluginId}"`);
    return;
  }

  // P1-6 #6: minAppVersion 版本检查
  if (manifest.minAppVersion) {
    const appVer = getAppVersion();
    if (!versionGte(appVer, manifest.minAppVersion)) {
      pushToast({
        message: `插件 "${manifest.name}" 需要应用版本 ≥${manifest.minAppVersion}（当前 ${appVer}），已跳过`,
        ttl: TOAST_TTL_ERROR,
      });
      console.warn(
        `[pluginLoader] 版本不兼容 — "${pluginId}" 需要 ≥${manifest.minAppVersion}，当前 ${appVer}`
      );
      return;
    }
  }

  // #45：extensionDependencies——加载前检查依赖是否已安装且未被禁用
  if (!_checkDependencies(pluginId, manifest)) return;

  // VS Code 对标：不 switch type——检测 manifest 实际声明了什么，每种贡献独立处理。
  let contributed = false;

  if (manifest.entry && !opts?.skipView) {
    await loadViewPlugin(pluginId, manifest);
    contributed = true;
  } else if (manifest.entry && opts?.skipView) {
    // #44：延迟激活——只标记 contributed，不 import JS
    contributed = true;
  }

  // M4：contributes.themes 优先——旧格式 manifest.themes / manifest.file 仅在新格式缺失时兜底
  const hasNewThemes = !!manifest.contributes?.themes;
  if (!hasNewThemes) {
    if (manifest.themes && manifest.themes.length > 0) {
      await loadThemePlugin(pluginId, manifest);
      contributed = true;
    }
    if (manifest.file) {
      const data = await fetchPluginDataFile(pluginId, manifest.file);
      if (data?.type === "dark" || data?.type === "light") {
        await loadThemePlugin(pluginId, manifest);
        contributed = true;
      }
    }
  }

  // contributes.themes（parseContributions 中注册——此处仅标记 contributed）
  if (hasNewThemes) {
    contributed = true;
  }

  // M4：contributes.languages 优先——旧格式 manifest.languages / manifest.file 仅在新格式缺失时兜底
  const hasNewLanguages = !!manifest.contributes?.languages;
  if (!hasNewLanguages) {
    if (manifest.languages && manifest.languages.length > 0) {
      await loadLanguagePlugin(pluginId, manifest);
      contributed = true;
    }
    if (manifest.file) {
      const data = await fetchPluginDataFile(pluginId, manifest.file);
      if (data && !data.type) {
        await loadLanguagePlugin(pluginId, manifest);
        contributed = true;
      }
    }
  }

  // contributes.languages（parseContributions 中注册——此处仅标记 contributed）
  if (hasNewLanguages) {
    contributed = true;
  }

  // TODO Phase 6: registerProtocol(pluginId, manifest.mode)——当前仅 stub 检测抑制 "未声明贡献" 警告
  if (manifest.mode) {
    log.appendLine(`📡 协议插件 "${manifest.name}" (${pluginId}) 已识别——run-time 协议注册 Phase 6`);
    contributed = true;
  }

  // TODO Phase 6: ResourceRegistry.register(pluginId, manifest.resources)——当前仅 stub 检测
  if (manifest.resources && manifest.resources.length > 0) {
    log.appendLine(`📦 资源插件 "${manifest.name}" (${pluginId}) 已识别——资源注册 Phase 6`);
    contributed = true;
  }

  if (manifest.contributes) {
    try {
      parseContributions(pluginId, manifest.contributes);
      contributed = true;
    } catch (e: any) {
      console.error(`[pluginLoader] 插件 "${pluginId}" contributions 解析失败:`, e);
      // 不阻断——插件视图可能已注册成功，只有配置/命令/菜单等声明失效
    }
  }

  // contributes.themes / contributes.languages 数据异步加载——parseContributions 仅注册 metadata，此处 fetch 实际 JSON
  // 🔥 用 fetchPluginDataFile() 而非 getPluginDataFile()——绕开 Vite glob 缓存（#39a）
  if (hasNewThemes) {
    await loadThemeContributionData(pluginId, manifest);
  }
  if (hasNewLanguages) {
    await loadLanguageContributionData(pluginId, manifest);
  }

  if (!contributed) {
    log.appendLine(`插件 "${manifest.name}" (${pluginId}) 未声明任何可识别的贡献——跳过`);
  }

  // B2 fix: 缓存元数据——marketplace 不依赖文件系统，卸载后仍可浏览详情
  cachePluginMetadata(pluginId, manifest, "installed");

  applyPostLoadSteps(pluginId, manifest, reason);
  })();
  _loadingPromises.set(pluginId, promise);
  try { await promise; }
  finally { _loadingPromises.delete(pluginId); }
}

/**
 * 加载后收敛步骤——loadPlugin 和 loadPluginRuntime 共享。
 * 🔥 这不是消重复——是堵缝。两条独立函数应收敛到相同终态。
 * 历史上每次给 loadPlugin 加能力，loadPluginRuntime 就漏掉。
 * 加此函数后，新增能力只需改一处，两条路径自动受益。
 * 同类 bug：Bug 3（runtime 无侧栏）、L6（runtime 无主题颜色）、#34 bug 6（重装不显示）。
 */
function applyPostLoadSteps(pluginId: string, manifest: PluginManifest, reason: PluginInstallEvent["reason"]): void {
  loadedPluginIds.add(pluginId);
  syncAppThemeEnum();
  syncAppLanguageEnum();
  PluginLifecycle.onDidInstall.fire({ pluginId, manifest, reason });
}

/* ── Phase 5h：运行时动态加载（不在 import.meta.glob 中的插件） ── */

/**
 * 加载运行时安装的插件（不在 Vite 构建产物中）。
 * 1. 通过 Rust 命令读取 plugin.json
 * 2. 通过 plugin:// 协议加载 JS bundle
 * 3. 注册到 viewRegistry + 解析 contributions
 *
 * 对标 VS Code：从文件系统热加载扩展，不刷新窗口。
 */
async function loadPluginRuntime(pluginId: string): Promise<void> {
  if (loadedPluginIds.has(pluginId)) return;
  if (_loadingPromises.has(pluginId)) { await _loadingPromises.get(pluginId)!; return; }

  // 1. 读取 manifest
  const promise = (async () => {
  let manifest: PluginManifest;
  try {
    const raw = await linkdesk().plugins.readManifest(pluginId);
    manifest = JSON.parse(raw);
  } catch (e: any) {
    console.warn(`[pluginLoader] glob 外的插件 "${pluginId}" 读取 plugin.json 失败: ${e?.message || e}`);
    return;
  }

  // 2. 版本检查
  if (manifest.minAppVersion) {
    const appVer = getAppVersion();
    if (!versionGte(appVer, manifest.minAppVersion)) {
      pushToast({
        message: `插件 "${manifest.name}" 需要应用版本 >=${manifest.minAppVersion}（当前 ${appVer}），已跳过`,
        ttl: TOAST_TTL_ERROR,
      });
      return;
    }
  }

  // #45：extensionDependencies——加载前检查依赖
  if (!_checkDependencies(pluginId, manifest)) return;

  // B2 fix: 缓存元数据——glob 外的插件也入缓存，卸载后仍可浏览详情
  cachePluginMetadata(pluginId, manifest, "installed");

  // 3. 加载 JS bundle（ES module，core 模块 API 走 window.__v3_core__）
  let Component: React.ComponentType<{ isActive: boolean }> | undefined;
  let statusBarComponent: React.ComponentType | undefined;
  if (manifest.entry) {
    try {
      const isDev = import.meta.env.DEV;
      // dev：Vite /@fs/ 即时编译 TSX。prod：linkdesk:// 协议加载预构建 JS。
      const absPath = isDev ? await linkdesk().plugins.resolvePath(pluginId) : "";
      const entryUrl = isDev
        ? `/@fs/${absPath}/${manifest.entry}`
        : `linkdesk://${pluginId}/${manifest.entry}`;
      const module = await import(/* @vite-ignore */ entryUrl);
      Component = module.default;
      if (!Component) {
        console.warn(`[pluginLoader] glob 外的插件 "${pluginId}" 的 JS bundle 未导出 default 组件`);
      }

      // Bug 3 fix：运行时插件也加载 statusBar.tsx（对标 loadViewPlugin glob 行为）。
      // 卸载→退出→重进→重装后插件不在 import.meta.glob 中，走 loadPluginRuntime。
      const basePath = isDev ? `/@fs/${absPath}` : `linkdesk://${pluginId}`;
      try {
        const sbm = await import(/* @vite-ignore */ `${basePath}/statusBar.tsx`);
        statusBarComponent = sbm.default;
      } catch { /* 无 statusBar.tsx——正常 */ }
      if (!statusBarComponent) {
        try {
          const sbm = await import(/* @vite-ignore */ `${basePath}/src/statusBar.tsx`);
          statusBarComponent = sbm.default;
        } catch { /* 无 src/statusBar.tsx——正常 */ }
      }
    } catch (e: any) {
      console.warn(`[pluginLoader] glob 外的插件 "${pluginId}" 加载 JS 失败: ${e?.message || e}`);
      pushToast({
        message: `插件 "${manifest.name}" 加载失败——可能未构建。运行 npm run build:plugins`,
        source: pluginId,
        severity: "warning",
        ttl: TOAST_TTL_ERROR,
      });
      // 不阻断——没有视图组件仍可贡献 commands/menus/configuration
    }
  }

  // 4. 注册视图插件
  if (Component) {
    const entry: ViewPluginEntry = {
      pluginId,
      manifest,
      component: Component,
      statusBarComponent,
    };
    registerViewPlugin(entry);
    // E3f #58a：运行时插件也创建独立 WebView
    // 🔥 E5#84g 回退：单 WebView 模式——不创建独立 WebContentsView
    // try { (window as any).linkdesk?.pluginViews?.create?.(pluginId); } catch { /* 非 Electron */ }
    log.appendLine(`[OK] 运行时视图插件 "${manifest.name}" (${pluginId}) 已注册`);
  }

  // 5. 解析 contributions
  if (manifest.contributes) {
    try {
      parseContributions(pluginId, manifest.contributes as Record<string, unknown>);
    } catch (e: any) {
      console.error(`[pluginLoader] 插件 "${pluginId}" contributions 解析失败:`, e);
    }

    // contributes.themes / contributes.languages 数据异步加载（parseContributions 仅注册 metadata）
    if (manifest.contributes.themes) {
      await loadThemeContributionData(pluginId, manifest);
    }
    if (manifest.contributes.languages) {
      await loadLanguageContributionData(pluginId, manifest);
    }

    // Runtime 主题数据补充——parseContributions 中 getPluginDataFile 依赖 import.meta.glob，
    // runtime 插件不在 glob 中 → ThemeRegistry 有记录但 ThemeEngine 无颜色数据。
    if (manifest.contributes.themes) {
      const themeList = manifest.contributes.themes as ThemeContribution[];
      for (const tc of themeList) {
        if (findTheme(tc.label)) continue; // glob 插件——parseContributions 已加载
        try {
          const absPath = await linkdesk().plugins.resolvePath(pluginId);
          const url = import.meta.env.DEV
            ? `/@fs/${absPath}/${tc.path}`
            : `linkdesk://${pluginId}/${tc.path}`;
          const response = await fetch(url);
          if (!response.ok) {
            console.warn(`[pluginLoader] 主题数据文件缺失 — "${pluginId}/${tc.path}" (HTTP ${response.status})`);
            continue;
          }
          const data = await response.json();
          const themeType = (data.type as "dark" | "light") ?? tc.uiTheme;
          const colors = extractThemeColors(data);
          registerTheme({ name: tc.label, type: themeType as "dark" | "light", colors }, pluginId);
        } catch (e: any) {
          console.warn(`[pluginLoader] 主题数据加载失败 — "${pluginId}/${tc.path}": ${e?.message || e}`);
        }
      }
    }
  }

  // 6. 主题/语言（和 loadPlugin 相同的 M4 守卫逻辑）
  // L5：独立 if（非 else if）——同时声明旧格式 theme+language 的插件两者都加载
  if (!manifest.contributes?.themes && manifest.themes && manifest.themes.length > 0) {
    await loadThemePlugin(pluginId, manifest);
  }
  if (!manifest.contributes?.languages && manifest.languages && manifest.languages.length > 0) {
    await loadLanguagePlugin(pluginId, manifest);
  }

  applyPostLoadSteps(pluginId, manifest, "install");
  })();
  _loadingPromises.set(pluginId, promise);
  try { await promise; }
  finally { _loadingPromises.delete(pluginId); }
}

/* ── 视图插件 ── */

async function loadViewPlugin(pluginId: string, manifest: PluginManifest): Promise<void> {
  const entryKey = Object.keys(pluginModules).find(
    (k) => extractPluginId(k) === pluginId
  );
  if (!entryKey) {
    pushToast({ message: `插件 "${manifest.name}" 缺少入口文件（${manifest.entry ?? "index.tsx"}）` });
    throw new Error(`找不到入口文件（${manifest.entry ?? "index.tsx"}）`);
  }

  const module = await pluginModules[entryKey]();
  const Component = module.default;

  if (!Component) {
    throw new Error("入口文件未导出 default 组件");
  }

  let statusBarComponent: React.ComponentType | undefined;
  const statusBarKey = Object.keys(pluginStatusBarModules).find(
    (k) => extractPluginId(k) === pluginId
  );
  if (statusBarKey) {
    const statusBarModule = await pluginStatusBarModules[statusBarKey]();
    statusBarComponent = statusBarModule.default;
  }

  const entry: ViewPluginEntry = {
    pluginId,
    manifest,
    component: Component,
    statusBarComponent,
  };

  registerViewPlugin(entry);

  // E3f #58a：为视图插件创建独立 WebContentsView（占位 HTML，真渲染后续迁移）
  // 🔥 E5#84g 回退：单 WebView 模式——不创建独立 WebContentsView
  // try { (window as any).linkdesk?.pluginViews?.create?.(pluginId); } catch { /* 非 Electron 环境 */ }

  // E2c #19g：statusBar 声明 configurable: true → 自动注册配置项 + 注入 visible prop
  // 在 registerViewPlugin 之后、parseContributions 之前调用——
  // registerConfiguration 为 merge 语义，parseContributions 的配置会合并进来不丢失。
  const configurableItems = (manifest.statusBar ?? []).filter((i) => i.configurable);
  if (configurableItems.length > 0) {
    const properties: Record<string, { type: "boolean"; default: boolean; description: string }> = {};
    const defaults: Record<string, boolean> = {};
    for (const item of configurableItems) {
      const key = `${pluginId}.statusBar.${item.id}`;
      properties[key] = { type: "boolean", default: true, description: `状态栏显示 "${item.label || item.id}"` };
      defaults[key] = true;
    }
    registerConfiguration(pluginId, { title: manifest.name, properties });
    registerConfigurationDefaults(pluginId, defaults);
  }

  log.appendLine(`✅ 视图插件 "${manifest.name}" (${pluginId}) 已注册`);
}

/* ── 主题插件（P1-4） ── */

async function loadThemePlugin(pluginId: string, manifest: PluginManifest): Promise<void> {
  // 多主题数组
  if (manifest.themes && manifest.themes.length > 0) {
    let registered = 0;
    for (const t of manifest.themes) {
      const data = await fetchPluginDataFile(pluginId, t.file);
      if (!data) continue;
      const themeType = (data.type as "dark" | "light") ?? "dark";
      const colors = extractThemeColors(data);
      registerTheme({ name: t.name, type: themeType, colors }, pluginId);
      // H2：旧格式主题同步写入 ThemeRegistry——卸载时 revertThemeIfCurrent 能找到归属
      ThemeRegistry.register({ id: t.name, label: t.name, uiTheme: themeType, path: t.file }, pluginId);
      registered++;
    }
    if (registered > 0) {
      log.appendLine(`✅ 主题插件 "${manifest.name}" — ${registered} 个主题已注册`);
      pushToast({
        message: `新增 ${registered} 个主题：${manifest.name}`,
        ttl: TOAST_TTL_SUCCESS,
      });
    }
    return;
  }

  // 单主题
  if (manifest.file) {
    const data = await fetchPluginDataFile(pluginId, manifest.file);
    if (!data) {
      console.warn(`[pluginLoader] 主题文件缺失 — "${pluginId}/${manifest.file}"`);
      return;
    }
    const themeType = (data.type as "dark" | "light") ?? "dark";
    const colors: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      if (k !== "type" && k !== "name" && typeof v === "string") {
        colors[k] = v;
      }
    }
    registerTheme({ name: manifest.name, type: themeType, colors }, pluginId);
    // H2：旧格式主题同步写入 ThemeRegistry——卸载时 revertThemeIfCurrent 能找到归属
    ThemeRegistry.register({ id: manifest.name, label: manifest.name, uiTheme: themeType, path: manifest.file }, pluginId);
    log.appendLine(`✅ 主题插件 "${manifest.name}" 已注册`);
    pushToast({
      message: `新增主题：${manifest.name}`,
      ttl: TOAST_TTL_SUCCESS,
    });
    return;
  }

  console.warn(`[pluginLoader] 主题插件 "${pluginId}" 未声明 file 或 themes 字段`);
}

/* ── 插件数据文件 fetch（#39a：全量迁移——绕开 Vite glob 缓存） ── */

/**
 * 🔥 替代 getPluginDataFile——用 fetch() 而非 import.meta.glob。
 * Vite glob 在 dev 模式下只在启动时扫描一次，新插件目录的 JSON 不被实时发现。
 * 对标 loadPluginRuntime 的主题数据加载——从一开始就用 fetch。
 */
async function fetchPluginDataFile(pluginId: string, filePath: string): Promise<Record<string, unknown> | null> {
  try {
    if (import.meta.env.DEV) {
      // dev 模式：先试 builtin 再试 user
      for (const sub of ['builtin', 'user']) {
        const url = `http://localhost:1420/plugins/${sub}/${pluginId}/${filePath}`;
        try {
          const response = await fetch(url);
          if (response.ok) {
            return await response.json() as Record<string, unknown>;
          }
        } catch { /* fetch 失败继续试下一个 */ }
      }
      console.warn(`[pluginLoader] 数据文件加载失败 — "${pluginId}/${filePath}" (not in builtin/ or user/)`);
      return null;
    }
    // prod 模式：linkdesk:// 协议——protocol.ts 已处理 builtin/user 回退
    const url = `linkdesk://${pluginId}/${filePath}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[pluginLoader] 数据文件加载失败 — "${pluginId}/${filePath}" (${response.status})`);
      return null;
    }
    return await response.json() as Record<string, unknown>;
  } catch (e: any) {
    console.warn(`[pluginLoader] 数据文件加载异常 — "${pluginId}/${filePath}": ${e?.message || e}`);
    return null;
  }
}

/* ── 主题 JSON 数据异步加载（对标 loadLanguageContributionData） ── */

/** 加载 contributes.themes 声明的 JSON 颜色文件——用 fetch() 绕开 glob 缓存 */
async function loadThemeContributionData(pluginId: string, manifest: PluginManifest): Promise<void> {
  const themeList = manifest.contributes?.themes as ThemeContribution[] | undefined;
  if (!themeList?.length) return;

  for (const tc of themeList) {
    const data = await fetchPluginDataFile(pluginId, tc.path);
    if (!data) continue;
    const themeType = (data.type as "dark" | "light") ?? tc.uiTheme;
    const colors = extractThemeColors(data);
    registerTheme({ name: tc.label, type: themeType as "dark" | "light", colors }, pluginId);
  }
}

/* ── 语言 JSON 数据异步加载（#39 fix：绕过 Vite glob 缓存） ── */

/**
 * 加载 contributes.languages 声明的 JSON 翻译文件。
 * 和 loadLanguagePlugin 并行——后者处理旧格式 manifest.languages。
 * 🔥 用 fetch() 而不用 getPluginDataFile()——后者依赖 import.meta.glob，
 * Vite 在 dev 模式下可能缓存旧快照，新插件目录的 JSON 文件不被实时发现。
 */
async function loadLanguageContributionData(pluginId: string, manifest: PluginManifest): Promise<void> {
  const langList = manifest.contributes?.languages as LanguageContribution[] | undefined;
  if (!langList?.length) return;

  let registered = 0;
  for (const lc of langList) {
    const data = await fetchPluginDataFile(pluginId, lc.path);
    if (data) {
      registerLanguageBundle(lc.id, data as Record<string, unknown>, pluginId);
      registered++;
    }
  }

  // #42：新语言插件安装后重播当前语言资源——插件 WebView 无需等用户切语言
  if (registered > 0) syncLanguageBroadcast();
}

/**
 * 广播当前语言资源到所有插件 WebView。
 * #42：新语言插件安装后调用——插件 WebView 即时获得新翻译，无需等用户切语言。
 * 对标 App.tsx onApply 的广播——同一段逻辑，两处触发（语言切换 + 新翻译注册）。
 */
function syncLanguageBroadcast(): void {
  const bridge = (window as any).linkdesk?.bridge;
  if (!bridge?.broadcast) return;
  const currentLang = i18n.language;
  const resources: Record<string, unknown> = {};
  for (const lang of i18n.languages ?? []) {
    const bundle = i18n.getResourceBundle(lang, "translation");
    if (bundle) resources[lang] = bundle;
  }
  bridge.broadcast("lang:changed", { lang: currentLang, resources });
}

/* ── 语言资源注册——归一化（#38b：消两处 addResourceBundle 重复） ── */

/**
 * 注册语言翻译资源到 i18next。
 * 两处调用：loadLanguagePlugin（旧格式 manifest.languages）+
 * parseContributions（新格式 contributes.languages）。
 * 归一化后两处各一行调用——新增语言注册路径不复制粘贴。
 */
function registerLanguageBundle(langCode: string, data: Record<string, unknown>, pluginId: string): void {
  const ns = "translation";
  i18n.addResourceBundle(langCode, ns, data, true, true);
  i18n.addResourceBundle(langCode, pluginId, data, true, true);
}

/* ── 语言插件（P1-4） ── */

async function loadLanguagePlugin(pluginId: string, manifest: PluginManifest): Promise<void> {
  // 多语言数组
  if (manifest.languages && manifest.languages.length > 0) {
    let registered = 0;
    for (const lang of manifest.languages) {
      const data = await fetchPluginDataFile(pluginId, lang.file);
      if (!data) continue;
      registerLanguageBundle(lang.code, data, pluginId);
      registered++;
    }
    if (registered > 0) {
      log.appendLine(`✅ 语言插件 "${manifest.name}" — ${registered} 个语言已注册`);
      pushToast({
        message: `新增 ${registered} 个语言：${manifest.name}`,
        ttl: TOAST_TTL_SUCCESS,
      });
      syncLanguageBroadcast(); // #42：新翻译注册→即时广播到插件 WebView
    }
    return;
  }

  // 单语言文件——从文件名推导语言代码
  if (manifest.file) {
    const data = await fetchPluginDataFile(pluginId, manifest.file);
    if (!data) return;
    const code = manifest.file.replace(/\.json$/, "");
    registerLanguageBundle(code, data, pluginId);
    log.appendLine(`✅ 语言插件 "${manifest.name}" (${code}) 已注册`);
    pushToast({
      message: `新增语言：${manifest.name}`,
      ttl: TOAST_TTL_SUCCESS,
    });
    syncLanguageBroadcast(); // #42：新翻译注册→即时广播到插件 WebView
    return;
  }

  console.warn(`[pluginLoader] 语言插件 "${pluginId}" 未声明 file 或 languages 字段`);
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

/* ═══════════════════════════════════════════════════════════
   Phase 4.3 生命周期 API——安装/卸载/禁用/启用
   ═══════════════════════════════════════════════════════════ */

/**
 * 禁用插件：标记到 prefs.disabledPlugins + 从 viewRegistry 移除。
 * 插件文件保留在 plugins/ 目录，下次启动跳过。
 * 对标 VS Code "Disable Extension"。
 */
export async function disablePlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const manifest = getLoadedManifest(pluginId);
    if (!manifest) {
      return { success: false, error: `插件 "${pluginId}" 未找到` };
    }
    if (manifest.core) {
      return { success: false, error: `核心插件 "${pluginId}" 不可禁用` };
    }

    const list = getDisabledList();
    if (!list.includes(pluginId)) {
      list.push(pluginId);
      await saveDisabledList(list);
    }
    // Phase 5h 行为归一化：lifecycle 消费端处理 config 清理 + tab 关闭 + iconOrder(保留) + toast
    const displayName = manifest.name;
    // B2 fix: 标记为已禁用（缓存保留——marketplace 仍可浏览详情）
    cachePluginMetadata(pluginId, manifest, "disabled");
    // revert 必须在 onWillUninstall 之前——onWillUninstall 注销主题/语言后 revert 找不到归属
    await revertThemeIfCurrent(pluginId);
    await revertLanguageIfCurrent(pluginId);
    PluginLifecycle.onWillUninstall.fire({ pluginId, reason: "disable", displayName });
    // 仅视图插件需要注销组件注册
    if (getViewPlugin(pluginId)) unregisterViewPlugin(pluginId);
    loadedPluginIds.delete(pluginId);
    _deferredPlugins.delete(pluginId);
    PluginLifecycle.onDidUninstall.fire({ pluginId, reason: "disable", displayName });
    syncAppThemeEnum();
    syncAppLanguageEnum();
    log.appendLine(`🔒 已禁用 "${pluginId}"`);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

/**
 * 启用插件：从 prefs.disabledPlugins 移除 + 重新加载。
 * 对标 VS Code "Enable Extension"。
 * 注意：.tsx 视图插件启用后需重启生效（无法运行时动态 import）。
 */
export async function enablePlugin(pluginId: string): Promise<{ success: boolean; error?: string; needRestart?: boolean }> {
  try {
    const list = getDisabledList();
    const idx = list.indexOf(pluginId);
    if (idx !== -1) {
      list.splice(idx, 1);
      await saveDisabledList(list);
    }

    // 尝试重新加载——对于 .json 插件（theme/language）即时生效
    // 对于 .tsx 视图插件，import.meta.glob 是构建时解析的，无法运行时动态注入
    // 此时返回 needRestart: true
    const manifestKey = Object.keys(pluginManifests).find(
      (k) => extractPluginId(k) === pluginId
    );

    if (manifestKey) {
      const manifest = pluginManifests[manifestKey];
      // .json 插件（theme/language/file）——即时生效
      if ((manifest.themes || manifest.languages || (!manifest.entry && manifest.file))) {
        await loadPlugin(pluginId, "enable");
        log.appendLine(`🔓 已启用 "${pluginId}"`);
        return { success: true };
      }
      // 视图插件——loadPlugin(reason:'enable') → lifecycle 消费端处理 iconOrder(保持原位) + toast
      await loadPlugin(pluginId, "enable");
      log.appendLine(`[OK] 已启用 "${pluginId}"（即时生效）`);
      return { success: true };
    }

    return { success: true, needRestart: true };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

/**
 * 卸载插件：Rust 端移到 .disabled/ → 从 viewRegistry 移除 → 持久化。
 * 如果插件之前被禁用，从禁用列表清理（卸载优先级高于禁用）。
 * core 插件不可卸载。
 */
export async function uninstallPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const manifest = getLoadedManifest(pluginId);
    if (!manifest) {
      return { success: false, error: `插件 "${pluginId}" 未找到` };
    }
    if (manifest.core) {
      return { success: false, error: `核心插件 "${pluginId}" 不可卸载` };
    }

    // Phase 5h 行为归一化：lifecycle 消费端处理 config 清理 + iconOrder(移除) + tab 关闭
    const displayName = manifest.name;

    // Rust 端先执行——成功后再做前端变更。
    // 如果 Rust 失败，前端保持原样不进入撕裂状态；且调用方组件未卸载，能显示错误。
    await linkdesk().plugins.uninstall(pluginId);

    // Rust 成功 → 前端更新
    cachePluginMetadata(pluginId, manifest, "uninstalled");
    // revert 必须在 onWillUninstall 之前——onWillUninstall 注销主题/语言后 revert 找不到归属
    await revertThemeIfCurrent(pluginId);
    await revertLanguageIfCurrent(pluginId);
    PluginLifecycle.onWillUninstall.fire({ pluginId, reason: "uninstall", displayName });

    // 如果插件之前被禁用过，清理禁用列表——卸载优先级高于禁用
    const list = getDisabledList();
    const idx = list.indexOf(pluginId);
    if (idx !== -1) {
      list.splice(idx, 1);
      await saveDisabledList(list);
    }

    // 前端：移除注册（仅视图插件需要）
    if (getViewPlugin(pluginId)) unregisterViewPlugin(pluginId);
    loadedPluginIds.delete(pluginId);
    _deferredPlugins.delete(pluginId);
    PluginLifecycle.onDidUninstall.fire({ pluginId, reason: "uninstall", displayName });
    syncAppThemeEnum();
    syncAppLanguageEnum();
    log.appendLine(`🗑 已卸载 "${pluginId}"`);
    pushToast({ message: `已卸载：${displayName}`, source: pluginId, ttl: TOAST_TTL_SUCCESS, severity: "info" });
    return { success: true };
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error(`[pluginLoader] 卸载 "${pluginId}" 失败:`, msg);
    pushToast({ message: `卸载失败：${msg}`, source: pluginId, ttl: TOAST_TTL_ERROR, severity: "error" });
    return { success: false, error: msg };
  }
}

/**
 * 卸载插件的唯一入口——带确认弹窗 + 错误反馈。
 * 两个 UI 入口（齿轮菜单 + 详情页）都调此函数，确保行为一致。
 */
export async function performUninstall(pluginId: string): Promise<boolean> {
  const { showConfirm } = await import("../core/services/DialogService");
  const manifest = getLoadedManifest(pluginId);
  const name = manifest?.name ?? pluginId;
  const confirmed = await showConfirm(
    i18n.t("确定要卸载") + ` "${name}"？` + i18n.t("此操作可撤销（文件保留在 .disabled/ 目录）。")
  );
  if (!confirmed) return false;
  const r = await uninstallPlugin(pluginId);
  return r.success;
}

/**
 * 安装插件：Electron 端复制到 plugins/user/ → 热加载。
 * 仅对 theme/language 插件即时生效；view 插件提示重启。
 */
export async function installPlugin(sourcePath: string): Promise<{ success: boolean; pluginId?: string; error?: string; needRestart?: boolean }> {
  try {
    const pluginId = await linkdesk().plugins.install(sourcePath);

    // 尝试热加载——主题/语言即时生效，视图插件需要重启
    const manifestKey = Object.keys(pluginManifests).find(
      (k) => extractPluginId(k) === pluginId
    );

    if (manifestKey) {
      // 清单在 glob 中 → loadPlugin(reason:'install') → lifecycle 消费端处理 iconOrder + toast
      await loadPlugin(pluginId, "install");
      return { success: true, pluginId };
    }
    // Phase 5h：清单不在 glob 中（运行时安装的插件）——loadPluginRuntime 内部 fire onDidInstall
    try {
      await loadPluginRuntime(pluginId);
      return { success: true, pluginId };
    } catch (e: any) {
      // 运行时加载失败（可能未构建）
      pushToast({
        message: `已安装：${pluginId}。运行 npm run build:plugins 后生效。`,
        source: pluginId,
        severity: "info",
        ttl: 0,
        actions: [
          { label: "立即重启", isPrimary: true, onClick: () => window.location.reload() },
        ],
      });
      return { success: true, pluginId, needRestart: true };
    }
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

/** 判断插件是否被禁用 */
export function isPluginDisabled(pluginId: string): boolean {
  return getDisabledList().includes(pluginId);
}

/**
 * 获取插件在元数据缓存中的状态。
 * 返回值优先级高于 isPluginDisabled——缓存 "uninstalled" 的插件即使残留
 * 在禁用列表中，也应视为已卸载（可重新安装，而非启用）。
 */
export function getPluginCachedStatus(pluginId: string): CachedPluginMeta["status"] | undefined {
  return getMetadataCache()[pluginId]?.status;
}

/** 获取插件完整缓存元数据——PluginDetailView 卸载后重建详情页用（G14 fix v2） */
export function getPluginCachedMeta(pluginId: string): CachedPluginMeta | undefined {
  return getMetadataCache()[pluginId];
}

/** 获取所有已加载插件的 manifest（含非视图插件 + 运行时加载的插件） */
export function getLoadedPluginManifests(): Array<{ pluginId: string; manifest: PluginManifest }> {
  const result: Array<{ pluginId: string; manifest: PluginManifest }> = [];
  const seen = new Set<string>();

  // 1. Vite glob 中的插件（构建时扫描）
  for (const [path, manifest] of Object.entries(pluginManifests)) {
    const pluginId = extractPluginId(path);
    if (loadedPluginIds.has(pluginId)) {
      result.push({ pluginId, manifest });
      seen.add(pluginId);
    }
  }

  // 2. 运行时加载的插件（loadPluginRuntime 缓存了完整 manifest——仅 loadedPluginIds 中有的，防僵尸缓存）
  const cache = getMetadataCache();
  for (const [pluginId, meta] of Object.entries(cache)) {
    if (meta.status === "installed" && meta.manifest && !seen.has(pluginId) && loadedPluginIds.has(pluginId)) {
      result.push({ pluginId, manifest: meta.manifest });
    }
  }

  return result;
}

/** 同步 app.theme 枚举——主题注册/注销后调用。不影响 onApply，只更新下拉选项。 */
function syncAppThemeEnum(): void {
  const available = getAvailableThemes();
  if (available.length === 0) return; // 无主题时不更新——保留上次枚举，避免下拉变输入框
  updateConfigurationEnum("app.theme", available, available.includes("Dark") ? "Dark" : available[0]);
}

/** 同步 app.language 枚举——语言注册/注销后调用。不影响 onApply，只更新下拉选项。 */
function syncAppLanguageEnum(): void {
  const languages = LanguageRegistry.getAll();
  if (languages.length === 0) return; // 无语言时不更新——保留上次枚举
  const codes = languages.map(l => l.id);
  updateConfigurationEnum("app.language", codes, codes.includes("zh") ? "zh" : codes[0]);
}

/** 当前语言是否来自此插件——卸载/禁用当前语言时自动回退（对标 revertThemeIfCurrent） */
async function revertLanguageIfCurrent(pluginId: string): Promise<void> {
  try {
    const currentLang = getConfigurationValue<string>("app.language") ?? "zh";
    const lang = LanguageRegistry.get(currentLang);
    if (!lang || lang.pluginId !== pluginId) return;

    // 当前语言来自被卸载/禁用的插件 → 找替代
    const languages = LanguageRegistry.getAll();
    const fallback = languages.length > 0
      ? (languages.find(l => l.id === "zh")?.id ?? languages[0].id)
      : "zh";
    await setConfigurationValue("app.language", fallback, "user");
  } catch { /* 非关键路径 */ }
}

/** 当前主题是否来自此插件——卸载/禁用当前主题时自动回退 */
async function revertThemeIfCurrent(pluginId: string): Promise<void> {
  try {
    const currentTheme = getConfigurationValue<string>("app.theme");
    const theme = ThemeRegistry.get(currentTheme ?? "");
    if (!theme || theme.pluginId !== pluginId) return;

    // 当前主题来自被卸载/禁用的插件 → 找替代
    const available = getAvailableThemes();
    if (available.length > 0) {
      await setConfigurationValue("app.theme", available[0], "user");
    }
    // 无可用主题 → 保持当前 CSS（index.css :root 为兜底），设定下次启动的默认值
  } catch { /* 非关键路径 */ }
}

/** 是否已初始化 */
export function isPluginLoaderReady(): boolean {
  return _initialized;
}

/** 获取禁用插件的基本信息（在 plugins/.disabled/ 下）*/
export function getDisabledPluginInfo(): Array<{ pluginId: string; name: string; description?: string; version?: string }> {
  // B2 fix: 优先从缓存读——支持glob 外的插件（glob 中无清单）
  const cache = getMetadataCache();
  const disabled = getDisabledList();
  const result: Array<{ pluginId: string; name: string; description?: string; version?: string }> = [];
  for (const pluginId of disabled) {
    const cached = cache[pluginId];
    if (cached) {
      result.push({ pluginId, name: cached.name, description: cached.description, version: cached.version });
      continue;
    }
    // 兜底：glob 中的插件从 glob 读（initPluginLoader 已将种子写入缓存，此分支仅用于缓存未就绪的极端情况）
    const manifestKey = Object.keys(pluginManifests).find(
      (k) => extractPluginId(k) === pluginId
    );
    if (manifestKey) {
      const m = pluginManifests[manifestKey];
      result.push({
        pluginId,
        name: m.name || pluginId,
        description: m.description,
        version: m.version,
      });
    }
  }
  return result;
}

/** 获取已卸载插件列表（B2 fix：从元数据缓存读，不依赖文件系统——插件目录已被移走）*/
export async function getUninstalledPluginInfo(): Promise<Array<{ pluginId: string; name: string; description?: string; version?: string }>> {
  // B2 fix: 从缓存读——不依赖 Rust 目录扫描（目录已被移走）也不依赖 globally（glob 外的插件不存在于此）
  const cache = getMetadataCache();
  const result: Array<{ pluginId: string; name: string; description?: string; version?: string }> = [];
  for (const [, meta] of Object.entries(cache)) {
    if (meta.status === "uninstalled") {
      result.push({ pluginId: meta.pluginId, name: meta.name, description: meta.description, version: meta.version });
    }
  }
  return result;
}

/**
 * 重新安装已卸载的插件：从 .disabled/ 移回 plugins/。
 * 对标 VS Code：扩展卸载后文件仍在本地，可一键重新安装。
 * 移回后需全页刷新——Vite dev server 的 import.meta.glob 在启动时扫描，需重扫才能识别移回的插件。
 */
export async function reinstallPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await linkdesk().plugins.reinstall(pluginId);

    // 检查 Vite glob 中是否有此插件——启动时文件在 plugins/builtin/ 或 plugins/user/ 下则 glob 中有
    const manifestKey = Object.keys(pluginManifests).find(
      (k) => extractPluginId(k) === pluginId
    );
    if (manifestKey) {
      // 同 session 重装——模块已加载，Vite 动态 import 直接加载移回的文件，即时生效
      await loadPlugin(pluginId, "reinstall");
      return { success: true };
    }

    // glob 中没有（退出软件后重启 npx tauri dev 导致 Vite 重扫 glob，插件当时在
    // .disabled/ 中未被纳入）。文件已由 reinstall_plugin 移回——通过 loadPluginRuntime
    // 用 Vite /@fs/ 端点即时加载，无需再次重启。
    await loadPluginRuntime(pluginId);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

/* ── #44：延迟激活——activationEvents 插件按需 import ── */

/**
 * 激活之前延迟加载的插件——import JS → registerViewPlugin → fire onDidInstall。
 * 调用时机：onCommand 执行前 / onFileOpen / onPortOpen 等触发源。
 */
export async function activatePlugin(pluginId: string): Promise<boolean> {
  const manifest = _deferredPlugins.get(pluginId);
  if (!manifest) return false; // 不是延迟插件——可能已激活或不存在

  try {
    await loadViewPlugin(pluginId, manifest);
    _deferredPlugins.delete(pluginId);
    // 不调 applyPostLoadSteps——loadedPluginIds 已有、onDidInstall 已发过（startup 静默）、
    // 图标排序已正确。只需通知 UI 刷新（例如图标从灰变亮）
    syncAppThemeEnum();
    syncAppLanguageEnum();
    onPluginLifecycleChange.fire();
    console.log(`[pluginLoader] ⚡ 延迟激活 "${pluginId}"`);
    log.appendLine(`⚡ 延迟激活 "${pluginId}"`);
    return true;
  } catch (e: any) {
    console.error(`[pluginLoader] 激活 "${pluginId}" 失败:`, e);
    pushToast({ message: `插件 "${manifest.name ?? pluginId}" 激活失败: ${e?.message || e}`, severity: "error" });
    return false;
  }
}

/** 根据 commandId 查找所属的延迟插件——executeCommand 预激活用 */
export function findDeferredByCommand(commandId: string): string | undefined {
  for (const [pluginId, manifest] of _deferredPlugins) {
    const events = manifest.activationEvents ?? [];
    for (const ev of events) {
      if (ev === `onCommand:${commandId}` || ev === "*") return pluginId;
    }
  }
  return undefined;
}

/* ── 获取 viewPlugin（从 registry，导出给外部使用） ── */
import { getViewPlugin } from "./viewRegistry";

/* ═══════════════════════════════════════════════════════════
   P1-5 文件监听 —— 轮询检测新插件
   ═══════════════════════════════════════════════════════════ */

let _watchInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Phase 5h：文件监听——轮询检测新插件目录。
 * 每 2 秒调用 Rust `list_plugin_dirs`。
 * - glob 中的插件（在 import.meta.glob 中）→ loadPlugin（Vite chunk）
 * - glob 外的插件（不在 glob 中）→ loadPluginRuntime（plugin:// 协议）
 */
export function startPluginWatcher(): void {
  if (_watchInterval) return;

  _watchInterval = setInterval(async () => {
    try {
      const dirs = await linkdesk().plugins.listDirs();
      for (const dir of dirs) {
        if (loadedPluginIds.has(dir)) continue;
        if (getDisabledList().includes(dir)) continue;

        const manifestKey = Object.keys(pluginManifests).find(
          (k) => extractPluginId(k) === dir
        );
        if (manifestKey) {
          // 已在 Vite glob 中——直接 loadPlugin
          await loadPlugin(dir, "startup");
          log.appendLine(`文件监听发现新插件 "${dir}"——已即时加载`);
        } else {
          // 不在 glob 中——通过 Vite /@fs/ 动态 import 加载
          await loadPluginRuntime(dir);
          // loadPluginRuntime 内部已 toast（成功或失败）
        }
      }

      // G16：反向检测——已加载但文件系统已删除 → 自动卸载
      const fsSet = new Set(dirs);
      for (const id of [...loadedPluginIds]) {
        if (!fsSet.has(id) && !getDisabledList().includes(id)) {
          log.appendLine(`插件 "${id}" 目录已手动删除——自动移除注册`);
          unregisterViewPlugin(id);
          loadedPluginIds.delete(id);
          PluginLifecycle.onWillUninstall.fire({ pluginId: id, reason: "uninstall", displayName: id });
          PluginLifecycle.onDidUninstall.fire({ pluginId: id, reason: "uninstall", displayName: id });
        }
      }
    } catch {
      // 静默——polling 失败不影响运行
    }
  }, 2000);

  log.appendLine("文件监听已启动（2s 轮询，Phase 5h）");
}

/** 停止文件监听 */
export function stopPluginWatcher(): void {
  if (_watchInterval) {
    clearInterval(_watchInterval);
    _watchInterval = null;
  }
}

// 导出供 vitest——防止新增贡献类型时漏加 revert（主题/语言/图标主题…）
export { revertThemeIfCurrent, revertLanguageIfCurrent };
