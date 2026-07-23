/**
 * 终端会话管理——模块级单例 hook。
 * Phase 5.5c Step C1：会话 CRUD + 每会话 12 项收发设置 + session 标识色。
 *
 * 对标 ConfigurationService 模式——数据在 React 树外，侧栏 unmount 时状态不丢。
 * 对标卡片调色盘——per-instance CSS 变量 `--session-color`，6 色循环分配。
 * Phase 6 持久化（loadSessions/saveSessions → FileService）留给 Phase 6。
 *
 * 硬规则——每个字段只有一个写入入口（§3.12）：
 *   port/baudRate/protocol → ControlPanel
 *   12 项收发设置 → sidebar "收发设置" Section
 *   quickSends → QuickSendBar（主区）
 *   connected → SerialContext 派生（不独立 set）
 *   name → sidebar 会话列表 (F2 / hover ✎)
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ── 类型 ──

export interface TerminalSession {
  /** = tabId，一一对应。创建时自动生成 "terminal-{N}" */
  id: string;
  /** 用户可编辑的会话名。新建时传入，侧栏 F2/hover ✎ 改名 */
  name: string;
  /** COM 口名称。"" = 未选。唯一写入入口：ControlPanel */
  port: string;
  /** 波特率。唯一写入入口：ControlPanel */
  baudRate: string;
  /** 协议插件 ID。唯一写入入口：ControlPanel */
  protocol: string;
  /**
   * 连接状态——从 SerialContext 派生，不独立 set。
   * 规则：SerialContext.state.isOpen && SerialContext.state.portName === session.port
   */
  connected: boolean;

  // ── 12 项收发设置——每会话独立 ──

  timestampFormat: string;
  showEcho: boolean;
  showLineNumbers: boolean;
  separateSystemLog: boolean;
  lineEnding: string;
  autoRepeat: boolean;
  repeatInterval: number;
  autoClear: boolean;
  receiveMode: string;
  receiveCoding: string;
  sendMode: string;
  sendCoding: string;

  /** 快捷发送——按会话。唯一写入入口：QuickSendBar */
  quickSends: Record<string, string>;

  /** Session 标识色——per-instance CSS 变量 `--session-color`。对标 `--card-accent` */
  color: string;
}

// ── 默认值 ──

const DEFAULT_SESSION: Omit<TerminalSession, "id" | "name" | "color"> = {
  port: "",
  baudRate: "115200",
  protocol: "bracket",
  connected: false,
  timestampFormat: "HH:mm:ss:fff",
  showEcho: true,
  showLineNumbers: true,
  separateSystemLog: true,
  lineEnding: "\\r\\n",
  autoRepeat: false,
  repeatInterval: 1000,
  autoClear: false,
  receiveMode: "text",
  receiveCoding: "UTF-8",
  sendMode: "text",
  sendCoding: "UTF-8",
  quickSends: { "AT": "AT\\r\\n" },
};

// ── Session 标识色调色盘 ──
// 对标卡片调色盘（memory custom-accent-colors §卡片调色盘）。
// 每个新 session 自动分配下一个颜色，循环使用。

const SESSION_COLORS = [
  "#22C55E", // 绿
  "#3B82F6", // 蓝
  "#F59E0B", // 琥珀
  "#A855F7", // 紫
  "#06B6D4", // 青
  "#EC4899", // 粉
];

// ── 模块级单例状态 ──
// 不在 React 树上——对标 ConfigurationService。侧栏切到别的插件时 unmount 但状态不丢。

let _sessions: TerminalSession[] = [];
let _activeSessionId: string | null = null;
let _sessionCounter = 0;
let _colorIndex = 0;
const _listeners = new Set<() => void>();

function notify(): void {
  _listeners.forEach((fn) => fn());
}

/** 深度克隆默认值——防止多个 session 共享同一个 quickSends 对象引用 */
function cloneDefaults(): typeof DEFAULT_SESSION {
  return {
    ...DEFAULT_SESSION,
    quickSends: { ...DEFAULT_SESSION.quickSends },
  };
}

// ── Hook ──

export function useTerminalSessions() {
  const [, tick] = useState(0);

  useEffect(() => {
    const rerender = () => tick((n) => n + 1);
    _listeners.add(rerender);
    return () => {
      _listeners.delete(rerender);
    };
  }, []);

  return {
    /** 所有会话（不可直接 mutate——用 updateSession） */
    sessions: _sessions,

    /** 当前选中会话的 ID */
    activeSessionId: _activeSessionId,

    /** 当前选中会话——派生值，响应式更新 */
    get activeSession(): TerminalSession | null {
      return _sessions.find((s) => s.id === _activeSessionId) ?? null;
    },

    // ── CRUD ──

    /** 新建会话——返回新 session（id=tabId，已自动设为活跃）。
     *  Phase 5.5c C5：可选 id 参数——sidebar 先 createTab 拿到 tabId 再传入，确保 session.id === tab.id */
    createSession(name: string, id?: string): TerminalSession {
      const session: TerminalSession = {
        id: id || `terminal-${++_sessionCounter}`, // `||` 而非 `??`——空字符串也视为无效，自动生成新 ID
        name,
        ...cloneDefaults(),
        color: SESSION_COLORS[_colorIndex % SESSION_COLORS.length],
      };
      _colorIndex++;
      _sessions = [..._sessions, session];
      _activeSessionId = session.id;
      notify();
      return session;
    },

    /** 删除会话——自动重选相邻会话（如果删除的是当前活跃） */
    removeSession(id: string): void {
      _sessions = _sessions.filter((s) => s.id !== id);
      if (_activeSessionId === id) {
        _activeSessionId = _sessions.length > 0 ? _sessions[0].id : null;
      }
      notify();
    },

    /** 部分更新会话字段——浅合并（§3.12：每个字段只有一个写入入口，但底层都走这一个函数） */
    updateSession(id: string, patch: Partial<TerminalSession>): void {
      _sessions = _sessions.map((s) =>
        s.id === id ? { ...s, ...patch } : s,
      );
      notify();
    },

    /** 切换活跃会话 */
    setActiveSession(id: string | null): void {
      _activeSessionId = id;
      notify();
    },

    /** 重置所有状态——供插件 onWillUninstall 调用 */
    resetAll(): void {
      _sessions = [];
      _activeSessionId = null;
      _sessionCounter = 0;
      _colorIndex = 0;
      notify();
    },
  };
}

// ── Per-Tab Session Hook（C1 修复） ──
// 主区 TerminalView / ControlPanel 用此 hook 绑定到自己的 session，
// 而非读全局 activeSession。sourceId = tab.id = session.id。

export function useSession(id: string | undefined) {
  const [, tick] = useState(0);

  useEffect(() => {
    const rerender = () => tick((n) => n + 1);
    _listeners.add(rerender);
    return () => {
      _listeners.delete(rerender);
    };
  }, []);

  // B3：F5 刷新 → 标签页恢复但 session 丢失 → 首次 mount 自动创建。
  // didAutoCreate ref 确保只在组件首次挂载时检查一次，不会在 keep-alive 期间重复创建。
  const didAutoCreate = useRef(false);
  useEffect(() => {
    if (!didAutoCreate.current && id && !_sessions.find((s) => s.id === id)) {
      didAutoCreate.current = true;
      const session: TerminalSession = {
        id,
        name: `会话`,
        ...cloneDefaults(),
        color: SESSION_COLORS[_colorIndex % SESSION_COLORS.length],
      };
      _colorIndex++;
      _sessions = [..._sessions, session];
      notify();
    }
  }, [id]);

  const session = id ? (_sessions.find((s) => s.id === id) ?? null) : null;

  const update = useCallback(
    (patch: Partial<TerminalSession>) => {
      if (id) {
        _sessions = _sessions.map((s) =>
          s.id === id ? { ...s, ...patch } : s,
        );
        notify();
      }
    },
    [id],
  );

  return { session, update } as const;
}

// ── 模块级 getter（非 React 上下文使用） ──
// Tauri event handler、生命周期回调等不在组件内的代码用这些函数读状态。
// 对标 _receiveMode 模块级变量模式——已验证可行。

/** 获取当前活跃 session ID——不通过 hook，供 Tauri event handler 使用 */
export function getActiveSessionId(): string | null {
  return _activeSessionId;
}

/** 设置活跃 session ID——不通过 hook，供 TerminalView 标签页聚焦时同步侧栏 */
export function setActiveSessionId(id: string | null): void {
  _activeSessionId = id;
  notify();
}

/** 按 ID 查 session——不通过 hook，供非 React 上下文使用 */
export function getSessionById(id: string): TerminalSession | undefined {
  return _sessions.find((s) => s.id === id);
}

/** 按 ID 更新 session——不通过 hook，供非 React 上下文使用 */
export function updateSessionById(id: string, patch: Partial<TerminalSession>): void {
  _sessions = _sessions.map((s) =>
    s.id === id ? { ...s, ...patch } : s,
  );
  notify();
}

export default useTerminalSessions;
