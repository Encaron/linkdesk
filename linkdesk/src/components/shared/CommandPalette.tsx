/**
 * 命令面板——对标 VS Code Ctrl+Shift+P。
 * E3b #36b：改用 QuickPick 归一化组件——portal/fuzzy/键盘导航全委托给 QuickPick。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子1
 * VS Code 对标：QuickOpen → Show All Commands
 *
 * 🔥 E3f #53b + #59 齿轮设计（对标 VS Code）：
 * VS Code 命令面板齿轮是单按钮（不是子菜单）——点击打开快捷键设置。
 * #59 快捷键设置 UI 已就绪：齿轮 → 切换到设置页快捷键 tab，搜索框预填命令 ID。
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getCommands, executeCommand, type Command } from "../../core/registry/CommandRegistry";
import { ContextKeyService } from "../../core/registry/ContextKeyService";
import { openKeybindingsSettings, findKeybindingForCommand } from "../../core/registry/KeybindingRegistry"; // E3f #59 + E3.5 #CP05
import { QuickPickService } from "../../core/registry/QuickPickService"; // E5.5#7-p15
import QuickPick from "./QuickPick";

interface Props {
  open: boolean;
  onClose: () => void;
}

function CommandPalette({ open, onClose }: Props) {
  const { t } = useTranslation();

  // 从 CommandRegistry 获取命令 + when 条件过滤——每次打开面板时重新求值（依赖 open trigger）
  const allCommands = useMemo(() => {
    const cmds = getCommands();
    return cmds.filter((cmd) => ContextKeyService.matches(cmd.when));
  }, [open]);

  const handleGearClick = (cmd: Command, e: React.MouseEvent) => {
    e.stopPropagation();
    openKeybindingsSettings({ query: cmd.id });
  };

  return (
    <QuickPick
      open={open}
      onClose={onClose}
      items={allCommands}
      placeholder={t("输入命令…")}
      prefix=">"
      getSearchText={(cmd) => `${cmd.title} ${cmd.category ?? ""} ${cmd.id}`}
      getKey={(cmd) => cmd.id}
      onSelect={(cmd) => executeCommand(cmd.id)}
      // E3.5 #CP18: 切 slot props——布局由 QuickPick 锁死，只填内容
      renderLabel={(cmd) => t(cmd.title)}
      renderCategory={(cmd) => cmd.category ? t(cmd.category) : undefined}
      renderDetail={(cmd) => cmd.id}
      renderDetailRight={(cmd) => {
        const kb = findKeybindingForCommand(cmd.id);
        if (!kb) return null;
        const keys = kb.key.split("+");
        return (
          <span className="keybinding-pill">
            {keys.map((k, ki) => (
              <span key={ki}>
                {ki > 0 && <span className="keybinding-sep">+</span>}
                <kbd>{k.charAt(0).toUpperCase() + k.slice(1)}</kbd>
              </span>
            ))}
          </span>
        );
      }}
      renderItemActions={(cmd, _isSelected) => (
        <button
          className="palette-item-gear codicon codicon-gear"
          title={t("配置快捷键")}
          onClick={(e) => handleGearClick(cmd, e)}
          onMouseDown={(e) => e.stopPropagation()}
        />
      )}
    />
  );
}

/** 复用 Command 类型 */
export type { Command };

/**
 * E5.5#7-p15：命令式调起命令面板——不再走 CustomEvent → App.tsx useState。
 * 壳命令直接调此函数，QuickPickService 渲染。
 */
export function showCommandPalette(): void {
  const cmds = getCommands().filter((cmd) => ContextKeyService.matches(cmd.when));
  QuickPickService.show<Command>({
    mode: "commands",
    items: cmds,
    placeholder: "输入命令…",
    prefix: ">",
    getSearchText: (cmd) => `${cmd.title} ${cmd.category ?? ""} ${cmd.id}`,
    getKey: (cmd) => cmd.id,
    onSelect: (cmd) => { executeCommand(cmd.id); },
    renderLabel: (cmd) => cmd.title,
    renderCategory: (cmd) => cmd.category ?? undefined,
    renderDetail: (cmd) => cmd.id,
    renderDetailRight: (cmd) => {
      const kb = findKeybindingForCommand(cmd.id);
      if (!kb) return null;
      const keys = kb.key.split("+");
      return (
        <span className="keybinding-pill">
          {keys.map((k, ki) => (
            <span key={ki}>
              {ki > 0 && <span className="keybinding-sep">+</span>}
              <kbd>{k.charAt(0).toUpperCase() + k.slice(1)}</kbd>
            </span>
          ))}
        </span>
      );
    },
    renderItemActions: (cmd, _isSelected) => (
      <button
        className="palette-item-gear codicon codicon-gear"
        title="配置快捷键"
        onClick={(e) => { e.stopPropagation(); openKeybindingsSettings({ query: cmd.id }); }}
        onMouseDown={(e) => e.stopPropagation()}
      />
    ),
    onClose: () => QuickPickService.hide(),
  });
}

export default CommandPalette;
