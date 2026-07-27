/**
 * 命令面板——对标 VS Code Ctrl+Shift+P。
 * E3b #36b：改用 QuickPick 归一化组件——portal/fuzzy/键盘导航全委托给 QuickPick。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子1
 * VS Code 对标：QuickOpen → Show All Commands
 *
 * 🔥 E3f #53b 齿轮设计（对标 VS Code）：
 * VS Code 命令面板齿轮是单按钮（不是子菜单）——点击打开快捷键设置。
 * LinkDesk #59 前快捷键设置 UI 未就绪 → 齿轮暂退化为"复制命令 ID"。
 * #59 做完后改为：点击齿轮 → 打开快捷键设置页，搜索框预填该命令 ID。
 * 详见 docs/02-Electron架构/E3_多WebView与壳收尾_暂定/06-E3f-壳UI收尾.md §三.5。
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

  const handleGearClick = async (cmd: Command, e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(cmd.id);
    const { pushToast, TOAST_TTL_INFO } = await import("../../core/NotificationService");
    pushToast({ message: t("已复制：") + cmd.id, ttl: TOAST_TTL_INFO });
  };

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
        <div className="palette-item-content">
          <div className="palette-item-row">
            <span className="palette-item-label">{cmd.title}</span>
            {cmd.category && (
              <span className="palette-item-category">{cmd.category}</span>
            )}
          </div>
          <span className="palette-item-detail">{cmd.id}</span>
        </div>
      )}
      renderItemActions={(cmd, _isSelected) => (
        <button
          className="palette-item-gear codicon codicon-gear"
          title={t("复制命令 ID")}
          onClick={(e) => handleGearClick(cmd, e)}
          onMouseDown={(e) => e.stopPropagation()}
        />
      )}
    />
  );
}

/** 复用 Command 类型 */
export type { Command };
export default CommandPalette;
