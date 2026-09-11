/**
 * SerialContext IPC 接线——E6#87b 从 services/SerialContext.tsx 搬出（只搬不改）。
 *
 * E3j #81 方向 B：组件级生命周期 + 引用计数
 *   `_initOnce()`              —— 一次性数据拉取（listPorts / getStatus），模块级，只跑一次
 *   `_registerIPCListeners()`  —— 注册 onData/onStats/onSystem，引用计数
 *   `_unregisterIPCListeners()`—— 减引用，最后一个卸载时清理全部监听器
 *
 * 壳 fallback 和 WebView 用同一套逻辑——不判断运行环境。
 * 壳切空 div → ControlPanel unmount → 自动清理 → 零僵尸监听器。
 *
 * 🔴 硬约束 19/20：`_initOnce` 的 `_oneTimeFetched` 与监听器的 `_refCount` 是**两套独立记账**，
 *    不得合并进同一个 `_initialized` guard——混用即 E3j #81 的僵尸回调整。模块级 mutable
 *    在此文件单一属主：`_oneTimeFetched` / `_refCount` / `_ipcCleanups`。
 */

import type { PortInfo } from "./types";
import { mergeStatus } from "./status";
import {
  accumulatePortStats, _notifyPort, _setState, _writePortState,
  deleteOpenPort, getSharedState, setOpenPort,
} from "./store";

let _oneTimeFetched = false;

/** 一次性数据拉取——端口列表 + 状态。模块级调用，只跑一次。 */
export function _initOnce(): void {
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
      setOpenPort(port, { baudRate: status.baudRate ?? 0, txBytes: 0, rxBytes: 0 });
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
export function _registerIPCListeners(): void {
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
      if (port) accumulatePortStats(port, tx, rx);
    }),
    s.onSystem?.((payload) => {
      // E5.8#30.11（P1）：type 分类路由——status 按口过滤（他口开/关/波特率消息不显示），
      // error 全局可见（D8 拒绝 / 驱动错误 / 拔线，非活动标签页也显示）。审视 ①：来源端打 type 标签，
      // 不做文案关键词判断（字符串硬编码 + i18n 切语言失效 + 归一性三违）。
      const raw = typeof payload === "string" ? null : payload;
      const msg = raw?.message ?? (typeof payload === "string" ? payload : payload.message);
      const type = raw?.type ?? "status"; // 兜底旧载荷（无 type 按 status）
      const port = raw?.portName ?? getSharedState().sourceName;
      if (type === "error") {
        // 错误全局显示——凡非正常成功流程（#29 决策升级：按 type 而非不区分）
        _setState((p) => ({ ...p, lastError: msg }));
      } else if (port === getSharedState().sourceName) {
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
        sourceName: typeof payload === "string" ? getSharedState().sourceName : payload.portName,
        text,
      });
    }),
  ].filter(Boolean) as Array<() => void>;
}

/** 注销 IPC 监听器——减引用，最后一个 consumer unmount → 全清。 */
export function _unregisterIPCListeners(): void {
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
  deleteOpenPort(port);
  _setState((p) => ({ ...p, isOpen: false }));
  _notifyPort(port);
  _writePortState(port, false);
}
