/**
 * 壳标签页命令——Ctrl+W / Ctrl+Tab / Ctrl+Shift+T 等。
 * E5#44-2：从 coreCommands.ts 提取。
 */

import { registerCommand, type Command } from "../../registry/commands/CommandRegistry";
import { getCallbacks } from "../infra/CoreCallbacks";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";

export function registerTabCommands(): void {
  // 🔴 显式标注 `Command[]`——同 settingsCommands 的同款理由：不标则 `type: "object"` 放宽成 `string`。
  const commands: Command[] = [
    {
      id: "workbench.action.closeActiveTab",
      title: "关闭标签页",
      category: "标签页",
      description: "关闭当前窗口的活动标签页",
      // ctx 可省——无参调用 = 关当前聚焦窗口的活动标签页（快捷键路径壳侧自动注入 sourceWindowId）
      params: [{ name: "ctx", type: "object", required: false, description: "{ sourceWindowId: string }——发起操作的窗口 id（多窗键盘路由用，省略 = 主窗口）" }],
      // E5.8#46.8：快捷键转发带 sourceWindowId（键盘路由按聚焦窗裁决）——从命令 args 末尾取并透传给 callbacks
      handler: async (...args: unknown[]) => {
        getCallbacks()?.closeActiveTab((args[args.length - 1] as { sourceWindowId?: string } | undefined)?.sourceWindowId);
      },
    },
    {
      id: "workbench.action.reopenClosedEditor",
      title: "重新打开已关闭的编辑器",
      category: "标签页",
      description: "撤销关闭：重新打开最近关闭的标签页",
      handler: async () => { getCallbacks()?.reopenClosedTab(); },
    },
    {
      id: "workbench.action.nextTab",
      title: "下一个标签页",
      category: "标签页",
      description: "聚焦同分组中的下一个标签页",
      params: [{ name: "ctx", type: "object", required: false, description: "{ shift: boolean }——true 则聚焦上一个，省略/false 聚焦下一个" }],
      handler: async (...args: unknown[]) => {
        getCallbacks()?.focusNextTab(!!(args[0] as { shift?: boolean } | undefined)?.shift);
      },
    },
    {
      id: "workbench.action.toggleSplit",
      title: "切换分屏",
      category: "标签页",
      description: "在当前分组上切换分屏（分屏 ↔ 合并）",
      handler: async () => { getCallbacks()?.toggleSplit(); },
    },
    {
      id: "core.closeAllEditors",
      title: "关闭所有编辑器",
      category: "标签页",
      description: "关闭全部分组里的所有编辑器标签页",
      handler: async () => { getCallbacks()?.closeAllEditors(); },
    },
    {
      id: "workbench.action.focusNthTab",
      title: "跳转到标签页",
      category: "标签页",
      description: "聚焦同分组中的第 n 个标签页",
      params: [{ name: "ctx", type: "object", required: true, description: "{ n: number }——目标标签页序号（从 1 起）" }],
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
