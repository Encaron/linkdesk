/**
 * 命令面板——对标 VS Code Ctrl+Shift+P。
 * E3b #36b：改用 QuickPick 归一化组件——portal/fuzzy/键盘导航全委托给 QuickPick。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子1
 * VS Code 对标：QuickOpen → Show All Commands
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCommands, getCommandPluginId, executeCommand, type Command } from "../../core/CommandRegistry";
import { ContextKeyService } from "../../core/ContextKeyService";
import { APP_PLUGIN_ID } from "../../core/PluginStateService";
import { MenuId } from "../../core/MenuRegistry";
import ContextMenu from "./ContextMenu";
import QuickPick from "./QuickPick";

interface Props {
  open: boolean;
  onClose: () => void;
}

function CommandPalette({ open, onClose }: Props) {
  const { t } = useTranslation();
  const [gearMenu, setGearMenu] = useState<{
    commandId: string;
    anchor: { x: number; y: number };
  } | null>(null);

  // 从 CommandRegistry 获取命令 + when 条件过滤——每次打开面板时重新求值（依赖 open trigger）
  const allCommands = useMemo(() => {
    const cmds = getCommands();
    return cmds.filter((cmd) => ContextKeyService.matches(cmd.when));
  }, [open]);

  const handleGearOpen = (cmd: Command, anchor: { x: number; y: number }) => {
    const pluginId = getCommandPluginId(cmd.id);
    ContextKeyService.setValue("commandId", cmd.id);
    // 核心命令（APP_PLUGIN_ID）不设 commandPluginId——"打开插件详情"不显示
    ContextKeyService.setValue("commandPluginId", pluginId && pluginId !== APP_PLUGIN_ID ? pluginId : false);
    ContextKeyService.setValue("commandHasSetting", !!cmd.configurationKey);
    setGearMenu({ commandId: cmd.id, anchor });
  };

  const handleGearClose = () => {
    setGearMenu(null);
    ContextKeyService.setValue("commandId", undefined);
    ContextKeyService.setValue("commandPluginId", undefined);
    ContextKeyService.setValue("commandHasSetting", undefined);
  };

  return (
    <>
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
            title={t("更多操作…")}
            onClick={(e) => {
              e.stopPropagation();
              const rect = (e.target as HTMLElement).getBoundingClientRect();
              handleGearOpen(cmd, { x: rect.right, y: rect.bottom });
            }}
            onMouseDown={(e) => e.stopPropagation()}
          />
        )}
      />
      {gearMenu && (
        <ContextMenu
          menuId={MenuId.CommandPaletteItemGear}
          anchor={gearMenu.anchor}
          context={{ commandId: gearMenu.commandId }}
          onClose={handleGearClose}
        />
      )}
    </>
  );
}

/** 复用 Command 类型 */
export type { Command };
export default CommandPalette;
