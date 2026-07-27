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
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // 菜单关闭时清除 hover 状态
  useEffect(() => {
    if (!open) setHoveredKey(null);
  }, [open]);

  const handleCommand = useCallback((command: string) => {
    if (!command) return;
    setOpen(false);
    executeCommand(command);
  }, []);

  /** tiny 延迟——防止快速划过时闪烁 */
  const scheduleHover = useCallback((key: string | null) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (key === null) {
      hoverTimerRef.current = setTimeout(() => setHoveredKey(null), 150);
    } else {
      hoverTimerRef.current = setTimeout(() => setHoveredKey(key), 100);
    }
  }, []);

  // 菜单数据
  const items = getMenuItems(MenuId.MenuBar);
  const groups = new Map<string, Array<MenuItem & { pluginId: string }>>();
  for (const item of items) {
    const group = item.group ?? "other";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(item);
  }
  const sortedGroups = [...groups.entries()].sort(
    (a, b) => (GROUP_ORDER[a[0]] ?? 99) - (GROUP_ORDER[b[0]] ?? 99)
  );
  const allKeybindings = getKeybindings();

  function getLabel(item: MenuItem): string {
    if (item.label) return item.label;
    if (item.command) return getCommand(item.command)?.title ?? item.command;
    return "";
  }

  function getKeyLabel(command: string): string | null {
    const kb = allKeybindings.find((k) => k.command === command);
    if (!kb?.key) return null;
    return kb.key
      .replace(/ctrl/i, "Ctrl+")
      .replace(/alt/i, "Alt+")
      .replace(/shift/i, "Shift+")
      .toUpperCase();
  }

  /** 获取当前 hover 的 item 的 children */
  const hoveredChildren = (() => {
    if (!hoveredKey) return null;
    for (const [, groupItems] of sortedGroups) {
      for (const item of groupItems) {
        const key = item.command + (item.label ?? "");
        if (key === hoveredKey && item.children?.length) {
          return item.children as Array<MenuItem & { pluginId: string }>;
        }
      }
    }
    return null;
  })();

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
          {/* 主面板——顶级菜单项 */}
          <div className="hamburger-main-panel">
            {sortedGroups.map(([group, groupItems]) => (
              <div key={group} className="hamburger-group">
                <div className="hamburger-group-label">{GROUP_LABELS[group] ?? group}</div>
                {groupItems.map((item) => {
                  const key = item.command + (item.label ?? "");
                  const hasChildren = item.children && item.children.length > 0;

                  return (
                    <button
                      key={`${item.pluginId}:${key}`}
                      className={`hamburger-item${hoveredKey === key ? " hamburger-item-hovered" : ""}`}
                      onMouseEnter={() => scheduleHover(hasChildren ? key : null)}
                      onClick={() => {
                        if (hasChildren) return; // 有子菜单——不执行命令
                        handleCommand(item.command);
                      }}
                    >
                      <span className="hamburger-item-label">{getLabel(item)}</span>
                      <span className="hamburger-item-right">
                        {getKeyLabel(item.command) && (
                          <span className="hamburger-item-key">{getKeyLabel(item.command)}</span>
                        )}
                        {hasChildren && (
                          <span className="codicon codicon-chevron-right hamburger-chevron" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* 子面板——hover 时右侧弹出 */}
          {hoveredChildren && (
            <div
              className="hamburger-sub-panel"
              onMouseEnter={() => {
                // 保持 hover 状态——鼠标移入子面板时不关闭
                if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
              }}
              onMouseLeave={() => scheduleHover(null)}
            >
              {hoveredChildren.map((child) => (
                <button
                  key={`${child.pluginId}:${child.command}:${child.label}`}
                  className="hamburger-item hamburger-sub-item"
                  onClick={() => handleCommand(child.command)}
                >
                  <span className="hamburger-item-label">{getLabel(child)}</span>
                  {getKeyLabel(child.command) && (
                    <span className="hamburger-item-key">{getKeyLabel(child.command)}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default HamburgerMenu;
