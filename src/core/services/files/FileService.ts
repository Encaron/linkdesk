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

import i18n from "../../../i18n"; // E6#73h（D3/D4）：错误文案走 i18n + 去掉内部函数名（「listDir 失败」不是给用户看的）
import { normalizePath } from "../../utils/path/pathUtils";
import { reportError } from "../bootstrap/ErrorService";

/* ── 类型 ── */

import type { FileEntry } from "../../types/fileEntry"; // E5.7#45.5：shared/types.ts 迁入 core/types/。E5.7#62：不再 re-export——唯一消费方是 file-tree 插件 4 处 type import，已直指正源；re-export 保留会诱插件走服务路径（#53 桶陷阱同款）

export interface FileChangeEvent {
  path: string;
  type: "created" | "changed" | "deleted";
}

/* ── 底层 API 引用 ── */

function api() {
  return window.linkdesk?.filesystem as {
    readTextFile(path: string): Promise<string>;
    writeTextFile(path: string, data: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    createDir(path: string): Promise<void>;
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

// E5.7#98：契约 path 面直接消费——join 等为同步函数（preload 本地实现），
// 原局部 cast 误标 join 为 Promise（await 同步值无害但类型不诚实）。appDataDir 双端注入（E5.8#0d.5：池侧已补——settings 插件需 userData 路径）。
function pathApi() {
  return window.linkdesk?.path;
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

// 🔴 E6#73g（18 档 §五 G 定级）：本文件**全部**失败上报一律 `wake: false` = 「只角标」。
// 依据：本服务的消费者只有壳内 StorageService（配置 / 存储持久化）——**背景操作**，
// 用户当场什么也做不了，弹面板只会糊脸（18 档 B3「壳侧文件读写失败太吵」）。
// ⚠️ 别顺手改成 `醒`：真要让用户动手的失败（插件加载失败 / 安装失败）走各自的通道，
// 不经这里；插件侧的文件操作（文件树 / 编辑器）走池 preload 裸 IPC，也不经这里。

/** 列出目录内容——返回 FileEntry[]（含 isDirectory/isFile/size/modifiedAt） */
export async function listDir(dirPath: string): Promise<FileEntry[]> {
  const a = api();
  if (!a) { reportError({ message: "filesystem API 不可用", source: "core", silent: true }); return []; }
  try { return await a.listDir(dirPath); }
  catch (e) { reportError({ message: i18n.t("无法读取文件夹：{{path}}", { path: dirPath }), source: "core", error: e, wake: false }); return []; }
}

/**
 * 读取文本文件。
 * 非 Electron 环境返回空串——调用方应检查。
 */
export async function readFile(filePath: string): Promise<string> {
  const a = api();
  if (!a) { reportError({ message: "filesystem API 不可用", source: "core", silent: true }); return ""; }
  try { return await a.readTextFile(filePath); }
  catch (e) { reportError({ message: i18n.t("无法读取文件：{{path}}", { path: filePath }), source: "core", error: e, wake: false }); return ""; }
}

/**
 * 读取二进制文件——返回 Uint8Array。
 * Electron IPC 原生支持 Buffer ↔ Uint8Array 传输。
 */
export async function readBinaryFile(filePath: string): Promise<Uint8Array> {
  const a = api();
  if (!a) { reportError({ message: "filesystem API 不可用", source: "core", silent: true }); return new Uint8Array(); }
  try { return await a.readBinaryFile(filePath); }
  catch (e) { reportError({ message: i18n.t("无法读取文件：{{path}}", { path: filePath }), source: "core", error: e, wake: false }); return new Uint8Array(); }
}

/**
 * E4V#40w——写入二进制文件（GBK/UTF-16 编码保存）。
 * Electron IPC 原生支持 Uint8Array/Buffer 传输。
 */
export async function writeBinaryFile(filePath: string, data: Uint8Array): Promise<void> {
  const a = api();
  if (!a) { reportError({ message: "filesystem API 不可用", source: "core", silent: true }); return; }
  try { await a.writeBinaryFile(filePath, data); }
  catch (e) { reportError({ message: i18n.t("无法写入文件：{{path}}", { path: filePath }), source: "core", error: e, wake: false }); }
  suppressPath(filePath);
}

/**
 * 写入文本文件——自动创建父目录。
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  const a = api();
  if (!a) { reportError({ message: "filesystem API 不可用", source: "core", silent: true }); return; }
  try { await a.writeTextFile(filePath, content); }
  catch (e) { reportError({ message: i18n.t("无法写入文件：{{path}}", { path: filePath }), source: "core", error: e, wake: false }); }
  suppressPath(filePath);
}

/** 删除文件或目录（递归） */
export async function remove(filePath: string): Promise<void> {
  const a = api();
  if (!a) { reportError({ message: "filesystem API 不可用", source: "core", silent: true }); return; }
  try { await a.remove(filePath); }
  catch (e) { reportError({ message: i18n.t("无法删除：{{path}}", { path: filePath }), source: "core", error: e, wake: false }); }
  suppressPath(filePath);
}

/** 检查路径是否存在 */
export async function exists(filePath: string): Promise<boolean> {
  const a = api();
  if (!a) { reportError({ message: "filesystem API 不可用", source: "core", silent: true }); return false; }
  try { return await a.exists(filePath); }
  catch (e) { reportError({ message: i18n.t("无法检查路径是否存在：{{path}}", { path: filePath }), source: "core", error: e, wake: false }); return false; }
}

/** 复制文件或目录（递归） */
export async function copy(src: string, dest: string): Promise<void> {
  const a = api();
  if (!a) { reportError({ message: "filesystem API 不可用", source: "core", silent: true }); return; }
  try { await a.copy(src, dest); }
  catch (e) { reportError({ message: i18n.t("无法复制：{{src}} → {{dest}}", { src, dest }), source: "core", error: e, wake: false }); }
  suppressPath(src); suppressPath(dest);
}

/** 创建目录（递归） */
export async function createDir(dirPath: string): Promise<void> {
  const a = api();
  if (!a) { reportError({ message: "filesystem API 不可用", source: "core", silent: true }); return; }
  try { await a.createDir(dirPath); }
  catch (e) { reportError({ message: i18n.t("无法新建文件夹：{{path}}", { path: dirPath }), source: "core", error: e, wake: false }); }
  suppressPath(dirPath);
}

/**
 * 监听文件/目录变化——返回 unsubscribe 函数。
 * 每个 watcher 走独立 IPC 通道（filesystem:changed:${watcherId}），
 * 不同 watcher 之间物理隔离——不再共享全局频道。
 *
 * 使用示例：
 *   const unsub = await watch("/path/to/dir", (event) => {
 *     if (event.type === "changed") reloadConfig();
 *   });
 *   // 停止监听时调用 unsub()
 */
export async function watch(
  dirPath: string,
  onEvent: (event: FileChangeEvent) => void,
): Promise<() => void> {
  const a = api();
  if (!a) return () => {};
  return a.watch(dirPath, (event) => {
    // 🔥 核心写操作抑制——writeFile/copy/remove/createDir 后 300ms 内事件丢弃
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
  if (!p?.appDataDir) return "";
  return p.appDataDir();
}
