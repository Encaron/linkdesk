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
import PreferenceService from "../core/PreferenceService";
import i18n from "../i18n";

/* ── 插件入口文件映射（Vite import.meta.glob） ── */

// Vite 在构建时展开此 glob，生成所有插件的入口映射
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

  // 2. 加载每个插件（跳过禁用的）
  for (const pluginId of installed) {
    if (disabled.includes(pluginId)) {
      console.log(`[pluginLoader] 插件 "${pluginId}" 已禁用——跳过`);
      continue;
    }
    try {
      await loadPlugin(pluginId);
    } catch (e: any) {
      errors.push(`${pluginId}: ${e?.message || e}`);
    }
  }

  // 3. 错误汇总
  if (errors.length > 0) {
    console.warn("[pluginLoader] 以下插件加载失败:", errors);
    pushToast({
      message: `${errors.length} 个插件加载失败`,
      ttl: 8000,
    });
  }
}

async function loadPlugin(pluginId: string): Promise<void> {
  // 找到对应的 glob key
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
    // P1-6 #2: plugin.json 格式错误
    pushToast({ message: `插件 "${pluginId}" 的 plugin.json 格式错误，已跳过` });
    console.warn(`[pluginLoader] plugin.json 格式错误 — "${pluginId}"`);
    return;
  }

  // P1-6 #3: 校验 type
  if (!manifest.type) {
    console.warn(`[pluginLoader] 插件 "${pluginId}" 缺少 type 字段，已跳过`);
    return;
  }

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

  // 按类型分发注册
  switch (manifest.type) {
    case "view":
      await loadViewPlugin(pluginId, manifest);
      break;
    case "theme":
      loadThemePlugin(pluginId, manifest);
      break;
    case "language":
      loadLanguagePlugin(pluginId, manifest);
      break;
    default:
      // P1-6 #4: 未知类型
      console.log(`[pluginLoader] 未知插件类型 "${manifest.type}" — 跳过 "${pluginId}"`);
      pushToast({
        message: `插件 "${manifest.name}" 的类型 "${manifest.type}" 暂不支持`,
        ttl: 5000,
      });
  }

  loadedPluginIds.add(pluginId);
}

/* ── 视图插件 ── */

async function loadViewPlugin(pluginId: string, manifest: PluginManifest): Promise<void> {
  const entryKey = Object.keys(pluginModules).find(
    (k) => extractPluginId(k) === pluginId
  );
  if (!entryKey) {
    // P1-6 #5: 缺少 entry
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
    return PreferenceService.loadPrefs().disabledPlugins ?? [];
  } catch {
    return [];
  }
}

async function saveDisabledList(list: string[]): Promise<void> {
  try {
    const prefs = PreferenceService.loadPrefs();
    prefs.disabledPlugins = list;
    await PreferenceService.savePrefs(prefs);
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
    loadedPluginIds.delete(pluginId);
    // Phase 4.4：通知壳关闭使用此插件的标签页
    window.dispatchEvent(new CustomEvent("plugin-removed", { detail: { pluginId } }));
    pushToast({
      message: `已禁用：${entry.manifest.name}`,
      actions: [{ label: "撤销", onClick: () => enablePlugin(pluginId) }],
      ttl: 6000,
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
      if (manifest.type === "theme" || manifest.type === "language") {
        // .json 插件即时生效
        await loadPlugin(pluginId);
        pushToast({
          message: `已启用：${manifest.name}`,
          ttl: 4000,
        });
        console.log(`[pluginLoader] 🔓 已启用 "${pluginId}"`);
        return { success: true };
      }
      // .tsx 视图插件——需要重启
      const needRestart = manifest.type === "view";
      pushToast({
        message: `已启用：${manifest.name}。视图插件需重启生效。`,
        ttl: 8000,
      });
      console.log(`[pluginLoader] 🔓 已启用 "${pluginId}"（需重启）`);
      return { success: true, needRestart: needRestart || undefined };
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
    loadedPluginIds.delete(pluginId);

    // Phase 4.4：通知壳关闭使用此插件的标签页
    window.dispatchEvent(new CustomEvent("plugin-removed", { detail: { pluginId } }));
    pushToast({
      message: `已卸载：${entry.manifest.name}`,
      ttl: 5000,
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
      if (manifest.type === "theme" || manifest.type === "language") {
        await loadPlugin(pluginId);
        pushToast({
          message: `已安装：${manifest.name}（即时生效）`,
          ttl: 5000,
        });
        return { success: true, pluginId };
      }
    }

    // 视图插件或无法识别的类型——提示重启
    pushToast({
      message: `已安装：${pluginId}。重启后生效。`,
      ttl: 8000,
    });
    return { success: true, pluginId, needRestart: true };
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
 */
export async function reinstallPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await invoke("reinstall_plugin", { pluginId });

    // 尝试热加载
    const manifestKey = Object.keys(pluginManifests).find(
      (k) => extractPluginId(k) === pluginId
    );
    if (manifestKey) {
      const manifest = pluginManifests[manifestKey];
      if (manifest.type === "theme" || manifest.type === "language") {
        await loadPlugin(pluginId);
        pushToast({ message: `已安装：${manifest.name}（即时生效）`, ttl: 5000 });
        return { success: true };
      }
      pushToast({ message: `已安装：${manifest.name}。重启后生效。`, ttl: 8000 });
    } else {
      pushToast({ message: `已安装：${pluginId}。重启后生效。`, ttl: 8000 });
    }
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
 * Phase 4 P1-5：启动插件目录轮询。
 * 每 2 秒调用 Rust `list_plugin_dirs` 检测新目录。
 * - 发现新 .json 插件（theme/language）→ 即时加载 + toast
 * - 发现新 .tsx 插件（view）→ toast 提示重启
 *
 * 设计依据：[V3-插件系统与UI重构设计.md §4 "文件监听与热加载"]
 */
export function startPluginWatcher(): void {
  if (_watchInterval) return;

  _watchInterval = setInterval(async () => {
    try {
      const dirs = await invoke<string[]>("list_plugin_dirs");
      for (const dir of dirs) {
        if (loadedPluginIds.has(dir)) continue;
        if (getDisabledList().includes(dir)) continue;

        // 新目录——检查类型
        const manifestKey = Object.keys(pluginManifests).find(
          (k) => extractPluginId(k) === dir
        );
        if (manifestKey) {
          const manifest = pluginManifests[manifestKey];
          if (manifest.type === "theme" || manifest.type === "language") {
            await loadPlugin(dir);
            pushToast({ message: `发现新插件：${manifest.name}（即时生效）`, ttl: 5000 });
          } else {
            pushToast({
              message: `发现新插件：${manifest.name || dir}。重启后生效。`,
              ttl: 8000,
            });
            loadedPluginIds.add(dir); // 标记已知，不再重复提示
          }
        }
      }
    } catch {
      // 静默——polling 失败不影响运行（Tauri 环境未就绪等）
    }
  }, 2000);

  console.log("[pluginLoader] 文件监听已启动（2s 轮询）");
}

/** 停止文件监听 */
export function stopPluginWatcher(): void {
  if (_watchInterval) {
    clearInterval(_watchInterval);
    _watchInterval = null;
  }
}
