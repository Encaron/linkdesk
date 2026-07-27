/**
 * HamburgerMenu —— ☰ 菜单按钮 + 下拉面板。
 * E3f #52：对标 VS Code 浏览器版标题栏左侧汉堡菜单。
 * 数据源：MenuRegistry → MenuId.MenuBar → 按 group 分组。
 *
 * 设计文档：docs/02-Electron架构/E3_多WebView与壳收尾_暂定/06-E3f-壳UI收尾.md §二
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getMenuItems, MenuId, type MenuItem } from "../core/MenuRegistry";
import { getCommand, executeCommand } from "../core/CommandRegistry";
import { getKeybindings } from "../core/KeybindingRegistry";
import "./HamburgerMenu.css";

/** 组标签映射——命令 group → 菜单章节名 */
const GROUP_LABELS: Record<string, string> = {
  file: "File",
  edit: "Edit",
  view: "View",
  help: "Help",
};

/** 组排序——越小组越靠前 */
const GROUP_ORDER: Record<string, number> = {
  file: 0,
  edit: 1,
  view: 2,
  help: 3,
};

function HamburgerMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (btnRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const handleCommand = useCallback((command: string) => {
    setOpen(false);
    executeCommand(command);
  }, []);

  // 构建分组数据
  const items = getMenuItems(MenuId.MenuBar);
  const groups = new Map<string, Array<MenuItem & { pluginId: string }>>();

  for (const item of items) {
    const group = item.group ?? "other";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(item);
  }

  // 按 group 排序
  const sortedGroups = [...groups.entries()].sort(
    (a, b) => (GROUP_ORDER[a[0]] ?? 99) - (GROUP_ORDER[b[0]] ?? 99)
  );

  // 查找快捷键
  const allKeybindings = getKeybindings();

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
        <div className="hamburger-dropdown" ref={menuRef}>
          {sortedGroups.map(([group, groupItems]) => {
            const label = GROUP_LABELS[group] ?? group;
            return (
              <div key={group} className="hamburger-group">
                <div className="hamburger-group-label">{label}</div>
                {groupItems.map((item) => {
                  const cmd = getCommand(item.command);
                  const kb = allKeybindings.find((k) => k.command === item.command);
                  const keyLabel = kb?.key
                    ?.replace(/ctrl/i, "Ctrl+")
                    ?.replace(/alt/i, "Alt+")
                    ?.replace(/shift/i, "Shift+")
                    ?.toUpperCase();

                  return (
                    <button
                      key={`${item.pluginId}:${item.command}`}
                      className="hamburger-item"
                      onClick={() => handleCommand(item.command)}
                    >
                      <span className="hamburger-item-label">
                        {cmd?.title ?? item.command}
                      </span>
                      {keyLabel && (
                        <span className="hamburger-item-key">{keyLabel}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default HamburgerMenu;
