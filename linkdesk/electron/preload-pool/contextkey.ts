/**
 * Pool preload ContextKey 域——本地同步 store + contextKey 命名空间。
 * E5.8#0d.10-4c：自 preload-pool.ts 拆出——IPC 回路延迟致键盘分发读不到最新值，
 * 池侧本地镜像 store（E5#19b fix）+ set 同步写壳 + _getValue 本地直读。
 * 依赖方向：contextkey → electron/ipc（channels）；无反向。
 */

import { ipcRenderer } from 'electron';
import { IPC } from '../ipc/channels';

// ── E5#19b fix: ContextKey 本地同步 store——IPC 回路延迟致键盘分发读不到最新值 ──
const _contextKeyStore = new Map<string, unknown>();
ipcRenderer.on(IPC.contextKey.changed, (_event, { key, value }: { key: string; value: unknown }) => {
  _contextKeyStore.set(key, value);
});

/** contextKey 命名空间——本地镜像 + 壳写 + 壳推同步（_getValue 仅供池内消费） */
export function buildContextKey() {
  return {
    set: (key: string, value: unknown) => {
      _contextKeyStore.set(key, value);
      // E5.8 回归 bug 修复：必须 return invoke Promise——合同 linkdesk-api.ts 声明 set(): Promise<void>，
      // 不 return 则插件 `contextKey.set(...).catch()` 抛 reading 'catch'（E5.8#47 串口 sourceOpen 触发）。
      return ipcRenderer.invoke(IPC.contextKey.set, key, value);
    },
    _getValue: (key: string) => _contextKeyStore.get(key),
  };
}
