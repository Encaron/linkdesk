/**
 * FileService——所有文件 I/O 的唯一入口。
 * E2c #13：归一化 ConfigurationService / StorageService / LayoutService 共用的 fs 操作。
 *
 * 设计依据：docs/02-Electron架构/E2_底层加固与侧栏扩展_暂定/03-E2c-基础设施缺口.md §一
 *
 * 底层：window.linkdesk.filesystem（Electron IPC → Node.js fs）。
 * 所有文件读写必须经过此服务——禁止直接调 window.linkdesk.filesystem.*。
 *
 * 历史教训：
 *   B66——PluginStateService 和 ConfigurationService 往同一个 settings.json 写，互相覆盖
 *   B67——quickSends 绕过 ConfigurationService 走 PreferenceService，多套路径
 *   B68——beforeunload 和 LayoutService 各写各的 v3_layout，两套序列化不同步
 *   归一后：所有 fs 操作走 FileService——不存在"A 写 B 不知道"。
 */

import { normalizePath } from "./pathUtils";

/* ── 类型 ── */

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;
  modifiedAt?: number;
  /** E4V#10: 文件是否只读（不可写） */
  isReadonly?: boolean;
}

export interface FileChangeEvent {
  path: string;
  type: "created" | "changed" | "deleted";
}

/* ── 底层 API 引用 ── */

function api() {
  return (window as any).linkdesk?.filesystem as {
    readTextFile(path: string): Promise<string>;
    writeTextFile(path: string, data: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    mkdir(path: string): Promise<void>;
    readdir(path: string): Promise<string[]>;
    copy(src: string, dest: string): Promise<void>;
    remove(path: string): Promise<void>;
    listDir(path: string): Promise<FileEntry[]>;
    readBinaryFile(path: string): Promise<Uint8Array>;
    // E4V#40w——GBK 编码保存
    writeBinaryFile(path: string, data: Uint8Array): Promise<void>;
    // E4V#fix: watch 一步完成——dirPath + callback → 返回 unsubscribe。
    // 内部走 filesystem:changed:${watcherId}，每个 watcher 独立 IPC 通道。
    watch(dirPath: string, onEvent: (e: FileChangeEvent) => void): Promise<() => void>;
  } | undefined;
}

function pathApi() {
  return (window as any).linkdesk?.path as {
    join(...parts: string[]): Promise<string>;
    appDataDir(): Promise<string>;
  } | undefined;
}

/* ── 🔥 写操作路径抑制——定向静音，非全局 ── */

const _suppressPaths = new Map<string, number>();
const _SUPPRESS_MS = 300;

/** 写操作后抑制该文件父目录的 watcher 事件 */
function suppressPath(filePath: string): void {
  const dir = normalizePath(filePath).replace(/\/[^/]*$/, "");
  if (dir) _suppressPaths.set(dir, Date.now() + _SUPPRESS_MS);
}

/** eventPath 是否被抑制——检查自己及祖先路径 */
function isSuppressed(eventPath: string): boolean {
  const now = Date.now();
  let p = normalizePath(eventPath);
  while (p) {
    const until = _suppressPaths.get(p);
    if (until && now < until) return true;
    const idx = p.lastIndexOf("/");
    if (idx < 0) break;
    p = p.substring(0, idx);
  }
  return false;
}

/* ── 公开 API ── */

/** 列出目录内容——返回 FileEntry[]（含 isDirectory/isFile/size/modifiedAt） */
export async function listDir(dirPath: string): Promise<FileEntry[]> {
  const a = api();
  if (!a) return [];
  return a.listDir(dirPath);
}

/**
 * 读取文本文件。
 * 非 Electron 环境返回空串——调用方应检查。
 */
export async function readFile(filePath: string): Promise<string> {
  const a = api();
  if (!a) return "";
  return a.readTextFile(filePath);
}

/**
 * 读取二进制文件——返回 Uint8Array。
 * Electron IPC 原生支持 Buffer ↔ Uint8Array 传输。
 */
export async function readBinaryFile(filePath: string): Promise<Uint8Array> {
  const a = api();
  if (!a) return new Uint8Array();
  return a.readBinaryFile(filePath);
}

/**
 * E4V#40w——写入二进制文件（GBK/UTF-16 编码保存）。
 * Electron IPC 原生支持 Uint8Array/Buffer 传输。
 */
export async function writeBinaryFile(filePath: string, data: Uint8Array): Promise<void> {
  const a = api();
  if (!a) return;
  await a.writeBinaryFile(filePath, data);
  suppressPath(filePath);
}

/**
 * 写入文本文件——自动创建父目录。
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  const a = api();
  if (!a) return;
  await a.writeTextFile(filePath, content);
  suppressPath(filePath);
}

/** 删除文件或目录（递归） */
export async function deleteEntry(filePath: string): Promise<void> {
  const a = api();
  if (!a) return;
  await a.remove(filePath);
  suppressPath(filePath);
}

/** 检查路径是否存在 */
export async function exists(filePath: string): Promise<boolean> {
  const a = api();
  if (!a) return false;
  return a.exists(filePath);
}

/** 复制文件或目录（递归） */
export async function copy(src: string, dest: string): Promise<void> {
  const a = api();
  if (!a) return;
  await a.copy(src, dest);
  suppressPath(src); suppressPath(dest);
}

/** 创建目录（递归） */
export async function mkdir(dirPath: string): Promise<void> {
  const a = api();
  if (!a) return;
  await a.mkdir(dirPath);
  suppressPath(dirPath);
}

/**
 * 监听文件/目录变化——返回 unsubscribe 函数。
 * 每个 watcher 走独立 IPC 通道（filesystem:changed:${watcherId}），
 * 不同 watcher 之间物理隔离——不再共享全局频道。
 *
 * 使用示例：
 *   const unsub = await watchFile("/path/to/dir", (event) => {
 *     if (event.type === "changed") reloadConfig();
 *   });
 *   // 停止监听时调用 unsub()
 */
export async function watchFile(
  dirPath: string,
  onEvent: (event: FileChangeEvent) => void,
): Promise<() => void> {
  const a = api();
  if (!a) return () => {};
  return a.watch(dirPath, (event) => {
    // 🔥 核心写操作抑制——writeFile/copy/deleteEntry/mkdir 后 300ms 内事件丢弃
    if (isSuppressed(event.path)) return;
    onEvent(event);
  });
}

/** 路径拼接——对标 Tauri path.join() */
export async function joinPath(...parts: string[]): Promise<string> {
  const p = pathApi();
  if (!p) return parts.join("/");
  return p.join(...parts);
}

/** 应用数据目录——对标 Tauri appDataDir() */
export async function appDataDir(): Promise<string> {
  const p = pathApi();
  if (!p) return "";
  return p.appDataDir();
}
