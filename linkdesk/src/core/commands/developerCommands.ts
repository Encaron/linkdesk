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
        type DevToolsTarget = { kind: 'plugin'; id: string } | { kind: 'shell' } | { kind: 'pool'; zone: string };
        const targets: DevToolsTarget[] = webViewIds.map(id => ({ kind: 'plugin' as const, id }));
        // E5.6#9：Pool WebView 也出现在 DevTools picker 中
        if (lk?.pool) {
          targets.push({ kind: 'pool', zone: 'sidebar' });
          targets.push({ kind: 'pool', zone: 'main' });
        }
        targets.push({ kind: 'shell' });

        QuickPickService.show<DevToolsTarget>({
          mode: "devtools",
          items: targets,
          placeholder: "选择 WebView…",
          getSearchText: (t) => t.kind === 'shell' ? 'shell 壳窗口' : t.kind === 'pool' ? `pool:${t.zone}` : t.id,
          getKey: (t) => t.kind === 'shell' ? '__shell__' : t.kind === 'pool' ? `__pool_${t.zone}__` : t.id,
          onSelect: async (t) => {
            if (t.kind === 'shell') {
              await lk?.window?.toggleDevTools?.();
            } else if (t.kind === 'pool') {
              lk?.pool?.toggleDevTools?.(t.zone);
            } else {
              await lk?.pluginViews?.toggleDevTools?.(t.id);
            }
            QuickPickService.hide();
          },
          renderLabel: (t) => t.kind === 'shell' ? 'shell 壳窗口' : t.kind === 'pool' ? `Pool: ${t.zone}` : `插件: ${t.id}`,
          renderCategory: () => "切换 DevTools",
          renderDetail: (t) => t.kind === 'shell' ? '壳窗口 DevTools' : t.kind === 'pool' ? `${t.zone} Pool DevTools` : '插件 DevTools',
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
