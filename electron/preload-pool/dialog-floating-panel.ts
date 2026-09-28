/**
 * Pool preload Dialog/悬浮面板 域——哑渲染缓冲回放 + dialogHost/floatingPanelHost 命名空间。
 * E6#72：toast 域整删（E5.7#16 右下窄卡链路——通知面归一，唯一通知面 = 铃铛宽面板，走 layout.statusBar.notif，
 * 不经独立 IPC 通道）。本文件保留 dialog + floatingPanel 两组同构哑渲染订阅。
 * 依赖方向：dialog-floating-panel → electron/ipc（channels）+ src/core/types/pool（type-only，E5.8#20 契约对齐——
 * 原手抄 *Shape 的 unknown[]/open:boolean 与语义类型漂移，satisfies 实证后改直接 import type；构建期擦除零运行时依赖）。
 */

import { ipcRenderer } from 'electron';
import { IPC } from '../ipc/channels';
import { guardPush } from '../ipc/wire-guard';
import type { PoolDialogData, PoolPendingDialog } from '../../src/core/types/pool/poolDialog';
import type {
  FloatingPanelBoundsHostFn,
  PoolFloatingPanelData,
  PoolFloatingPanelGeometry,
} from '../../src/core/types/pool/poolFloatingPanel';

// ── E5.7#17：pool:dialog 缓冲回放——Dialog 哑渲染数据可能在 DialogHost mount 前到达 ──
// 对标 pool:quickpick 模式（硬约束 20）：模块顶层注册 + 缓冲 + onShow 回放。
// 只保留最后一份（单例态——open/close 全量替换，旧数据回放无意义）。
const _dialogBuffer: PoolDialogData[] = [];
let _dialogCallback: ((data: PoolDialogData) => void) | null = null;
let _dialogActive = false;
// E6#71c：当前打开 Dialog 态——富内容视图挂载后经 dialogHost.current()?.content?.payload 取数。
// 模块顶层追踪（非 React state）——内容视图与 DialogHost 无关独立读，硬约束 19 例外（单快照读写，
// 非 IPC 监听器，无清理需求）。open:false → null（无打开/已关闭）。
let _dialogOpen: PoolDialogData | null = null;

ipcRenderer.on(IPC.pool.dialog, (_event, data: PoolDialogData) => {
  // E5.8#22.5：pool:dialog 直收点接收边界断言——guard 只记录不阻断，透传缓冲
  guardPush(IPC.pool.dialog, data);
  _dialogOpen = data.open ? data : null;
  if (!_dialogActive || !_dialogCallback) {
    _dialogBuffer.length = 0;
    _dialogBuffer.push(data);
  } else {
    try { _dialogCallback(data); } catch { /* contextBridge 回调静默失败 */ }
  }
});

/** Dialog 哑渲染订阅——池 DialogHost 消费（缓冲+回放，只保留最后一份）。命名 dialogHost——dialog 命名空间已是插件侧 API */
export function buildDialogHost() {
  return {
    /** E6#71c：当前打开的 Dialog 数据——富内容视图挂载后经 current()?.content?.payload 取数。
     *  content 模式才可读；无打开/已关闭（open:false）→ null。 */
    current: () => _dialogOpen,
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
    // M1 AI#5：在途弹窗清单——问**壳**（DialogService 登记的在途 options：kind/标题/正文/按钮文案）。
    // 与 current() 的分工见契约注释：current() = 本进程收到的哑渲染数据（画什么），
    // pending() = 壳侧正在等什么（谁问的 / 富内容视图身份 / 按钮有几条）。单槽是现状（见契约 🔴）。
    pending: (): Promise<PoolPendingDialog[]> => ipcRenderer.invoke(IPC.plugins.call, 'getPendingDialogs'),
    /** 确认（确定按钮 / Enter）——壳侧 settle(true) */
    confirm: () => ipcRenderer.send(IPC.pool.dialogAction, { type: 'confirm' }),
    /** 取消（取消按钮 / Escape / backdrop）——壳侧 settle(false) */
    cancel: () => ipcRenderer.send(IPC.pool.dialogAction, { type: 'cancel' }),
  };
}

// ── E5.8#37：pool:floating-panel 缓冲回放——悬浮面板哑渲染数据可能在 FloatingPanelHost mount 前到达 ──
// 对标 pool:dialog 模式（硬约束 20）：模块顶层注册 + 缓冲 + onShow 回放。
// 只保留最后一份（单实例态——open/close 全量替换，I8-10 壳侧裁决后只推胜出者）。
const _floatingPanelBuffer: PoolFloatingPanelData[] = [];
let _floatingPanelCallback: ((data: PoolFloatingPanelData) => void) | null = null;
let _floatingPanelActive = false;

// ── M2 `AI#20`：几何宿主注册槽——池 FloatingPanelHost 注册（getBounds 同步直答；主世界函数经代理进本侧存储，
//    同 quickPickHost `_quickPickHostFn` 先例）。set 路径不经本槽（走壳 → DTO 推送），故此处只存不调 set。
//    ⚠️ `FloatingPanelBoundsHostFn` 走 `src/core/types/pool` 的**共享类型**（本文件顶 E5.8#20 那条裁决：
//    手抄一份 = 与语义类型漂移，构建期擦除零运行时依赖 ⇒ 直接 import type）。
let _floatingPanelBoundsHostFn: FloatingPanelBoundsHostFn | null = null;

ipcRenderer.on(IPC.pool.floatingPanel, (_event, data: PoolFloatingPanelData) => {
  // E5.8#22.5：pool:floating-panel 直收点接收边界断言——guard 只记录不阻断，透传缓冲
  guardPush(IPC.pool.floatingPanel, data);
  if (!_floatingPanelActive || !_floatingPanelCallback) {
    _floatingPanelBuffer.length = 0;
    _floatingPanelBuffer.push(data);
  } else {
    try { _floatingPanelCallback(data); } catch { /* contextBridge 回调静默失败 */ }
  }
});

/** 悬浮面板哑渲染订阅——池 FloatingPanelHost 消费（缓冲+回放，只保留最后一份）。命名 floatingPanelHost */
export function buildFloatingPanelHost() {
  return {
    /** 订阅壳推送的悬浮面板数据（缓冲+回放，只保留最后一份）。返回 unsubscribe */
    onShow: (cb: (data: PoolFloatingPanelData) => void) => {
      _floatingPanelCallback = cb;
      _floatingPanelActive = true;
      if (_floatingPanelBuffer.length > 0) {
        for (const data of _floatingPanelBuffer) {
          try { cb(data); } catch { /* contextBridge 回调静默失败 */ }
        }
        _floatingPanelBuffer.length = 0;
      }
      return () => {
        _floatingPanelCallback = null;
        _floatingPanelActive = false;
      };
    },
    /** 动作回传——open-in（在主窗口中打开）/ close（关闭按钮/Esc/遮罩），壳侧 settle（业务语义壳侧重解析） */
    action: (actionId: string) => ipcRenderer.send(IPC.pool.floatingPanelAction, { type: 'action', actionId }),

    // ── M2 `AI#20`：几何宿主（池是几何真相源——面板渲染在池，壳不存几何） ──
    /** 池 FloatingPanelHost mount 时注册几何宿主（主世界函数经 contextBridge 代理进隔离世界存储，
     *  同 `quickPickHost.registerHost` 先例）。返回 unsubscribe。 */
    registerBoundsHost: (fn: FloatingPanelBoundsHostFn) => {
      _floatingPanelBoundsHostFn = fn;
      return () => {
        if (_floatingPanelBoundsHostFn === fn) _floatingPanelBoundsHostFn = null;
      };
    },
    /** 读当前悬浮面板几何（**同步**——池内直答零 IPC，同 `dialogHost.current()` 先例）。
     *  无面板 / 宿主未注册（旧池组件）→ null。 */
    getBounds: (): PoolFloatingPanelGeometry | null =>
      (_floatingPanelBoundsHostFn?.({ op: 'get' }) as PoolFloatingPanelGeometry | null | undefined) ?? null,
  };
}
