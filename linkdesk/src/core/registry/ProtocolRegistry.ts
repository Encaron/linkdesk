/**
 * 协议注册表——V3 独有基础设施（VS Code 不做硬件协议解析）。
 * Phase 5 柱子 4：插件声明 mode + entry → 注册解析函数 → 终端下拉框切换。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子4
 */

/* ── 类型 ── */

export type ProtocolMode = "text" | "binary";

/**
 * 协议解析器条目。
 * text 模式：parseLine 在前端 TS 中运行。
 * binary 模式：parseBinary 在 Rust/WASM 端运行（Phase 7）。
 */
export interface ProtocolEntry {
  id: string;
  name: string;
  pluginId: string;
  mode: ProtocolMode;
  /** text 模式：行解析函数。输入一行原始文本 → 输出解析后的字段数组 */
  parseLine?: (line: string) => { cardId?: string; value?: unknown; fields?: Record<string, unknown> }[];
  /** binary 模式：字节帧解析函数（Phase 7） */
  parseBinary?: (bytes: Uint8Array) => { cardId?: string; value?: unknown; fields?: Record<string, unknown> }[];
  /** 可选：自动检测函数——收到原始字节时判断是否匹配此协议 */
  detect?: (rawBytes: Uint8Array) => boolean;
}

/* ── Registry ── */

import { trackRegistration } from "./registrationTracker";

const _protocols = new Map<string, ProtocolEntry>();
let _activeProtocolId = "bracket"; // 默认方括号协议——Phase 5 迁移后从 Prefs 读

/** 注册协议——loader 在检测到 mode 为 "text" 或 "binary" 时调用。
 *  E5.8#10：返 disposer + track——引用级删除，dispose 不误删后来者覆盖的条目。 */
export function registerProtocol(entry: ProtocolEntry): () => void {
  if (_protocols.has(entry.id)) {
    console.warn(`[ProtocolRegistry] 协议 "${entry.id}" 重复注册——覆盖旧解析器`);
  }
  _protocols.set(entry.id, entry);
  return trackRegistration(entry.pluginId, () => {
    if (_protocols.get(entry.id) === entry) {
      _protocols.delete(entry.id);
      if (_activeProtocolId === entry.id) {
        _activeProtocolId = "bracket"; // 回退到内置方括号协议
      }
    }
  });
}

/** 注销协议——卸载时调用 */
export function unregisterProtocol(protocolId: string): boolean {
  if (_activeProtocolId === protocolId) {
    _activeProtocolId = "bracket"; // 回退到内置方括号协议
  }
  return _protocols.delete(protocolId);
}

/** 注销插件的全部协议 */
export function unregisterPluginProtocols(pluginId: string): void {
  for (const [id, entry] of _protocols) {
    if (entry.pluginId === pluginId) {
      _protocols.delete(id);
      if (_activeProtocolId === id) {
        _activeProtocolId = "bracket";
      }
    }
  }
}

/** 获取所有已注册协议——终端下拉框消费 */
export function listProtocols(): ProtocolEntry[] {
  return Array.from(_protocols.values());
}

/** 设置当前活跃协议 */
export function setActiveProtocol(protocolId: string): void {
  if (!_protocols.has(protocolId)) {
    console.warn(`[ProtocolRegistry] 协议 "${protocolId}" 未注册——保持当前协议`);
    return;
  }
  _activeProtocolId = protocolId;
}

/** 获取当前活跃协议 */
export function getActiveProtocol(): ProtocolEntry | undefined {
  return _protocols.get(_activeProtocolId);
}

/** 获取当前活跃协议 ID */
export function getActiveProtocolId(): string {
  return _activeProtocolId;
}

/** 获取单个协议 */
export function getProtocol(protocolId: string): ProtocolEntry | undefined {
  return _protocols.get(protocolId);
}

/** 自动检测协议——收到原始字节时调用所有协议的 detect 函数 */
export function autoDetectProtocol(bytes: Uint8Array): ProtocolEntry | undefined {
  for (const entry of _protocols.values()) {
    if (entry.detect?.(bytes)) {
      return entry;
    }
  }
  return undefined;
}

/** 清空注册表（测试用） */
export function clearProtocols(): void {
  _protocols.clear();
  _activeProtocolId = "bracket";
}
