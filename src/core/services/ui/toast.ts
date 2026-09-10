/**
 * Toast 通知队列。
 * Phase 4 对标 VS Code Notifications 系统。
 * 读源码依据：notificationsToasts.css / notificationsList.css / notificationsViewer.ts
 *
 * 设计文档：docs/phase4_插件系统/V3-Phase4-通知系统设计.md
 */

import { readSync, writeSync } from "../configuration/StorageService";
import i18n from "../../../i18n"; // E5.7#16：serializeToasts 壳侧解析来源文本（显示文本铁律）
import type { PoolToastData, PoolToastItem } from "../../types/pool/poolToast";

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

/* ── E5.7#16：聪慧→哑桥——壳侧序列化 + 动作重解析（浮层归一化设计.md §6） ── */

/** 图标类解析——壳侧归一（原 ToastContainer.tsx 局部函数迁入，serialize 与壳渲染共用）。
 *  查表绕开 no-restricted-syntax 小写字面量比较误报（switch case "error" 会误报 pluginId）。 */
export function getToastIconClass(toast: Toast): string {
  if (toast.icon) {
    // 如果直接传了 codicon 类名
    if (toast.icon.startsWith("codicon")) return `codicon ${toast.icon}`;
    // 如果传了自定义类名
    return toast.icon;
  }
  // 根据 severity 默认——对标 VS Code Severity codicons
  const severityIcons: Record<string, string> = {
    error: "codicon codicon-error toast-severity-error",
    warning: "codicon codicon-warning toast-severity-warning",
    info: "codicon codicon-info toast-severity-info",
  };
  return severityIcons[toast.severity ?? "info"] ?? severityIcons.info;
}

/** 序列化当前 toast 状态为池 DTO——显示文本铁律：message 原文 + sourceText 壳侧 t() 解析，
 *  池 ToastHost 原样渲染。函数不过 IPC：actions 的 onClick 闭包留壳，
 *  按位置序号 actionId 回传（runToastAction 重解析执行）。 */
export function serializeToasts(): PoolToastData {
  const toasts: PoolToastItem[] = _toasts.map((toast) => ({
    id: toast.id,
    message: toast.message,
    iconClass: getToastIconClass(toast),
    sourceText: toast.source ? i18n.t("来源: {{source}}", { source: toast.source }) : undefined,
    // E6#71i：进度类 toast 透传 progress + percent——池据此渲染进度条（有 percent = 确定条宽，无 = 不定态）
    progress: toast.progress ?? false,
    percent: toast.percent,
    actions: toast.actions?.map((a, idx) => ({
      actionId: String(idx),
      label: a.label,
      isPrimary: a.isPrimary,
    })),
  }));
  return { toasts, suppressed: _toastsSuppressed };
}

/** 池动作回传——按 id + 位置序号重解析 onClick 闭包并执行，随后 dismiss。
 *  对标壳 NotificationItem 动作按钮行为（onClick 后 dismissToast）——行为零差异。 */
export function runToastAction(id: string, actionId: string): void {
  const toast = _toasts.find((t) => t.id === id);
  const idx = Number(actionId);
  if (toast && Number.isInteger(idx) && toast.actions && toast.actions[idx]) {
    toast.actions[idx].onClick();
  }
  dismissToast(id);
}
