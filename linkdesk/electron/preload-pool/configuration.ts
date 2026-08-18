/**
 * Pool preload 配置域——_configCache 本地缓存 + configuration/config 命名空间。
 * E5.8#0d.10-4b：自 preload-pool.ts 拆出——settings 在池内渲染（E5.7#44 壳侧 configuration 面已删），
 * 全量经此面走 IPC；配置缓存防 React mount 前事件竞态（E5.5#7a）。
 * 依赖方向：configuration → electron/ipc（channels/event-system type）+ src/core/types（type）；无反向。
 */

import { ipcRenderer } from 'electron';
import { IPC } from '../ipc/channels';
import type { EventSystemApi } from '../ipc/event-system';
import type { ConfigurationChangedPayload, SettingsRequestGroupPayload, SettingsScrollToPayload, PluginPushEnvelope } from '../../src/core/types/ipc/events';

// ── E5.5#7a: 配置缓存——防 React mount 前事件竞态 ──
const _configCache = new Map<string, unknown>();
ipcRenderer.on(IPC.plugin.push, (_event, data: PluginPushEnvelope) => {
  if (data?.channel === IPC.config.changed) {
    const { key, value } = data.payload as ConfigurationChangedPayload;
    _configCache.set(key, value);
  }
});

/** configuration/config 命名空间——通用面 get/set/getSchema/onChange + 设置页专用 9 方法 */
export function buildConfiguration(events: EventSystemApi) {
  // ── 配置对象——settings 在池内渲染（E5.7#44：壳侧 configuration 面已删），全量经此面走 IPC ──
  // 通用面 get/set/getSchema/onChange；设置页专用 9 方法见下方 E5.7#76 分隔标注。
  return {
    get: (key: string) => ipcRenderer.invoke(IPC.config.get, key),
    set: (key: string, v: unknown) => ipcRenderer.invoke(IPC.config.set, key, v),
    getSchema: (key?: string) => ipcRenderer.invoke(IPC.plugins.call, 'getSchema', key),
    onChange: (key: string, cb: (v: unknown) => void) => {
      if (key && _configCache.has(key)) {
        try { cb(_configCache.get(key)); } catch { /* contextBridge 回调静默失败 */ }
      }
      return events.on(IPC.config.changed, (d: ConfigurationChangedPayload) => {
        const { key: k, value } = d;
        if (!key || k === key) cb(value);
      });
    },
    // ══ E5.7#76（E5.5#10r/E5.6#65 迁入）：以下 9 个方法为设置页专用
    // （SettingsView 渲染/实时刷新/插件生命周期联动/跳转到分组/跳转到具体配置项）。
    // 通用插件请用上面的 get/set/getSchema/onChange。 ══
    getConfigurationContributions: (): Promise<[string, unknown][]> =>
      ipcRenderer.invoke(IPC.plugins.call, 'getConfigurationContributions'),
    inspectConfiguration: (key: string): Promise<unknown> =>
      ipcRenderer.invoke(IPC.plugins.call, 'inspectConfiguration', key),
    getUserSettings: (): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke(IPC.plugins.call, 'getUserSettings'),
    onDidChangeConfiguration: (cb: (key: string, value: unknown) => void) => {
      return events.on(IPC.config.changed, (d: ConfigurationChangedPayload) => {
        const { key: k, value } = d;
        try { cb(k, value); } catch { /* contextBridge 回调静默失败 */ }
      });
    },
    onPluginLifecycleChange: (cb: () => void) => {
      return events.on('plugin-lifecycle:changed', () => {
        try { cb(); } catch { /* contextBridge 回调静默失败 */ }
      });
    },
    consumeSettingsGroup: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.plugins.call, 'consumeSettingsGroup'),
    onRequestSettingsGroup: (cb: (pluginId: string) => void) => {
      return events.on('settings:requestGroup', (d: SettingsRequestGroupPayload) => {
        try { cb(d.pluginId); } catch { /* contextBridge 回调静默失败 */ }
      });
    },
    consumeScrollToSetting: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.plugins.call, 'consumeScrollToSetting'),
    onRequestScrollToSetting: (cb: (key: string) => void) => {
      return events.on('settings:scrollTo', (d: SettingsScrollToPayload) => {
        try { cb(d.key); } catch { /* contextBridge 回调静默失败 */ }
      });
    },
  };
}
