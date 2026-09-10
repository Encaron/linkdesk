/**
 * Toast 通知队列。
 * Phase 4 对标 VS Code Notifications 系统。
 * 读源码依据：notificationsToasts.css / notificationsList.css / notificationsViewer.ts
 *
 * 设计文档：docs/phase4_插件系统/V3-Phase4-通知系统设计.md
 * 隔离模型（S3/S4/S6）见：docs/02-Electron架构/E6_插件生态与发布/03-插件市场/18-通知系统全账与设计定案.md §五 E
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
  /** 来源（插件名等），显示在详情行；也是常驻上限分桶 + 面板分组的键（见 sourceKeyOf） */
  source?: string;
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
   * ⚠️ 只有**用户主动关闭**才记；TTL 自动消失不算（E6#73f 修的 bug——见 expireToast）。
   */
  isCloseAffordance?: boolean;
  /** 创建时间戳——Notification Center 按时间排序/分组用。pushToast 自动填。 */
  createdAt?: number;
  /**
   * 唤醒旗标（E6#73f 新增，18 档 §五 B）——本条通知是否允许把**最小化**的通知面板弹回来。
   * 取值归 §五 G 的分级（E6#73g 给「该弹」级条目置位）；**判据表达式归 E6#73b 的独立白名单**。
   * ⚠️ 不得并进 isImportantNotif（18 档 ㉓：复用会把每 30 秒一条的内存墙也判成「重要」，
   * 最小化面板被反复弹开，直接违反 R5-4）。
   */
  wake?: boolean;
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

/**
 * 常驻条目**每个来源**的堆积上限（E6#73f / 18 档 S3）。
 * 原为**全局** 5 条——任一来源（如 30 连装失败）能把**别的来源**的条目无声顶掉，用户也看不出有东西被吞。
 * 改逐来源分桶 + 被顶掉的记进折叠计数（getFoldedCount），由面板给汇总提示。
 */
export const TOAST_SOURCE_CAP = 5;

/** 无来源条目的分桶键——面板分组「其他」同款键（E6#72） */
export const OTHER_SOURCE_KEY = "__other__";

/**
 * 来源分桶键——`marketplace.update` → `marketplace`；无来源 → `OTHER_SOURCE_KEY`。
 * E6#73f 归一：常驻淘汰分桶与面板分组**共用本函数**（此前两处各写一遍 `split(".")[0] || …`）。
 */
export function sourceKeyOf(source?: string): string {
  return source?.split(".")[0] || OTHER_SOURCE_KEY;
}

let _toasts: Toast[] = [];
const _listeners = new Set<ToastListener>();
/** id → 自动消失定时器——显式移除/替换时清掉，不留悬空回掉（E6#73f） */
const _timers = new Map<string, ReturnType<typeof setTimeout>>();
/** 来源键 → 被淘汰折叠掉的条数（E6#73f S3/A6）——面板渲染「本组另有 N 条较早的已折叠」 */
const _folded = new Map<string, number>();
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

/**
 * 清空 "Don't show again" 台账（debug 钩子用，startup.ts 消费）。
 * E6#73f 修：此前 startup 自写 localStorage 键名且**写错了**（`linkdesk_dismissed_toasts`，
 * 真实键是 StorageService 的 `toast-dismissed`）⇒ 钩子点了没反应。归一：键名只在本模块出现一次。
 */
export function clearDismissedState(): void {
  try { writeSync(DISMISSED_KEY, []); } catch { /* StorageService 不可用时静默 */ }
}

function notify(): void {
  for (const fn of _listeners) {
    fn([..._toasts]);
  }
}

/**
 * 尚无结果判定（E6#73f S4）——进行中/排队中的条目**只能由创建它的句柄收掉**。
 * `clearAll` / 单条 × 一律跳过它们：安装跑到 10% 时点「全部清除」，若连进度条一起清掉，
 * 此后整个安装期屏幕上零反馈、装完才突然冒一条（18 档 A2 实证）。
 * ⚠️「排队中」今天没有独立的 toast 表示（市场队列画在行内按钮上）——`progress` 已是 store 层
 * 全部在途载体；73d 给队列态加行时，第二个判据并进本函数（调用方零改动）。
 */
export function isPending(t: Toast): boolean {
  return t.progress === true;
}

function clearTimer(id: string): void {
  const timer = _timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    _timers.delete(id);
  }
}

function armTimer(t: Toast): void {
  clearTimer(t.id);
  if (!t.ttl || t.ttl <= 0) return;
  _timers.set(t.id, setTimeout(() => expireToast(t.id), t.ttl));
}

/**
 * 条目 GC——来源桶空了就把折叠计数归零（「某来源被清空 = 该来源重新起算」）。
 * 必须在每次移除后跑；否则清空某来源后新增第一条，旧计数会挂在面板上凭空多出一行。
 */
function gcFolded(): void {
  if (_folded.size === 0) return;
  const live = new Set(_toasts.map((t) => sourceKeyOf(t.source)));
  for (const key of [..._folded.keys()]) {
    if (!live.has(key)) _folded.delete(key);
  }
}

/**
 * 自动消失——**不是**用户关的，不落 "Don't show again"。
 * E6#73f 修的 bug：此前 TTL 到点直接调 dismissToast → persistDismiss ⇒ 凡带 isCloseAffordance
 * 的通知只要放够 ttl 就自记「用户不要了」，下次同款静默不弹——机制退化成一次性的。
 * 🔴 机制本身（isCloseAffordance）**不许删**：E6#57.12a 主软件更新通知的既定依赖。
 */
function expireToast(id: string): void {
  _timers.delete(id);
  _toasts = _toasts.filter((t) => t.id !== id);
  gcFolded();
  notify();
}

/**
 * 常驻上限淘汰（E6#73f S3）——按**来源分桶**各留 TOAST_SOURCE_CAP 条，超出顶掉该来源最老的，
 * 并记进折叠计数（面板给汇总提示——A6：原来直接 filter 掉、无声无息，用户不知道有失败被吞）。
 * 进行中条目豁免（S4）——它们归创建句柄收，被顶掉等于屏幕零反馈。
 */
function evictOverflow(added: Toast): void {
  const key = sourceKeyOf(added.source);
  const bucket = _toasts.filter((x) => x.persistent && !isPending(x) && sourceKeyOf(x.source) === key);
  let overflow = bucket.length - TOAST_SOURCE_CAP;
  if (overflow <= 0) return;

  const doomed = new Set<string>();
  for (const x of bucket) {          // bucket 保持插入序（_toasts 原序）→ 先入先淘汰
    if (overflow <= 0) break;
    doomed.add(x.id);
    overflow -= 1;
  }
  for (const id of doomed) clearTimer(id);
  _toasts = _toasts.filter((x) => !doomed.has(x.id));
  _folded.set(key, (_folded.get(key) ?? 0) + doomed.size);
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
  evictOverflow(t);
  armTimer(t);

  notify();
  return id;
}

/** 移除 toast（用户点 × / 句柄取消 / 全部清除） */
export function dismissToast(id: string): void {
  // "Don't show again" 持久化——关闭前记录
  const toast = _toasts.find((t) => t.id === id);
  if (toast) persistDismiss(toast);

  clearTimer(id);
  _toasts = _toasts.filter((t) => t.id !== id);
  gcFolded();
  notify();
}

/**
 * 原子替换（E6#73f 新增，18 档 §五 I.6⑧）——**单次 notify、保持原 id 与原位置**。
 * 缺此 API 时「把一条通知改写成另一条」只能 dismiss + push = 两次 notify ⇒ 行会闪、会换位。
 * 保留 id / createdAt（时间标签不跳）；patch 里未提供的字段保持不变（`percent: undefined` 是
 * **合法**输入 = 清确定进度条，见 updateToast）。ttl 变化则重挂定时器。id 不存在 → 静默 no-op。
 */
export function replaceToast(id: string, patch: Partial<Omit<Toast, "id">>): boolean {
  const idx = _toasts.findIndex((t) => t.id === id);
  if (idx < 0) return false;
  const prev = _toasts[idx];
  const next: Toast = { ...prev, ...patch, id, createdAt: prev.createdAt };
  _toasts[idx] = next;
  if (patch.ttl !== undefined) armTimer(next);
  evictOverflow(next);
  notify();
  return true;
}

/** 更新 toast 消息 + 进度——进度条模式用。不改变其他属性（ttl/severity 等）。
 *  E6#71i：percent 是「当前阶段」状态，逐次 update 全量同步——有值（0-100）→ 确定条宽；
 *  undefined → 清确定态回不定态动画（阶段离开下载段后旧百分比若残留会冻结成「停滞条」误导，
 *  故清空让扫动动画诚实表达仍在进行）。消费方仅在真拿到百分比时才传，不传 = 该阶段无百分比。
 *  E6#73f：本函数收窄为 replaceToast 的薄封装——单一写入路径，不再各写一份 notify。 */
export function updateToast(id: string, message: string, percent?: number): void {
  replaceToast(id, { message, percent });
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

/** 某来源被折叠掉的条数——面板按来源分组渲染汇总行用（E6#73f S3/A6） */
export function getFoldedCount(sourceKey: string): number {
  return _folded.get(sourceKey) ?? 0;
}

/* ── 面板开合镜像——宽面板（铃铛 Notification Center）打开/关闭的壳侧镜像。
 *  语义（E6#72）：通知面唯一化后无右下窄卡可隐，此旗标改作「面板当前是否打开」，
 *  供 buildNotif 计算 autoOpen（重要通知只在面板关着时自动展开，开着的面板不二次打扰）。 */

let _panelOpen = false;

/** 宽面板打开/关闭时调用——同步面板开合状态到壳侧 */
export function setNotifPanelOpen(open: boolean): void {
  _panelOpen = open;
}

/** 当前面板开合镜像状态——buildNotif autoOpen 门禁消费 */
export function isNotifPanelOpen(): boolean {
  return _panelOpen;
}
