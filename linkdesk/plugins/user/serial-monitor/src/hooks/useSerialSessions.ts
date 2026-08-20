/**
 * 串口监视器会话管理——模块级单例 hook。
 * Phase 5.5c Step C1：会话 CRUD + 每会话 12 项收发设置 + session 标识色。
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

import { useState, useEffect, useCallback, useRef } from "react";

// ── 类型 ──

export interface SerialSession {
  id: string; name: string; port: string; baudRate: string;
  // E5.8#30.17：帧格式（数据位/停止位/校验）——命令条 8N1 + 校验选择器，openPort 时透传
  dataBits: number; stopBits: number; parity: string;
  // E5.8#30.18：握手信号 DTR/RTS 初始电平（per-COM，侧栏「握手信号」group）——打开时应用 + 运行中切换直发
  dtr: boolean; rts: boolean;
  // E5.8#30.19a：接收区 HEX+ASCII 双栏渲染开关（per-COM，侧栏「显示」group）——开 = 接收区并排 HEX/ASCII 两栏
  hexAsciiDualPane: boolean;
  // E5.8#30.19b：不可见字符转义开关（per-COM，侧栏「显示」group）——`\n`/`\r`/`\t` 等显示为可见符号
  escapeInvisibleChars: boolean;
  // E5.8#30.20：自动保存接收区开关（per-COM，侧栏「显示」group）——端口关闭 + 应用退出时落盘，防数据丢失
  autoSaveReceive: boolean;
  // E5.8#30.21：打开即发初始化序列开关（per-COM，侧栏「发送行为」group）——打开端口自动发送 quickSends 序列（归一化复用，不新建平行概念）
  sendInitOnOpen: boolean;
  connected: boolean; timestampFormat: string; showEcho: boolean;
  showLineNumbers: boolean; separateSystemLog: boolean; lineEnding: string;
  autoRepeat: boolean; repeatInterval: number; autoClear: boolean;
  receiveMode: string; receiveCoding: string; sendMode: string; sendCoding: string;
  quickSends: Record<string, string>; color: string;
}

const DEFAULT_SESSION: Omit<SerialSession, "id" | "name" | "color"> = {
  port: "", baudRate: "115200", dataBits: 8, stopBits: 1, parity: "none",
  dtr: false, rts: false, hexAsciiDualPane: false, escapeInvisibleChars: false, autoSaveReceive: true, sendInitOnOpen: false, connected: false,
  timestampFormat: "HH:mm:ss:fff", showEcho: true, showLineNumbers: true,
  separateSystemLog: true, lineEnding: "\\r\\n", autoRepeat: false,
  repeatInterval: 1000, autoClear: false, receiveMode: "text",
  receiveCoding: "UTF-8", sendMode: "text", sendCoding: "UTF-8",
  quickSends: { "AT": "AT\\r\\n" },
};

// E5.8#6.6 hex 豁免：会话标签色板（颜色即数据——多会话轮换标签色）
// eslint-disable-next-line linkdesk/no-hardcoded-hex
const SESSION_COLORS = ["#22C55E","#3B82F6","#F59E0B","#A855F7","#06B6D4","#EC4899"];

// ── 模块级——跨组件共享缓存（E5#71f：不再 import PluginStateService）──

const _store = { sessions: [] as SerialSession[], activeSessionId: null as string | null, sessionCounter: 0, colorIndex: 0 };
const _listeners = new Set<() => void>();
let _initDone = false;
const STORAGE_KEY = "linkdesk:serial-monitor:sessions";

/** E5#84f：跨 WebView 同步——上次本地快照，用于去重（自己 emit 的广播回来时跳过） */
let _lastLocalSnapshot = "";

function _notify(): void {
  _persist();
  _listeners.forEach((fn) => fn());

  // E5#84f：跨 WebView 广播——壳侧栏 ↔ 插件主区状态同步
  const d = { sessions: _store.sessions, activeSessionId: _store.activeSessionId, sessionCounter: _store.sessionCounter, colorIndex: _store.colorIndex };
  const snap = JSON.stringify(d);
  if (snap !== _lastLocalSnapshot) {
    _lastLocalSnapshot = snap;
    try { window.linkdesk?.events?.emit("serial:storeChanged", d); } catch { /* events 不可用（测试环境等） */ }
  }
}

// ── 持久化：双重写入——pluginState（权威）+ localStorage（同步兜底）──

function _readLocal(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("linkdesk:terminal:sessions");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function _writeLocal(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions: _store.sessions, activeSessionId: _store.activeSessionId, sessionCounter: _store.sessionCounter, colorIndex: _store.colorIndex })); } catch { /* 静默 */ }
}
function _persist(): void {
  const d = { sessions: _store.sessions, activeSessionId: _store.activeSessionId, sessionCounter: _store.sessionCounter, colorIndex: _store.colorIndex };
  window.linkdesk?.pluginState?.set("serial-monitor", "sessions", d).catch((e) => { console.error("[serial-monitor] 保存会话失败:", e); });
  _writeLocal();
}

function _applyStore(raw: Record<string, unknown>): void {
  const s = raw.sessions; const a = raw.activeSessionId; const c = raw.sessionCounter; const cl = raw.colorIndex;
  if (Array.isArray(s)) _store.sessions = (s as SerialSession[]).map((x) => ({ ...x, connected: false }));
  if (typeof a === "string") _store.activeSessionId = a;
  if (typeof c === "number") _store.sessionCounter = c;
  if (typeof cl === "number") _store.colorIndex = cl;
}

/** 同步恢复——localStorage 立即填充 */
function _restoreSync(): void { const d = _readLocal(); if (d) _applyStore(d); }

/** 异步更新——pluginState 覆盖 */
async function _restoreAsync(): Promise<void> {
  try {
    const psData = await window.linkdesk?.pluginState?.get("serial-monitor", "sessions") as Record<string, unknown> | undefined;
    if (psData?.sessions) { _applyStore(psData); _writeLocal(); _listeners.forEach((fn) => fn()); }
  } catch { /* 静默 */ }
}

/** E5#71f：幂等——任一 hook 首次 mount 时执行一次 */
function _ensureInit(): void {
  if (_initDone) return;
  _initDone = true;
  _restoreSync();
  _restoreAsync();

  // E5#84f：订阅跨 WebView 状态变更——壳侧栏和插件主区通过 events 广播保持 _store 同步
  try {
    window.linkdesk?.events?.on("serial:storeChanged", (data: Record<string, unknown>) => {
      const snap = JSON.stringify(data);
      if (snap === _lastLocalSnapshot) return; // 自己发的广播回来了——跳过
      _lastLocalSnapshot = snap;
      _applyStore(data);
      _listeners.forEach((fn) => fn());
    });
  } catch { /* events 不可用 */ }
}

function cloneDefaults(): typeof DEFAULT_SESSION { return { ...DEFAULT_SESSION, quickSends: { ...DEFAULT_SESSION.quickSends } }; }

// ── Hook ──

export function useSerialSessions() {
  const [, tick] = useState(0);
  useEffect(() => { _ensureInit(); const r = () => tick((n) => n + 1); _listeners.add(r); return () => { _listeners.delete(r); }; }, []);
  return {
    sessions: _store.sessions, activeSessionId: _store.activeSessionId,
    get activeSession(): SerialSession | null { return _store.sessions.find((s) => s.id === _store.activeSessionId) ?? null; },
    createSession(name: string, id?: string): SerialSession {
      const session: SerialSession = { id: id || `serial-monitor-${++_store.sessionCounter}`, name, ...cloneDefaults(), color: SESSION_COLORS[_store.colorIndex % SESSION_COLORS.length] };
      _store.colorIndex++; _store.sessions = [..._store.sessions, session]; _store.activeSessionId = session.id; _notify(); return session;
    },
    removeSession(id: string): void { _store.sessions = _store.sessions.filter((s) => s.id !== id); if (_store.activeSessionId === id) _store.activeSessionId = _store.sessions.length > 0 ? _store.sessions[0].id : null; _notify(); },
    updateSession(id: string, patch: Partial<SerialSession>): void { _store.sessions = _store.sessions.map((s) => s.id === id ? { ...s, ...patch } : s); _notify(); },
    setActiveSession(id: string | null): void { _store.activeSessionId = id; _notify(); },
    resetAll(): void { _store.sessions = []; _store.activeSessionId = null; _store.sessionCounter = 0; _store.colorIndex = 0; _notify(); },
  };
}

// ── Per-Tab Session Hook ──

export function useSession(id: string | undefined) {
  const [, tick] = useState(0);
  useEffect(() => { _ensureInit(); const r = () => tick((n) => n + 1); _listeners.add(r); return () => { _listeners.delete(r); }; }, []);
  const didAutoCreate = useRef(false);
  useEffect(() => {
    if (!didAutoCreate.current && id && !_store.sessions.find((s) => s.id === id)) {
      didAutoCreate.current = true;
      const session: SerialSession = { id, name: `会话`, ...cloneDefaults(), color: SESSION_COLORS[_store.colorIndex % SESSION_COLORS.length] };
      _store.colorIndex++; _store.sessions = [..._store.sessions, session]; _notify();
    }
  }, [id]);
  const session = id ? (_store.sessions.find((s) => s.id === id) ?? null) : null;
  const update = useCallback((patch: Partial<SerialSession>) => { if (id) { _store.sessions = _store.sessions.map((s) => s.id === id ? { ...s, ...patch } : s); _notify(); } }, [id]);
  return { session, update } as const;
}

// ── 模块级 getter ──

export function getActiveSessionId(): string | null { return _store.activeSessionId; }
export function setActiveSessionId(id: string | null): void { _store.activeSessionId = id; _notify(); }
export function getSessionById(id: string): SerialSession | undefined { return _store.sessions.find((s) => s.id === id); }
export function updateSessionById(id: string, patch: Partial<SerialSession>): void { _store.sessions = _store.sessions.map((s) => s.id === id ? { ...s, ...patch } : s); _notify(); }

export default useSerialSessions;
