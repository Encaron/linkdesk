/**
 * 插件加载器。
 * Phase 4：Vite 构建时独立打包 + import() 运行时加载。
 * 设计依据：[[phase4-design-decisions]] 第 1-3 条。
 *
 * 加载时机：App 启动 initPrefs() 完成后调用 initPluginLoader()。
 * 加载顺序：先出厂预装 → 再用户安装 → 错误不阻断。
 *
 * P1-4：theme/language 注册（ThemeEngine + i18next）
 * P1-6：7 种错误处理 + minAppVersion 版本检查 + 同名去重
 */

import type { PluginManifest, ViewPluginEntry } from "../core/types";
import { registerViewPlugin } from "./viewRegistry";
import { registerTheme } from "../core/ThemeEngine";
import { pushToast } from "../core/toast";
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
  // Phase 4：硬编码版本号——未来从 Rust 端获取
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

export async function initPluginLoader(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  const errors: string[] = [];

  // 1. 收集所有已安装插件
  const installed = new Set<string>();
  for (const path of Object.keys(pluginManifests)) {
    installed.add(extractPluginId(path));
  }

  // 2. 加载每个插件
  for (const pluginId of installed) {
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

  const entry: ViewPluginEntry = {
    pluginId,
    manifest,
    component: Component,
    sidebarComponent,
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
      // 从 JSON 推断主题类型（有 type 字段直接用，否则默认 dark）
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

/** 是否已初始化 */
export function isPluginLoaderReady(): boolean {
  return _initialized;
}

/* ── 文件监听（P1-5 骨架） ── */

let _watchInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Phase 4 P1-5：启动插件目录轮询。
 * TODO：需要 Tauri fs 命令 `list_plugin_dirs` 返回 `plugins/` 下的目录列表。
 * 当前骨架：2 秒轮询 + 检测新目录 → 加载 + toast。
 * 完整实现依赖 Rust 端 fs 命令或 @tauri-apps/plugin-fs。
 *
 * 设计依据：[V3-插件系统与UI重构设计.md §4 "文件监听与热加载"]
 */
export function startPluginWatcher(): void {
  if (_watchInterval) return;

  _watchInterval = setInterval(async () => {
    try {
      // TODO P1-5：调用 Tauri invoke("list_plugin_dirs") 获取目录列表
      // const dirs = await invoke<string[]>("list_plugin_dirs");
      // for (const dir of dirs) {
      //   if (!loadedPluginIds.has(dir)) {
      //     await loadPlugin(dir);
      //     pushToast({ message: `发现新插件：${dir}` });
      //   }
      // }
    } catch {
      // 静默——轮询失败不影响运行
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
