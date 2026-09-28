/**
 * IpcBridgeHandler 标签页域——自 IpcBridgeHandler.ts 拆出（E5.8#0d.10-10c）。
 * DEFAULT_TAB_TYPE 壳政策常量 + tabs:* 七 channel verbatim；M1 `AI#3` 加 `handleTabsMethod`
 * （读取面经 `plugins:call` 门面，**零新增 IPC 通道**）。
 * 依赖方向：tabs → ShellEvents（tab:* 事件）+ readSnapshots（壳侧标签清单提供者槽）；被聚合器委派。
 */

import { shellEvents } from "../../../react/events/ShellEvents"; // E5#68
import { tabsSnapshot } from "../readSnapshots"; // M1 AI#3：壳侧标签清单（usePoolSync 注册的 serializeGroups 闭包）

// E5.7#70：tabs:create 未知类型兜底——对标 VS Code 文本编辑器 fallback。
// 壳政策常量（硬约束 10 白名单例外）：未声明类型的开标签请求路由到编辑器插件。
// 为什么是编辑器：tabs:create 语义 = "打开点什么"——编辑器是唯一无参数可开的通用内容容器。
export const DEFAULT_TAB_TYPE = "editor";

/**
 * tabs:* 七 channel 处理器——插件调壳的 tabs API（经 ShellEvents 事件总线）。全 case void emit 无返回。
 * sourceWindowId = 信封来源窗章（E5.8#46.12，主进程 sender 反查）——focusBySourceId 按章路由到来源窗注册表。
 * E5.8#46.2：updateLabelBySourceId/closeBySourceId 改走 windowHost 全窗广播（资源事件 = 全窗事实）——emit 不带章。
 */
export async function handleTabsChannel(channel: string, args: unknown[], sourceWindowId?: string): Promise<void> {
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
      shellEvents.emit("tab:focusBySourceId", { sourceId, sourceWindowId });
      break;
    }
    case "tabs:updateLabelBySourceId": {
      const [sourceId, label] = args as [string, string];
      // E5.8#46.2：全窗广播（windowHost 唯一订阅点）——不带 sourceWindowId（章只留给 focus 单发路由）
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

/**
 * M1 `AI#3`：标签页域的**读取面**方法（`plugins:call` 门面，非 wire channel）。
 *
 * 🔴 为什么单开一个函数而不是塞进 `handleTabsChannel`：那个 switch 的键是**主进程代理通道名**
 * （`tabs:create` 等，由 preload 的 `ipcRenderer.invoke(IPC.tabs.*)` 触发）；本方法是**池经
 * `plugins:call` 的按名调用**（与 `showNotification`/`theme.*` 同族）。混在一起会让「通道」与
 * 「方法」两种寻址漂移成一种。
 *
 * 🔴 为什么读取面走 `plugins:call` 而不新开 `tabs:list` 通道：新通道 = 主进程注册 + 命名空间矩阵
 * §3 通道计数改 + 审计门禁多处动**（本格只加一个读方法，不值当）。既有门面已经通了。
 */
export function handleTabsMethod(method: string): unknown {
  switch (method) {
    case "listTabs":
      // 壳是标签权威（`useTabManager` React state）——答案由 usePoolSync 注册的提供者给
      // （`serializeGroups` 同一序列化器 ⇒ 与布局树对得上，AI#3 判据）。未注册 → 大声抛（可诊断）。
      return tabsSnapshot.read();
    default:
      throw new Error(`未知的 plugins 方法: ${method}`);
  }
}
