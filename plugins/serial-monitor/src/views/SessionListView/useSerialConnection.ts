/**
 * 侧栏连接状态订阅——E6#87b 从 views/SessionListView.tsx 搬出（只搬不改）。
 *
 * ── E5.5#7 Bug C fix：侧栏从 pluginState IPC 读取连接状态（多 WebView 下 useSerialContext 是隔离实例）。
 * E5.5#9m：9l 将 key 改为 <sourceName>:isOpen 格式——侧栏用 events.on 通配订阅，从键名提取端口。
 * E5.8#27（S15）：多口集合——每口自己的 key 自己亮（删 E5.7#89-fix 换灯补丁：单口顶替语义已删，
 * 多口集合天然处理"任意口开→add / 关→delete"，换口/多开无需 sourceName 换灯信号）。
 */

import { useState, useEffect } from "react";
import type { PluginStateChangedPayload } from "@linkdesk/contracts";
import { SERIAL_MONITOR_PLUGIN_ID } from "../../utils/pluginId";
import { lk } from "./lk";

/** E5.8#27（S15）：从 plugin-state:changed 通配事件读多口连接集合——key 带端口前缀（如 COM3:isOpen） */
export function useSerialConnection(): { openPorts: Set<string> } {
  const [openPorts, setOpenPorts] = useState<Set<string>>(new Set());

  useEffect(() => {
    // E5.5#9m：直接订阅 plugin-state:changed——key 带端口前缀（如 COM3:isOpen），
    // pluginState.onChange 的精确 key 匹配无法捕获通配键名。
    const handler = (data: PluginStateChangedPayload) => {
      if (data?.pluginId !== SERIAL_MONITOR_PLUGIN_ID) return;
      const k: string = data.key ?? "";
      if (!k.endsWith(":isOpen") || typeof data.value !== "boolean") return;
      const port = k.slice(0, -7); // "COM3:isOpen" → "COM3"
      setOpenPorts((prev) => {
        const next = new Set(prev);
        if (data.value) next.add(port);
        else next.delete(port);
        return next;
      });
    };
    const unsub = lk()?.events?.on<PluginStateChangedPayload>("plugin-state:changed", handler);
    return () => { unsub?.(); };
  }, []);

  return { openPorts };
}
