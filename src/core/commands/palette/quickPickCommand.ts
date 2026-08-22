/**
 * quickpick.show 插件命令——对标 VS Code vscode.window.showQuickPick()。
 * E3j #80 → E5.7#18：从 components/shared/QuickPick.tsx 迁入——组件部分已删（#15 起走池 QuickPickHost）。
 * 命令注册随兄弟命令走 ensureCoreCommands（原模块级注册依赖 import 图存活，已消灭）。
 *
 * 插件调 `linkdesk.commands.executeCommand('quickpick.show', { title, items })`
 * → 浮动列表 → 用户选一项 / Esc → 返回结果 / undefined。
 */

import { registerCommand } from "../../registry/commands/CommandRegistry";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import { QuickPickService } from "../../services/ui/QuickPickService";

interface QuickPickItem {
  label: string;
  description?: string;
}

interface ShowQuickPickOptions {
  title?: string;
  items: QuickPickItem[];
}

function showQuickPick(options: ShowQuickPickOptions): Promise<QuickPickItem | undefined> {
  return new Promise((resolve) => {
    // settle 守卫——select 与 close 都会触发（对标壳 QuickPick handleSelect：onSelect 后必 onClose）
    let settled = false;
    const settle = (v?: QuickPickItem) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    QuickPickService.show<QuickPickItem>({
      mode: "custom",
      items: options.items,
      placeholder: options.title ?? "",
      getSearchText: (item) => item.label,
      getKey: (item) => item.label,
      serialize: (item) => ({
        key: item.label,
        searchText: item.label,
        label: item.label,
        // E3.5 #CP22: description 从第一行移到第二行 detail
        detail: item.description,
      }),
      onSelect: (item) => {
        settle(item);
        QuickPickService.hide();
      },
      onClose: () => {
        settle(undefined);
        QuickPickService.hide();
      },
    });
  });
}

/** quickpick.show 命令注册——ensureCoreCommands 调用（插件 API 入口）。
 *  E5.7#18：provider id 归一——原 "linkdesk" 字面量 → APP_PLUGIN_ID（命令注册表按命令 id 索引，行为零差异）。 */
export function registerQuickPickCommand(): void {
  registerCommand(APP_PLUGIN_ID, {
    id: "quickpick.show",
    title: "QuickPick",
    when: "false",
    handler: async (...args: unknown[]) => {
      return showQuickPick(args[0] as ShowQuickPickOptions);
    },
  });
}
