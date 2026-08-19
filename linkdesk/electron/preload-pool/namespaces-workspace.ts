/**
 * Pool preload 工作区/交互域命名空间集合——workspace/notifications/tabs/p2p/dialog。
 * E5.8#0d.10-4d：自 preload-pool.ts 拆出——无模块级状态的薄转发面（invoke/send/listenDirect/events.on）。
 * 依赖方向：namespaces-workspace → electron/ipc（channels/event-system）+ src/core/types（type）；无反向。
 */

import { ipcRenderer } from 'electron';
import { IPC } from '../ipc/channels';
import { listenDirect, type EventSystemApi } from '../ipc/event-system';
import type { WorkspaceFolder } from '../../src/core/services/layout/WorkspaceService';
import type { WorkspaceActiveChangedPayload, TabActivatedPayload } from '../../src/core/types/ipc/events';
import type { DialogOpenOptions } from '../../src/core/types/ipc/dialogs';

/** workspace 命名空间——池插件完整工作区操作（E5.6#11.5a 扩展） */
export function buildWorkspace(events: EventSystemApi) {
  return {
    getFolders: (): Promise<WorkspaceFolder[]> => ipcRenderer.invoke(IPC.workspace.getFolders),
    getActive: (): Promise<string | undefined> => ipcRenderer.invoke(IPC.workspace.getActive),
    setActive: (uri: string) => ipcRenderer.invoke(IPC.workspace.setActive, uri),
    openFolder: () => ipcRenderer.invoke(IPC.workspace.openFolder),
    addFolder: (path: string) => ipcRenderer.invoke(IPC.workspace.addFolder, path),
    removeFolder: (path: string) => ipcRenderer.invoke(IPC.workspace.removeFolder, path),
    onDidChangeFolders: (cb: () => void) => events.on('workspace:changed', cb),
    onDidChangeActiveWorkspace: (cb: (uri: string | null) => void) => {
      return events.on('workspace:activeChanged', (d: WorkspaceActiveChangedPayload) => {
        try { cb(d?.uri ?? null); } catch { /* contextBridge 回调静默失败 */ }
      });
    },
  };
}

/** notifications 命名空间 */
export function buildNotifications() {
  return {
    show: (message: string, options?: { type?: string; progress?: boolean }) => {
      return ipcRenderer.invoke(IPC.plugins.call, 'showNotification', message, options)
        .then((handleId: string | undefined) => {
          if (!handleId) return undefined;
          return {
            update: (msg: string) => ipcRenderer.invoke(IPC.plugins.call, 'updateNotification', handleId, msg),
            finish: (msg?: string) => ipcRenderer.invoke(IPC.plugins.call, 'finishNotification', handleId, msg),
            cancel: () => ipcRenderer.invoke(IPC.plugins.call, 'cancelNotification', handleId),
          };
        });
    },
  };
}

/** tabs 命名空间——标签页操作 */
export function buildTabs(events: EventSystemApi) {
  // E5.8#1d EXEMPT：壳 preload-shell 镜像——双 preload 各持 window.linkdesk.* 契约（tabs 命名空间），无法共享
  /* jscpd:ignore-start */
  return {
    create: (type: string, opts?: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC.tabs.create, type, opts),
    openOrFocus: (type: string, opts?: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC.tabs.openOrFocus, type, opts),
    focus: (tabId: string) => ipcRenderer.invoke(IPC.tabs.focus, tabId),
    close: (tabId: string) => ipcRenderer.invoke(IPC.tabs.close, tabId),
    focusBySourceId: (sourceId: string) => ipcRenderer.invoke(IPC.tabs.focusBySourceId, sourceId),
    updateLabelBySourceId: (sourceId: string, label: string) =>
      ipcRenderer.invoke(IPC.tabs.updateLabelBySourceId, sourceId, label),
    closeBySourceId: (sourceId: string) => ipcRenderer.invoke(IPC.tabs.closeBySourceId, sourceId),
    // E5.6#11.5g3: autoReveal——文件树随标签页切换自动定位
    onDidChangeActiveTab: (cb: (data: { tabId: string; pluginId?: string; filePath?: string }) => void) => {
      return events.on('tab:activated', (d: TabActivatedPayload) => {
        try { cb(d as { tabId: string; pluginId?: string; filePath?: string }); } catch { /* contextBridge 回调静默失败 */ }
      });
    },
  };
  /* jscpd:ignore-end */
}

/** p2p 命名空间——插件间点对点 */
export function buildP2p() {
  // E5.8#1d EXEMPT：壳 preload-shell 镜像——双 preload 各持 window.linkdesk.* 契约（p2p 命名空间），无法共享
  /* jscpd:ignore-start */
  return {
    send: (target: string, channel: string, data: unknown) => {
      ipcRenderer.send(IPC.p2p.send, { target, channel, data });
    },
    on: (channel: string, cb: (data: unknown) => void) =>
      listenDirect(ipcRenderer, IPC.p2p.data, (d: { channel: string; data: unknown }) => {
        if (d.channel === channel) cb(d.data);
      }),
  };
  /* jscpd:ignore-end */
}

/**
 * dialog 命名空间——插件文件选择器/确认/警告（安全由主进程控制：原生对话框 + 文件存在校验）。
 * E5.7#73：openFile——插件文件选择器（E5.5#10q/E5.6#62 迁入）。
 * 与 open 同通道（主进程 dialog-handlers.ts IPC.dialog.open）；安全由主进程控制
 * （原生对话框 + 文件存在校验），返回用户选中路径，取消 → null。
 */
export function buildDialog() {
  return {
    confirm: (message: string): Promise<boolean> => ipcRenderer.invoke(IPC.dialog.confirm, message),
    alert: (message: string): Promise<void> => ipcRenderer.invoke(IPC.dialog.alert, message),
    open: (opts?: DialogOpenOptions): Promise<string | null> => ipcRenderer.invoke(IPC.dialog.open, opts),
    openFile: (opts?: {
      title?: string;
      filters?: { name: string; extensions: string[] }[];
      directory?: boolean;
    }): Promise<string | null> => ipcRenderer.invoke(IPC.dialog.open, opts),
  };
}
