/**
 * 终端插件的 SerialContext——IPC 版本（E3a #30）。
 *
 * E2b #7 时是薄封装层：useSerialContext → useSourceState → React Context → App.tsx Provider。
 * E3a 多 WebView：终端在自己的 WebView 中运行，无法访问壳的 React Context。
 * 改为直接 IPC——window.linkdesk.serial.* 调用壳侧 serial-service。
 *
 * 调用方不感知变化——useSerialContext() 接口完全不变。
 */

import { useState, useEffect, useCallback } from "react";

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
// E3a #30：IPC 版 useSerialContext
// 对标 useSourceState 的 { state, actions } 接口，
// 但数据来源从 React Context 改为 IPC。
// ═══════════════════════════════════════════════════════

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

export function useSerialContext(): { state: SerialState; actions: SerialActions } {
  const s = (window as any).linkdesk?.serial;

  const [state, setState] = useState<SerialState>({
    ports: [],
    sourceName: "",
    baudRate: "115200",
    isOpen: false,
    txBytes: 0,
    rxBytes: 0,
    lastError: null,
  });

  // 初始加载——拉取端口列表 + 串口状态
  // 兼容两套 preload：壳侧 listPorts，插件侧 getPorts
  useEffect(() => {
    const listPorts = s?.listPorts ?? s?.getPorts;
    listPorts?.()?.then((ports: PortInfo[]) => {
      if (ports) setState((p) => ({ ...p, ports }));
    });
    s?.getStatus()?.then((status: any) => {
      if (status) setState((p) => mergeStatus(p, status));
    });
  }, []);

  // 订阅——tx/rx 统计实时更新
  useEffect(() => {
    const unsub = s?.onStats?.((stats: any) => {
      setState((p) => ({
        ...p,
        txBytes: stats.tx ?? p.txBytes,
        rxBytes: stats.rx ?? p.rxBytes,
      }));
    });
    return () => unsub?.();
  }, []);

  // 订阅——系统消息（错误等）
  useEffect(() => {
    const unsub = s?.onSystem?.((msg: any) => {
      setState((p) => ({ ...p, lastError: typeof msg === "string" ? msg : p.lastError }));
    });
    return () => unsub?.();
  }, []);

  // ── 操作（对标 SourceActions，体感不变）──

  const toggleOpen = useCallback(async (encoding?: string) => {
    if (!s) return;
    const status = await s.getStatus();
    if (status?.isOpen) {
      await s.closePort();
    } else {
      await s.openPort({
        portName: status?.portName ?? state.sourceName,
        baudRate: Number(status?.baudRate ?? state.baudRate),
        encoding,
      });
    }
    const fresh = await s.getStatus();
    if (fresh) setState((p) => mergeStatus(p, fresh));
  }, [state.sourceName, state.baudRate]);

  const setSourceName = useCallback(async (name: string, encoding?: string) => {
    if (!s) return;
    const status = await s.getStatus();
    if (status?.isOpen) {
      await s.closePort();
      await s.openPort({ portName: name, baudRate: Number(status?.baudRate ?? "115200"), encoding });
      const fresh = await s.getStatus();
      if (fresh) setState((p) => mergeStatus(p, fresh));
    } else {
      setState((p) => ({ ...p, sourceName: name }));
    }
  }, []);

  const setBaudRate = useCallback(async (baud: string, encoding?: string) => {
    if (!s) return;
    const status = await s.getStatus();
    if (status?.isOpen) {
      await s.closePort();
      await s.openPort({ portName: status?.portName ?? "", baudRate: Number(baud), encoding });
      const fresh = await s.getStatus();
      if (fresh) setState((p) => mergeStatus(p, fresh));
    } else {
      setState((p) => ({ ...p, baudRate: baud }));
    }
  }, []);

  return { state, actions: { toggleOpen, setSourceName, setBaudRate } };
}
