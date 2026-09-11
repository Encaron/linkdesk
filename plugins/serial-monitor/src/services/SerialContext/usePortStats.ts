/**
 * per-port 只读 hooks——E6#87b 从 services/SerialContext.tsx 搬出（只搬不改）。
 *
 * E5.8#30.12（P6）：状态栏 (N) + 接收区工具栏 per-tab TX/RX。
 */

import { useState, useEffect } from "react";
import type { PluginStateChangedPayload } from "@linkdesk/contracts";
import { SERIAL_MONITOR_PLUGIN_ID } from "../../utils/pluginId";
import { addPortListener, getOpenPortEntry, hasOpenPort } from "./store";

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
    const read = () => {
      const e = getOpenPortEntry(port);
      setStats({ txBytes: e?.txBytes ?? 0, rxBytes: e?.rxBytes ?? 0, isOpen: hasOpenPort(port) });
    };
    read();
    return addPortListener(port, read);
  }, [port]);
  return stats;
}
