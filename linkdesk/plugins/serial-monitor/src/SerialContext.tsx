/**
 * 串口监视器插件的 SerialContext——IPC 版本（E3a #30）。
 *
 * E3a 多 WebView：终端在自己的 WebView 中运行，无法访问壳的 React Context。
 * 改为直接 IPC——window.linkdesk.serial.* 调用壳侧 serial-service。
 *
 * 🔥 模块级共享状态——所有 useSerialContext() 共享同一份 state。
 * 用最朴素的手写订阅（useState + useEffect subscribe），避免 useSyncExternalStore
 * 与高频 onStats 回调的潜在交互问题。
 * 🔥 B86 预防：sourceName/baudRate 用 ref 桥接。
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ── 类型 ──

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
// 模块级共享状态
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

let _listenerId = 0;
const _listeners = new Map<number, () => void>();

function _setState(updater: (p: SerialState) => SerialState): void {
  _sharedState = updater(_sharedState);
  // 异步通知——让 React 18 自动批处理多个 _setState
  for (const fn of _listeners.values()) fn();
}

function _subscribe(cb: () => void): () => void {
  const id = ++_listenerId;
  _listeners.set(id, cb);
  return () => { _listeners.delete(id); };
}

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

let _initialized = false;

function _initIPC(): void {
  if (_initialized) return;
  _initialized = true;

  const s = (window as any).linkdesk?.serial;
  if (!s) return;

  const listPorts = s.listPorts ?? s.getPorts;
  listPorts?.()?.then((ports: PortInfo[]) => {
    if (ports) _setState((p) => ({ ...p, ports }));
  });
  s.getStatus?.()?.then((status: any) => {
    if (status) _setState((p) => mergeStatus(p, status));
  });

  // 高频 stats 回调——累加而非覆盖
  s.onStats?.((stats: any) => {
    _setState((p) => ({
      ...p,
      txBytes: p.txBytes + (stats.tx ?? 0),
      rxBytes: p.rxBytes + (stats.rx ?? 0),
    }));
  });

  s.onSystem?.((msg: any) => {
    _setState((p) => ({ ...p, lastError: typeof msg === "string" ? msg : p.lastError }));
  });

  // E3j #77：串口数据上桌——原始数据推到大厅 events 频道，供协议插件等消费
  s.onData?.((text: string) => {
    (window as any).linkdesk?.events?.emit("serial:rawData", {
      sourceName: _sharedState.sourceName,
      text,
    });
  });
}

// ═══════════════════════════════════════════════════════
// useSerialContext
// ═══════════════════════════════════════════════════════

export function useSerialContext(): { state: SerialState; actions: SerialActions } {
  const s = (window as any).linkdesk?.serial;

  // 首次渲染初始化 IPC（只跑一次）
  _initIPC();

  // 朴素的订阅模式：useState + useEffect subscribe
  const [state, setState] = useState<SerialState>(_sharedState);

  useEffect(() => {
    return _subscribe(() => setState(_sharedState));
  }, []);

  // 🔥 B86 预防：ref 桥接
  const sourceNameRef = useRef(state.sourceName);
  sourceNameRef.current = state.sourceName;
  const baudRateRef = useRef(state.baudRate);
  baudRateRef.current = state.baudRate;

  const toggleOpen = useCallback(async (encoding?: string) => {
    if (!s) return;
    const status = await s.getStatus();
    if (status?.isOpen) {
      await s.closePort();
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
