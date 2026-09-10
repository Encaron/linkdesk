/**
 * NotificationService — 通知系统入口。
 * E3e 建了完整通知系统（进度条 / 来源过滤 / DND / Notification Center），
 * E5.7#27.5 死链整删（2026-08-15）：进度条 API 面（showProgress 等）与 DND/来源过滤
 * 全仓库零调用方——自诞生起无生产者（App.tsx 调试后门 __showProgress 也零消费者）。
 * 现为 toast 服务的统一入口（pushToast 直通，无过滤层）。
 *
 * 进度通知的现网路径（E3j #76）：notification.show(message, { progress: true }) →
 * 持久 toast（ttl:0）+ update/finish/cancel 改 toast 消息（IpcBridgeHandler.ts:536），
 * 走 E5.7#16 池 toast 桥显示。真进度条 UI（VS Code 式右下角进度卡）留未来——
 * 届时 API 面已现成，样式 git history 可找回（src/components/ProgressBar.css）。
 *
 * 设计文档：docs/02-Electron架构/E3_多WebView与壳收尾_暂定/05-E3e-通知系统.md
 * VS Code 对标：src/vs/workbench/services/notification/common/notificationService.ts
 */

/* ── 导出 toast 功能（E3e 的超集面——进度条/DND/来源过滤——已随 E5.7#27.5 整删） ── */

import {
  pushToast,
  dismissToast,
  getToasts,
  subscribeToasts,
  getUnreadCount,
} from "./toast";
export type { Toast, ToastSeverity, ToastAction } from "./toast";
export { dismissToast, getToasts, subscribeToasts, getUnreadCount };
export { setNotifPanelOpen, isNotifPanelOpen, subscribeNotifPanelOpen } from "./toast";
export { TOAST_TTL_ERROR, TOAST_TTL_INFO, TOAST_TTL_SUCCESS } from "./toast";
export { pushToast };
