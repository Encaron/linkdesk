/**
 * 会话 hook——E6#87b 从 hooks/useSerialSessions.ts 搬出（只搬不改）。
 * 模块级单例 + 订阅；数据模型见 types.ts，可变属主与持久化见 store.ts / persist.ts。
 *
 * Phase 5.5c Step C1：会话 CRUD + 每会话 12 项收发设置 + session 标识色。
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { SerialSession } from "./types";
import { cloneDefaults, SESSION_COLORS } from "./types";
import { _notify, _sessionListeners, _store } from "./store";
import { _ensureInit } from "./persist";

export function useSerialSessions() {
  const [, tick] = useState(0);
  useEffect(() => { _ensureInit(); const r = () => tick((n) => n + 1); _sessionListeners.add(r); return () => { _sessionListeners.delete(r); }; }, []);
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
  useEffect(() => { _ensureInit(); const r = () => tick((n) => n + 1); _sessionListeners.add(r); return () => { _sessionListeners.delete(r); }; }, []);
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
