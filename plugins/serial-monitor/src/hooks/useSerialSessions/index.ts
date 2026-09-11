/**
 * 会话管理门面——E6#87b：原 hooks/useSerialSessions.ts（180 行）拆为同名夹。
 * 消费方 import 路径零变更（`hooks/useSerialSessions` 解析到本文件）。
 *
 * 子模块：
 *   types.ts            —— SerialSession / DEFAULT_SESSION / 色板 / cloneDefaults
 *   store.ts            —— 🔴 模块级 mutable 单一属主（_store / _sessionListeners / _lastLocalSnapshot）+ 持久化写入
 *   persist.ts          —— 快照恢复（localStorage 同步 → pluginState 异步 → 跨 WebView 广播订阅）
 *   useSerialSessions.ts—— useSerialSessions / useSession
 *   getters.ts          —— 模块级 getter（非 React 环境消费）
 */

export type { SerialSession } from "./types";
export { useSerialSessions, useSession } from "./useSerialSessions";
export { getActiveSessionId, setActiveSessionId, getSessionById, updateSessionById } from "./getters";

import { useSerialSessions } from "./useSerialSessions";
export default useSerialSessions;
