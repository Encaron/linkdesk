/**
 * Toast 通知队列。
 * Phase 4 Step 4：插件安装/更新/语言变化时触发。
 * 对标 VS Code 右下角通知——堆叠显示（最多 3 条），自动消失。
 *
 * 设计依据：[V3-插件系统与UI重构设计.md §3.5]
 */

export interface Toast {
  id: string;
  message: string;
  actions?: { label: string; onClick: () => void }[];
  /** 自动消失时间（ms），默认 5000，0 = 不自动消失 */
  ttl?: number;
}

type ToastListener = (toasts: Toast[]) => void;

const MAX_VISIBLE = 3;
const DEFAULT_TTL = 5000;

let _toasts: Toast[] = [];
let _listeners: Set<ToastListener> = new Set();
let _counter = 0;

function notify(): void {
  for (const fn of _listeners) {
    fn([..._toasts]);
  }
}

/** 推送 toast——最多 3 条可见，超出自动移除最早的 */
export function pushToast(toast: Omit<Toast, "id"> & { id?: string }): string {
  const id = toast.id ?? `toast-${++_counter}`;
  const t: Toast = { ...toast, id, ttl: toast.ttl ?? DEFAULT_TTL };

  _toasts.push(t);
  while (_toasts.length > MAX_VISIBLE) {
    _toasts.shift();
  }

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

/** 获取当前 toast 列表 */
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
