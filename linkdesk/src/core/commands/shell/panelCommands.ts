/**
 * 壳面板命令——底部面板显隐（E5.8#31）。
 * E5.8#31：自 coreCommands.ts 划分独立文件（settingsCommands 同款模式）。
 */

import { registerCommand } from "../../registry/commands/CommandRegistry";
import { shellEvents } from "../../react/events/ShellEvents";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";

export function registerPanelCommands(): void {
  // E5.8#31：底部面板显隐切换（VS Code 标准 Ctrl+J）——与侧栏 Ctrl+B 同构：
  // 命令只做入口 emit panel:toggle，App usePanelHost 消费翻转 + 持久化。真相源 = App state。
  // 无 panel 贡献插件时命令无可见效果（state 翻转无害，usePoolSync 无 panelViews → 不推 panel 字段）。
  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.togglePanel",
    title: "切换底部面板可见性",
    category: "视图",
    handler: async () => {
      shellEvents.emit("panel:toggle", undefined);
    },
  });
}
