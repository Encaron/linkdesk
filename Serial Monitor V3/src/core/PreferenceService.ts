/**
 * 唯一配置入口。
 * GUI 操作、文件监听、未来 WebSocket——三条路全走它。
 * 遵守 V3 设计方案 §1.5 的硬约束：没有"人用的 API"和"AI 用的 API"两套东西。
 *
 * Phase 3 Step 0：localStorage → Tauri 文件系统。
 * Phase 5f：持久化归一化到 StorageService（替代自研 fsApi + pathApi + localStorage 读写）。
 * prefs.json 存储在应用数据目录，跨版本保留。
 *
 * 读取模式：启动时异步加载到内存缓存，后续 `loadPrefs()` 同步返回缓存。
 * 写入模式：立即更新缓存 + 异步写文件。
 *
 * ⚠️ 剩余未迁移字段（Phase 6-7 搬空后此文件可删）：
 *   - window（窗口位置）→ 计划迁到 Tauri 窗口状态 API 或 `app.window` config
 *   - pluginsInstallPath → 计划迁到 PluginStateService
 *   其他 9 个字段已全部迁走（theme/language→ConfigurationService，lastPort→PluginStateService，
 *     preferences/quickSends→ConfigurationService，recentViews/iconOrder/disabledPlugins→PluginStateService，
 *     layout→LayoutService）。
 */

import type { LayoutData } from "../hooks/useTabManager";
import { read, write } from "./StorageService";

/* ── 类型 ── */

export interface Prefs {
  window: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  theme: "Dark" | "Light" | string;
  language: "zh" | "en";
  lastPort: string;
  preferences: {
    timestampFormat: string;
    showEcho: boolean;
    showLineNumbers: boolean;
    separateSystemLog: boolean;
    lineEnding: string;
    autoRepeat: boolean;
    repeatInterval: number;
    autoClear: boolean;
    receiveMode: "text" | "hex";
    receiveCoding: string;
    sendMode: "text" | "hex";
    sendCoding: string;
  };
  quickSends: Record<string, string>;
  /** Phase 4：最近打开的视图。欢迎页渲染。 */
  recentViews?: { pluginId: string; label: string; workspaceName?: string }[];
  /** Phase 4：图标栏拖拽排序——pluginId 数组，按顺序渲染 */
  iconOrder?: string[];
  /** Phase 4：禁用的插件 ID 列表——loader 跳过这些插件 */
  disabledPlugins?: string[];
  /** Phase 4：用户安装插件的目录路径（默认 = appDataDir/plugins/） */
  pluginsInstallPath?: string;
  /** Phase 3：标签页布局持久化。Phase 5 增加 cardLayout。 */
  layout?: LayoutData;
}

export interface Workspace {
  name: string;
  cards: unknown[];
}

/* ── 默认值 ── */

const DEFAULT_PREFS: Prefs = {
  window: { left: 100, top: 50, width: 960, height: 640 },
  theme: "Dark",
  language: "zh",
  lastPort: "COM3",
  preferences: {
    timestampFormat: "HH:mm:ss:fff",
    showEcho: true,
    showLineNumbers: true,
    separateSystemLog: true,
    lineEnding: "\r\n",
    autoRepeat: false,
    repeatInterval: 1000,
    autoClear: false,
    receiveMode: "text",
    receiveCoding: "UTF-8",
    sendMode: "text",
    sendCoding: "UTF-8",
  },
  quickSends: { AT: "AT\r\n" },
};

/* ── 内存缓存 ── */

let _cache: Prefs | null = null;

/* ── 初始化（App 启动时调一次） ── */

let _initPromise: Promise<Prefs> | null = null;

async function _init(): Promise<Prefs> {
  // Phase 5f：归一化到 StorageService——替代自研 isTauri + fsApi + pathApi + localStorage
  const saved = await read<Prefs>("prefs");
  if (saved) {
    _cache = { ...DEFAULT_PREFS, ...saved };
    return _cache;
  }

  // 无持久化数据 → 默认值
  _cache = { ...DEFAULT_PREFS };
  return _cache;
}

/** 初始化 PreferenceService——App 启动时调用一次。返回 Promise，完成后所有 loadPrefs() 调用同步返回。 */
export function initPrefs(): Promise<Prefs> {
  if (!_initPromise) _initPromise = _init();
  return _initPromise;
}

/* ── 读写 ── */

class PreferenceService {
  /** 同步读取全局配置——必须等 initPrefs() 完成后才能调用 */
  static loadPrefs(): Prefs {
    if (!_cache) throw new Error("PreferenceService 未初始化——请先 await initPrefs()");
    return _cache;
  }

  /** 保存全局配置：立即更新缓存 + 写持久化层（Phase 5f：归一化到 StorageService.write） */
  static async savePrefs(prefs: Prefs): Promise<void> {
    _cache = prefs;
    await write("prefs", prefs);
  }

  /** 加载工作区 */
  static async loadWorkspace(name: string): Promise<Workspace | null> {
    // Phase 7：WorkspaceService 会接管工作区读写，届时此方法删除
    if (!(window as any).__TAURI__) return null;
    try {
      const pathApi = await import("@tauri-apps/api/path");
      const fsApi = await import("@tauri-apps/plugin-fs");
      const dir = await pathApi.join(await pathApi.appDataDir(), "workspaces");
      const path = await pathApi.join(dir, `${name}.json`);
      if (!(await fsApi.exists(path))) return null;
      const raw = await fsApi.readTextFile(path);
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** 保存工作区 */
  static async saveWorkspace(name: string, ws: Workspace): Promise<void> {
    if (!(window as any).__TAURI__) return;
    try {
      const pathApi = await import("@tauri-apps/api/path");
      const fsApi = await import("@tauri-apps/plugin-fs");
      const dir = await pathApi.join(await pathApi.appDataDir(), "workspaces");
      if (!(await fsApi.exists(dir))) await fsApi.mkdir(dir, { recursive: true });
      const path = await pathApi.join(dir, `${name}.json`);
      await fsApi.writeTextFile(path, JSON.stringify(ws, null, 2));
    } catch { /* 静默 */ }
  }

  /** 列出所有工作区 */
  static async listWorkspaces(): Promise<string[]> {
    // TODO Phase 5：使用 readDir 枚举 workspaces/ 目录
    return [];
  }
}

export default PreferenceService;
