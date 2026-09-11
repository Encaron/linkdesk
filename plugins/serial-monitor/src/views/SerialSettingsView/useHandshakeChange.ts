/**
 * DTR/RTS 开关接线——E6#87b 从 views/SerialSettingsView.tsx 搬出（只搬不改）。
 *
 * E5.8#30.18：DTR/RTS 运行中切换直发（带端口）+ 口开判断——侧栏开关不只看会话，还驱动硬件电平。
 */

import { useCallback } from "react";
import type { SerialSession } from "../../hooks/useSerialSessions";
// E5.8#30.18：DTR/RTS 运行中切换直发（带端口）+ 口开判断——侧栏开关不只看会话，还驱动硬件电平
import { getOpenPorts } from "../../services/SerialContext";

export function useHandshakeChange(
  activeSession: SerialSession | null,
  activeSessionId: string | null,
  updateSession: (id: string, patch: Partial<SerialSession>) => void,
  setDtr: (port: string, enable: boolean) => Promise<void>,
  setRts: (port: string, enable: boolean) => Promise<void>,
) {
  // E5.8#30.18：DTR/RTS 开关——写会话（per-COM 配置态）+ 口开着才直发硬件（显式传会话口，per-tab 精确）。
  // 打开时初始电平由 openPort action 应用（ControlPanel 透传 handshake）——本处只管运行中切换。
  return useCallback(
    (key: "dtr" | "rts", v: boolean) => {
      if (!activeSessionId) return;
      updateSession(activeSessionId, { [key]: v } as Partial<SerialSession>);
      const port = activeSession?.port;
      if (port && getOpenPorts().has(port)) {
        const act = key === "dtr" ? setDtr : setRts;
        act(port, v).catch((e) => console.error(`[serial-monitor] 设置 ${key.toUpperCase()} 失败:`, e));
      }
    },
    [activeSessionId, updateSession, activeSession?.port, setDtr, setRts],
  );
}
