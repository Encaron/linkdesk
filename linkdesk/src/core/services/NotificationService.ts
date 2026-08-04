/**
 * NotificationService — 通知系统全功能。
 * Phase 4 建了 Toast 队列（toast.ts），Phase 5 建了 LogChannel。
 * E3e 扩展为完整对标 VS Code INotificationService：
 *   - 进度条（showProgress / ProgressHandle）
 *   - 来源过滤 / Do Not Disturb
 *   - "Don't show again" 持久化
 *   - Notification Center 面板
 *   - 通知 source 归类
 *
 * 设计文档：docs/02-Electron架构/E3_多WebView与壳收尾_暂定/05-E3e-通知系统.md
 * VS Code 对标：src/vs/workbench/services/notification/common/notificationService.ts
 */

import { Emitter } from "../react/CoreEvents";

/* ── 进度条 ── */

export interface ProgressHandle {
  /** 推进进度——increment 加到当前值，total 存在时计算百分比 */
  report(increment: number, message?: string): void;
  /** 完成——进度条跳到 100% 然后消失 */
  finish(message?: string): void;
  /** 取消——进度条立即移除 */
  cancel(): void;
}

export interface ProgressItem {
  id: string;
  title: string;
  message?: string;
  /** 0-100，-1 = 不确定模式（无 total 时持续动画） */
  percentage: number;
  cancellable: boolean;
  done: boolean;
  cancelled: boolean;
}

let _progresses: ProgressItem[] = [];
let _progressCounter = 0;
const _progressHandles = new Map<string, ProgressHandle>();
const _onDidChangeProgress = new Emitter<ProgressItem[]>();

/** 显示进度条——对标 VS Code vscode.window.withProgress */
export function showProgress(
  title: string,
  options?: { cancellable?: boolean; total?: number }
): ProgressHandle {
  const id = `progress-${++_progressCounter}`;
  let current = 0;
  const total = options?.total;

  const item: ProgressItem = {
    id,
    title,
    cancellable: options?.cancellable ?? false,
    percentage: total ? 0 : -1, // 无 total → 不确定模式立即开启动画
    done: false,
    cancelled: false,
  };

  const handle: ProgressHandle = {
    report(increment: number, message?: string) {
      if (item.done || item.cancelled) return;
      current += increment;
      if (message !== undefined) item.message = message;
      item.percentage = total ? Math.min(100, Math.round((current / total) * 100)) : -1;
      _onDidChangeProgress.fire([..._progresses]);
    },
    finish(message?: string) {
      if (item.done || item.cancelled) return;
      if (message !== undefined) item.message = message;
      item.percentage = 100;
      item.done = true;
      _onDidChangeProgress.fire([..._progresses]);
      _progressHandles.delete(id);
      // 完成后保留 1.5s 让用户看到 100%，然后移除
      setTimeout(() => {
        _progresses = _progresses.filter((p) => p.id !== id);
        _onDidChangeProgress.fire([..._progresses]);
      }, 1500);
    },
    cancel() {
      if (item.done) return;
      item.cancelled = true;
      _progresses = _progresses.filter((p) => p.id !== id);
      _progressHandles.delete(id);
      _onDidChangeProgress.fire([..._progresses]);
    },
  };

  _progresses.push(item);
  _progressHandles.set(id, handle);
  _onDidChangeProgress.fire([..._progresses]);

  return handle;
}

/** 取消指定进度——UI 取消按钮调用 */
export function cancelProgress(id: string): void {
  const handle = _progressHandles.get(id);
  if (handle) {
    handle.cancel();
    _progressHandles.delete(id);
  }
}

/** 获取当前所有活跃进度 */
export function getProgresses(): ProgressItem[] {
  return [..._progresses];
}

/** 订阅进度变化——React hook 用 */
export function subscribeProgress(fn: (items: ProgressItem[]) => void): () => void {
  return _onDidChangeProgress.event(fn);
}

/* ── 导出 toast 功能（NotificationService 是 toast 的超集——统一入口） ── */

import {
  pushToast as _pushToast,
  dismissToast,
  getToasts,
  subscribeToasts,
  getUnreadCount,
} from "./toast";
export type { Toast, ToastSeverity, ToastAction } from "./toast";
export { dismissToast, getToasts, subscribeToasts, getUnreadCount };
export { setToastsSuppressed, isToastsSuppressed, subscribeToastSuppressed } from "./toast";
export { TOAST_TTL_ERROR, TOAST_TTL_INFO, TOAST_TTL_SUCCESS } from "./toast";

/* ── 通知来源过滤 / Do Not Disturb ── */

let _dnd = false;
const _sourceFilters = new Map<string, boolean>();

/** 全局免打扰——所有 toast 静默 */
export function setDoNotDisturb(enabled: boolean): void {
  _dnd = enabled;
}

/** 是否处于免打扰模式 */
export function isDoNotDisturb(): boolean {
  return _dnd;
}

/** 设置插件通知来源开关——false = 该插件的通知不弹 */
export function setSourceFilter(pluginId: string, enabled: boolean): void {
  _sourceFilters.set(pluginId, enabled);
}

/** 获取插件通知来源状态——默认 true（未设置过的插件允许弹通知） */
export function getSourceFilter(pluginId: string): boolean {
  return _sourceFilters.get(pluginId) ?? true;
}

/**
 * 推送 toast——带过滤。
 * DND 全局静默或来源插件被关掉时丢弃通知，返回空串。
 */
export function pushToast(toast: Parameters<typeof _pushToast>[0]): string {
  if (_dnd) return "";

  if (toast.source) {
    // source 格式：pluginId 或 pluginId.sourceId——取第一段
    const pluginId = toast.source.split(".")[0];
    if (!getSourceFilter(pluginId)) return "";
  }

  return _pushToast(toast);
}
