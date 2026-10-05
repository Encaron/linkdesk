/**
 * fileAssociation 契约面共享工厂——壳/池两个 preload 的同形三方法（T2 · 第 3 波）。
 *
 * 🔴 为什么抽出来：jscpd 门禁抓过「同三个箭头函数在 preload-shell 与 namespaces-data 各写一份」
 * 的 8 行克隆（0.2.47 实测红）。双端同一契约面 ⇒ 实现也单源——形状变更只改这里。
 * `onSecondContender` 不在共享面（壳内私有扩展，池侧无消费者），留在壳侧字面量旁。
 */

import type { IpcRenderer } from 'electron';
import { IPC } from './channels';

export function buildFileAssociationFace(ipcRenderer: IpcRenderer) {
  return {
    getPluginFor: (ext: string): Promise<string | undefined> =>
      ipcRenderer.invoke(IPC.fileAssociation.getPluginFor, ext),
    listHandlersFor: (
      ext: string,
    ): Promise<Array<{ pluginId: string; displayName: string; isCurrent: boolean }>> =>
      ipcRenderer.invoke(IPC.fileAssociation.listHandlersFor, ext),
    setDefault: (ext: string, pluginId: string | null): Promise<void> =>
      ipcRenderer.invoke(IPC.fileAssociation.setDefault, ext, pluginId),
  };
}
