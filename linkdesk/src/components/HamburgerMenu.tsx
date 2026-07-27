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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
    if (!command) return; // 父菜单项——不执行命令
    setOpen(false);
    executeCommand(command);
  }, []);

  // 构建分组数据——每个 group 下可能有多个顶级 item（含子菜单）
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

  /** 获取显示标签——label > 命令 title > command id */
  function getLabel(item: MenuItem): string {
    if (item.label) return item.label;
    if (item.command) return getCommand(item.command)?.title ?? item.command;
    return "";
  }

  /** 渲染单个菜单项（叶子或父节点） */
  function renderItem(item: MenuItem & { pluginId: string }, depth: number) {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expanded.has(item.command + item.label);
    const label = getLabel(item);
    const kb = item.command ? allKeybindings.find((k) => k.command === item.command) : null;
    const keyLabel = kb?.key
      ?.replace(/ctrl/i, "Ctrl+")
      ?.replace(/alt/i, "Alt+")
      ?.replace(/shift/i, "Shift+")
      ?.toUpperCase();

    return (
      <div key={`${item.pluginId}:${item.command}:${item.label}`}>
        <button
          className="hamburger-item"
          style={{ paddingLeft: 12 + depth * 12 }}
          onClick={() => {
            if (hasChildren) {
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(item.command + item.label)) next.delete(item.command + item.label);
                else next.add(item.command + item.label);
                return next;
              });
            } else {
              handleCommand(item.command);
            }
          }}
        >
          <span className="hamburger-item-label">{label}</span>
          <span className="hamburger-item-right">
            {keyLabel && <span className="hamburger-item-key">{keyLabel}</span>}
            {hasChildren && (
              <span className={`codicon ${isExpanded ? "codicon-chevron-down" : "codicon-chevron-right"} hamburger-chevron`} />
            )}
          </span>
        </button>
        {hasChildren && isExpanded && (
          <div className="hamburger-submenu">
            {item.children!.map((c) => renderItem(c as MenuItem & { pluginId: string }, depth + 1))}
          </div>
        )}
      </div>
    );
  }

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
          {sortedGroups.map(([group, groupItems]) => (
            <div key={group} className="hamburger-group">
              <div className="hamburger-group-label">{GROUP_LABELS[group] ?? group}</div>
              {groupItems.map((item) => renderItem(item, 0))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default HamburgerMenu;
