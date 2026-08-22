/**
 * 池→壳浮层动作回传契约——E5.7#97。
 *
 * 原为 preload-shell.ts 模块级本地 type（E5.7#15/#16/#17/#39），
 * 但同样是跨堆 wire 载荷——归口本目录，壳 preload 与 API 类型层 import type。
 * 注意与 poolQuickPick.ts / poolToast.ts 区分：那些是壳→池的渲染数据 DTO，
 * 这些是池→壳的动作回传（actionId 由壳侧重解析原始 item）。
 */

/** QuickPick 动作——select/highlight/close/itemAction 按 key 回传 */
export interface PoolQuickPickAction {
  type: string;
  key?: string;
  actionId?: string;
}

/** Toast 动作——dismiss/action 按 id + actionId 回传 */
export interface PoolToastAction {
  type: string;
  id: string;
  actionId?: string;
}

/** Dialog 动作——confirm/cancel 回传，壳侧 settle Promise */
export interface PoolDialogAction {
  type: string;
}

/** 悬浮面板动作——action 按 actionId 回传（open-in/close），壳侧 settle Promise（E5.8#37 类型 B） */
export interface PoolFloatingPanelAction {
  type: string;
  actionId?: string;
}

/** 内存压力通知——主进程 window-manager 采样超阈值（E5.7#39） */
export interface MemoryPressureData {
  totalRSS: number;
  threshold: number;
}

/** Pool 就绪通知载荷——主进程按 sender 解析 windowId 转发壳（E5.8#43-1 A3 多窗口就绪流） */
export interface PoolReadyPayload {
  windowId: string;
}

/** 壳→主：创建池窗请求——windowId 壳生成（tabState 归属），bounds 可选（E5.8#43-1 A4 多窗口底座） */
export interface CreatePoolWindowRequest {
  windowId: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

/** 主→壳：池窗被 OS 关闭通知（用户点 × / OS 关窗）——壳据 windowId 按窗口策略处理 tab（E5.8#43-1 A4） */
export interface PoolWindowClosedPayload {
  windowId: string;
}
