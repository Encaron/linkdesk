/**
 * 活动会话 / 按 id 取会话——E6#87b 从 hooks/useSerialSessions.ts 搬出（只搬不改）。
 * 模块级 getter——非 React 环境（命令 handler / beforeClose）消费。
 */

import type { SerialSession } from "./types";
import { _notify, _store } from "./store";

export function getActiveSessionId(): string | null { return _store.activeSessionId; }
export function setActiveSessionId(id: string | null): void { _store.activeSessionId = id; _notify(); }
export function getSessionById(id: string): SerialSession | undefined { return _store.sessions.find((s) => s.id === id); }
export function updateSessionById(id: string, patch: Partial<SerialSession>): void { _store.sessions = _store.sessions.map((s) => s.id === id ? { ...s, ...patch } : s); _notify(); }
