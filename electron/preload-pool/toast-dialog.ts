/**
 * Pool preload Toast/Dialog 域——哑渲染缓冲回放 + toast/dialogHost 命名空间。
 * E5.8#0d.10-4a：自 preload-pool.ts 拆出——两组同构哑渲染订阅（壳全量快照推池 ToastHost/
 * DialogHost 哑渲染，池动作按 id/type 回传壳重解析）。缓冲+回放（硬约束 20），只保留最后一份。
 * 依赖方向：toast-dialog → electron/ipc（channels）+ src/core/types/pool（type-only，E5.8#20 契约对齐——
 * 原手抄 *Shape 的 unknown[]/open:boolean 与语义类型漂移，satisfies 实证后改直接 import type；构建期擦除零运行时依赖）。
 */

import { ipcRenderer } from 'electron';
import { IPC } from '../ipc/channels';
import { guardPush } from '../ipc/wire-guard';
import type { PoolToastData } from '../../src/core/types/pool/poolToast';
import type { PoolDialogData } from '../../src/core/types/pool/poolDialog';

// ── E5.7#16：pool:toast 缓冲回放——Toast 哑渲染数据可能在 ToastHost mount 前到达 ──
// 对标 pool:quickpick 模式（硬约束 20）：模块顶层注册 + 缓冲 + onShow 回放。
// 只保留最后一份（全量快照语义——新快照整体取代旧快照，回放旧数据无意义）。
const _toastBuffer: PoolToastData[] = [];
let _toastCallback: ((data: PoolToastData) => void) | null = null;
let _toastActive = false;

ipcRenderer.on(IPC.pool.toast, (_event, data: PoolToastData) => {
  // E5.8#22.5：pool:toast 直收点接收边界断言——guard 只记录不阻断，透传缓冲
  guardPush(IPC.pool.toast, data);
  if (!_toastActive || !_toastCallback) {
    _toastBuffer.length = 0;
    _toastBuffer.push(data);
  } else {
    try { _toastCallback(data); } catch { /* contextBridge 回调静默失败 */ }
  }
});

// ── E5.7#17：pool:dialog 缓冲回放——Dialog 哑渲染数据可能在 DialogHost mount 前到达 ──
// 对标 pool:quickpick 模式（硬约束 20）：模块顶层注册 + 缓冲 + onShow 回放。
// 只保留最后一份（单例态——open/close 全量替换，旧数据回放无意义）。
const _dialogBuffer: PoolDialogData[] = [];
let _dialogCallback: ((data: PoolDialogData) => void) | null = null;
let _dialogActive = false;

ipcRenderer.on(IPC.pool.dialog, (_event, data: PoolDialogData) => {
  // E5.8#22.5：pool:dialog 直收点接收边界断言——guard 只记录不阻断，透传缓冲
  guardPush(IPC.pool.dialog, data);
  if (!_dialogActive || !_dialogCallback) {
    _dialogBuffer.length = 0;
    _dialogBuffer.push(data);
  } else {
    try { _dialogCallback(data); } catch { /* contextBridge 回调静默失败 */ }
  }
});

/** Toast 哑渲染订阅——池 ToastHost 消费（缓冲+回放，只保留最后一份） */
export function buildToast() {
  return {
    /** 订阅壳推送的 Toast 全量快照（缓冲+回放，只保留最后一份）。返回 unsubscribe */
    onShow: (cb: (data: PoolToastData) => void) => {
      _toastCallback = cb;
      _toastActive = true;
      if (_toastBuffer.length > 0) {
        for (const data of _toastBuffer) {
          try { cb(data); } catch { /* contextBridge 回调静默失败 */ }
        }
        _toastBuffer.length = 0;
      }
      return () => {
        _toastCallback = null;
        _toastActive = false;
      };
    },
    /** 关闭单条——壳按 id 重解析执行 dismissToast */
    dismiss: (id: string) => ipcRenderer.send(IPC.pool.toastAction, { type: 'dismiss', id }),
    /** 行内操作按钮——壳按 id + actionId（位置序号）重解析 onClick */
    action: (id: string, actionId: string) =>
      ipcRenderer.send(IPC.pool.toastAction, { type: 'action', id, actionId }),
  };
}

/** Dialog 哑渲染订阅——池 DialogHost 消费（缓冲+回放，只保留最后一份）。命名 dialogHost——dialog 命名空间已是插件侧 API */
export function buildDialogHost() {
  return {
    /** 订阅壳推送的 Dialog 数据（缓冲+回放，只保留最后一份）。返回 unsubscribe */
    onShow: (cb: (data: PoolDialogData) => void) => {
      _dialogCallback = cb;
      _dialogActive = true;
      if (_dialogBuffer.length > 0) {
        for (const data of _dialogBuffer) {
          try { cb(data); } catch { /* contextBridge 回调静默失败 */ }
        }
        _dialogBuffer.length = 0;
      }
      return () => {
        _dialogCallback = null;
        _dialogActive = false;
      };
    },
    /** 确认（确定按钮 / Enter）——壳侧 settle(true) */
    confirm: () => ipcRenderer.send(IPC.pool.dialogAction, { type: 'confirm' }),
    /** 取消（取消按钮 / Escape / backdrop）——壳侧 settle(false) */
    cancel: () => ipcRenderer.send(IPC.pool.dialogAction, { type: 'cancel' }),
  };
}
