/**
 * IpcBridgeHandler 数据域——自 IpcBridgeHandler.ts 拆出（E5.8#0d.10-10g）。
 * pluginState:get/set 二 channel + search:searchFiles + encoding:detect/decode/encode 三 channel
 * + 插件生命周期变更订阅（_lifecycleUnsub 属主）verbatim。
 * 依赖方向：data → PluginStateService/FileSearcher/EncodingService/pluginLoader-lifecycle
 * + linkdesk-api（LinkDeskAPI 订阅类型）；被聚合器委派。
 */

import { getPluginStateValue, setPluginStateValue } from "../PluginStateService"; // E5#71
import { searchFiles } from "../../files/FileSearcher"; // E5.6#11.5g5
import { EncodingService } from "../../files/EncodingService"; // E5.6#11.5g5
// E5.5#7：插件生命周期广播——设置页等保姆插件依赖此事件刷新配置分组
import { onPluginLifecycleChange } from "../../../../pluginLoader/lifecycle/lifecycle";
import type { LinkDeskAPI } from "../../../api/linkdesk-api";

let _lifecycleUnsub: (() => void) | null = null;

// ── 插件生命周期变更广播──

export function subscribeData(linkdesk: LinkDeskAPI): void {
  // E5.5#7：插件生命周期变更 → 广播到插件 WebView → 设置页等保姆插件刷新
  _lifecycleUnsub = onPluginLifecycleChange.event(() => {
    try { linkdesk.events?.emit("plugin-lifecycle:changed", {}); } catch { /* 静默 */ }
  });
}

export function unsubscribeData(): void {
  _lifecycleUnsub?.();
  _lifecycleUnsub = null;
}

/** pluginState:* / search:* / encoding:* 六 channel 处理器 */
export async function handleDataChannel(channel: string, args: unknown[]): Promise<unknown> {
  switch (channel) {
    // ── E5#71：插件持久化存储——集中缓存 + 文件持久化 ──
    case "pluginState:get": {
      const [pluginId, key] = args as [string, string];
      return getPluginStateValue(pluginId, key);
    }
    case "pluginState:set": {
      const [pluginId, key, value] = args as [string, string, unknown];
      await setPluginStateValue(pluginId, key, value);
      // E5#84f：广播变更到所有 WebView——pluginState.onChange 订阅者收到通知
      try { window.linkdesk?.events?.emit("plugin-state:changed", { pluginId, key, value }); } catch { /* 静默 */ }
      break;
    }

    // ── E5.6#11.5g5：文件搜索——池插件跨进程全文搜索（对齐 FileSearcher.SearchOptions）──
    case "search:searchFiles": {
      const [opts] = args as [Parameters<typeof searchFiles>[0]];
      return searchFiles(opts);
    }

    // ── E5.6#11.5g5：编码检测/转换——池插件跨进程使用 EncodingService ──
    case "encoding:detect": {
      const [buffer] = args as [Uint8Array];
      return EncodingService.detect(buffer);
    }
    case "encoding:decode": {
      const [buffer, encoding] = args as [Uint8Array, string];
      return EncodingService.decode(buffer, encoding);
    }
    case "encoding:encode": {
      const [text, encoding] = args as [string, string];
      return EncodingService.encode(text, encoding);
    }
    default:
      throw new Error(`未知的 bridge channel: ${channel}`);
  }
}
