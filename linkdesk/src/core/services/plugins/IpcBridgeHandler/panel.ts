/**
 * IpcBridgeHandler 底部面板域——E5.8#34.5 自建 / #35.5 扩 moveToEditor。
 * panel:* channel 处理器 verbatim。依赖方向：panel → ShellEvents（panel:reveal / panel:moveToEditor）；被聚合器委派。
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
    // ── E5.8#35.5：面板视图升级主区标签页——插件调 linkdesk.panel.moveToEditor(viewId) ──
    case "panel:moveToEditor": {
      const [viewId] = args as [string];
      shellEvents.emit("panel:moveToEditor", { viewId });
      break;
    }
    default:
      throw new Error(`未知的 bridge channel: ${channel}`);
  }
}
