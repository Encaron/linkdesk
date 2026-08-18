/**
 * 内置协议注册。
 * Phase 5e：方括号解析器迁移到 ProtocolRegistry——从硬编码工具函数升级为可切换的注册协议。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子4 + §9.2 5e
 *
 * 模式：对标 coreCommands.ts——模块级 ensure 函数，幂等。
 * E5.7#49：调用方从壳 App.tsx 迁到主进程 plugin-manifest-loader——ProtocolRegistry
 * 唯一写入方收敛主进程（Registry 主进程化），parseLine/detect 随实例留在主进程（跨 IPC 剥壳）。
 */

import { registerProtocol } from "../../registry/ProtocolRegistry";
import { Parse } from "../../pipeline/ProtocolParser";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";

let _registered = false;

/** 将 ProtocolParser.Parse 包装为 ProtocolEntry.parseLine 签名 */
function bracketParseLine(line: string): { cardId?: string; value?: unknown; fields?: Record<string, unknown> }[] {
  const result = Parse(line);
  if (result.messages.length === 0) return [];

  return result.messages.map((msg) => {
    // 构建 fields 对象：arg0, arg1, ... → 数字字段名
    const fields: Record<string, unknown> = {};
    msg.fields.forEach((f, i) => {
      // 尝试解析为数字
      const num = Number(f);
      fields[`arg${i}`] = isNaN(num) ? f : num;
    });

    return {
      cardId: msg.id,
      value: msg.fields.length === 1 ? fields.arg0 : undefined,
      fields: msg.fields.length > 1 ? fields : undefined,
    };
  });
}

/** 注册内置方括号协议——幂等，主进程 plugin-manifest-loader 启动时调用（E5.7#49）。 */
export function ensureBuiltinProtocols(): void {
  if (_registered) return;
  _registered = true;

  registerProtocol({
    id: "bracket",
    name: "方括号协议",
    pluginId: APP_PLUGIN_ID, // 内置协议，不属于任何插件
    mode: "text",
    parseLine: bracketParseLine,
    // 自动检测：方括号协议的特征是行内含 [xxx] 结构
    detect: (rawBytes: Uint8Array) => {
      const text = new TextDecoder().decode(rawBytes.slice(0, 64));
      return text.includes("[") && text.includes("]");
    },
  });
}
