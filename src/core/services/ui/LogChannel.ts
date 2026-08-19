/**
 * 插件日志/诊断频道——对标 VS Code OutputChannel。
 * Phase 5 盲区 10（P1）：插件开发者需要调试输出——不是 toast（对用户可见），是日志频道（对开发者可见）。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §盲区10
 * VS Code 对标：vscode.window.createOutputChannel()
 * VS Code 源码：src/vs/workbench/services/output/common/output.ts — IOutputChannel
 *
 * Phase 5 建数据通道（appendLine / show），Phase 6 建 Output 查看器 UI。
 */

import { Emitter } from "../../react/events/CoreEvents";
import { trackRegistration } from "../../registry/registrationTracker";

/* ── 类型 ── */

export interface LogChannelEntry {
  timestamp: number;
  message: string;
  severity?: "info" | "warn" | "error";
}

export interface LogChannel {
  /** 频道 ID——如 "terminal" / "protocol-sbq" */
  id: string;
  /** 频道显示名 */
  name: string;
  /** 所属插件 ID */
  pluginId: string;
  /** 日志列表 */
  entries: LogChannelEntry[];

  /** 追加一行 */
  appendLine(message: string, severity?: "info" | "warn" | "error"): void;

  /** 清空 */
  clear(): void;

  /** 标记为可见——Output 面板应打开并切换到此频道（Phase 6 UI 消费） */
  show(): void;

  /** 销毁频道——从注册表移除（E5.8#10：per-entry disposer） */
  dispose(): void;
}

/* ── 频道注册表 ── */

const _channels = new Map<string, LogChannel>();

/** 创建日志频道——对标 VS Code window.createOutputChannel() */
export function createLogChannel(
  pluginId: string,
  name: string,
  customId?: string
): LogChannel {
  const id = customId ?? `plugin-${pluginId}`;

  if (_channels.has(id)) {
    return _channels.get(id)!;
  }

  const channel: LogChannel = {
    id,
    name,
    pluginId,
    entries: [],

    appendLine(message: string, severity?: "info" | "warn" | "error") {
      this.entries.push({
        timestamp: performance.now(),
        message,
        severity,
      });
      // 上限 500 条——防止无限增长
      if (this.entries.length > 500) {
        this.entries.splice(0, 100);
      }
      onDidChangeLogChannel.fire({ channelId: id, entry: this.entries[this.entries.length - 1] });
    },

    clear() {
      this.entries.length = 0;
      onDidChangeLogChannel.fire({ channelId: id, entry: null });
    },

    show() {
      onDidRequestShowChannel.fire(id);
    },

    dispose() {
      _channels.delete(id);
    },
  };

  _channels.set(id, channel);
  // E5.8#10：仅 fresh-create 路径追踪——重复创建返回既有频道不重复入层
  // （dispose 幂等——频道已被 dispose 后再 rollback 删除同一 key 无害）
  trackRegistration(pluginId, () => {
    _channels.delete(id);
  });
  return channel;
}

/** 获取日志频道 */
export function getLogChannel(id: string): LogChannel | undefined {
  return _channels.get(id);
}

/** 获取所有日志频道——Output 面板消费 */
export function getLogChannels(): LogChannel[] {
  return Array.from(_channels.values());
}

/** 注销插件的全部日志频道——卸载时调用 */
export function unregisterPluginChannels(pluginId: string): void {
  for (const [id, channel] of _channels) {
    if (channel.pluginId === pluginId) {
      _channels.delete(id);
    }
  }
}

/* ── 事件（UI 层订阅） ── */

/** 日志频道内容变更——Output 面板实时更新 */
export const onDidChangeLogChannel = new Emitter<{
  channelId: string;
  entry: LogChannelEntry | null; // null = 清空
}>();

/** 频道请求显示——插件调 show() 时通知 Output 面板 */
export const onDidRequestShowChannel = new Emitter<string>(); // channelId

/** 清空所有频道（测试用） */
export function clearLogChannels(): void {
  _channels.clear();
}
