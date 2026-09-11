/**
 * getStatus 合并——E6#87b 从 services/SerialContext.tsx 搬出（只搬不改）。
 */

import type { SerialState, SerialStatusDto } from "./types";

// E5.7#98：merge 入参 = wire SerialStatus（portName/baudRate/isOpen）+ 历史 DTO 防御性字段（tx/rx/lastError），零 any
export function mergeStatus(p: SerialState, status: SerialStatusDto): SerialState {
  return {
    ...p,
    sourceName: status.portName ?? p.sourceName,
    baudRate: status.baudRate ?? p.baudRate,
    isOpen: status.isOpen ?? p.isOpen,
    lastError: status.lastError ?? p.lastError,
  };
}
