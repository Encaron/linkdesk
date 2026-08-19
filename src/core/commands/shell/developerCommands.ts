/**
 * 壳开发者命令——DevTools/重载等。
 * E5#44-4：从 coreCommands.ts 提取。
 */

import { registerCommand } from "../../registry/commands/CommandRegistry";
import { registerMenuItems, MENU_SLOTS } from "../../registry/commands/MenuRegistry";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import { QuickPickService } from "../../services/ui/QuickPickService"; // E5.5#7-p15
import i18n from "../../../i18n"; // E5.7#15：serialize 非 React 上下文解析显示文本（显示文本铁律）

export function registerDeveloperCommands(): void {
  const commands = [
    {
      id: "workbench.action.togglePluginDevTools",
      title: "切换插件 DevTools",
      category: "开发者",
      handler: async () => {
        // E5.5#7-p15：直调 QuickPickService——不再 dispatch SHOW_DEVTOOLS_PICKER
        // E5.7#44：插件 DevTools 入口已删（per-tab 插件 WebView 消亡）——插件在池渲染进程内，
        // 池 DevTools 已覆盖。picker 只剩池 + 壳两个入口。
        const lk = window.linkdesk;
        type DevToolsTarget = { kind: 'shell' } | { kind: 'pool' };
        const targets: DevToolsTarget[] = [];
        if (lk?.pool) {
          targets.push({ kind: 'pool' });
        }
        targets.push({ kind: 'shell' });

        // E5.7#15：显示文本归一——查表/三元比较集中在 helper（一处定义），
        // 绕开 no-restricted-syntax lowercase 字面量比较误报；
        // E5.8#6.6：显示文本铁律全覆盖——label/category/detail 全部 i18n.t() 解析后推池（池原样渲染）
        const searchOf = (t: DevToolsTarget) => t.kind === 'shell' ? i18n.t('shell 壳窗口') : i18n.t('pool 池窗口');
        const keyOf = (t: DevToolsTarget) => t.kind === 'shell' ? '__shell__' : '__pool__';
        const labelOf = (t: DevToolsTarget) => t.kind === 'shell' ? i18n.t('shell 壳窗口') : i18n.t('Pool 池窗口');
        const detailOf = (t: DevToolsTarget) => t.kind === 'shell' ? i18n.t('壳窗口 DevTools') : i18n.t('池窗口 DevTools');

        QuickPickService.show<DevToolsTarget>({
          mode: "devtools",
          items: targets,
          placeholder: i18n.t("选择 WebView…"),
          getSearchText: (t) => searchOf(t),
          getKey: (t) => keyOf(t),
          onSelect: async (t) => {
            if (t.kind === 'shell') {
              await lk?.window?.toggleDevTools?.();
            } else {
              lk?.pool?.toggleDevTools?.();
            }
            QuickPickService.hide();
          },
          // E5.7#15：聪慧→哑——池 DTO 序列化（壳侧解析后推送，池原样渲染）
          serialize: (t) => ({
            key: keyOf(t),
            searchText: searchOf(t),
            label: labelOf(t),
            category: i18n.t("切换 DevTools"),
            detail: detailOf(t),
          }),
          onClose: () => QuickPickService.hide(),
        });
      },
    },
  ];

  for (const c of commands) {
    registerCommand(APP_PLUGIN_ID, c);
  }

  // 齿轮菜单入口
  registerMenuItems(MENU_SLOTS.ExtensionGear, APP_PLUGIN_ID, [
    { command: "workbench.action.togglePluginDevTools", group: "navigation" },
  ]);
}
