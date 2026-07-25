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
 */

// Electron IPC——window.linkdesk 由 preload-shell.ts 注入
const linkdesk = () => (window as any).linkdesk;
import type { PluginManifest, ViewPluginEntry } from "../core/types";
import { registerViewPlugin, unregisterViewPlugin } from "./viewRegistry";
import { registerTheme } from "../core/ThemeEngine";
import { ThemeRegistry } from "../core/ThemeRegistry";
import type { ThemeContribution } from "../core/types";
import { pushToast, TOAST_TTL_ERROR, TOAST_TTL_SUCCESS } from "../core/toast";
// Phase 5f：PreferenceService 双写已清除——PluginStateService/ConfigurationService 是唯一真源
// Phase 5：插件状态管理迁移到 PluginStateService
import { getPluginStateValue, setPluginStateValue, APP_PLUGIN_ID } from "../core/PluginStateService";
// Phase 5h 行为归一化：副作用（iconOrder/toast/config/tab）集中到 lifecycle.ts 消费端
import { PluginLifecycle, initLifecycleConsumers, type PluginInstallEvent } from "./lifecycle";
// Phase 5：contributes 解析——静态导入，确保同步注册（异步 import 会晚于组件 mount → placeholder 覆盖真实 handler）
import { registerConfiguration, registerConfigurationDefaults } from "../core/ConfigurationRegistry";
import type { ManifestMenuItem } from "../core/MenuRegistry";
import { registerMenuItems } from "../core/MenuRegistry";
import { registerCommand } from "../core/CommandRegistry";
import { registerFileAssociation } from "../core/FileAssociationService";
import { registerKeybinding } from "../core/KeybindingRegistry";
import { versionGte } from "./semverUtils";
import i18n from "../i18n";
import { createLogChannel } from "../core/LogChannel";

/* ── B6 fix：pluginLoader 日志频道——替代 console.log（对标 VS Code Output panel） */
const log = createLogChannel("app", "pluginLoader", "pluginLoader");

/* ── 插件入口文件映射（Vite import.meta.glob） ── */

// Vite 在构建时展开 glob，生成所有插件的入口映射。
// E2c #19j-structure-a：同时支持平铺结构和 src/ 子目录结构——过渡期内两种都匹配。
// 注意：只扫描 plugins/*/，不扫描 plugins/.disabled/（.disabled 多了层目录会破坏相对 import 路径）
const pluginModules = {
  ...import.meta.glob<{ default: React.ComponentType<{ isActive: boolean }> }>(
    "../../plugins/*/index.tsx",
    { eager: false }
  ),
  ...import.meta.glob<{ default: React.ComponentType<{ isActive: boolean }> }>(
    "../../plugins/*/src/index.tsx",
    { eager: false }
  ),
};

const pluginSidebarModules = {
  ...import.meta.glob<{ default: React.ComponentType }>(
    "../../plugins/*/sidebar.tsx",
    { eager: false }
  ),
  ...import.meta.glob<{ default: React.ComponentType }>(
    "../../plugins/*/src/sidebar.tsx",
    { eager: false }
  ),
};

const pluginStatusBarModules = {
  ...import.meta.glob<{ default: React.ComponentType }>(
    "../../plugins/*/statusBar.tsx",
    { eager: false }
  ),
  ...import.meta.glob<{ default: React.ComponentType }>(
    "../../plugins/*/src/statusBar.tsx",
    { eager: false }
  ),
};

const pluginManifests = import.meta.glob<PluginManifest>(
  "../../plugins/*/plugin.json",
  { eager: true }  // plugin.json 需要立即读取——决定注册表结构
);

// P1-4：主题/语言数据文件（所有非 plugin.json 的 JSON 文件）
const pluginDataFiles = import.meta.glob<Record<string, unknown>>(
  "../../plugins/*/*.json",
  { eager: true }
);

/* ── 辅助：从路径提取 pluginId ── */

/** 从 glob key 提取插件 ID——"../../plugins/<id>/..." → "<id>" */
function extractPluginId(path: string): string {
  // 找到 "plugins" 目录，插件 ID 是它后面第一个段
  const parts = path.split("/");
  const idx = parts.indexOf("plugins");
  return idx >= 0 && idx + 1 < parts.length ? parts[idx + 1] : parts[parts.length - 2];
}

/** 获取插件目录下的数据文件内容 */
function getPluginDataFile(pluginId: string, filename: string): Record<string, unknown> | undefined {
  const target = `../../plugins/${pluginId}/${filename}`;
  return pluginDataFiles[target];
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
/** 已成功加载的插件 ID 集合（用于文件监听检测新插件） */
const loadedPluginIds = new Set<string>();

export async function initPluginLoader(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  // Phase 5h 行为归一化：注册 lifecycle 消费端（iconOrder/toast/config/tab——只注册一次）
  initLifecycleConsumers();

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
      await loadPlugin(pluginId, "startup");
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
      properties: config.properties as Record<string, import("../core/ConfigurationRegistry").ConfigurationProperty>,
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

  // contributes.themes → ThemeRegistry
  if (c.themes) {
    const themeList = c.themes as ThemeContribution[];
    for (const tc of themeList) {
      ThemeRegistry.register(tc, pluginId);
    }
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
}

async function loadPlugin(
  pluginId: string,
  reason: PluginInstallEvent["reason"] = "startup"
): Promise<void> {
  const manifestKey = Object.keys(pluginManifests).find(
    (k) => extractPluginId(k) === pluginId
  );
  if (!manifestKey) {
    throw new Error(`找不到 plugin.json`);
  }

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

  // VS Code 对标：不 switch type——检测 manifest 实际声明了什么，每种贡献独立处理。
  let contributed = false;

  if (manifest.entry) {
    await loadViewPlugin(pluginId, manifest);
    contributed = true;
  }

  if (manifest.themes && manifest.themes.length > 0) {
    loadThemePlugin(pluginId, manifest);
    contributed = true;
  } else if (manifest.file) {
    const data = getPluginDataFile(pluginId, manifest.file);
    if (data?.type === "dark" || data?.type === "light") {
      loadThemePlugin(pluginId, manifest);
      contributed = true;
    }
  }

  if (manifest.languages && manifest.languages.length > 0) {
    loadLanguagePlugin(pluginId, manifest);
    contributed = true;
  } else if (manifest.file && !contributed) {
    const data = getPluginDataFile(pluginId, manifest.file);
    if (data && !data.type) {
      loadLanguagePlugin(pluginId, manifest);
      contributed = true;
    }
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

  if (!contributed) {
    log.appendLine(`插件 "${manifest.name}" (${pluginId}) 未声明任何可识别的贡献——跳过`);
  }

  loadedPluginIds.add(pluginId);

  // B2 fix: 缓存元数据——marketplace 不依赖文件系统，卸载后仍可浏览详情
  cachePluginMetadata(pluginId, manifest, "installed");

  // Phase 5h 行为归一化：副作用（iconOrder/toast/config/tab）由 lifecycle 消费端统一处理
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
  // 1. 读取 manifest
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

  // B2 fix: 缓存元数据——glob 外的插件也入缓存，卸载后仍可浏览详情
  cachePluginMetadata(pluginId, manifest, "installed");

  // 3. 加载 JS bundle（ES module，core 模块 API 走 window.__v3_core__）
  let Component: React.ComponentType<{ isActive: boolean }> | undefined;
  if (manifest.entry) {
    try {
      // Vite /@fs/ 端点——dev server 实时编译 TypeScript，浏览器直接拿 JS。
      // 对标 import.meta.glob 底层机制，源码树 .tsx 和运行时 dist/.js 都适用。
      // 归一化：所有非 glob 插件加载走同一条 /@fs/ 路径。
      const absPath = await linkdesk().plugins.resolvePath(pluginId);
      const module = await import(/* @vite-ignore */ `/@fs/${absPath}/${manifest.entry}`);
      Component = module.default;
      if (!Component) {
        console.warn(`[pluginLoader] glob 外的插件 "${pluginId}" 的 JS bundle 未导出 default 组件`);
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
      // glob 外的插件暂不支持 sidebar/statusBar（Phase 6 扩展 SDK 后支持）
    };
    registerViewPlugin(entry);
    log.appendLine(`[OK] 运行时视图插件 "${manifest.name}" (${pluginId}) 已注册`);
  }

  // 5. 解析 contributions
  if (manifest.contributes) {
    try {
      parseContributions(pluginId, manifest.contributes as Record<string, unknown>);
    } catch (e: any) {
      console.error(`[pluginLoader] 插件 "${pluginId}" contributions 解析失败:`, e);
    }
  }

  // 6. 主题/语言（和 loadPlugin 相同的逻辑）
  if (manifest.themes && manifest.themes.length > 0) {
    loadThemePlugin(pluginId, manifest);
  } else if (manifest.languages && manifest.languages.length > 0) {
    loadLanguagePlugin(pluginId, manifest);
  }

  loadedPluginIds.add(pluginId);

  // Phase 5h 行为归一化：副作用由 lifecycle 消费端统一处理
  // glob 外的插件的安装原因——从外部来源安装，视为 'install'
  PluginLifecycle.onDidInstall.fire({ pluginId, manifest, reason: "install" });
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

  let sidebarComponent: React.ComponentType | undefined;
  const sidebarKey = Object.keys(pluginSidebarModules).find(
    (k) => extractPluginId(k) === pluginId
  );
  if (sidebarKey) {
    const sidebarModule = await pluginSidebarModules[sidebarKey]();
    sidebarComponent = sidebarModule.default;
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
    sidebarComponent,
    statusBarComponent,
  };

  registerViewPlugin(entry);

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

function loadThemePlugin(pluginId: string, manifest: PluginManifest): void {
  // 多主题数组
  if (manifest.themes && manifest.themes.length > 0) {
    let registered = 0;
    for (const t of manifest.themes) {
      const data = getPluginDataFile(pluginId, t.file);
      if (!data) {
        console.warn(`[pluginLoader] 主题文件缺失 — "${pluginId}/${t.file}"`);
        continue;
      }
      const themeType = (data.type as "dark" | "light") ?? "dark";
      const colors: Record<string, string> = {};
      for (const [k, v] of Object.entries(data)) {
        if (k !== "type" && k !== "name" && typeof v === "string") {
          colors[k] = v;
        }
      }
      registerTheme({ name: t.name, type: themeType, colors }, pluginId);
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
    const data = getPluginDataFile(pluginId, manifest.file);
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
    log.appendLine(`✅ 主题插件 "${manifest.name}" 已注册`);
    pushToast({
      message: `新增主题：${manifest.name}`,
      ttl: TOAST_TTL_SUCCESS,
    });
    return;
  }

  console.warn(`[pluginLoader] 主题插件 "${pluginId}" 未声明 file 或 themes 字段`);
}

/* ── 语言插件（P1-4） ── */

function loadLanguagePlugin(pluginId: string, manifest: PluginManifest): void {
  const ns = "translation";

  // 多语言数组
  if (manifest.languages && manifest.languages.length > 0) {
    let registered = 0;
    for (const lang of manifest.languages) {
      const data = getPluginDataFile(pluginId, lang.file);
      if (!data) {
        console.warn(`[pluginLoader] 语言文件缺失 — "${pluginId}/${lang.file}"`);
        continue;
      }
      i18n.addResourceBundle(lang.code, ns, data, true, true);
      registered++;
    }
    if (registered > 0) {
      log.appendLine(`✅ 语言插件 "${manifest.name}" — ${registered} 个语言已注册`);
      pushToast({
        message: `新增 ${registered} 个语言：${manifest.name}`,
        ttl: TOAST_TTL_SUCCESS,
      });
    }
    return;
  }

  // 单语言文件——从文件名推导语言代码
  if (manifest.file) {
    const data = getPluginDataFile(pluginId, manifest.file);
    if (!data) {
      console.warn(`[pluginLoader] 语言文件缺失 — "${pluginId}/${manifest.file}"`);
      return;
    }
    const code = manifest.file.replace(/\.json$/, "");
    i18n.addResourceBundle(code, ns, data, true, true);
    log.appendLine(`✅ 语言插件 "${manifest.name}" (${code}) 已注册`);
    pushToast({
      message: `新增语言：${manifest.name}`,
      ttl: TOAST_TTL_SUCCESS,
    });
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
    const entry = getViewPlugin(pluginId);
    if (!entry) {
      return { success: false, error: `插件 "${pluginId}" 未找到` };
    }
    if (entry.manifest.core) {
      return { success: false, error: `核心插件 "${pluginId}" 不可禁用` };
    }

    const list = getDisabledList();
    if (!list.includes(pluginId)) {
      list.push(pluginId);
      await saveDisabledList(list);
    }
    // Phase 5h 行为归一化：lifecycle 消费端处理 config 清理 + tab 关闭 + iconOrder(保留) + toast
    const displayName = entry.manifest.name;
    // B2 fix: 标记为已禁用（缓存保留——marketplace 仍可浏览详情）
    cachePluginMetadata(pluginId, entry.manifest, "disabled");
    PluginLifecycle.onWillUninstall.fire({ pluginId, reason: "disable", displayName });
    unregisterViewPlugin(pluginId);
    loadedPluginIds.delete(pluginId);
    PluginLifecycle.onDidUninstall.fire({ pluginId, reason: "disable", displayName });
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
    const entry = getViewPlugin(pluginId);
    if (!entry) {
      return { success: false, error: `插件 "${pluginId}" 未找到` };
    }
    if (entry.manifest.core) {
      return { success: false, error: `核心插件 "${pluginId}" 不可卸载` };
    }

    // Phase 5h 行为归一化：lifecycle 消费端处理 config 清理 + iconOrder(移除) + tab 关闭
    const displayName = entry.manifest.name;

    // Rust 端先执行——成功后再做前端变更。
    // 如果 Rust 失败，前端保持原样不进入撕裂状态；且调用方组件未卸载，能显示错误。
    await linkdesk().plugins.uninstall(pluginId);

    // Rust 成功 → 前端更新
    cachePluginMetadata(pluginId, entry.manifest, "uninstalled");
    PluginLifecycle.onWillUninstall.fire({ pluginId, reason: "uninstall", displayName });

    // 如果插件之前被禁用过，清理禁用列表——卸载优先级高于禁用
    const list = getDisabledList();
    const idx = list.indexOf(pluginId);
    if (idx !== -1) {
      list.splice(idx, 1);
      await saveDisabledList(list);
    }

    // 前端：移除注册
    unregisterViewPlugin(pluginId);
    loadedPluginIds.delete(pluginId);
    PluginLifecycle.onDidUninstall.fire({ pluginId, reason: "uninstall", displayName });
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
  const { showConfirm } = await import("../core/DialogService");
  const entry = getViewPlugin(pluginId);
  const name = entry?.manifest.name ?? pluginId;
  const confirmed = await showConfirm(
    i18n.t("确定要卸载") + ` "${name}"？` + i18n.t("此操作可撤销（文件保留在 .disabled/ 目录）。")
  );
  if (!confirmed) return false;
  const r = await uninstallPlugin(pluginId);
  return r.success;
}

/**
 * 安装插件：Rust 端复制到 plugins/ → 热加载。
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

/** 是否已初始化 */
export function isPluginLoaderReady(): boolean {
  return _initialized;
}

/** 获取禁用插件的基本信息（在 plugins/ 但被 prefs 标记禁用）*/
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

    // 检查 Vite glob 中是否有此插件——启动时文件在 plugins/ 下则 glob 中有
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
