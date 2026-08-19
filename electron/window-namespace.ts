/**
 * window 命名空间共享实现——壳/池双 preload 共用（E5.8#20）。
 *
 * 其余镜像命名空间走 E5.8#1d EXEMPT jscpd:ignore（pluginManager/keybindings/pluginState/shell/menu）——
 * window 是唯一双端口径完全一致的命名空间（8 方法同通道零差异），抽共享模块消灭克隆 + 单一真相源：
 * setZoom 曾只壳有→池缺失，satisfies 逮出补齐后，共享让此类漂移结构性消失（双端永远同版）。
 * 依赖方向：window-namespace → electron/ipc（channels/event-system）；被两个 preload import。
 */

import { ipcRenderer } from 'electron';
import { IPC } from './ipc/channels';
import { listenDirect } from './ipc/event-system';

/** window 命名空间——TitleBar 自定义 ─ □ × 按钮 + 缩放/DevTools/最大化状态（双 preload 同款） */
export function buildWindow() {
  return {
    minimize:  () => ipcRenderer.send(IPC.window.minimize),
    maximize:  () => ipcRenderer.send(IPC.window.maximize),
    unmaximize:() => ipcRenderer.send(IPC.window.unmaximize),
    close:     () => ipcRenderer.send(IPC.window.close),
    // E5.7#79：缩放因子 → 主进程 setZoomFactor(池 WCV)。壳配置 window.zoomLevel onApply 调用；池插件调用同效
    setZoom:   (factor: number) => ipcRenderer.send(IPC.window.setZoom, factor),
    toggleDevTools: () => ipcRenderer.invoke(IPC.window.toggleDevTools), // E3f #58
    isMaximized:() => ipcRenderer.invoke(IPC.window.isMaximized),
    onMaximizeChange: (cb: (maximized: boolean) => void) =>
      listenDirect(ipcRenderer, IPC.window.maximizeChange, (m: boolean) => cb(m)),
  };
}
