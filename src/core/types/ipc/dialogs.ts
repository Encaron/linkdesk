/**
 * Dialog wire contract—E5.7#97.
 *
 * Once defined twice: linkdesk-api.ts (plugin side, E5.7#73) and an inline struct in dialog-handlers.ts
 * manually aligned—changing one side silently broke the other. This module defines it in one place:
 * plugin API re-export (keeping the existing import path) + preload + main process, three ends import type.
 */

export interface DialogOpenOptions {
  title?: string;
  /** true = pick a directory; defaults to picking a file */
  directory?: boolean;
  filters?: { name: string; extensions: string[] }[];
  /**
   * 2026-11-23：初始目录的**已知文件夹令牌**（⚠️ 不接受插件给绝对路径）。
   * `"appearance"` = userData/appearance（受控外观图缓存，背景图选择用）——主进程解析并建目录。
   * 旧壳忽略本字段（无初始目录），插件可安全传入。
   */
  defaultPathKind?: "appearance";
}

/** E6#71c rich-content confirm dialog open params—pool plugin → shell DialogService (addressed by content view declaration).
 *  title/message are fallbacks—when the content view fails to resolve, the shell falls back to a plain-text confirm (the dialog still shows; it does not silently die). */
export interface DialogContentOpenOptions {
  /** Fallback title—used when content resolution fails; the pool side has already resolved it via t() */
  title?: string;
  /** Fallback body—same as above */
  message?: string;
  /** Owning plugin of the content (the shell resolves the composite address via ViewContainerService.getView) */
  pluginId: string;
  /** Content view declaration id (registered in contributes.views) */
  viewId: string;
  /** Opaque payload—structured-cloned over IPC; the shell does not interpret it; the content view reads it via dialogHost.current() */
  payload?: unknown;
}

/** 2026-11-24（D12）：保存对话框入参——只选**落盘路径**，壳不代写内容（写入由调用方走 filesystem）。
 *  起始目录 / 覆盖确认由 OS 原生对话框决定；插件⛔ 不再自造 `showSaveFilePicker` / `<a download>` 第二套。 */
export interface DialogSaveOptions {
  title?: string;
  filters?: { name: string; extensions: string[] }[];
  /** 建议文件名（可含扩展名；OS 对话框据此给出落点） */
  defaultName?: string;
}
