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
import type { PluginStateChangedPayload } from "@linkdesk/contracts";
import { SERIAL_MONITOR_PLUGIN_ID } from "../utils/pluginId";

// ── 类型 ──

interface PortInfo { name: string; description: string; }

/** E5.8#30.17：帧格式——openPort 时透传 dataBits/stopBits/parity（wire OpenPortConfig 已支持）。 */
export interface SerialFrame {
  dataBits: number;
  stopBits: number;
  parity: string;
}

/** E5.8#30.18：握手信号初始电平——openPort 打开时应用（setDtr/setRts 带端口）。 */
export interface HandshakeState {
  dtr: boolean;
  rts: boolean;
}

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
  lastError: string | null;
}

/** wire getStatus() 返回面（portName/baudRate/isOpen）+ 历史 DTO 防御性字段（E5.6 前曾带 lastError）。
 *  E5.8#30.12（P6）：txBytes/rxBytes 已删——投影 _sharedState 不再持有全局 TX/RX（per-port 计数归 _openPorts）。 */
interface SerialStatusDto {
  portName?: string;
  baudRate?: number;
  isOpen?: boolean;
  lastError?: string | null;
}

interface SerialActions {
  /** E5.8#30.8：开/关单动作——显式传口 + 按口已开决策（per-tab 精确） */
  toggleOpen: (port: string, baudRate?: number, encoding?: string, frame?: SerialFrame, handshake?: HandshakeState) => Promise<void>;
  /** 明确打开指定端口——多标签页场景：ControlPanel 按 per-tab connected 决策，不盲翻转 */
  openPort: (portName: string, baudRate: number, encoding?: string, frame?: SerialFrame, handshake?: HandshakeState) => Promise<void>;
  /** E5.8#30.8：明确关闭指定端口——显式传口（不再读投影口 _sharedState.sourceName） */
  closePort: (port: string) => Promise<void>;
  /** E5.8#30.10（P7）：换口——显式传旧口 + per-tab 精确触发（旧口 ∈ openPorts 才关旧开新；否则只记配置） */
  setSourceName: (name: string, oldPort: string, encoding?: string, frame?: SerialFrame, handshake?: HandshakeState) => Promise<void>;
  /** E5.8#30.8：改波特率——显式传口 + per-tab 精确判断（该口真开着才关旧重开） */
  setBaudRate: (baud: string, port: string, encoding?: string, frame?: SerialFrame, handshake?: HandshakeState) => Promise<void>;
  /** E5.8#30.17：改帧格式（8N1/校验）——显式传口 + per-tab 精确判断（该口真开着才关旧重开，同 setBaudRate 语义） */
  setFrame: (frame: SerialFrame, port: string, baudRate: number, encoding?: string, handshake?: HandshakeState) => Promise<void>;
  /** E5.8#30.18：运行中切握手信号——显式传口（per-tab 精确） */
  setDtr: (port: string, enable: boolean) => Promise<void>;
  setRts: (port: string, enable: boolean) => Promise<void>;
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
  lastError: null,
};

// E5.8#27（S8/S10）：多口权威态——portName → 每口 baudRate/TX/RX。
// F5 恢复（_initOnce 数组遍历）+ 动作路径（openPort/closePort/换口）共同维护；
// 侧栏/状态栏跨 WebView 读的是 per-port pluginState 键（E5.5#9l 前缀），本 Map 是插件主区侧真相，
// #29 会话-端口绑定（per-tab connected 派生）的直接消费源。
const _openPorts = new Map<string, OpenPortEntry>();

let _listenerId = 0;
const _listeners = new Map<number, () => void>();

// E5.8#30.12（P6）：per-port 通知——接收区工具栏 per-tab TX/RX 实时刷新。
// 非活动口的数据累计不触发全局 _setState（避免高频 onStats 全量重渲染），只通知本口订阅者。
const _portListeners = new Map<string, Set<() => void>>();

function _notifyPort(port: string): void {
  _portListeners.get(port)?.forEach((fn) => fn());
}

/** E5.5#9l：per-tab 隔离——pluginState key 加 sourceName(COM 端口名) 前缀，防多实例互相覆盖 */
/** E5.5#9l-fix：port 参数显式传入——_setState 内部 _sharedState 尚未更新，读 _sharedState.sourceName 会拿到旧值 */
function _scopeKey(key: string, port?: string): string {
  const p = port ?? _sharedState.sourceName;
  return p ? `${p}:${key}` : key;
}

/**
 * E5.8#30.9（P3）：灯按口显式写单一咽喉——isOpen/sourceName/TX-RX 清零按「显式传入 port」写 per-port pluginState 键。
 * open/close/toggle/setSourceName/setBaudRate/F5 恢复全走它（审视 ②：防「一个 bug 多个地方出现」= 归一性）；
 * 守卫读显式传入 port 而非投影口——谁打开写谁的，不短路（后开者不再覆盖前灯）。
 * contextKey sourceOpen = 本口开闭（投影语义——多口并存时最后操作口决定，与 #30.8 前一致）。
 */
function _writePortState(port: string, isOpen: boolean): void {
  window.linkdesk?.contextKey?.set("sourceOpen", isOpen).catch(() => {});
  window.linkdesk?.pluginState?.set("serial-monitor", _scopeKey("isOpen", port), isOpen).catch(() => {});
  window.linkdesk?.pluginState?.set("serial-monitor", _scopeKey("sourceName", port), port).catch(() => {});
  if (!isOpen) {
    window.linkdesk?.pluginState?.set("serial-monitor", _scopeKey("txBytes", port), 0).catch(() => {});
    window.linkdesk?.pluginState?.set("serial-monitor", _scopeKey("rxBytes", port), 0).catch(() => {});
  }
}

function _setState(updater: (p: SerialState) => SerialState): void {
  const next = updater(_sharedState);

  // E5.8#30.9（P3）：isOpen/sourceName 的 pluginState 写入已剥离到 _writePortState 单一咽喉——
  // 旧守卫读投影口 + 单布尔短路 → 后开者写前灯/开一关一串灯。此处只保留投影内存态。
  // E5.8#30.12（P6）：TX/RX 防抖同步已删——状态栏不再显示全局计数，per-port 计数走 _openPorts + _notifyPort。

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
      _notifyPort(port); // E5.8#30.12：F5 恢复 → 接收区 per-tab 计数刷新
      _writePortState(port, true); // E5.8#30.9：F5 恢复走单一咽喉（侧栏灯真相源）
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
    // E5.8#29（S10 修根）：按 payload.portName 每口精确计数——_openPorts 权威态写对口计数器。
    // E5.8#30.12（P6）：投影 _sharedState 的 TX/RX 已删（状态栏不再显示全局计数）——累计后仅 notify 本口订阅者
    //（接收区工具栏 per-tab 计数；非活动口也实时，不触发全局 _setState 高频重渲染）。
    s.onStats?.((payload) => {
      const tx = payload.tx ?? 0;
      const rx = payload.rx ?? 0;
      const port = payload.portName;
      if (port) {
        const entry = _openPorts.get(port);
        if (entry) {
          entry.txBytes += tx;
          entry.rxBytes += rx;
          _notifyPort(port);
        }
      }
    }),
    s.onSystem?.((payload) => {
      // E5.8#30.11（P1）：type 分类路由——status 按口过滤（他口开/关/波特率消息不显示），
      // error 全局可见（D8 拒绝 / 驱动错误 / 拔线，非活动标签页也显示）。审视 ①：来源端打 type 标签，
      // 不做文案关键词判断（字符串硬编码 + i18n 切语言失效 + 归一性三违）。
      const raw = typeof payload === "string" ? null : payload;
      const msg = raw?.message ?? (typeof payload === "string" ? payload : payload.message);
      const type = raw?.type ?? "status"; // 兜底旧载荷（无 type 按 status）
      const port = raw?.portName ?? _sharedState.sourceName;
      if (type === "error") {
        // 错误全局显示——凡非正常成功流程（#29 决策升级：按 type 而非不区分）
        _setState((p) => ({ ...p, lastError: msg }));
      } else if (port === _sharedState.sourceName) {
        // status 按口过滤——只显示本标签页活动口的开/关/波特率消息；他口操作完全不显示
        _setState((p) => ({ ...p, lastError: msg }));
      }
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

// E5.8#30.16（P8）：关闭串口的模块级咽喉——React action closePort 与 beforeClose handler 共用
// （归一性：一个写入咽喉，审视 ②——防「同一个 bug 多处出现」）。非 React 上下文（标签页关闭 handler）
// 也能关串口，且走与 UI 完全相同的灯写入链路（_writePortState 灭灯 + _openPorts 权威态 + per-port 通知）。
export async function closePortFromModule(port: string): Promise<void> {
  const s = window.linkdesk?.serial;
  if (!s || !port) return;
  await s.closePort(port);
  _openPorts.delete(port);
  _setState((p) => ({ ...p, isOpen: false }));
  _notifyPort(port);
  _writePortState(port, false);
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
  const openPort = useCallback(async (portName: string, baudRate: number, encoding?: string, frame?: SerialFrame, handshake?: HandshakeState) => {
    if (!s) return;
    sourceNameRef.current = portName;
    baudRateRef.current = String(baudRate);
    // E5.8#30.17：帧格式透传——openPortConfig dataBits/stopBits/parity（wire 已支持，#26 实锤）
    await s.openPort({ portName, baudRate, encoding, dataBits: frame?.dataBits, stopBits: frame?.stopBits, parity: frame?.parity });
    // E5.8#30.18：打开时应用握手信号初始电平（DTR/RTS）——非致命，失败只记日志不阻断开串口
    if (handshake) {
      s.setDtr?.(handshake.dtr, portName).catch((e) => console.error("[serial-monitor] 应用 DTR 初始电平失败:", e));
      s.setRts?.(handshake.rts, portName).catch((e) => console.error("[serial-monitor] 应用 RTS 初始电平失败:", e));
    }
    // E5.8#27：定向取刚开的口——多口下 getStatus()[0] 未必是本次开的（#26 遗留，D5 定向修复）
    const fresh = (await s.getStatus(portName));
    // E5.8#54：set 挪到 _setState 前——对齐 closePortFromModule（delete→setState→notify→write），
    // 消除「开一关一不对称」：订阅 _openPorts 的瞬时读不再拿到旧态
    _openPorts.set(portName, { baudRate, txBytes: 0, rxBytes: 0 });
    if (fresh) _setState((p) => mergeStatus(p, fresh));
    _notifyPort(portName); // E5.8#30.12：打开 → 接收区 per-tab 计数从 0 起
    _writePortState(portName, true); // E5.8#30.9：打开按口显式亮灯
  }, [s]);

  const closePort = useCallback(async (port: string) => {
    // E5.8#30.16（P8）：委托模块级咽喉 closePortFromModule——UI 与 beforeClose handler 共用同一写入路径
    await closePortFromModule(port);
  }, []);

  // E5.8#30.8：开/关单动作——显式传口 + 按口已开决策（per-tab 精确，D1 多口共存）。
  // 组合原子动作 closePort/openPort（审视 ③：灭 toggleOpen 死代码 + 「开关=一个动作一处写」归一）
  const toggleOpen = useCallback(async (port: string, baudRate?: number, encoding?: string, frame?: SerialFrame, handshake?: HandshakeState) => {
    if (!s || !port) return;
    if (_openPorts.has(port)) {
      await closePort(port);
    } else {
      // 口未开 → 开（D1 不影响其他已开口）；baudRate 缺省走投影 baudRateRef
      await openPort(port, baudRate ?? Number(baudRateRef.current), encoding, frame, handshake);
    }
  }, [s, closePort, openPort]);

  const setSourceName = useCallback(async (name: string, oldPort: string, encoding?: string, frame?: SerialFrame, handshake?: HandshakeState) => {
    if (!s) return;
    sourceNameRef.current = name;
    _setState((p) => ({ ...p, sourceName: name }));
    // E5.8#30.10（P7）：换口触发条件 per-tab 精确——本标签页旧口真开着才关旧开新；
    // 他标签页开着不误触（旧口显式传入，不读投影 _sharedState.sourceName）；新标签页选口
    // （旧口空/未开）只记配置、点「打开」才开（被 per-tab 判断天然覆盖，无需单独拦）。
    // 关旧口按口显式灭灯 + 开新口复用 openPort action 走咽喉（#30.9）。
    if (oldPort && _openPorts.has(oldPort)) {
      await s.closePort(oldPort);
      _openPorts.delete(oldPort);
      _notifyPort(oldPort); // E5.8#30.12：换口 → 旧口接收区 per-tab 计数归零
      _writePortState(oldPort, false);
      await openPort(name, Number(baudRateRef.current), encoding, frame, handshake);
    }
  }, [s, openPort]);

  const setBaudRate = useCallback(async (baud: string, port: string, encoding?: string, frame?: SerialFrame, handshake?: HandshakeState) => {
    if (!s) return;
    baudRateRef.current = baud;
    _setState((p) => ({ ...p, baudRate: baud }));
    // 改波特率 = 定向关 + 重开同口（E5.8#30.8：显式传口；per-tab 精确判断——该口真开着才重开，
    // 不再用投影 isOpen 判断避免他标签页口开着也误重开）；port 空 = 纯存配置（会话未开）
    // E5.8#30.9：closePort/openPort 组合——两原子动作已走灯写入咽喉（归一性）
    if (port && _openPorts.has(port)) {
      await closePort(port);
      await openPort(port, Number(baud), encoding, frame, handshake);
    }
  }, [s, closePort, openPort]);

  // E5.8#30.17：改帧格式（8N1/校验）——同 setBaudRate 语义（该口真开着才关旧重开，port 空 = 纯存配置）。
  // 会话帧字段由 ControlPanel updateSession 写入；本动作只做「口开着 → 用新帧重开」的端口侧生效。
  const setFrame = useCallback(async (frame: SerialFrame, port: string, baudRate: number, encoding?: string, handshake?: HandshakeState) => {
    if (!s) return;
    if (port && _openPorts.has(port)) {
      await closePort(port);
      await openPort(port, baudRate, encoding, frame, handshake);
    }
  }, [s, closePort, openPort]);

  // E5.8#30.18：运行中切握手信号——显式传口（per-tab 精确）；口未开时只写会话（侧栏开关仍是配置态）
  const setDtr = useCallback(async (port: string, enable: boolean) => {
    if (!s || !port) return;
    await s.setDtr(enable, port);
  }, [s]);

  const setRts = useCallback(async (port: string, enable: boolean) => {
    if (!s || !port) return;
    await s.setRts(enable, port);
  }, [s]);

  // 支线：刷新可用串口列表——USB 热插拔后下拉框即时更新
  const refreshPorts = useCallback(async () => {
    if (!s) return;
    const listPorts = s.listPorts;
    const ports = await listPorts?.();
    if (ports) _setState((p) => ({ ...p, ports }));
  }, [s]);

  return { state, actions: { toggleOpen, openPort, closePort, setSourceName, setBaudRate, setFrame, setDtr, setRts, refreshPorts } };
}

// ═══════════════════════════════════════════════════════
// E5.8#30.12（P6）：per-port 只读 hooks——状态栏 (N) + 接收区工具栏 per-tab TX/RX
// ═══════════════════════════════════════════════════════

/**
 * 打开口计数——状态栏 (N)（≥2 才显示数字）。
 * E5.8#54 根治：权威从局部 _openPorts Map（每 JS 上下文独享——脱出窗/分屏感知不到别窗口开的口）
 * 上移到主进程 serial-service 全口 getStatus()（唯一真相，跨窗口一致、无读-增-写竞态）——
 * 初始播种 + 订阅 plugin-state:changed 的 *:isOpen 变化重拉。写侧零新增：_writePortState 写 :isOpen 已广播。
 */
export function useOpenPortCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let inflight = 0; // 并发重拉只认最新发起——乱序响应丢弃
    const refresh = async () => {
      const my = ++inflight;
      const statuses = await window.linkdesk?.serial?.getStatus?.();
      if (cancelled || my !== inflight) return;
      setCount(Array.isArray(statuses) ? statuses.filter((s) => s?.portName).length : 0);
    };
    refresh(); // 初始播种——主进程权威全口
    const handler = (data: PluginStateChangedPayload) => {
      if (data?.pluginId !== SERIAL_MONITOR_PLUGIN_ID) return;
      if (typeof data?.key === "string" && data.key.endsWith(":isOpen")) refresh();
    };
    const unsub = window.linkdesk?.events?.on<PluginStateChangedPayload>("plugin-state:changed", handler);
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);
  return count;
}

/** per-port TX/RX + 开闭——接收区工具栏每标签页计数。订阅本口累计事件（活动/非活动口都实时）。 */
export function usePortStats(port: string | null): { txBytes: number; rxBytes: number; isOpen: boolean } {
  const [stats, setStats] = useState({ txBytes: 0, rxBytes: 0, isOpen: false });
  useEffect(() => {
    if (!port) {
      setStats({ txBytes: 0, rxBytes: 0, isOpen: false });
      return;
    }
    const entry = _openPorts.get(port);
    setStats({ txBytes: entry?.txBytes ?? 0, rxBytes: entry?.rxBytes ?? 0, isOpen: _openPorts.has(port) });
    const fn = () => {
      const e = _openPorts.get(port);
      setStats({ txBytes: e?.txBytes ?? 0, rxBytes: e?.rxBytes ?? 0, isOpen: _openPorts.has(port) });
    };
    let set = _portListeners.get(port);
    if (!set) { set = new Set(); _portListeners.set(port, set); }
    set.add(fn);
    return () => {
      const s = _portListeners.get(port);
      if (!s) return;
      s.delete(fn);
      if (s.size === 0) _portListeners.delete(port);
    };
  }, [port]);
  return stats;
}
