/**
 * 命令面板——对标 VS Code Ctrl+Shift+P。
 * E3b #36b → E5.5#7-p15 → E5.7#18：组件部分已删（#15 起走池 QuickPickHost），
 * 从 components/shared/CommandPalette.tsx 迁入——只剩命令式入口 showCommandPalette。
 *
 * E5.7#15：聪慧→哑——壳侧序列化 DTO 推池渲染（显示文本铁律：壳侧 t() 解析后推送，池原样渲染。
 * 快捷键 capital 化也在壳侧完成——池 renderKeybinding 零变换）。
 */

import i18n from "../../../i18n";
import { getCommands, executeCommand, type Command } from "../../registry/commands/CommandRegistry";
import { ContextKeyService } from "../../registry/commands/ContextKeyService";
import { openKeybindingsSettings, findKeybindingForCommand } from "../../registry/commands/KeybindingRegistry";
import { QuickPickService } from "../../services/ui/QuickPickService";

export function showCommandPalette(): void {
  const cmds = getCommands().filter((cmd) => ContextKeyService.matches(cmd.when));
  QuickPickService.show<Command>({
    mode: "commands",
    items: cmds,
    placeholder: i18n.t("输入命令…"),
    prefix: ">",
    getSearchText: (cmd) => `${cmd.title} ${cmd.category ?? ""} ${cmd.id}`,
    getKey: (cmd) => cmd.id,
    onSelect: (cmd) => { executeCommand(cmd.id); },
    // E5.7#15：聪慧→哑——池 DTO 序列化（显示文本铁律：壳侧 t() 解析后推送，池原样渲染）
    serialize: (cmd) => ({
      key: cmd.id,
      searchText: `${cmd.title} ${cmd.category ?? ""} ${cmd.id}`,
      label: i18n.t(cmd.title),
      category: cmd.category ? i18n.t(cmd.category) : undefined,
      detail: cmd.id,
      keybinding: findKeybindingForCommand(cmd.id)?.key
        .split("+")
        .map((k) => k.charAt(0).toUpperCase() + k.slice(1))
        .join("+"),
      buttons: [{ actionId: "configureKeybinding", icon: "gear", tooltip: i18n.t("配置快捷键") }],
    }),
    // E5.7#15：行内按钮动作——当前唯一按钮 = 齿轮 → 快捷键设置（壳按 key 重解析后执行。
    // 按钮只此一个，无需 actionId 分支；将来加新按钮时再查表分发）
    onItemAction: (cmd, _actionId) => {
      openKeybindingsSettings({ query: cmd.id });
    },
    onClose: () => QuickPickService.hide(),
  });
}
