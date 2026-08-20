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

/** E5.8#27（S8/S10）——每打开口的独立状态（权威多口态）。单口投影 _sharedState 是"当前活动口"兼容视图。 */
interface OpenPortEntry {
  baudRate: number;
  txBytes: number;
  rxBytes: number;
}

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
  /** E5.8#30.8：开/关单动作——显式传口 + 按口已开决策（per-tab 精确） */
  toggleOpen: (port: string, baudRate?: number, encoding?: string) => Promise<void>;
  /** 明确打开指定端口——多标签页场景：ControlPanel 按 per-tab connected 决策，不盲翻转 */
  openPort: (portName: string, baudRate: number, encoding?: string) => Promise<void>;
  /** E5.8#30.8：明确关闭指定端口——显式传口（不再读投影口 _sharedState.sourceName） */
  closePort: (port: string) => Promise<void>;
  setSourceName: (name: string, encoding?: string) => Promise<void>;
  /** E5.8#30.8：改波特率——显式传口 + per-tab 精确判断（该口真开着才关旧重开） */
  setBaudRate: (baud: string, port: string, encoding?: string) => Promise<void>;
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

// E5.8#27（S8/S10）：多口权威态——portName → 每口 baudRate/TX/RX。
// F5 恢复（_initOnce 数组遍历）+ 动作路径（openPort/closePort/换口）共同维护；
// 侧栏/状态栏跨 WebView 读的是 per-port pluginState 键（E5.5#9l 前缀），本 Map 是插件主区侧真相，
// #29 会话-端口绑定（per-tab connected 派生）的直接消费源。
const _openPorts = new Map<string, OpenPortEntry>();

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

/** E5.8#29：多口打开集合只读视图——ControlPanel per-tab connected 派生（会话口 ∈ 集合）。 */
export function getOpenPorts(): ReadonlySet<string> {
  return new Set(_openPorts.keys());
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
  // E5.8#27（设计 §8 #27）：getStatus() 无参返回全口数组——F5 Hot Exit 按口遍历恢复。
  // 每口：写 _openPorts 权威态 + per-port pluginState 键（侧栏灯真相源，E5.5#9l 前缀打底）。
  // 恢复顺序 = 主进程 getStatus Map 遍历序（服务层开端口序）；同口双会话争抢由 D8 拒绝 + #29 会话绑定消化。
  s.getStatus?.()?.then((statuses) => {
    for (const status of statuses) {
      const port = status.portName;
      if (!port) continue;
      _openPorts.set(port, { baudRate: status.baudRate ?? 0, txBytes: 0, rxBytes: 0 });
      window.linkdesk?.pluginState?.set("serial-monitor", _scopeKey("isOpen", port), true).catch(() => {});
      window.linkdesk?.pluginState?.set("serial-monitor", _scopeKey("sourceName", port), port).catch(() => {});
    }
    // 单口投影兼容——现有主区 UI（ControlPanel）消费第一个打开口
    const first = statuses[0];
    if (first) _setState((p) => mergeStatus(p, first));
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
    // E5.8#29（S10 修根）：按 payload.portName 每口精确计数——_openPorts 权威态写对口计数器，
    // 投影只累加活动口（_sharedState 是单口投影兼容视图，不再叠加所有口的计数）
    s.onStats?.((payload) => {
      const tx = payload.tx ?? 0;
      const rx = payload.rx ?? 0;
      const port = payload.portName;
      if (port) {
        const entry = _openPorts.get(port);
        if (entry) {
          entry.txBytes += tx;
          entry.rxBytes += rx;
        }
        if (port === _sharedState.sourceName) {
          _setState((p) => ({ ...p, txBytes: p.txBytes + tx, rxBytes: p.rxBytes + rx }));
        }
      }
    }),
    s.onSystem?.((payload) => {
      // #29 决策保留：错误消息不按口过滤——同口二开拒绝（D8）到达时 _sharedState.sourceName
      // 可能尚未更新（异步 gap），按口过滤会吞掉错误提示 → 保守全局 lastError（现网通道）
      const msg = typeof payload === "string" ? payload : payload.message;
      _setState((p) => ({ ...p, lastError: msg }));
    }),
    // E3j #77：串口数据上桌——原始数据推到大厅 events 频道，供协议插件等消费
    // E5.8#29（S9 修根）：payload.portName 贴真名——多口并发错标边界消除
    //（原贴当前活动口名，另一标签页的口的数据会错标到活动口）
    s.onData?.((payload) => {
      const text = typeof payload === "string" ? payload : payload.text;
      window.linkdesk?.events?.emit("serial:rawData", {
        sourceName: typeof payload === "string" ? _sharedState.sourceName : payload.portName,
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

  // 支线：明确打开/关闭——多标签页场景 ControlPanel 按 per-tab connected 决策
  const openPort = useCallback(async (portName: string, baudRate: number, encoding?: string) => {
    if (!s) return;
    sourceNameRef.current = portName;
    baudRateRef.current = String(baudRate);
    await s.openPort({ portName, baudRate, encoding });
    // E5.8#27：定向取刚开的口——多口下 getStatus()[0] 未必是本次开的（#26 遗留，D5 定向修复）
    const fresh = (await s.getStatus(portName));
    if (fresh) _setState((p) => mergeStatus(p, fresh));
    _openPorts.set(portName, { baudRate, txBytes: 0, rxBytes: 0 });
  }, [s]);

  const closePort = useCallback(async (port: string) => {
    if (!s || !port) return;
    await s.closePort(port);
    _openPorts.delete(port);
    _setState((p) => ({ ...p, isOpen: false, txBytes: 0, rxBytes: 0 }));
  }, [s]);

  // E5.8#30.8：开/关单动作——显式传口 + 按口已开决策（per-tab 精确，D1 多口共存）。
  // 组合原子动作 closePort/openPort（审视 ③：灭 toggleOpen 死代码 + 「开关=一个动作一处写」归一）
  const toggleOpen = useCallback(async (port: string, baudRate?: number, encoding?: string) => {
    if (!s || !port) return;
    if (_openPorts.has(port)) {
      await closePort(port);
    } else {
      // 口未开 → 开（D1 不影响其他已开口）；baudRate 缺省走投影 baudRateRef
      await openPort(port, baudRate ?? Number(baudRateRef.current), encoding);
    }
  }, [s, closePort, openPort]);

  const setSourceName = useCallback(async (name: string, encoding?: string) => {
    if (!s) return;
    // E5.8#27：改名前存旧口——换口 = 定向关旧口 + 开新口（D3 标签页内换口；多口下无参 closePort 抛歧义）
    const oldPort = _sharedState.sourceName;
    sourceNameRef.current = name;
    _setState((p) => ({ ...p, sourceName: name }));
    if (_sharedState.isOpen) {
      if (oldPort) {
        await s.closePort(oldPort);
        _openPorts.delete(oldPort);
      }
      await s.openPort({ portName: name, baudRate: Number(baudRateRef.current), encoding });
      const fresh = (await s.getStatus(name));
      if (fresh) _setState((p) => mergeStatus(p, fresh));
      _openPorts.set(name, { baudRate: Number(baudRateRef.current), txBytes: 0, rxBytes: 0 });
    }
  }, [s]);

  const setBaudRate = useCallback(async (baud: string, port: string, encoding?: string) => {
    if (!s) return;
    baudRateRef.current = baud;
    _setState((p) => ({ ...p, baudRate: baud }));
    // 改波特率 = 定向关 + 重开同口（E5.8#30.8：显式传口；per-tab 精确判断——该口真开着才重开，
    // 不再用投影 isOpen 判断避免他标签页口开着也误重开）；port 空 = 纯存配置（会话未开）
    if (port && _openPorts.has(port)) {
      await closePort(port);
      await s.openPort({ portName: port, baudRate: Number(baud), encoding });
      const fresh = (await s.getStatus(port));
      if (fresh) _setState((p) => mergeStatus(p, fresh));
      _openPorts.set(port, { baudRate: Number(baud), txBytes: 0, rxBytes: 0 });
    }
  }, [s, closePort]);

  // 支线：刷新可用串口列表——USB 热插拔后下拉框即时更新
  const refreshPorts = useCallback(async () => {
    if (!s) return;
    const listPorts = s.listPorts;
    const ports = await listPorts?.();
    if (ports) _setState((p) => ({ ...p, ports }));
  }, [s]);

  return { state, actions: { toggleOpen, openPort, closePort, setSourceName, setBaudRate, refreshPorts } };
}
