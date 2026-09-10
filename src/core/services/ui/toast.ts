/**
 * Toast 通知队列。
 * Phase 4 对标 VS Code Notifications 系统。
 * 读源码依据：notificationsToasts.css / notificationsList.css / notificationsViewer.ts
 *
 * 设计文档：docs/phase4_插件系统/V3-Phase4-通知系统设计.md
 */

import { readSync, writeSync } from "../configuration/StorageService";

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
  /** 进度通知（progress toast）——池渲染进度条（E6#71i）。由 notifications.show options.progress 置位 */
  progress?: boolean;
  /** 当前进度百分比 0-100——下载段带真值（确定条宽度）；无 percent = 不定态动画 */
  percent?: number;
  /** 长驻通知——不自动消失、等用户手动点 ×（E6#71j）。与 ttl:0 叠加；参与常驻上限淘汰 */
  persistent?: boolean;
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

/** 长驻 toast 堆积上限（E6#71j 定案 ④——防失败通知一直不点 × 越摞越多）：最多保留 N 条，再来顶掉最老的 */
export const TOAST_PERSISTENT_CAP = 5;

let _toasts: Toast[] = [];
let _listeners: Set<ToastListener> = new Set();
let _counter = 0;

/** "Don't show again" 持久化 key——走 StorageService 归一化 */
const DISMISSED_KEY = "toast-dismissed";

function isDismissed(toast: { source?: string; message: string; isCloseAffordance?: boolean }): boolean {
  if (!toast.isCloseAffordance) return false;
  try {
    const key = `${toast.source ?? ""}::${toast.message}`;
    const dismissed = readSync<string[]>(DISMISSED_KEY) ?? [];
    return dismissed.includes(key);
  } catch { return false; }
}

function persistDismiss(toast: { source?: string; message: string; isCloseAffordance?: boolean }): void {
  if (!toast.isCloseAffordance) return;
  try {
    const key = `${toast.source ?? ""}::${toast.message}`;
    const dismissed = readSync<string[]>(DISMISSED_KEY) ?? [];
    if (!dismissed.includes(key)) {
      dismissed.push(key);
      writeSync(DISMISSED_KEY, dismissed);
    }
  } catch { /* StorageService 不可用时静默 */ }
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

  // E6#71j ④：常驻上限——常驻类互相淘汰（顶掉最老的），不碰自动消失 toast。手动移除不落 persistDismiss
  if (t.persistent) {
    const overflow = _toasts.filter((x) => x.persistent).length - TOAST_PERSISTENT_CAP;
    if (overflow > 0) {
      let dropped = 0;
      _toasts = _toasts.filter((x) => {
        if (dropped >= overflow) return true;
        if (x.persistent) {
          dropped += 1;
          return false;
        }
        return true;
      });
    }
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
  // "Don't show again" 持久化——关闭前记录
  const toast = _toasts.find((t) => t.id === id);
  if (toast) persistDismiss(toast);

  _toasts = _toasts.filter((t) => t.id !== id);
  notify();
}

/** 更新 toast 消息 + 进度——进度条模式用。不改变其他属性（ttl/severity 等）。
 *  E6#71i：percent 是「当前阶段」状态，逐次 update 全量同步——有值（0-100）→ 确定条宽；
 *  undefined → 清确定态回不定态动画（阶段离开下载段后旧百分比若残留会冻结成「停滞条」误导，
 *  故清空让扫动动画诚实表达仍在进行）。消费方仅在真拿到百分比时才传，不传 = 该阶段无百分比。 */
export function updateToast(id: string, message: string, percent?: number): void {
  const toast = _toasts.find((t) => t.id === id);
  if (toast) {
    toast.message = message;
    toast.percent = percent;
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

/* ── 面板开合镜像——宽面板（铃铛 Notification Center）打开/关闭的壳侧镜像。
 *  语义（E6#72）：通知面唯一化后无右下窄卡可隐，此旗标改作「面板当前是否打开」，
 *  供 buildNotif 计算 autoOpen（重要通知只在面板关着时自动展开，开着的面板不二次打扰）。 */

let _panelOpen = false;
let _suppressListeners = new Set<(v: boolean) => void>();

/** 宽面板打开/关闭时调用——同步面板开合状态到壳侧 */
export function setNotifPanelOpen(suppressed: boolean): void {
  _panelOpen = suppressed;
  for (const fn of _suppressListeners) fn(suppressed);
}

/** 当前面板开合镜像状态——buildNotif autoOpen 门禁消费 */
export function isNotifPanelOpen(): boolean {
  return _panelOpen;
}

/** 订阅面板开合变化——React hook 用 */
export function subscribeNotifPanelOpen(fn: (v: boolean) => void): () => void {
  _suppressListeners.add(fn);
  return () => { _suppressListeners.delete(fn); };
}

/** 面板动作回传——按 id + 位置序号重解析 onClick 闭包并执行，随后 dismiss。
 *  对标壳 NotificationItem 动作按钮行为（onClick 后 dismissToast）——行为零差异。
 *  E6#72：窄卡删除后，此函数由宽面板动作按钮（useSubscriptions notif:action）归一消费。 */
export function runToastAction(id: string, actionId: string): void {
  const toast = _toasts.find((t) => t.id === id);
  const idx = Number(actionId);
  if (toast && Number.isInteger(idx) && toast.actions && toast.actions[idx]) {
    toast.actions[idx].onClick();
  }
  dismissToast(id);
}
