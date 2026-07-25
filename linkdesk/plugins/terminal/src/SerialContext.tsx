/**
 * 终端插件的 SerialContext——IPC 版本（E3a #30）。
 *
 * E2b #7 时是薄封装层：useSerialContext → useSourceState → React Context → App.tsx Provider。
 * E3a 多 WebView：终端在自己的 WebView 中运行，无法访问壳的 React Context。
 * 改为直接 IPC——window.linkdesk.serial.* 调用壳侧 serial-service。
 *
 * 🔥 关键：模块级共享状态——替代 React Context 的跨组件共享。
 * 每个 useSerialContext() 共享同一份 state，任意组件调 actions 所有组件都重渲染。
 * 🔥 B86 预防：sourceName/baudRate 用 ref 桥接——ControlPanel 先 setSourceName
 *   再 toggleOpen（同事件循环），闭包里的 state 还没更新（React 异步 setState）。
 */

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";

// ── 类型（与 SourceStateContext 内联——避免跨模块依赖）──

interface PortInfo { name: string; description: string; }

interface SerialState {
  ports: PortInfo[];
  sourceName: string;
  baudRate: string;
  isOpen: boolean;
  txBytes: number;
  rxBytes: number;
  lastError: string | null;
}

interface SerialActions {
  toggleOpen: (encoding?: string) => Promise<void>;
  setSourceName: (name: string, encoding?: string) => Promise<void>;
  setBaudRate: (baud: string, encoding?: string) => Promise<void>;
}

// ═══════════════════════════════════════════════════════
// 模块级共享状态——替代 React Context 的跨组件共享
// ═══════════════════════════════════════════════════════

let _sharedState: SerialState = {
  ports: [],
  sourceName: "",
  baudRate: "115200",
  isOpen: false,
  txBytes: 0,
  rxBytes: 0,
  lastError: null,
};

const _listeners = new Set<() => void>();

function _setState(updater: (p: SerialState) => SerialState): void {
  _sharedState = updater(_sharedState);
  for (const fn of _listeners) fn();
}

function _getState(): SerialState {
  return _sharedState;
}

function _subscribe(cb: () => void): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

// serial-service getStatus() 返回 portName，终端状态用 sourceName——做 key 映射
function mergeStatus(p: SerialState, status: any): SerialState {
  return {
    ...p,
    sourceName: status.portName ?? p.sourceName,
    baudRate: status.baudRate ?? p.baudRate,
    isOpen: status.isOpen ?? p.isOpen,
    txBytes: status.txBytes ?? p.txBytes,
    rxBytes: status.rxBytes ?? p.rxBytes,
    lastError: status.lastError ?? p.lastError,
  };
}

// 标记是否已初始化（只跑一次 IPC 订阅）
let _initialized = false;

function _initIPC(): void {
  if (_initialized) return;
  _initialized = true;

  const s = (window as any).linkdesk?.serial;
  if (!s) return;

  // 初始加载——拉取端口列表 + 串口状态
  const listPorts = s.listPorts ?? s.getPorts;
  listPorts?.()?.then((ports: PortInfo[]) => {
    if (ports) _setState((p) => ({ ...p, ports }));
  });
  s.getStatus?.()?.then((status: any) => {
    if (status) _setState((p) => mergeStatus(p, status));
  });

  // 订阅——tx/rx 统计累加（对标 App.tsx useIpcEvent("serial-stats")）
  s.onStats?.((stats: any) => {
    _setState((p) => ({
      ...p,
      txBytes: p.txBytes + (stats.tx ?? 0),
      rxBytes: p.rxBytes + (stats.rx ?? 0),
    }));
  });

  // 订阅——系统消息（错误等）
  s.onSystem?.((msg: any) => {
    _setState((p) => ({ ...p, lastError: typeof msg === "string" ? msg : p.lastError }));
  });
}

// ═══════════════════════════════════════════════════════
// useSerialContext——共享状态 + actions
// ═══════════════════════════════════════════════════════

export function useSerialContext(): { state: SerialState; actions: SerialActions } {
  const s = (window as any).linkdesk?.serial;

  // 首次渲染时初始化 IPC 订阅（只跑一次）
  _initIPC();

  // useSyncExternalStore 确保所有组件共享同一份 state
  const state = useSyncExternalStore(_subscribe, _getState, _getState);

  // 🔥 B86 预防：ref 桥接——action 闭包永远读最新值
  const sourceNameRef = useRef(state.sourceName);
  sourceNameRef.current = state.sourceName;
  const baudRateRef = useRef(state.baudRate);
  baudRateRef.current = state.baudRate;

  // ── 操作（对标 SourceActions）──

  const toggleOpen = useCallback(async (encoding?: string) => {
    if (!s) return;
    const status = await s.getStatus();
    if (status?.isOpen) {
      await s.closePort();
      // 关闭时重置计数（对标 App.tsx useEffect([isOpen])）
      _setState((p) => ({ ...p, isOpen: false, txBytes: 0, rxBytes: 0 }));
    } else {
      await s.openPort({
        portName: sourceNameRef.current,
        baudRate: Number(baudRateRef.current),
        encoding,
      });
      const fresh = await s.getStatus();
      if (fresh) _setState((p) => mergeStatus(p, fresh));
    }
  }, []);

  const setSourceName = useCallback(async (name: string, encoding?: string) => {
    if (!s) return;
    sourceNameRef.current = name;
    _setState((p) => ({ ...p, sourceName: name }));
    if (_sharedState.isOpen) {
      await s.closePort();
      await s.openPort({ portName: name, baudRate: Number(baudRateRef.current), encoding });
      const fresh = await s.getStatus();
      if (fresh) _setState((p) => mergeStatus(p, fresh));
    }
  }, []);

  const setBaudRate = useCallback(async (baud: string, encoding?: string) => {
    if (!s) return;
    baudRateRef.current = baud;
    _setState((p) => ({ ...p, baudRate: baud }));
    if (_sharedState.isOpen) {
      await s.closePort();
      await s.openPort({ portName: sourceNameRef.current, baudRate: Number(baud), encoding });
      const fresh = await s.getStatus();
      if (fresh) _setState((p) => mergeStatus(p, fresh));
    }
  }, []);

  return { state, actions: { toggleOpen, setSourceName, setBaudRate } };
}
