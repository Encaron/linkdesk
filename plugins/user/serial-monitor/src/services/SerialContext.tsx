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

/** wire getStatus() 返回面（portName/baudRate/isOpen）+ 历史 DTO 防御性字段（E5.6 前曾带 tx/rx/lastError） */
interface SerialStatusDto {
  portName?: string;
  baudRate?: number;
  isOpen?: boolean;
  txBytes?: number;
  rxBytes?: number;
  lastError?: string | null;
}

interface SerialActions {
  toggleOpen: (encoding?: string) => Promise<void>;
  /** 明确打开指定端口——多标签页场景：ControlPanel 按 per-tab connected 决策，不盲翻转 */
  openPort: (portName: string, baudRate: number, encoding?: string) => Promise<void>;
  /** 明确关闭当前端口 */
  closePort: () => Promise<void>;
  setSourceName: (name: string, encoding?: string) => Promise<void>;
  setBaudRate: (baud: string, encoding?: string) => Promise<void>;
  /** 刷新可用串口列表——USB 热插拔后下拉框即时更新 */
  refreshPorts: () => Promise<void>;
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

// E5.5#7 Bug C fix：TX/RX 防抖同步——onStats 高频回调，不在 isOpen 变化守卫内。
let _txRxSyncTimer: ReturnType<typeof setTimeout> | null = null;

/** E5.5#9l：per-tab 隔离——pluginState key 加 sourceName(COM 端口名) 前缀，防多实例互相覆盖 */
/** E5.5#9l-fix：port 参数显式传入——_setState 内部 _sharedState 尚未更新，读 _sharedState.sourceName 会拿到旧值 */
function _scopeKey(key: string, port?: string): string {
  const p = port ?? _sharedState.sourceName;
  return p ? `${p}:${key}` : key;
}

function _setState(updater: (p: SerialState) => SerialState): void {
  const next = updater(_sharedState);

  // isOpen 变化——立即同步连接状态 + 端口名到 pluginState（壳侧栏/状态栏跨 WebView 读取）
  // E5.5#9l：key 加 _scopeKey 前缀，per-tab 隔离——多串口标签页不再互相覆盖
  if (next.isOpen !== _sharedState.isOpen) {
    // E5.8#47：sourceOpen contextKey 归插件自管——壳不再镜像串口 bit（硬约束 #9 核心无知）
    // 真值经此咽喉单点写入，覆盖 toggleOpen/closePort/换端口/F5 恢复全部路径
    window.linkdesk?.contextKey?.set("sourceOpen", next.isOpen).catch(() => {});
    window.linkdesk?.pluginState?.set("serial-monitor", _scopeKey("isOpen", next.sourceName), next.isOpen)
      .catch(() => {});
    window.linkdesk?.pluginState?.set("serial-monitor", _scopeKey("sourceName", next.sourceName), next.sourceName)
      .catch(() => {});
    // 关闭时立即清零 TX/RX——不等到防抖超时
    if (!next.isOpen) {
      window.linkdesk?.pluginState?.set("serial-monitor", _scopeKey("txBytes", next.sourceName), 0)
        .catch(() => {});
      window.linkdesk?.pluginState?.set("serial-monitor", _scopeKey("rxBytes", next.sourceName), 0)
        .catch(() => {});
    }
  }

  // sourceName 变化——同步到 pluginState（壳侧栏 session connected 判断需要）
  if (next.sourceName !== _sharedState.sourceName) {
    window.linkdesk?.pluginState?.set("serial-monitor", _scopeKey("sourceName", next.sourceName), next.sourceName)
      .catch(() => {});
  }

  // TX/RX 变化且端口打开——防抖 250ms 同步到 pluginState。
  // onStats 高频回调累加计数，直接每次 set 会拥塞 IPC。防抖合并为一次 set。
  if (next.isOpen && (next.txBytes !== _sharedState.txBytes || next.rxBytes !== _sharedState.rxBytes)) {
    if (_txRxSyncTimer) clearTimeout(_txRxSyncTimer);
    const debounced = next;
    _txRxSyncTimer = setTimeout(() => {
      window.linkdesk?.pluginState?.set("serial-monitor", _scopeKey("txBytes", debounced.sourceName), debounced.txBytes)
        .catch(() => {});
      window.linkdesk?.pluginState?.set("serial-monitor", _scopeKey("rxBytes", debounced.sourceName), debounced.rxBytes)
        .catch(() => {});
    }, 250);
  }

  _sharedState = next;
  // 异步通知——让 React 18 自动批处理多个 _setState
  for (const fn of _listeners.values()) fn();
}

function _subscribe(cb: () => void): () => void {
  const id = ++_listenerId;
  _listeners.set(id, cb);
  return () => { _listeners.delete(id); };
}

// E5.7#98：merge 入参 = wire SerialStatus（portName/baudRate/isOpen）+ 历史 DTO 防御性字段（tx/rx/lastError），零 any
function mergeStatus(p: SerialState, status: SerialStatusDto): SerialState {
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

// ═══════════════════════════════════════════════════════
// E3j #81 方向 B：组件级生命周期 + 引用计数
//
// _initOnce()  —— 一次性数据拉取（listPorts / getStatus），模块级，只跑一次
// _registerIPCListeners()   —— 注册 onData/onStats/onSystem，引用计数
// _unregisterIPCListeners() —— 减引用，最后一个卸载时清理全部监听器
//
// 壳 fallback 和 WebView 用同一套逻辑——不判断运行环境。
// 壳切空 div → ControlPanel unmount → 自动清理 → 零僵尸监听器。
// ═══════════════════════════════════════════════════════

let _oneTimeFetched = false;

/** 一次性数据拉取——端口列表 + 状态。模块级调用，只跑一次。 */
function _initOnce(): void {
  if (_oneTimeFetched) return;
  _oneTimeFetched = true;

  const s = window.linkdesk?.serial;
  if (!s) return;

  const listPorts = s.listPorts;
  listPorts?.()?.then((ports: PortInfo[]) => {
    if (ports) _setState((p) => ({ ...p, ports }));
  });
  // E5.8#26 D5：getStatus() 无参返回全口数组——单口监视器取唯一打开口（[0]），多口 UI 适配留 #27
  s.getStatus?.()?.then((statuses) => {
    const status = statuses[0];
    if (status) _setState((p) => mergeStatus(p, status));
  });
}

let _refCount = 0;
let _ipcCleanups: Array<() => void> = [];

/** 注册 IPC 监听器——引用计数。第一个 consumer mount → 注册；后续只加引用。 */
// eslint-disable-next-line linkdesk/no-module-level-ipc-listener -- 方向 B 正确实现：useEffect mount 调用，_unregisterIPCListeners 在 cleanup 中清理
function _registerIPCListeners(): void {
  _refCount++;
  if (_refCount > 1) return;

  const s = window.linkdesk?.serial;
  if (!s) return;

  _ipcCleanups = [
    // 高频 stats 回调——累加而非覆盖
    s.onStats?.((stats) => {
      _setState((p) => ({
        ...p,
        txBytes: p.txBytes + (stats.tx ?? 0),
        rxBytes: p.rxBytes + (stats.rx ?? 0),
      }));
    }),
    s.onSystem?.((msg) => {
      _setState((p) => ({ ...p, lastError: typeof msg === "string" ? msg : p.lastError }));
    }),
    // E3j #77：串口数据上桌——原始数据推到大厅 events 频道，供协议插件等消费
    s.onData?.((text: string) => {
      window.linkdesk?.events?.emit("serial:rawData", {
        sourceName: _sharedState.sourceName,
        text,
      });
    }),
  ].filter(Boolean) as Array<() => void>;
}

/** 注销 IPC 监听器——减引用，最后一个 consumer unmount → 全清。 */
function _unregisterIPCListeners(): void {
  _refCount = Math.max(0, _refCount - 1);
  if (_refCount > 0) return;
  for (const fn of _ipcCleanups) fn();
  _ipcCleanups = [];
}

// ═══════════════════════════════════════════════════════
// useSerialContext
// ═══════════════════════════════════════════════════════

export function useSerialContext(): { state: SerialState; actions: SerialActions } {
  const s = window.linkdesk?.serial;

  // 一次性数据拉取——端口列表 + 状态（模块级 guard，只跑一次）
  _initOnce();

  // 朴素的订阅模式：useState + useEffect subscribe
  const [state, setState] = useState<SerialState>(_sharedState);

  // E3j #81 方向 B：IPC 监听器走组件生命周期——引用计数，
  // mount → 注册（第一个 consumer），unmount → 减引用（最后一个 consumer 全清）。
  useEffect(() => {
    _registerIPCListeners();
    return () => _unregisterIPCListeners();
  }, []);

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
    // E5.8#26 D5：getStatus() 无参返回全口数组——单口监视器取唯一打开口（[0]）
    const status = (await s.getStatus())[0];
    if (status?.isOpen) {
      await s.closePort();
      _setState((p) => ({ ...p, isOpen: false, txBytes: 0, rxBytes: 0 }));
    } else {
      await s.openPort({
        portName: sourceNameRef.current,
        baudRate: Number(baudRateRef.current),
        encoding,
      });
      const fresh = (await s.getStatus())[0];
      if (fresh) _setState((p) => mergeStatus(p, fresh));
    }
  }, [s]);

  // 支线：明确打开/关闭——多标签页场景 ControlPanel 按 per-tab connected 决策
  const openPort = useCallback(async (portName: string, baudRate: number, encoding?: string) => {
    if (!s) return;
    sourceNameRef.current = portName;
    baudRateRef.current = String(baudRate);
    await s.openPort({ portName, baudRate, encoding });
    // E5.8#26 D5：getStatus() 无参返回全口数组——取唯一打开口（[0]）
    const fresh = (await s.getStatus())[0];
    if (fresh) _setState((p) => mergeStatus(p, fresh));
  }, [s]);

  const closePort = useCallback(async () => {
    if (!s) return;
    await s.closePort();
    _setState((p) => ({ ...p, isOpen: false, txBytes: 0, rxBytes: 0 }));
  }, [s]);

  const setSourceName = useCallback(async (name: string, encoding?: string) => {
    if (!s) return;
    sourceNameRef.current = name;
    _setState((p) => ({ ...p, sourceName: name }));
    if (_sharedState.isOpen) {
      await s.closePort();
      await s.openPort({ portName: name, baudRate: Number(baudRateRef.current), encoding });
      // E5.8#26 D5：getStatus() 无参返回全口数组——取唯一打开口（[0]）
      const fresh = (await s.getStatus())[0];
      if (fresh) _setState((p) => mergeStatus(p, fresh));
    }
  }, [s]);

  const setBaudRate = useCallback(async (baud: string, encoding?: string) => {
    if (!s) return;
    baudRateRef.current = baud;
    _setState((p) => ({ ...p, baudRate: baud }));
    if (_sharedState.isOpen) {
      await s.closePort();
      await s.openPort({ portName: sourceNameRef.current, baudRate: Number(baud), encoding });
      // E5.8#26 D5：getStatus() 无参返回全口数组——取唯一打开口（[0]）
      const fresh = (await s.getStatus())[0];
      if (fresh) _setState((p) => mergeStatus(p, fresh));
    }
  }, [s]);

  // 支线：刷新可用串口列表——USB 热插拔后下拉框即时更新
  const refreshPorts = useCallback(async () => {
    if (!s) return;
    const listPorts = s.listPorts;
    const ports = await listPorts?.();
    if (ports) _setState((p) => ({ ...p, ports }));
  }, [s]);

  return { state, actions: { toggleOpen, openPort, closePort, setSourceName, setBaudRate, refreshPorts } };
}
