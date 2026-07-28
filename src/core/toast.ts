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
  /**
   * 关闭后不再显示——对标 VS Code `isCloseAffordance`。
   * 设为 true 后，用户点 × 关闭此通知 → localStorage 持久化 → 下次同 source+message 的通知不弹。
   */
  isCloseAffordance?: boolean;
  /** 创建时间戳——Notification Center 按时间排序/分组用。pushToast 自动填。 */
  createdAt?: number;
}

type ToastListener = (toasts: Toast[]) => void;

/** 对标 VS Code：无数量上限，通知自然堆叠 */
const DEFAULT_TTL = 6000;

/** 错误 toast 持续更久——用户需要时间读诊断信息（B9 fix：消除裸数字） */
export const TOAST_TTL_ERROR = 8000;
/** 成功 toast 短提示——操作完成后快速消失 */
export const TOAST_TTL_SUCCESS = 5000;
/** 信息 toast 中等——不紧急但有用 */
export const TOAST_TTL_INFO = 6000;

let _toasts: Toast[] = [];
let _listeners: Set<ToastListener> = new Set();
let _counter = 0;

/** "Don't show again" 持久化 key */
const DISMISSED_KEY = "linkdesk_dismissed_toasts";

function isDismissed(toast: { source?: string; message: string; isCloseAffordance?: boolean }): boolean {
  if (!toast.isCloseAffordance) return false;
  try {
    const key = `${toast.source ?? ""}::${toast.message}`;
    const dismissed = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]") as string[];
    return dismissed.includes(key);
  } catch { return false; }
}

function persistDismiss(toast: { source?: string; message: string; isCloseAffordance?: boolean }): void {
  if (!toast.isCloseAffordance) return;
  try {
    const key = `${toast.source ?? ""}::${toast.message}`;
    const dismissed = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]") as string[];
    if (!dismissed.includes(key)) {
      dismissed.push(key);
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
    }
  } catch { /* localStorage 不可用时静默 */ }
}

function notify(): void {
  for (const fn of _listeners) {
    fn([..._toasts]);
  }
}

/** 推送 toast。对标 VS Code `INotificationService.notify()` */
export function pushToast(toast: Omit<Toast, "id"> & { id?: string }): string {
  // "Don't show again" 检查——用户之前点 × 关过同款通知
  if (toast.isCloseAffordance && isDismissed(toast)) {
    return "";
  }

  const id = toast.id ?? `toast-${++_counter}`;
  const t: Toast = { ...toast, id, ttl: toast.ttl ?? DEFAULT_TTL, createdAt: toast.createdAt ?? Date.now() };

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
  // "Don't show again" 持久化——关闭前记录
  const toast = _toasts.find((t) => t.id === id);
  if (toast) persistDismiss(toast);

  _toasts = _toasts.filter((t) => t.id !== id);
  notify();
}

/** 更新 toast 消息——进度条模式用。不改变其他属性（ttl/severity 等） */
export function updateToast(id: string, message: string): void {
  const toast = _toasts.find((t) => t.id === id);
  if (toast) {
    toast.message = message;
    notify();
  }
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

/* ── Toast 显隐——NotificationCenter 打开面板时隐藏 toast，对标 VS Code ── */

let _toastsSuppressed = false;
let _suppressListeners = new Set<(v: boolean) => void>();

/** NotificationCenter 面板打开/关闭时调用——打开时隐藏 toast，关闭后恢复 */
export function setToastsSuppressed(suppressed: boolean): void {
  _toastsSuppressed = suppressed;
  for (const fn of _suppressListeners) fn(suppressed);
}

/** 当前 suppress 状态——ToastContainer 消费 */
export function isToastsSuppressed(): boolean {
  return _toastsSuppressed;
}

/** 订阅 suppress 变化——React hook 用 */
export function subscribeToastSuppressed(fn: (v: boolean) => void): () => void {
  _suppressListeners.add(fn);
  return () => { _suppressListeners.delete(fn); };
}
