/**
 * IpcBridgeHandler 标签页域——自 IpcBridgeHandler.ts 拆出（E5.8#0d.10-10c）。
 * DEFAULT_TAB_TYPE 壳政策常量 + tabs:* 七 channel verbatim。
 * 依赖方向：tabs → ShellEvents（tab:* 事件）；被聚合器委派。
 */

import { shellEvents } from "../../../react/events/ShellEvents"; // E5#68

// E5.7#70：tabs:create 未知类型兜底——对标 VS Code 文本编辑器 fallback。
// 壳政策常量（硬约束 10 白名单例外）：未声明类型的开标签请求路由到编辑器插件。
// 为什么是编辑器：tabs:create 语义 = "打开点什么"——编辑器是唯一无参数可开的通用内容容器。
export const DEFAULT_TAB_TYPE = "editor";

/** tabs:* 七 channel 处理器——插件调壳的 tabs API（经 ShellEvents 事件总线）。全 case void emit 无返回 */
export async function handleTabsChannel(channel: string, args: unknown[]): Promise<void> {
  switch (channel) {
    // ── E5#68：标签页操作——插件调壳的 tabs API ──
    case "tabs:create": {
      const [type, opts] = args as [string, Record<string, unknown>?];
      // E5#99：壳统一守卫——未知类型路由到编辑器（对标 VS Code 文本编辑器 fallback）
      shellEvents.emit("tab:create", { type: type || DEFAULT_TAB_TYPE, opts });
      break;
    }
    case "tabs:openOrFocus": {
      const [type, opts] = args as [string, Record<string, unknown>?];
      shellEvents.emit("tab:openOrFocus", { type, opts });
      break;
    }
    case "tabs:focus": {
      const [tabId] = args as [string];
      shellEvents.emit("tab:focus", { tabId });
      break;
    }
    case "tabs:close": {
      const [tabId] = args as [string];
      shellEvents.emit("tab:close", { tabId });
      break;
    }
    case "tabs:focusBySourceId": {
      const [sourceId] = args as [string];
      shellEvents.emit("tab:focusBySourceId", { sourceId });
      break;
    }
    case "tabs:updateLabelBySourceId": {
      const [sourceId, label] = args as [string, string];
      shellEvents.emit("tab:updateLabelBySourceId", { sourceId, label });
      break;
    }
    case "tabs:closeBySourceId": {
      const [sourceId] = args as [string];
      shellEvents.emit("tab:closeBySourceId", { sourceId });
      break;
    }
    default:
      throw new Error(`未知的 bridge channel: ${channel}`);
  }
}
