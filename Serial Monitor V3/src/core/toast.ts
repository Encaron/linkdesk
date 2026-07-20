/**
 * Toast 通知队列。
 * Phase 4 对标 VS Code Notifications 系统。
 * 读源码依据：notificationsToasts.css / notificationsList.css / notificationsViewer.ts
 *
 * 设计文档：docs/phase4_插件系统/V3-Phase4-通知系统设计.md
 */

/** 对标 VS Code Severity */
export type ToastSeverity = "info" | "warning" | "error";

export interface ToastAction {
  label: string;
  /** true → 主按钮（accent 色），false/未设 → 次级文本按钮 */
  isPrimary?: boolean;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  severity?: ToastSeverity;
  /** 来源（插件名等），显示在详情行 */
  source?: string;
  /** 图标：codicon 类名 或 'info'/'warning'/'error' 映射到默认图标 */
  icon?: string;
  actions?: ToastAction[];
  /** 自动消失时间（ms），默认 6000，0 = 不自动消失 */
  ttl?: number;
}

type ToastListener = (toasts: Toast[]) => void;

/** 对标 VS Code：无数量上限，通知自然堆叠 */
const DEFAULT_TTL = 6000;

let _toasts: Toast[] = [];
let _listeners: Set<ToastListener> = new Set();
let _counter = 0;

function notify(): void {
  for (const fn of _listeners) {
    fn([..._toasts]);
  }
}

/** 推送 toast。对标 VS Code `INotificationService.notify()` */
export function pushToast(toast: Omit<Toast, "id"> & { id?: string }): string {
  const id = toast.id ?? `toast-${++_counter}`;
  const t: Toast = { ...toast, id, ttl: toast.ttl ?? DEFAULT_TTL };

  _toasts.push(t);

  // 自动消失
  if (t.ttl && t.ttl > 0) {
    setTimeout(() => {
      dismissToast(id);
    }, t.ttl);
  }

  notify();
  return id;
}

/** 移除 toast */
export function dismissToast(id: string): void {
  _toasts = _toasts.filter((t) => t.id !== id);
  notify();
}

/** 获取当前所有 toast */
export function getToasts(): Toast[] {
  return [..._toasts];
}

/** 订阅 toast 变化（React hook 用） */
export function subscribeToasts(fn: ToastListener): () => void {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}

/** 未读计数（目前 = 总数，对标 VS Code 铃铛数字） */
export function getUnreadCount(): number {
  return _toasts.length;
}
