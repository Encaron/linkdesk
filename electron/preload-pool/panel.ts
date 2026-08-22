/**
 * Pool preload panel 命名空间——E5.8#34.5 linkdesk.panel.reveal。
 * 薄转发面：插件调 reveal → ipcRenderer.invoke(panel:reveal) → IpcBridge 代理到壳 →
 * IpcBridgeHandler/panel 域 → shellEvents.emit("panel:reveal") → App usePanelReveal。
 * 依赖方向：panel → electron/ipc/channels；无反向。
 */

import { ipcRenderer } from 'electron';
import { IPC } from '../ipc/channels';

/** panel 命名空间——底部面板视图聚焦 + 悬浮面板声明制（E5.8#34.5/#39.5 通用 API，壳先行建设不等消费方） */
export function buildPanel() {
  return {
    /** 聚焦底部面板视图——面板隐藏则展开并切到该视图；已显示则切换聚焦。viewId 不在 panel 容器时壳侧 no-op */
    reveal: (viewId: string) => ipcRenderer.invoke(IPC.panel.reveal, viewId),
    /** 壳内悬浮面板（类型 B）——按声明弹出某视图（I8-2 身份开关键：无面板→开 / 同视图→关 / 他面板→替换）。
     *  viewId → contributes.views 已注册视图（#39.5 声明寻址）；未声明 → 壳侧 no-op 不崩。
     *  E5.8#41.18：可选 pluginId 复合寻址——双套同名 viewId 并存时精确命中目标套。 */
    revealFloating: (viewId: string, pluginId?: string) => ipcRenderer.invoke(IPC.panel.revealFloating, viewId, pluginId),
  };
}
