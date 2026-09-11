/**
 * 会话表模块级单例 + 持久化写入——E6#87b 从 hooks/useSerialSessions.ts 搬出（只搬不改）。
 *
 * 🔴 单一属主：`_store`（会话表全部可变字段）/ `_sessionListeners` / `_lastLocalSnapshot` /
 *    `_initDone`（在 persist.ts）**只在本夹声明**。跨文件读写一律经本文件导出的 handle——
 *    拆完 grep `const _store =` 全仓应恰好一处。
 *
 * E5#71f 重写：零 import PluginStateService。localStorage 同步初始化 + pluginState 异步更新。
 * 两个 WebView（壳侧栏、插件主区）各自加载本模块——localStorage 保证 mount 时数据已就绪，
 * pluginState 异步更新保证跨 WebView 一致性。
 *
 * 硬规则——每个字段只有一个写入入口（§3.12）：
 *   port/baudRate/帧格式（8N1/校验） → ControlPanel
 *   12 项收发设置 → sidebar "收发设置" Section
 *   quickSends → QuickSendBar（主区）
 *   connected → SerialContext 派生（不独立 set）
 *   name → sidebar 会话列表 (F2 / hover ✎)
 */

import type { SerialSession } from "./types";

/** 🔴 单一属主——会话表全部可变字段都在这里。跨文件读写一律经本 handle（公开 accessor）。 */
export const _store = { sessions: [] as SerialSession[], activeSessionId: null as string | null, sessionCounter: 0, colorIndex: 0 };

export const _sessionListeners = new Set<() => void>();
export const STORAGE_KEY = "linkdesk:serial-monitor:sessions";

/** E5#84f：跨 WebView 同步——上次本地快照，用于去重（自己 emit 的广播回来时跳过） */
export let _lastLocalSnapshot = "";

export function setLastLocalSnapshot(snap: string): void { _lastLocalSnapshot = snap; }

export function _notify(): void {
  _persist();
  _sessionListeners.forEach((fn) => fn());

  // E5#84f：跨 WebView 广播——壳侧栏 ↔ 插件主区状态同步
  const d = { sessions: _store.sessions, activeSessionId: _store.activeSessionId, sessionCounter: _store.sessionCounter, colorIndex: _store.colorIndex };
  const snap = JSON.stringify(d);
  if (snap !== _lastLocalSnapshot) {
    _lastLocalSnapshot = snap;
    try { window.linkdesk?.events?.emit("serial:storeChanged", d); } catch { /* events 不可用（测试环境等） */ }
  }
}

// ── 持久化：双重写入——pluginState（权威）+ localStorage（同步兜底）──

export function _readLocal(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("linkdesk:terminal:sessions");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function _writeLocal(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions: _store.sessions, activeSessionId: _store.activeSessionId, sessionCounter: _store.sessionCounter, colorIndex: _store.colorIndex })); } catch { /* 静默 */ }
}

export function _persist(): void {
  const d = { sessions: _store.sessions, activeSessionId: _store.activeSessionId, sessionCounter: _store.sessionCounter, colorIndex: _store.colorIndex };
  window.linkdesk?.pluginState?.set("serial-monitor", "sessions", d).catch((e) => { console.error("[serial-monitor] 保存会话失败:", e); });
  _writeLocal();
}

export function _applyStore(raw: Record<string, unknown>): void {
  const s = raw.sessions; const a = raw.activeSessionId; const c = raw.sessionCounter; const cl = raw.colorIndex;
  if (Array.isArray(s)) _store.sessions = (s as SerialSession[]).map((x) => ({ ...x, connected: false }));
  if (typeof a === "string") _store.activeSessionId = a;
  if (typeof c === "number") _store.sessionCounter = c;
  if (typeof cl === "number") _store.colorIndex = cl;
}
