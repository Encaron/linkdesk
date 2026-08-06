/**
 * HamburgerMenu —— ☰ 菜单按钮 + 下拉面板。
 * E3f #52：对标 VS Code 浏览器版 GlobalActivityActionViewItem。
 * 数据源：MenuRegistry → MenuId.MenuBar → 按 group 分组。
 * 交互：hover 展开子菜单（右侧弹出），点击叶子项执行命令。
 *
 * 设计文档：docs/02-Electron架构/E3_多WebView与壳收尾_暂定/06-E3f-壳UI收尾.md §二
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getMenuItems, MenuId } from "../core/registry/MenuRegistry";
import { executeCommand } from "../core/registry/CommandRegistry";
import { ContextKeyService } from "../core/registry/ContextKeyService";
import { MenuRenderer } from "./shared/MenuRenderer";
import OverlayPortal from "./shared/OverlayPortal";
import "./HamburgerMenu.css";

function HamburgerMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  // E5#96r: 外部点击检测 + Escape → OverlayPortal 统一处理

  // 订阅 context key 变化——when 条件可能随时改变（如串口打开/关闭）
  const [, setCtxTick] = useState(0);
  useEffect(() => {
    return ContextKeyService.onDidChangeContext(() => setCtxTick((n) => n + 1));
  }, []);

  const handleCommand = useCallback((command: string) => {
    if (!command) return;
    setOpen(false);
    executeCommand(command);
  }, []);

  // 菜单数据
  const items = getMenuItems(MenuId.MenuBar);

  return (
    <>
      <button
        ref={btnRef}
        className={`hamburger-btn${open ? " hamburger-open" : ""}`}
        onClick={() => setOpen(!open)}
        title={t("菜单")}
      >
        <span className="codicon codicon-menu" />
      </button>

      {open && (
        <OverlayPortal onClose={() => setOpen(false)} triggerRef={btnRef as React.RefObject<HTMLElement>}>
        <div className="hamburger-dropdown">
          <MenuRenderer
            items={items}
            onCommand={handleCommand}
            cssPrefix="hamburger"
            showKeybindings
            showGroups
            checkWhen
          />
        </div>
        </OverlayPortal>
      )}
    </>
  );
}

export default HamburgerMenu;
