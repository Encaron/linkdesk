/**
 * IpcBridgeHandler 底部面板域——E5.8#34.5 自建。
 * panel:* channel 处理器 verbatim。依赖方向：panel → ShellEvents（panel:reveal）；被聚合器委派。
 */

import { shellEvents } from "../../../react/events/ShellEvents"; // E5.8#34.5

/** panel:* 处理器——插件调壳的 linkdesk.panel API（经 ShellEvents 事件总线）。全 case void emit 无返回 */
export async function handlePanelChannel(channel: string, args: unknown[]): Promise<void> {
  switch (channel) {
    // ── E5.8#34.5：面板视图聚焦——插件调 linkdesk.panel.reveal(viewId) ──
    case "panel:reveal": {
      const [viewId] = args as [string];
      shellEvents.emit("panel:reveal", { viewId });
      break;
    }
    // ── E5.8#39.5：悬浮面板声明制——插件调 linkdesk.panel.revealFloating(viewId, pluginId?) ──
    case "panel:reveal-floating": {
      // E5.8#41.18：插件侧可选 pluginId 复合寻址——双设置套同名 viewId 并存时精确命中目标套
      //（壳侧路径 Ctrl+,/右键同款载荷；裸 viewId 多命中 fail-loud no-op）
      const [viewId, pluginId] = args as [string, string | undefined];
      shellEvents.emit("panel:reveal-floating", { viewId, pluginId });
      break;
    }
    default:
      throw new Error(`未知的 bridge channel: ${channel}`);
  }
}
