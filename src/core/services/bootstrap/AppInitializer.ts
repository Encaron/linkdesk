/**
 * AppInitializer——启动初始化管线
 *
 * 将 App.tsx 的 async init 链提取为可测试函数。
 * 依赖通过参数注入，测试可 mock 任意步骤失败。
 *
 * 留在 App.tsx 的部分（需要 React 上下文）：
 *   initIpcBridgeHandler / registerFallbackThemes
 *   / registerConfiguration / initCoreKeys / ensureCoreCommands
 *   / ensureCoreKeybindings（ensureBuiltinProtocols 已随 E5.7#49 移主进程
 *   plugin-manifest-loader——Registry 主进程化）
 *
 * E5#107：App 启动集成测试
 */

// E5.7#98：InitDeps manifest 字段归口 PluginManifest（原 any——契约收紧，测试替身补 name/version）
import type { PluginManifest } from "../../api/types";
// E5.8#50.21：app.theme 旧值归一化（启动应用前映射 "Dark"/"Light" → "dark"/"light"）
import { normalizeThemeValue } from "../ui/ThemeEngine";

// ── 依赖注入接口 ──

export interface InitDeps {
  /** 初始化布局服务 */
  initLayoutService: () => Promise<void>;
  /** 初始化插件状态服务 */
  initPluginStates: () => Promise<void>;
  /** E5.5#0e：初始化工作区服务——从 pluginState 恢复文件夹列表 */
  initWorkspaceService: () => Promise<void>;
  /** 初始化插件加载器 */
  initPluginLoader: () => Promise<void>;
  /** 启动插件文件监听 */
  startPluginWatcher: () => void;
  /** 获取已加载插件清单 */
  getLoadedPluginManifests: () => Array<{ pluginId: string; manifest: PluginManifest }>;
  /** 初始化系统插槽 */
  factorySlotsInitialize: (plugins: Array<{ pluginId: string; manifest: PluginManifest }>) => void;
  /** 挂载全局快捷键，返回 cleanup 函数 */
  mountGlobalKeybindings: () => (() => void);
  /** 加载用户快捷键 */
  initUserKeybindings: () => Promise<void>;
  /** 读配置值 */
  getConfigurationValue: <T>(key: string) => T | undefined;
  /** 应用配置（调 onApply） */
  applyConfiguration: (key: string, value: unknown) => void;
  /** 获取标签页布局 */
  getTabLayout: () => { groups?: Array<{ tabs: Array<{ id: string; type: string }> }> } | null;
  /** 恢复后同步标签页计数器 */
  syncCountersAfterRestore: (tabs: Array<{ id: string; type: string }>) => void;
}

// ── 返回结果 ──

export interface InitResult {
  /** 所有步骤均成功 */
  success: boolean;
  /** 布局是否恢复成功 */
  layoutRestored: boolean;
  /** 已加载插件数 */
  pluginsLoaded: number;
  /** 错误列表（供诊断） */
  errors: Array<{ step: string; message: string }>;
  /** keybinding cleanup 函数——调用方负责在 unmount 时调用 */
  keybindingCleanup: (() => void) | undefined;
}

// ── 启动管线 ──

/**
 * 执行异步初始化管线（6 步）。
 *
 * 任一步失败不阻塞后续步骤（降级运行），
 * 错误通过 errors[] 返回供调用方诊断。
 */
export async function initAll(deps: InitDeps): Promise<InitResult> {
  const errors: Array<{ step: string; message: string }> = [];
  let layoutRestored = false;
  let pluginsLoaded = 0;
  let keybindingCleanup: (() => void) | undefined;

  const logStep = (step: string, e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push({ step, message: msg });
    console.warn(`[AppInitializer] ${step} 失败:`, e);
  };

  // ── Step 1: 核心服务初始化 ──
  try {
    await Promise.all([
      deps.initLayoutService(),
      deps.initPluginStates(),
    ]);
  } catch (e) {
    logStep("initServices", e);
  }

  // E5.5#0e：工作区文件夹恢复——依赖 initPluginStates 已加载 _states
  try {
    await deps.initWorkspaceService();
  } catch (e) {
    logStep("workspaceService", e);
  }

  // ── Step 2: 插件加载 ──
  try {
    await deps.initPluginLoader();
    pluginsLoaded = deps.getLoadedPluginManifests().length;
  } catch (e) {
    logStep("pluginLoader", e);
  }

  // ── Step 3: 文件监听 + 系统插槽 ──
  try {
    deps.startPluginWatcher();
  } catch (e) {
    logStep("pluginWatcher", e);
  }

  try {
    const manifests = deps.getLoadedPluginManifests().map((p) => ({
      pluginId: p.pluginId,
      manifest: p.manifest,
    }));
    deps.factorySlotsInitialize(manifests);
  } catch (e) {
    logStep("factorySlots", e);
  }

  // ── Step 4: 快捷键 ──
  try {
    keybindingCleanup = deps.mountGlobalKeybindings();
  } catch (e) {
    logStep("globalKeybindings", e);
  }

  try {
    await deps.initUserKeybindings();
  } catch (e) {
    logStep("userKeybindings", e);
  }

  // ── Step 5: 配置应用 ──
  try {
    // E5.8#50.21：读时归一化——legacy "Dark"/"Light" → 壳内置配方 id "dark"/"light"（onApply 先命中配方路径）
    const rawTheme = deps.getConfigurationValue<string>("app.theme") ?? "dark";
    const initTheme = normalizeThemeValue(rawTheme) ?? "dark";
    const initLang = deps.getConfigurationValue<string>("app.language") ?? "zh";
    await deps.applyConfiguration("app.theme", initTheme);
    deps.applyConfiguration("app.language", initLang);
    deps.applyConfiguration("app.accentColor", deps.getConfigurationValue<string>("app.accentColor"));
  } catch (e) {
    logStep("applyConfig", e);
  }

  // ── Step 6: 布局恢复 ──
  try {
    const savedLayout = deps.getTabLayout();
    if (savedLayout?.groups?.length) {
      const allTabs = savedLayout.groups.flatMap((g) => g.tabs);
      deps.syncCountersAfterRestore(allTabs);
      layoutRestored = true;
    }
  } catch (e) {
    logStep("layoutRestore", e);
  }

  return {
    success: errors.length === 0,
    layoutRestored,
    pluginsLoaded,
    errors,
    keybindingCleanup,
  };
}
