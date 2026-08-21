/**
 * Pool preload 系统插槽域——factorySlots 命名空间（E5.8#41.14）。
 * 设置 UI 在池内渲染——候选枚举/活动切换全量经此面走 IPC（plugins:call 方法分发）→
 * 壳 IpcBridgeHandler/factory-slots 域（FactorySlots 槽位 + 活动持久化 + loader title 解析）。
 * 槽位无关：list/getActive/setActive 收 role 参数——串口/市场/设置同源。
 * 依赖方向：factory-slots → electron/ipc（channels）；无反向。
 */

import { ipcRenderer } from 'electron';
import { IPC } from '../ipc/channels';

/** factorySlots 命名空间——任意 factoryRole 候选枚举/切换（#41.14）。
 * 返回不标注——ipcRenderer.invoke 推断 Promise<any>，assignable 到契约面（satisfies PoolExposed 门禁） */
export function buildFactorySlots() {
  return {
    /** 全部声明指定 factoryRole 的候选插件 [{pluginId, title}]，注册序 */
    list: (role: string) => ipcRenderer.invoke(IPC.plugins.call, 'listFactorySlotPlugins', role),
    /** 指定角色的活动插件 ID——读持久化激活，无记录/已卸载回退默认（内置） */
    getActive: (role: string) => ipcRenderer.invoke(IPC.plugins.call, 'getActiveFactorySlot', role),
    /** 切换指定角色活动插件——校验候选后落盘持久化（重启保持）；非候选 fail-loud 抛错 */
    setActive: (role: string, pluginId: string) => ipcRenderer.invoke(IPC.plugins.call, 'setActiveFactorySlot', role, pluginId),
  };
}
