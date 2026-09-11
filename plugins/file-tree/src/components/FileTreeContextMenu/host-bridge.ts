/**
 * host-bridge——宿主（FoldersView）与模块级命令 handler 之间的桥接。
 *
 * 🔴 **模块级 mutable 单一属主（E6#87a）**：`_handleRef` / `_openFileFn` 全仓仅在**本文件**声明，
 * 跨文件读走 `h()` / `getOpenFileFn()`，不许在别处再写一份。
 *
 * 为什么存 ref 对象而不是 current 快照：FoldersView 不重渲染时 `_handle` 快照会过期（时序 bug）。
 */
import type { MutableRefObject } from "react";
import type { FileTreeHandle } from "../FileTree";

/* ── 🔥 归一化桥接：存 ref 对象——每次 .current 拿最新 handle，非快照 ── */

let _handleRef: MutableRefObject<FileTreeHandle | null> | null = null;

/** 🔥 读最新 handle——解决 FoldersView 不重渲染时 _handle 快照过期的时序 bug */
export function h(): FileTreeHandle | null {
  return _handleRef?.current ?? null;
}

/** FoldersView mount 时调用——注入 ref 本身（非 current 快照） */
export function setFileTreeHandleRef(ref: MutableRefObject<FileTreeHandle | null>): void {
  _handleRef = ref;
}

/** FoldersView unmount 时调用 */
export function clearFileTreeHandle(): void {
  _handleRef = null;
}

/* ── 🔥 打开文件桥接：命令 handler 通过此桥调 createTab ── */

export type OpenFileFn = (filePath: string, name: string, mode: "preview" | "pin") => void;

let _openFileFn: OpenFileFn | null = null;

/** FoldersView mount 时注入——命令 handler 通过此桥调 createTab */
export function setOpenFileFn(fn: OpenFileFn | null): void {
  _openFileFn = fn;
}

/** commands.ts 专用：取当前注入的打开文件函数（跨模块读走此 accessor，不直接碰 `_openFileFn`） */
export function getOpenFileFn(): OpenFileFn | null {
  return _openFileFn;
}
