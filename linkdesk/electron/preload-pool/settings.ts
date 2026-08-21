/**
 * Pool preload 设置套域——settings 命名空间（E5.8#41.12）。
 * 设置 UI 在池内渲染——设置套枚举/切换全量经此面走 IPC（plugins:call 方法分发）→
 * 壳 IpcBridgeHandler/settings 域（FactorySlots 槽位 + 活动持久化 + loader title 解析）。
 * 依赖方向：settings → electron/ipc（channels）；无反向。
 */

import { ipcRenderer } from 'electron';
import { IPC } from '../ipc/channels';

/** settings 命名空间——factoryRole:"settings" 多套并存时的查询/切换面（#41.12）。
 * 返回不标注——ipcRenderer.invoke 推断 Promise<any>，assignable 到契约面（satisfies PoolExposed 门禁） */
export function buildSettings() {
  return {
    /** 全部声明 factoryRole:"settings" 的设置套 [{pluginId, title}]，注册序 */
    list: () => ipcRenderer.invoke(IPC.plugins.call, 'listSettingsPlugins'),
    /** 当前活动设置套 ID——读持久化激活，无记录/已卸载回退默认（内置） */
    getActive: () => ipcRenderer.invoke(IPC.plugins.call, 'getActiveSettingsPlugin'),
    /** 切换活动设置套——校验候选后落盘持久化（重启保持）；非候选 fail-loud 抛错 */
    setActive: (pluginId: string) => ipcRenderer.invoke(IPC.plugins.call, 'setActiveSettingsPlugin', pluginId),
  };
}
