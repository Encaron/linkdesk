/**
 * 壳标签页命令——Ctrl+W / Ctrl+Tab / Ctrl+Shift+T 等。
 * E5#44-2：从 coreCommands.ts 提取。
 */

import { registerCommand } from "../../registry/commands/CommandRegistry";
import { getCallbacks } from "../infra/CoreCallbacks";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";

export function registerTabCommands(): void {
  const commands = [
    {
      id: "workbench.action.closeActiveTab",
      title: "关闭标签页",
      category: "标签页",
      // E5.8#46.8：快捷键转发带 sourceWindowId（键盘路由按聚焦窗裁决）——从命令 args 末尾取并透传给 callbacks
      handler: async (...args: unknown[]) => {
        getCallbacks()?.closeActiveTab((args[args.length - 1] as { sourceWindowId?: string } | undefined)?.sourceWindowId);
      },
    },
    {
      id: "workbench.action.reopenClosedEditor",
      title: "重新打开已关闭的编辑器",
      category: "标签页",
      handler: async () => { getCallbacks()?.reopenClosedTab(); },
    },
    {
      id: "workbench.action.nextTab",
      title: "下一个标签页",
      category: "标签页",
      handler: async (...args: unknown[]) => {
        getCallbacks()?.focusNextTab(!!(args[0] as { shift?: boolean } | undefined)?.shift);
      },
    },
    {
      id: "workbench.action.toggleSplit",
      title: "切换分屏",
      category: "标签页",
      handler: async () => { getCallbacks()?.toggleSplit(); },
    },
    {
      id: "core.closeAllEditors",
      title: "关闭所有编辑器",
      category: "标签页",
      handler: async () => { getCallbacks()?.closeAllEditors(); },
    },
    {
      id: "workbench.action.focusNthTab",
      title: "跳转到标签页",
      category: "标签页",
      handler: async (...args: unknown[]) => {
        const n = (args[0] as { n: number } | undefined)?.n;
        if (n) getCallbacks()?.focusNthTab(n);
      },
    },
  ];

  for (const c of commands) {
    registerCommand(APP_PLUGIN_ID, c);
  }
}
