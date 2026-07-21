/**
 * 插件加载器。
 * Phase 4：Vite 构建时独立打包 + import() 运行时加载。
 * 设计依据：[[phase4-design-decisions]] 第 1-3 条。
 *
 * 加载时机：App 启动 initPrefs() 完成后调用 initPluginLoader()。
 * 加载顺序：先出厂预装 → 再用户安装 → 错误不阻断。
 *
 * P1-4：theme/language 注册（ThemeEngine + i18next）
 * P1-5：文件监听（轮询 list_plugin_dirs）
 * P1-6：7 种错误处理 + minAppVersion 版本检查 + 同名去重
 * Phase 4.3：安装/卸载/禁用/启用完整生命周期
 */

import { invoke } from "@tauri-apps/api/core";
import type { PluginManifest, ViewPluginEntry } from "../core/types";
import { registerViewPlugin, unregisterViewPlugin } from "./viewRegistry";
import { registerTheme } from "../core/ThemeEngine";
import { pushToast } from "../core/toast";
// Phase 5f：PreferenceService 双写已清除——PluginStateService/ConfigurationService 是唯一真源
// Phase 5：插件状态管理迁移到 PluginStateService
import { getPluginStateValue, setPluginStateValue } from "../core/PluginStateService";
// Phase 5：contributes 解析——静态导入，确保同步注册（异步 import 会晚于组件 mount → placeholder 覆盖真实 handler）
import { registerConfiguration, registerConfigurationDefaults, unregisterConfiguration, unregisterConfigurationDefaults } from "../core/ConfigurationRegistry";
import type { ManifestMenuItem } from "../core/MenuRegistry";
import { registerMenuItems } from "../core/MenuRegistry";
import { registerCommand } from "../core/CommandRegistry";
import { registerKeybinding } from "../core/KeybindingRegistry";
import i18n from "../i18n";

/* ── 插件入口文件映射（Vite import.meta.glob） ── */

// Vite 在构建时展开此 glob，生成所有插件的入口映射。
// 注意：只扫描 plugins/*/，不扫描 plugins/.disabled/（.disabled 多了层目录会破坏相对 import 路径）
const pluginModules = import.meta.glob<{ default: React.ComponentType<{ isActive: boolean }> }>(
  "../../plugins/*/index.tsx",
  { eager: false }
);

const pluginSidebarModules = import.meta.glob<{ default: React.ComponentType }>(
  "../../plugins/*/sidebar.tsx",
  { eager: false }
);

const pluginStatusBarModules = import.meta.glob<{ default: React.ComponentType }>(
  "../../plugins/*/statusBar.tsx",
  { eager: false }
);

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

function extractPluginId(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 2];
}

/** 获取插件目录下的数据文件内容 */
function getPluginDataFile(pluginId: string, filename: string): Record<string, unknown> | undefined {
  const target = `../../plugins/${pluginId}/${filename}`;
  return pluginDataFiles[target];
}

/* ── 当前应用版本（从 package.json 读取） ── */

function getAppVersion(): string {
  return "3.0.0";
}

/** 简单 semver 比较：a >= b ? */
function versionGte(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return true;
}

/* ── 初始化 ── */

let _initialized = false;
/** 已成功加载的插件 ID 集合（用于文件监听检测新插件） */
const loadedPluginIds = new Set<string>();

export async function initPluginLoader(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

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
    const dirs = await invoke<string[]>("list_plugin_dirs");
    fsInstalled = new Set(dirs);
  } catch {
    // 非 Tauri 环境（npm run dev 浏览器模式）——无 invoke，回退到 glob 全量加载
  }

  // 3. 加载每个插件（跳过禁用 + 跳过文件系统不存在的）
  for (const pluginId of installed) {
    if (disabled.includes(pluginId)) {
      console.log(`[pluginLoader] 插件 "${pluginId}" 已禁用——跳过`);
      continue;
    }
    if (fsInstalled.size > 0 && !fsInstalled.has(pluginId)) {
      console.log(`[pluginLoader] 插件 "${pluginId}" 已卸载（文件系统不存在）——跳过`);
      continue;
    }
    try {
      await loadPlugin(pluginId);
    } catch (e: any) {
      errors.push(`${pluginId}: ${e?.message || e}`);
    }
  }

  // 4. Phase 5h：加载运行时插件（文件系统存在但不在 glob 中的）
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
      ttl: 8000,
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
      registerKeybinding({ command: kb.command, key: kb.key, when: kb.when, source: "plugin" });
    }
  }

  // contributes.configurationDefaults → ConfigurationRegistry（盲区 2：弱默认值）
  if (c.configurationDefaults) {
    registerConfigurationDefaults(pluginId, c.configurationDefaults as Record<string, unknown>);
  }
}

async function loadPlugin(pluginId: string): Promise<void> {
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

  // type 字段不再必需——贡献点由 manifest 的实际声明检测（对标 VS Code contributes）

  // P1-6 #6: minAppVersion 版本检查
  if (manifest.minAppVersion) {
    const appVer = getAppVersion();
    if (!versionGte(appVer, manifest.minAppVersion)) {
      pushToast({
        message: `插件 "${manifest.name}" 需要应用版本 ≥${manifest.minAppVersion}（当前 ${appVer}），已跳过`,
        ttl: 8000,
      });
      console.warn(
        `[pluginLoader] 版本不兼容 — "${pluginId}" 需要 ≥${manifest.minAppVersion}，当前 ${appVer}`
      );
      return;
    }
  }

  // VS Code 对标：不 switch type——检测 manifest 实际声明了什么，每种贡献独立处理。
  // 一个插件可以同时贡献视图 + 侧栏 + 状态栏 + 协议……新增贡献类型只需加一个 if。
  let contributed = false;

  if (manifest.entry) {
    await loadViewPlugin(pluginId, manifest);
    contributed = true;
  }

  if (manifest.themes && manifest.themes.length > 0) {
    loadThemePlugin(pluginId, manifest);
    contributed = true;
  } else if (manifest.file) {
    // 尝试作为主题加载（JSON 含 type: "dark"|"light" → 主题）
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
    // 尝试作为语言加载
    const data = getPluginDataFile(pluginId, manifest.file);
    if (data && !data.type) {
      loadLanguagePlugin(pluginId, manifest);
      contributed = true;
    }
  }

  if (manifest.mode) {
    // protocol 类型：text（前端 TS 解析）或 binary（Rust 端解析）
    console.log(`[pluginLoader] 📡 协议插件 "${manifest.name}" (${pluginId}) 已识别——run-time 协议注册 Phase 5`);
    contributed = true;
  }

  if (manifest.resources && manifest.resources.length > 0) {
    console.log(`[pluginLoader] 📦 资源插件 "${manifest.name}" (${pluginId}) 已识别——资源注册 Phase 5`);
    contributed = true;
  }

  // Phase 5：parseContributions——按 key 逐项检测，不认识的 key 静默跳过
  // Phase 6 加 contributes.themes / contributes.languages 时 loader 不崩
  if (manifest.contributes) {
    parseContributions(pluginId, manifest.contributes);
    contributed = true;
  }

  if (!contributed) {
    console.log(`[pluginLoader] 插件 "${manifest.name}" (${pluginId}) 未声明任何可识别的贡献——跳过`);
  }

  loadedPluginIds.add(pluginId);
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
    const raw = await invoke<string>("read_plugin_manifest", { pluginId });
    manifest = JSON.parse(raw);
  } catch (e: any) {
    console.warn(`[pluginLoader] 运行时插件 "${pluginId}" 读取 plugin.json 失败: ${e?.message || e}`);
    return;
  }

  // 2. 版本检查
  if (manifest.minAppVersion) {
    const appVer = getAppVersion();
    if (!versionGte(appVer, manifest.minAppVersion)) {
      pushToast({
        message: `插件 "${manifest.name}" 需要应用版本 >=${manifest.minAppVersion}（当前 ${appVer}），已跳过`,
        ttl: 8000,
      });
      return;
    }
  }

  // 3. 加载 JS bundle（ES module，core 模块 API 走 window.__v3_core__）
  let Component: React.ComponentType<{ isActive: boolean }> | undefined;
  if (manifest.entry) {
    try {
      // plugin:// 协议 → plugins/<id>/dist/index.js
      const module = await import(/* @vite-ignore */ `plugin://${pluginId}/dist/index.js`);
      Component = module.default;
      if (!Component) {
        console.warn(`[pluginLoader] 运行时插件 "${pluginId}" 的 JS bundle 未导出 default 组件`);
      }
    } catch (e: any) {
      console.warn(`[pluginLoader] 运行时插件 "${pluginId}" 加载 JS 失败: ${e?.message || e}`);
      pushToast({
        message: `插件 "${manifest.name}" 加载失败——可能未构建。运行 npm run build:plugins`,
        source: pluginId,
        severity: "warning",
        ttl: 8000,
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
      // 运行时插件暂不支持 sidebar/statusBar（Phase 6 扩展 SDK 后支持）
    };
    registerViewPlugin(entry);
    console.log(`[pluginLoader] [OK] 运行时视图插件 "${manifest.name}" (${pluginId}) 已注册`);
  }

  // 5. 解析 contributions
  if (manifest.contributes) {
    parseContributions(pluginId, manifest.contributes as Record<string, unknown>);
  }

  // 6. 主题/语言（和 loadPlugin 相同的逻辑）
  if (manifest.themes && manifest.themes.length > 0) {
    loadThemePlugin(pluginId, manifest);
  } else if (manifest.languages && manifest.languages.length > 0) {
    loadLanguagePlugin(pluginId, manifest);
  }

  // B77：运行时插件也追加到图标栏末尾
  if (Component) {
    await appendToIconOrder(pluginId);
  }

  loadedPluginIds.add(pluginId);
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
  console.log(`[pluginLoader] ✅ 视图插件 "${manifest.name}" (${pluginId}) 已注册`);
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
      registerTheme({ name: t.name, type: themeType, colors });
      registered++;
    }
    if (registered > 0) {
      console.log(`[pluginLoader] ✅ 主题插件 "${manifest.name}" — ${registered} 个主题已注册`);
      pushToast({
        message: `新增 ${registered} 个主题：${manifest.name}`,
        ttl: 5000,
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
    registerTheme({ name: manifest.name, type: themeType, colors });
    console.log(`[pluginLoader] ✅ 主题插件 "${manifest.name}" 已注册`);
    pushToast({
      message: `新增主题：${manifest.name}`,
      ttl: 5000,
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
      console.log(`[pluginLoader] ✅ 语言插件 "${manifest.name}" — ${registered} 个语言已注册`);
      pushToast({
        message: `新增 ${registered} 个语言：${manifest.name}`,
        ttl: 5000,
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
    console.log(`[pluginLoader] ✅ 语言插件 "${manifest.name}" (${code}) 已注册`);
    pushToast({
      message: `新增语言：${manifest.name}`,
      ttl: 5000,
    });
    return;
  }

  console.warn(`[pluginLoader] 语言插件 "${pluginId}" 未声明 file 或 languages 字段`);
}

/* ── 禁用列表持久化 ── */

function getDisabledList(): string[] {
  try {
    // Phase 5f：PluginStateService 唯一真源（PreferenceService 兜底读已清除）
    return getPluginStateValue<string[]>("app", "disabledPlugins") ?? [];
  } catch {
    return [];
  }
}

async function saveDisabledList(list: string[]): Promise<void> {
  try {
    // Phase 5：写入 PluginStateService（新路径）
    await setPluginStateValue("app", "disabledPlugins", list);
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
    unregisterViewPlugin(pluginId);
    unregisterConfiguration(pluginId);       // B70——卸载/禁用后 Settings Editor 残留
    unregisterConfigurationDefaults(pluginId);
    loadedPluginIds.delete(pluginId);
    // Phase 4.4：通知壳关闭使用此插件的标签页
    window.dispatchEvent(new CustomEvent("plugin-removed", { detail: { pluginId } }));
    pushToast({
      message: `已禁用：${entry.manifest.name}`,
      source: pluginId,
      severity: "info",
      actions: [{ label: "撤销", isPrimary: true, onClick: () => enablePlugin(pluginId) }],
      ttl: 8000,
    });
    console.log(`[pluginLoader] 🔒 已禁用 "${pluginId}"`);
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
        await loadPlugin(pluginId);
        pushToast({
          message: `已启用：${manifest.name}（即时生效）`,
          source: pluginId,
          severity: "info",
          ttl: 5000,
        });
        console.log(`[pluginLoader] 🔓 已启用 "${pluginId}"`);
        return { success: true };
      }
      // Phase 5h：视图插件——工厂插件（在 glob 中）走 loadPlugin 重载，外部插件走 loadPluginRuntime
      // loadPlugin 使用 Vite 构建的 chunk（模块实例和核心共享），已验证可工作
      // loadPluginRuntime 用于不在 glob 中的外部插件（通过 plugin:// 协议加载独立构建产物）
      await loadPlugin(pluginId);
      await appendToIconOrder(pluginId); // B77——F5 后图标位置不丢
      pushToast({
        message: `已启用：${manifest.name}（即时生效）`,
        source: pluginId,
        severity: "info",
        ttl: 5000,
      });
      console.log(`[pluginLoader] [OK] 已启用 "${pluginId}"（即时生效）`);
      return { success: true };
    }

    return { success: true, needRestart: true };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

/**
 * 卸载插件：Rust 端移到 .disabled/ → 从 viewRegistry 移除 → 持久化。
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

    // Rust 端：移到 plugins/.disabled/<id>/
    await invoke("uninstall_plugin", { pluginId });

    // 前端：移除注册
    unregisterViewPlugin(pluginId);
    unregisterConfiguration(pluginId);       // B70——卸载后 Settings Editor 残留（运行时）
    unregisterConfigurationDefaults(pluginId);
    loadedPluginIds.delete(pluginId);

    // Phase 5：清理 iconOrder，确保重装后排到图标栏末尾
    try {
      const iconOrder = getPluginStateValue<string[]>("app", "iconOrder") ?? [];
      const filtered = iconOrder.filter((id) => id !== pluginId);
      await setPluginStateValue("app", "iconOrder", filtered);
      // Phase 5f：PreferenceService 双写已清除——PluginStateService 是 iconOrder 唯一真源
    } catch { /* 静默 */ }

    // Phase 4.4：通知壳关闭使用此插件的标签页
    window.dispatchEvent(new CustomEvent("plugin-removed", { detail: { pluginId } }));
    pushToast({
      message: `已卸载：${entry.manifest.name}`,
      source: pluginId,
      severity: "info",
      ttl: 8000,
      actions: [
        { label: "撤销", isPrimary: true, onClick: () => reinstallPlugin(pluginId) },
      ],
    });
    console.log(`[pluginLoader] 🗑 已卸载 "${pluginId}"`);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

/**
 * 安装插件：Rust 端复制到 plugins/ → 热加载。
 * 仅对 theme/language 插件即时生效；view 插件提示重启。
 */
export async function installPlugin(sourcePath: string): Promise<{ success: boolean; pluginId?: string; error?: string; needRestart?: boolean }> {
  try {
    const pluginId = await invoke<string>("install_plugin", { source: sourcePath });

    // 尝试热加载——主题/语言即时生效，视图插件需要重启
    const manifestKey = Object.keys(pluginManifests).find(
      (k) => extractPluginId(k) === pluginId
    );

    if (manifestKey) {
      const manifest = pluginManifests[manifestKey];
      // 清单在 glob 中 → 直接 loadPlugin 即时生效
      await loadPlugin(pluginId);
      await appendToIconOrder(pluginId); // B77——F5 后图标位置不丢
      const instant = !!(manifest.themes || manifest.languages || (!manifest.entry && manifest.file));
      pushToast({
        message: `已安装：${manifest.name}${instant ? "（即时生效）" : ""}`,
        source: pluginId,
        severity: "info",
        ttl: 6000,
      });
      return { success: true, pluginId };
    }
    // Phase 5h：清单不在 glob 中（运行时安装的插件）——尝试即时加载
    try {
      await loadPluginRuntime(pluginId);
      pushToast({
        message: `已安装：${pluginId}（即时生效）`,
        source: pluginId,
        severity: "info",
        ttl: 6000,
      });
      return { success: true, pluginId };
    } catch (e: any) {
      // 运行时加载失败（可能未构建）——提示构建后可用
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

/** 是否已初始化 */
export function isPluginLoaderReady(): boolean {
  return _initialized;
}

/** 获取禁用插件的基本信息（在 plugins/ 但被 prefs 标记禁用）*/
export function getDisabledPluginInfo(): Array<{ pluginId: string; name: string; description?: string; version?: string }> {
  const disabled = getDisabledList();
  const result: Array<{ pluginId: string; name: string; description?: string; version?: string }> = [];
  for (const pluginId of disabled) {
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

/** 获取已卸载插件列表（在 .disabled/ 目录，对标 VS Code 本地可重装扩展）*/
export async function getUninstalledPluginInfo(): Promise<Array<{ pluginId: string; name: string; description?: string; version?: string }>> {
  try {
    const dirs = await invoke<string[]>("list_disabled_plugin_dirs");
    const result: Array<{ pluginId: string; name: string; description?: string; version?: string }> = [];
    for (const pluginId of dirs) {
      if (getDisabledList().includes(pluginId)) continue; // 已禁用但未卸载的排除
      // 尝试从 glob 读 manifest（可能不在 glob 里，因为 .disabled/ 不在 glob 路径）
      const manifestKey = Object.keys(pluginManifests).find(
        (k) => extractPluginId(k) === pluginId
      );
      if (manifestKey) {
        const m = pluginManifests[manifestKey];
        result.push({ pluginId, name: m.name || pluginId, description: m.description, version: m.version });
      } else {
        result.push({ pluginId, name: pluginId });
      }
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * 重新安装已卸载的插件：从 .disabled/ 移回 plugins/。
 * 对标 VS Code：扩展卸载后文件仍在本地，可一键重新安装。
 *
 * 如果插件在构建时已在 glob 中（出厂预装后被卸载的），移回后直接 loadPlugin 即时生效。
 * 如果不在 glob 中（外部新装后又卸载的），需重启让 Vite 重新扫描。
 */
export async function reinstallPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await invoke("reinstall_plugin", { pluginId });

    // 检查构建时 glob 是否有此插件（出厂预装插件在构建时被扫描过）
    const manifestKey = Object.keys(pluginManifests).find(
      (k) => extractPluginId(k) === pluginId
    );
    if (manifestKey) {
      const manifest = pluginManifests[manifestKey];
      // .json 插件（theme/language/file）——即时生效
      if ((manifest.themes || manifest.languages || (!manifest.entry && manifest.file))) {
        await loadPlugin(pluginId);
        pushToast({
          message: `已安装：${manifest.name}（即时生效）`,
          source: pluginId,
          severity: "info",
          ttl: 6000,
        });
        return { success: true };
      }
      // Phase 5h：工厂插件（在 glob 中）——走 loadPlugin 重新加载（Vite chunk，模块实例共享）
      await loadPlugin(pluginId);
      await appendToIconOrder(pluginId); // B77——F5 后图标位置不丢
      pushToast({
        message: `已安装：${manifest.name}（即时生效）`,
        source: pluginId,
        severity: "info",
        ttl: 6000,
      });
      return { success: true };
    }
    // glob 中没有——外部装过又卸了的插件，需重启
    pushToast({
      message: `已安装：${pluginId}。重启后生效。`,
      source: pluginId,
      severity: "info",
      ttl: 0,
      actions: [
        { label: "立即重启", isPrimary: true, onClick: () => window.location.reload() },
      ],
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

/* ── 图标排序辅助 ── */

/**
 * Phase 5h/B77：将插件追加到图标栏末尾。
 * 重装/启用/安装后调用——确保 F5 后图标位置不变（不会回退到注册顺序）。
 */
async function appendToIconOrder(pluginId: string): Promise<void> {
  try {
    const order = getPluginStateValue<string[]>("app", "iconOrder") ?? [];
    const filtered = order.filter((id) => id !== pluginId); // 去重
    filtered.push(pluginId);
    await setPluginStateValue("app", "iconOrder", filtered);
  } catch { /* 非关键路径——静默 */ }
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
 * - 工厂插件（在 import.meta.glob 中）→ loadPlugin（Vite chunk）
 * - 运行时插件（不在 glob 中）→ loadPluginRuntime（plugin:// 协议）
 */
export function startPluginWatcher(): void {
  if (_watchInterval) return;

  _watchInterval = setInterval(async () => {
    try {
      const dirs = await invoke<string[]>("list_plugin_dirs");
      for (const dir of dirs) {
        if (loadedPluginIds.has(dir)) continue;
        if (getDisabledList().includes(dir)) continue;

        const manifestKey = Object.keys(pluginManifests).find(
          (k) => extractPluginId(k) === dir
        );
        if (manifestKey) {
          // 工厂插件——已在 Vite 构建中，直接 loadPlugin
          await loadPlugin(dir);
          const manifest = pluginManifests[manifestKey];
          pushToast({ message: `发现新插件：${manifest.name}（即时生效）`, ttl: 5000 });
        } else {
          // Phase 5h：运行时插件——不在 glob 中，尝试 plugin:// 加载
          await loadPluginRuntime(dir);
          // loadPluginRuntime 内部已 toast（成功或失败）
        }
      }
    } catch {
      // 静默——polling 失败不影响运行
    }
  }, 2000);

  console.log("[pluginLoader] 文件监听已启动（2s 轮询，Phase 5h）");
}

/** 停止文件监听 */
export function stopPluginWatcher(): void {
  if (_watchInterval) {
    clearInterval(_watchInterval);
    _watchInterval = null;
  }
}
