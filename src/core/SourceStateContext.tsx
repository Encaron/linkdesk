/**
 * 数据源状态上下文（E2b #7——替代 SerialContext）。
 *
 * 核心只知道"数据源"概念——{ name, isOpen, stats }——不知道"串口"。
 * 所有数据源类型（串口、TCP、BLE、文件等）共用此上下文。
 * 串口监视器插件通过 plugins/user/serial-monitor/SerialContext.tsx 别名导入。
 *
 * 对标 VS Code：src/vs/platform/ — platform services that don't know about specific features.
 */

import { createContext, useContext } from "react";

/** 可用数据源列表项 */
export interface SourceInfo {
  name: string;
  description: string;
}

/** 数据源运行时状态 */
export interface SourceState {
  ports: SourceInfo[];
  sourceName: string;
  /** 波特率——串口特定字段。非串口数据源（TCP/BLE/文件）忽略此字段。 */
  baudRate: string;
  isOpen: boolean;
  txBytes: number;
  rxBytes: number;
  lastError: string | null;
}

/** 数据源操作 */
export interface SourceActions {
  toggleOpen: (encoding?: string) => Promise<void>;
  setSourceName: (name: string, encoding?: string) => Promise<void>;
  setBaudRate: (baud: string, encoding?: string) => Promise<void>;
}

export interface SourceStateContextValue {
  state: SourceState;
  actions: SourceActions;
}

const SourceStateContext = createContext<SourceStateContextValue | null>(null);

/** 通用数据源状态 hook——v3Api 和插件都走这个入口 */
export function useSourceState(): SourceStateContextValue {
  const ctx = useContext(SourceStateContext);
  if (!ctx) {
    throw new Error("useSourceState 必须在 <SourceStateContext.Provider> 内使用");
  }
  return ctx;
}

export default SourceStateContext;
