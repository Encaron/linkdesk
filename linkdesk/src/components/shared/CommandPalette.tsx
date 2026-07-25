/**
 * 命令面板——对标 VS Code Ctrl+Shift+P。
 * E3b #36b：改用 QuickPick 归一化组件——portal/fuzzy/键盘导航全委托给 QuickPick。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子1
 * VS Code 对标：QuickOpen → Show All Commands
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getCommands, executeCommand, type Command } from "../../core/CommandRegistry";
import { ContextKeyService } from "../../core/ContextKeyService";
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

  return (
    <QuickPick
      open={open}
      onClose={onClose}
      items={allCommands}
      placeholder={t("输入命令…")}
      getSearchText={(cmd) => `${cmd.title} ${cmd.category ?? ""} ${cmd.id}`}
      getKey={(cmd) => cmd.id}
      onSelect={(cmd) => executeCommand(cmd.id)}
      renderItem={(cmd, _isSelected) => (
        <>
          <span className="palette-item-label">{cmd.title}</span>
          {cmd.category && (
            <span className="palette-item-category">{cmd.category}</span>
          )}
        </>
      )}
    />
  );
}

/** 复用 Command 类型 */
export type { Command };
export default CommandPalette;
