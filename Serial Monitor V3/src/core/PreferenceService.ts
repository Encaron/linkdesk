/**
 * 唯一配置入口。
 * GUI 操作、文件监听、未来 WebSocket——三条路全走它。
 * 遵守 V3 设计方案 §1.5 的硬约束：没有"人用的 API"和"AI 用的 API"两套东西。
 *
 * Phase 3 Step 0：localStorage → Tauri 文件系统。
 * prefs.json 存储在应用数据目录，跨版本保留。
 *
 * 读取模式：启动时异步加载到内存缓存，后续 `loadPrefs()` 同步返回缓存。
 * 写入模式：立即更新缓存 + 异步写文件。
 */

// Tauri API——仅在 Tauri 环境（tauri dev / 打包后）可用。
// Vite dev（npm run dev）下这些模块的函数会抛出异常，由 isTauri() 判断兜底到 localStorage。
let fsApi: typeof import("@tauri-apps/plugin-fs") | null = null;
let pathApi: typeof import("@tauri-apps/api/path") | null = null;

import type { LayoutData } from "../hooks/useTabManager";

async function isTauri(): Promise<boolean> {
  if (fsApi && pathApi) return true;
  try {
    fsApi = await import("@tauri-apps/plugin-fs");
    pathApi = await import("@tauri-apps/api/path");
    return true;
  } catch {
    return false;
  }
}

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

const PREFS_KEY = "v3_prefs";

/* ── 内存缓存 + 路径 ── */

let _cache: Prefs | null = null;
let _prefsPath: string | null = null;
let _workspacesDir: string | null = null;

async function prefsPath(): Promise<string> {
  if (!_prefsPath && pathApi) {
    _prefsPath = await pathApi.join(await pathApi.appDataDir(), "prefs.json");
  }
  return _prefsPath || "prefs.json";
}

async function workspacesDir(): Promise<string> {
  if (!_workspacesDir && pathApi) {
    _workspacesDir = await pathApi.join(await pathApi.appDataDir(), "workspaces");
  }
  return _workspacesDir || "workspaces";
}

/* ── localStorage 读写（Vite dev 模式 fallback） ── */

function loadFromLocalStorage(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_PREFS };
}

function saveToLocalStorage(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs, null, 2));
    console.log("[PreferenceService] ✅ 已保存到 localStorage");
  } catch (e) { console.warn("[PreferenceService] localStorage 写入失败:", e); }
}

let _useLocalStorage = true; // 默认 localStorage——Tauri 模式由 init 覆盖

/* ── 初始化（App 启动时调一次） ── */

let _initPromise: Promise<Prefs> | null = null;

async function _init(): Promise<Prefs> {
  // 检测 Tauri 环境
  if (!(await isTauri())) {
    // 浏览器模式——localStorage（默认值已经是 true）
    _cache = loadFromLocalStorage();
    return _cache;
  }
  // Tauri 模式——文件系统
  _useLocalStorage = false;

  // 1. 尝试读文件
  try {
    const path = await prefsPath();
    if (await fsApi!.exists(path)) {
      const raw = await fsApi!.readTextFile(path);
      _cache = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
      return _cache!;
    }
  } catch { /* 文件不存在或损坏，继续 */ }

  // 2. 尝试从 localStorage 迁移旧数据
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      _cache = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
      localStorage.removeItem(PREFS_KEY);
      // 异步写入文件（不阻塞）
      const path = await prefsPath();
      const dir = await pathApi!.appDataDir();
      if (!(await fsApi!.exists(dir))) await fsApi!.mkdir(dir, { recursive: true });
      await fsApi!.writeTextFile(path, JSON.stringify(_cache, null, 2));
      return _cache!;
    }
  } catch { /* 迁移失败，继续 */ }

  // 3. 全部失败 → 默认值
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

  /** 保存全局配置：立即更新缓存 + 写持久化层 */
  static async savePrefs(prefs: Prefs): Promise<void> {
    _cache = prefs;
    if (_useLocalStorage) {
      saveToLocalStorage(prefs);
      return;
    }
    try {
      const path = await prefsPath();
      const dir = await pathApi!.appDataDir();
      if (!(await fsApi!.exists(dir))) await fsApi!.mkdir(dir, { recursive: true });
      await fsApi!.writeTextFile(path, JSON.stringify(prefs, null, 2));
    } catch (e) { console.warn("[PreferenceService] 写入 prefs.json 失败:", e); }
  }

  /** 加载工作区 */
  static async loadWorkspace(name: string): Promise<Workspace | null> {
    if (_useLocalStorage) return null;
    try {
      const dir = await workspacesDir();
      const path = await pathApi!.join(dir, `${name}.json`);
      if (!(await fsApi!.exists(path))) return null;
      const raw = await fsApi!.readTextFile(path);
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** 保存工作区 */
  static async saveWorkspace(name: string, ws: Workspace): Promise<void> {
    if (_useLocalStorage) return;
    try {
      const dir = await workspacesDir();
      if (!(await fsApi!.exists(dir))) await fsApi!.mkdir(dir, { recursive: true });
      const path = await pathApi!.join(dir, `${name}.json`);
      await fsApi!.writeTextFile(path, JSON.stringify(ws, null, 2));
    } catch { /* 静默 */ }
  }

  /** 列出所有工作区 */
  static async listWorkspaces(): Promise<string[]> {
    try {
      // TODO Phase 5：使用 readDir 枚举 workspaces/ 目录
      return [];
    } catch {
      return [];
    }
  }
}

export default PreferenceService;
