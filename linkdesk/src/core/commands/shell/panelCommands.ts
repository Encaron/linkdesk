/**
 * 壳面板命令——底部面板显隐（E5.8#31）+ 菜单栏「面板」菜单招牌（E5.8#33）。
 * E5.8#31：自 coreCommands.ts 划分独立文件（settingsCommands 同款模式）。
 */

import { registerCommand } from "../../registry/commands/CommandRegistry";
import { registerMenuItems, MENU_SLOTS } from "../../registry/commands/MenuRegistry"; // E5.8#33：面板菜单招牌
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

  // E5.8#33：菜单栏「面板」顶级菜单——壳声明招牌（空间归宿主，[[content-vs-space-ownership]]）。
  // 归并机制零新设施：插件 contributes.menus.menuBar/panel + group:"panel" 与壳招牌同组自动归入
  // （titlebar collectMenuBarGroups 按 group 分组——注册表当桌子，双方零耦合）。
  // order: 100 让「面板」排在「文件/查看」（缺省 99）之后。
  registerMenuItems(MENU_SLOTS.Panel, APP_PLUGIN_ID, [
    {
      command: "",
      label: "面板",
      group: "panel",
      order: 100,
      children: [
        // 招牌条目——togglePanel 同命令（点击 = 打开/折叠底部面板）
        { command: "workbench.action.togglePanel", label: "打开面板", group: "panel" },
      ],
    },
  ]);
}
