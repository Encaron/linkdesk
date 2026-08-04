/**
 * 壳标签页命令——Ctrl+W / Ctrl+Tab / Ctrl+Shift+T 等。
 * E5#44-2：从 coreCommands.ts 提取。
 */

import { registerCommand } from "../registry/CommandRegistry";
import { getCallbacks } from "./CoreCallbacks";
import { APP_PLUGIN_ID } from "../services/PluginStateService";
import i18n from "../../i18n";

export function registerTabCommands(): void {
  const commands = [
    {
      id: "workbench.action.closeActiveTab",
      title: i18n.t("关闭标签页"),
      category: i18n.t("标签页"),
      handler: async () => { getCallbacks()?.closeActiveTab(); },
    },
    {
      id: "workbench.action.reopenClosedEditor",
      title: i18n.t("重新打开已关闭的编辑器"),
      category: i18n.t("标签页"),
      handler: async () => { getCallbacks()?.reopenClosedTab(); },
    },
    {
      id: "workbench.action.nextTab",
      title: i18n.t("下一个标签页"),
      category: i18n.t("标签页"),
      handler: async (_token: unknown, ...args: unknown[]) => {
        getCallbacks()?.focusNextTab(!!(args[0] as { shift?: boolean } | undefined)?.shift);
      },
    },
    {
      id: "workbench.action.toggleSplit",
      title: i18n.t("切换分屏"),
      category: i18n.t("标签页"),
      handler: async () => { getCallbacks()?.toggleSplit(); },
    },
    {
      id: "core.closeAllEditors",
      title: i18n.t("关闭所有编辑器"),
      category: i18n.t("标签页"),
      handler: async () => { getCallbacks()?.closeAllEditors(); },
    },
    {
      id: "workbench.action.focusNthTab",
      title: i18n.t("跳转到标签页"),
      category: i18n.t("标签页"),
      handler: async (_token: unknown, ...args: unknown[]) => {
        const n = (args[0] as { n: number } | undefined)?.n;
        if (n) getCallbacks()?.focusNthTab(n);
      },
    },
  ];

  for (const c of commands) {
    registerCommand(APP_PLUGIN_ID, c);
  }
}
