/**
 * SerialContext 模块级共享状态——E6#87b 从 services/SerialContext.tsx 搬出（只搬不改）。
 *
 * 🔴 单一属主：`_sharedState` / `_openPorts` / `_listeners` / `_portListeners` 四份 mutable
 *    状态**只在本文件声明**（04 §〇③ 铁律）。跨文件读改写一律走本文件导出的 accessor——
 *    拆完 grep `const _openPorts =` 全仓应恰好一处。
 *
 * 🔥 模块级共享状态——所有 useSerialContext() 共享同一份 state。
 * 用最朴素的手写订阅（useState + useEffect subscribe），避免 useSyncExternalStore
 * 与高频 onStats 回调的潜在交互问题。
 */

import type { OpenPortEntry, SerialState } from "./types";

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

export function _notifyPort(port: string): void {
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
export function _writePortState(port: string, isOpen: boolean): void {
  window.linkdesk?.contextKey?.set("sourceOpen", isOpen).catch(() => {});
  window.linkdesk?.pluginState?.set("serial-monitor", _scopeKey("isOpen", port), isOpen).catch(() => {});
  window.linkdesk?.pluginState?.set("serial-monitor", _scopeKey("sourceName", port), port).catch(() => {});
  if (!isOpen) {
    window.linkdesk?.pluginState?.set("serial-monitor", _scopeKey("txBytes", port), 0).catch(() => {});
    window.linkdesk?.pluginState?.set("serial-monitor", _scopeKey("rxBytes", port), 0).catch(() => {});
  }
}

export function _setState(updater: (p: SerialState) => SerialState): void {
  const next = updater(_sharedState);

  // E5.8#30.9（P3）：isOpen/sourceName 的 pluginState 写入已剥离到 _writePortState 单一咽喉——
  // 旧守卫读投影口 + 单布尔短路 → 后开者写前灯/开一关一串灯。此处只保留投影内存态。
  // E5.8#30.12（P6）：TX/RX 防抖同步已删——状态栏不再显示全局计数，per-port 计数走 _openPorts + _notifyPort。

  _sharedState = next;
  // 异步通知——让 React 18 自动批处理多个 _setState
  for (const fn of _listeners.values()) fn();
}

export function _subscribe(cb: () => void): () => void {
  const id = ++_listenerId;
  _listeners.set(id, cb);
  return () => { _listeners.delete(id); };
}

/** 投影态只读快照——hook 初始化 useState 用（避免把 mutable 绑定泄给消费方） */
export function getSharedState(): SerialState {
  return _sharedState;
}

/** E5.8#29：多口打开集合只读视图——ControlPanel per-tab connected 派生（会话口 ∈ 集合）。 */
export function getOpenPorts(): ReadonlySet<string> {
  return new Set(_openPorts.keys());
}

/** 本口是否开着——动作路径 per-tab 精确判断（原读 _openPorts.has） */
export function hasOpenPort(port: string): boolean {
  return _openPorts.has(port);
}

/** 按口登记权威态（打开/换口时）——置入即权威，收口 openPort / F5 恢复 */
export function setOpenPort(port: string, entry: OpenPortEntry): void {
  _openPorts.set(port, entry);
}

/** 按口注销权威态（关闭/换口时） */
export function deleteOpenPort(port: string): void {
  _openPorts.delete(port);
}

/** 按口读权威态（只读消费——usePortStats / 状态栏） */
export function getOpenPortEntry(port: string): OpenPortEntry | undefined {
  return _openPorts.get(port);
}

/**
 * 按口累加 TX/RX——onStats 高频路径（原 handler 内原地累加 + _notifyPort 收口到本处）。
 * 口未开则不动不通知（与原文 `if (entry)` 语义一致）。
 */
export function accumulatePortStats(port: string, tx: number, rx: number): void {
  const entry = _openPorts.get(port);
  if (!entry) return;
  entry.txBytes += tx;
  entry.rxBytes += rx;
  _notifyPort(port);
}

/** 订阅本口变更——返回退订函数；引用计数清零时自动删空 Set（原 usePortStats 内的收尾逻辑） */
export function addPortListener(port: string, fn: () => void): () => void {
  let set = _portListeners.get(port);
  if (!set) { set = new Set(); _portListeners.set(port, set); }
  set.add(fn);
  return () => {
    const s = _portListeners.get(port);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) _portListeners.delete(port);
  };
}
