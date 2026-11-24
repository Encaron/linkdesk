/**
 * fileAssociation 契约面共享工厂——壳/池两个 preload 的同形方法（T2 第 3 波 ＋ 2026-11-24 A6）。
 *
 * 🔴 为什么抽出来：jscpd 门禁抓过「同几个箭头函数在 preload-shell 与 namespaces-data 各写一份」
 * 的克隆（0.2.47 实测红）。双端同一契约面 ⇒ 实现也单源——形状变更只改这里。
 * `onSecondContender` 不在共享面（壳内私有扩展，池侧无消费者），留在壳侧字面量旁。
 *
 * 2026-11-24 A6：`getOverrides`（只读快照）＋ `onDidChangeOverrides`（订阅）——UI 插件不再读
 * 宿主配置键 `workbench.fileAssociations`；变更事件到达后**重读快照**再回调（推归一化数据，
 * ⛔ 不把宿主键/原始表形状漏给插件）。
 */

import type { IpcRenderer } from 'electron';
import { IPC } from './channels';
import type { EventSystemApi } from './event-system';
import { FILE_ASSOCIATION_OVERRIDES_CHANGED } from '../../src/core/types/ipc/fileAssociationEvents';
import type {
  FileAssociationOverrides,
  FileHandlerCandidate,
} from '../../src/core/api/linkdesk-api/editor';

export function buildFileAssociationFace(ipcRenderer: IpcRenderer, events: EventSystemApi) {
  return {
    getPluginFor: (ext: string): Promise<string | undefined> =>
      ipcRenderer.invoke(IPC.fileAssociation.getPluginFor, ext),
    // C1.8：`title`（**插件**名，行/下拉主标签）与 `displayName`（**文件类型**名）是两个字段。
    listHandlersFor: (ext: string): Promise<FileHandlerCandidate[]> =>
      ipcRenderer.invoke(IPC.fileAssociation.listHandlersFor, ext),
    /** 2026-11-24（A6）：覆盖表只读快照——`ext → pluginId`，无覆盖 = 空表 */
    getOverrides: (): Promise<FileAssociationOverrides> =>
      ipcRenderer.invoke(IPC.fileAssociation.getOverrides),
    /** 2026-11-24（A6）：覆盖表变更订阅——事件到达后重读快照（归一化后回调） */
    onDidChangeOverrides: (cb: (overrides: FileAssociationOverrides) => void): (() => void) =>
      events.on(FILE_ASSOCIATION_OVERRIDES_CHANGED, (payload: { overrides?: FileAssociationOverrides } | undefined) => {
        const table = payload?.overrides;
        try {
          if (table) cb(table);
        } catch {
          /* contextBridge 回调静默失败 */
        }
      }),
    setDefault: (ext: string, pluginId: string | null): Promise<void> =>
      ipcRenderer.invoke(IPC.fileAssociation.setDefault, ext, pluginId),
    /** E32/E34：一次写 N 类（`pluginId: null` = 逐类恢复自动）——聚合格下拉/齿轮的批量口径 */
    setDefaultBulk: (exts: string[], pluginId: string | null): Promise<void> =>
      ipcRenderer.invoke(IPC.fileAssociation.setDefaultBulk, exts, pluginId),
  };
}
