/**
 * StorageService — 统一持久化原语。
 * Phase 5f：修掉"四个服务各自实现 I/O"的根因，避免持久化 bug（写了没读/读了没写/写A读B/异步竞态）。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §9.2 5f
 *
 * 底层：window.linkdesk.filesystem（Electron IPC）+ localStorage（浏览器模式 + beforeunload 同步兜底）。
 * 写入时始终同时写 localStorage（同步，F5 安全）和文件系统（异步，持久化）。
 */

/* ── 文件系统依赖（统一走 FileService——E2c #19c 归一化）── */

import { exists as fsExists, readFile, writeFile, joinPath, appDataDir } from "../files/FileService";

function _hasLinkdesk(): boolean {
  return !!window.linkdesk?.filesystem;
}

/* ── key → localStorage key 映射 ── */

const LS_KEY_MAP: Record<string, string> = {
  "settings": "settings",
  "layout": "layout",
  "plugin-states": "pluginStates",
  "prefs": "prefs",
};

function _lsKey(key: string): string {
  return LS_KEY_MAP[key] ?? key;
}

/* ── key → 文件路径 ── */

let _appDataDir: string | null = null;
const _filePaths = new Map<string, string>();

async function _filePath(key: string): Promise<string> {
  if (_filePaths.has(key)) return _filePaths.get(key)!;

  if (!_hasLinkdesk()) {
    // 非 Electron 环境（npm run dev 浏览器模式）——不需要文件路径
    return "";
  }

  if (!_appDataDir) {
    _appDataDir = await appDataDir();
  }

  const map: Record<string, string> = {
    "settings": "settings.json",
    "layout": "layout.json",
    "plugin-states": "plugin-states.json",
    "prefs": "prefs.json",
  };
  const filename = map[key] ?? `${key}.json`;
  const fullPath = await joinPath(_appDataDir, filename);
  _filePaths.set(key, fullPath);
  return fullPath;
}

/* ── 初始化 ── */

let _initialized = false;

/** 初始化——App 启动时调用一次 */
export async function initStorageService(): Promise<void> {
  if (_initialized) return;
  _initialized = true;
}

/* ── 读取 ── */

/**
 * 读取持久化数据。优先读 localStorage（beforeunload 同步写入，永远最新），
 * 文件兜底（100ms 防抖异步落盘，可能略旧于 localStorage）。
 */
export async function read<T>(key: string): Promise<T | null> {
  const lsKey = _lsKey(key);

  // 1. 尝试 localStorage
  try {
    const raw = localStorage.getItem(lsKey);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* ignore */ }

  // 2. 尝试文件系统
  if (_hasLinkdesk()) {
    try {
      const path = await _filePath(key);
      if (path && await fsExists(path)) {
        const raw = await readFile(path);
        // 读到后回写 localStorage——补齐 beforeunload 没写文件的缺口
        try { localStorage.setItem(lsKey, raw); } catch { /* ignore */ }
        return JSON.parse(raw) as T;
      }
    } catch { /* 文件不存在或损坏 */ }
  }

  return null;
}

/**
 * 只从 localStorage 读取（同步，不需要 await）。
 * 用于启动早期——读取 beforeunload 保存的最后一刻数据。
 */
export function readSync<T>(key: string): T | null {
  const lsKey = _lsKey(key);
  try {
    const raw = localStorage.getItem(lsKey);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* ignore */ }
  return null;
}

/* ── 写入 ── */

/**
 * 写入持久化数据——始终写 localStorage（同步）+ 文件系统（异步）。
 * 先写 localStorage 确保 beforeunload/F5 能拿到最新数据，
 * 再异步写文件系统保证持久化。
 */
export async function write<T>(key: string, data: T): Promise<void> {
  const json = JSON.stringify(data, null, 2);

  // 1. 始终写 localStorage（同步，F5 安全）
  try {
    localStorage.setItem(_lsKey(key), json);
  } catch { /* ignore */ }

  // 2. Electron 环境写文件——FileService.writeFile 自动创建父目录
  if (!_hasLinkdesk()) return;
  try {
    const path = await _filePath(key);
    if (!path) return;
    await writeFile(path, json);
  } catch (e) {
    console.warn(`[StorageService] 写入 ${key} 文件失败:`, e);
  }
}

/**
 * 同步写入 localStorage——beforeunload 专用。
 * beforeunload 期间不能做异步 I/O，只能用 localStorage 保底。
 * 下次启动时 init 会从 localStorage 读回（read() 的 step 1），
 * 同时异步写回文件补齐（read() 的 step 2 fallback → 回写 localStorage 时）。
 */
export function writeSync<T>(key: string, data: T): void {
  try {
    const json = JSON.stringify(data);
    localStorage.setItem(_lsKey(key), json);
  } catch { /* 静默——beforeunload 不容错 */ }
}

/* ── 工具 ── */

/** 检查持久化数据是否存在 */
export async function exists(key: string): Promise<boolean> {
  try {
    if (localStorage.getItem(_lsKey(key))) return true;
  } catch { /* ignore */ }

  if (_hasLinkdesk()) {
    try {
      const path = await _filePath(key);
      return path ? await fsExists(path) : false;
    } catch { /* ignore */ }
  }

  return false;
}

/** 获取文件路径（LayoutService 需要传给 Tauri 窗口状态保存） */
export async function getFilePath(key: string): Promise<string> {
  return _filePath(key);
}

/** 清空缓存（测试用） */
export function clearStorageCache(): void {
  _filePaths.clear();
  _appDataDir = null;
  _initialized = false;
}
