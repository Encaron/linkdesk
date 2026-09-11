/**
 * 会话快照恢复——E6#87b 从 hooks/useSerialSessions.ts 搬出（只搬不改）。
 *
 * 同步恢复（localStorage 立即填充）→ 异步覆盖（pluginState 权威）→ 订阅跨 WebView 广播。
 */

import {
  _applyStore, _lastLocalSnapshot, _readLocal, _sessionListeners,
  _writeLocal, setLastLocalSnapshot,
} from "./store";

let _initDone = false;

/** 同步恢复——localStorage 立即填充 */
function _restoreSync(): void { const d = _readLocal(); if (d) _applyStore(d); }

/** 异步更新——pluginState 覆盖 */
async function _restoreAsync(): Promise<void> {
  try {
    const psData = await window.linkdesk?.pluginState?.get("serial-monitor", "sessions") as Record<string, unknown> | undefined;
    if (psData?.sessions) { _applyStore(psData); _writeLocal(); _sessionListeners.forEach((fn) => fn()); }
  } catch { /* 静默 */ }
}

/** E5#71f：幂等——任一 hook 首次 mount 时执行一次 */
export function _ensureInit(): void {
  if (_initDone) return;
  _initDone = true;
  _restoreSync();
  _restoreAsync();

  // E5#84f：订阅跨 WebView 状态变更——壳侧栏和插件主区通过 events 广播保持 _store 同步
  try {
    window.linkdesk?.events?.on("serial:storeChanged", (data: Record<string, unknown>) => {
      const snap = JSON.stringify(data);
      if (snap === _lastLocalSnapshot) return; // 自己发的广播回来了——跳过
      setLastLocalSnapshot(snap);
      _applyStore(data);
      _sessionListeners.forEach((fn) => fn());
    });
  } catch { /* events 不可用 */ }
}
