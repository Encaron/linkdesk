/**
 * 壳开发者命令——DevTools/重载等。
 * E5#44-4：从 coreCommands.ts 提取。
 */

import { registerCommand } from "../registry/CommandRegistry";
import { registerMenuItems, MenuId } from "../registry/MenuRegistry";
import { APP_PLUGIN_ID } from "../services/PluginStateService";
import { QuickPickService } from "../registry/QuickPickService"; // E5.5#7-p15

export function registerDeveloperCommands(): void {
  const commands = [
    {
      id: "workbench.action.togglePluginDevTools",
      title: "切换插件 DevTools",
      category: "开发者",
      handler: async () => {
        // E5.5#7-p15：直调 QuickPickService——不再 dispatch SHOW_DEVTOOLS_PICKER
        const lk = window.linkdesk;
        const webViewIds: string[] = await lk?.pluginViews?.getAllIds?.() ?? [];
        type DevToolsTarget = { kind: 'plugin'; id: string } | { kind: 'shell' } | { kind: 'pool' };
        const targets: DevToolsTarget[] = webViewIds.map(id => ({ kind: 'plugin' as const, id }));
        // E5.7：池 DevTools 也出现在 picker 中——单 Pool 一个入口
        // （E5.6 双Pool 的 sidebar/main zone 已随 #12 SidebarPool 删除——池是唯一 WCV，无 zone 之分）
        if (lk?.pool) {
          targets.push({ kind: 'pool' });
        }
        targets.push({ kind: 'shell' });

        // E5.7#15：显示文本归一——查表/三元比较集中在 helper（一处定义），
        // 绕开 no-restricted-syntax lowercase 字面量比较误报
        const searchOf = (t: DevToolsTarget) => t.kind === 'shell' ? 'shell 壳窗口' : t.kind === 'pool' ? 'pool 池窗口' : t.id;
        const keyOf = (t: DevToolsTarget) => t.kind === 'shell' ? '__shell__' : t.kind === 'pool' ? '__pool__' : t.id;
        const labelOf = (t: DevToolsTarget) => t.kind === 'shell' ? 'shell 壳窗口' : t.kind === 'pool' ? 'Pool 池窗口' : `插件: ${t.id}`;
        const detailOf = (t: DevToolsTarget) => t.kind === 'shell' ? '壳窗口 DevTools' : t.kind === 'pool' ? '池窗口 DevTools' : '插件 DevTools';

        QuickPickService.show<DevToolsTarget>({
          mode: "devtools",
          items: targets,
          placeholder: "选择 WebView…",
          getSearchText: (t) => searchOf(t),
          getKey: (t) => keyOf(t),
          onSelect: async (t) => {
            if (t.kind === 'shell') {
              await lk?.window?.toggleDevTools?.();
            } else if (t.kind === 'pool') {
              lk?.pool?.toggleDevTools?.();
            } else {
              await lk?.pluginViews?.toggleDevTools?.(t.id);
            }
            QuickPickService.hide();
          },
          // E5.7#15：聪慧→哑——池 DTO 序列化（壳侧解析后推送，池原样渲染）
          serialize: (t) => ({
            key: keyOf(t),
            searchText: searchOf(t),
            label: labelOf(t),
            category: "切换 DevTools",
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
  registerMenuItems(MenuId.ExtensionGear, APP_PLUGIN_ID, [
    { command: "workbench.action.togglePluginDevTools", group: "navigation" },
  ]);
}
