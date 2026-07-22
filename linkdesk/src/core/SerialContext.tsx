/**
 * 串口状态上下文。
 * Phase 4 Step 2：桥接 App.tsx（持有串口状态）和终端插件（消费串口状态）。
 * Phase 4 Step 3 TopBar 移除后，此上下文成为串口状态的唯一共享通道。
 */

import { createContext, useContext } from "react";

export interface PortInfo {
  name: string;
  description: string;
}

export interface SerialState {
  ports: PortInfo[];
  portName: string;
  baudRate: string;
  isOpen: boolean;
  txBytes: number;
  rxBytes: number;
  lastError: string | null;
}

export interface SerialActions {
  /** encoding: 从 session 传入 receiveCoding（E8 fix——不再读旧配置系统） */
  toggleOpen: (encoding?: string) => Promise<void>;
  setPortName: (port: string, encoding?: string) => Promise<void>;
  setBaudRate: (baud: string, encoding?: string) => Promise<void>;
}

export interface SerialContextValue {
  state: SerialState;
  actions: SerialActions;
}

const SerialContext = createContext<SerialContextValue | null>(null);

export function useSerialContext(): SerialContextValue {
  const ctx = useContext(SerialContext);
  if (!ctx) {
    throw new Error("useSerialContext 必须在 <SerialContext.Provider> 内使用");
  }
  return ctx;
}

export default SerialContext;
