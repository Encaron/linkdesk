/**
 * Pool preload panel 命名空间——E5.8#34.5 linkdesk.panel.reveal / #35.5 moveToEditor。
 * 薄转发面：插件调 reveal/moveToEditor → ipcRenderer.invoke(panel:*) → IpcBridge 代理到壳 →
 * IpcBridgeHandler/panel 域 → shellEvents.emit("panel:reveal"/"panel:moveToEditor") →
 * App usePanelReveal / usePanelMoveToEditor。
 * 依赖方向：panel → electron/ipc/channels；无反向。
 */

import { ipcRenderer } from 'electron';
import { IPC } from '../ipc/channels';

/** panel 命名空间——底部面板视图聚焦 + 升级标签页（E5.8#34.5/#35.5 通用 API，壳先行建设不等消费方） */
export function buildPanel() {
  return {
    /** 聚焦底部面板视图——面板隐藏则展开并切到该视图；已显示则切换聚焦。viewId 不在 panel 容器时壳侧 no-op */
    reveal: (viewId: string) => ipcRenderer.invoke(IPC.panel.reveal, viewId),
    /** 将底部面板视图升级为主区标签页（当前活动 group 尾部）+ 面板内移除。viewId 不在 panel 容器时壳侧 no-op */
    moveToEditor: (viewId: string) => ipcRenderer.invoke(IPC.panel.moveToEditor, viewId),
  };
}
