/**
 * Pool preload 布局域——pool:layout 缓冲回放 + pool 命名空间。
 * E5.8#0d.10-4a：自 preload-pool.ts 拆出——PoolLayout 可能在 React mount 前到达，
 * IpcRelay 缓冲 + onLayout 回放（硬约束 20）。pool 命名空间 = 池专属 API
 * （onLayout/ready/sidebarAction/tabAction）。
 * 依赖方向：layout → electron/ipc（IpcRelay/channels）+ src/core/types（type PoolLayout）；无反向。
 * 🔥 E5.8#5 接收侧遵守 pushLayout 两条铁律（全文见 src/core/types/pool/poolLayout.ts 头注释）：
 *   池按 whole-value 快照整帧渲染、不缓存旧值合并；崩溃重建重放时只信最后完整快照（IpcRelay 回放缓冲）。
 */

import { ipcRenderer } from 'electron';
import { IPC } from '../ipc/channels';
import { IpcRelay } from '../ipc/ipc-relay';
import { guardPush } from '../ipc/wire-guard';
import type { PoolLayout } from '../../src/core/types/pool/poolLayout';

// ── E5.6#8b：pool:layout 缓冲回放——IPC 可能在 React mount 前到达 ──
// E5.7#78：手写 buffer+callback+active 三件套 → IpcRelay<T>（electron/ipc/ipc-relay.ts）
const _layoutRelay = new IpcRelay<PoolLayout>();

ipcRenderer.on(IPC.pool.layout, (_event, layout: PoolLayout) => {
  // E5.8#22.5：pool:layout 直收点接收边界断言——guard 只记录不阻断，透传缓冲
  guardPush(IPC.pool.layout, layout);
  _layoutRelay.push(layout);
});

/** Pool 专属 API——onLayout 回放缓冲布局；ready/sidebarAction/tabAction 池→壳 直发 */
export function buildPool() {
  return {
    onLayout: (cb: (layout: PoolLayout) => void) => _layoutRelay.onReady(cb),
    ready: () => ipcRenderer.send(IPC.pool.ready), // E5.7#54：不再带 zone——单 Pool 无路由
    sidebarAction: (action: unknown) => ipcRenderer.send(IPC.pool.sidebarAction, action),
    // E5.6#16.5：池→壳 tab 操作（切标签/关闭/拖拽排序/分屏/右键菜单等）
    tabAction: (action: unknown) => ipcRenderer.send(IPC.pool.tabAction, action),
  };
}
