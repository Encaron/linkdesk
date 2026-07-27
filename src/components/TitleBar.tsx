/**
 * TitleBar —— 自定义标题栏，对标 VS Code 桌面版 titlebarPart。
 * E3f #52f：HTML/CSS 渲染，数据来自 MenuRegistry。插件可扩展顶级菜单。
 *
 * 布局：Logo ─ 菜单按钮 ─ 拖拽区 ─ ─ □ ×
 *
 * 设计文档：docs/02-Electron架构/E3_多WebView与壳收尾_暂定/06-E3f-壳UI收尾.md §二
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { getAssetPath } from "../core/assetPath";
import { getMenuItems, MenuId, type MenuItem } from "../core/MenuRegistry";
import { getCommand, executeCommand } from "../core/CommandRegistry";
import "./TitleBar.css";

function TitleBar({ showMenus = true }: { showMenus?: boolean }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titlebarRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    if (!openGroup) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownRef.current?.contains(target)) return;
      const btn = btnRefs.current.get(openGroup);
      if (btn?.contains(target)) return;
      setOpenGroup(null);
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [openGroup]);

  useEffect(() => {
    if (!openGroup) setHoveredKey(null);
  }, [openGroup]);

  const handleCommand = useCallback((command: string) => {
    if (!command) return;
    setOpenGroup(null);
    executeCommand(command);
  }, []);

  const scheduleHover = useCallback((key: string | null) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (key === null) {
      hoverTimerRef.current = setTimeout(() => setHoveredKey(null), 150);
    } else {
      hoverTimerRef.current = setTimeout(() => setHoveredKey(key), 100);
    }
  }, []);

  // 菜单数据
  const allItems = getMenuItems(MenuId.MenuBar);
  const groups = new Map<string, Array<MenuItem & { pluginId: string }>>();
  for (const item of allItems) {
    const group = item.group ?? "other";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(item);
  }
  const sortedGroupNames = [...groups.keys()].sort(
    (a, b) => (groups.get(a)![0]?.order ?? 99) - (groups.get(b)![0]?.order ?? 99)
  );

  function getLabel(item: MenuItem): string {
    if (item.label) return item.label;
    if (item.command) return getCommand(item.command)?.title ?? item.command;
    return "";
  }

  function flattenGroupItems(
    groupItems: Array<MenuItem & { pluginId: string }>
  ): Array<MenuItem & { pluginId: string }> {
    const result: Array<MenuItem & { pluginId: string }> = [];
    for (const item of groupItems) {
      if (item.children?.length) {
        if (!item.command) {
          for (const child of item.children) {
            result.push({ ...child, pluginId: item.pluginId });
          }
        } else {
          result.push(item);
        }
      } else if (item.command) {
        result.push(item);
      }
    }
    return result;
  }

  const hoveredChildren = (() => {
    if (!hoveredKey || !openGroup) return null;
    const groupItems = flattenGroupItems(groups.get(openGroup) ?? []);
    for (const item of groupItems) {
      const key = item.command + (item.label ?? "");
      if (key === hoveredKey && item.children?.length) {
        return item.children as Array<MenuItem & { pluginId: string }>;
      }
    }
    return null;
  })();

  function getGroupLabel(groupName: string): string {
    const items = groups.get(groupName);
    if (!items?.length) return groupName;
    return items[0].label ?? groupName;
  }

  const handleButtonHover = useCallback(
    (group: string) => {
      if (openGroup && openGroup !== group) {
        setOpenGroup(group);
        setHoveredKey(null);
      }
    },
    [openGroup]
  );

  function getDropdownStyle(): React.CSSProperties {
    if (!openGroup) return { display: "none" };
    const btn = btnRefs.current.get(openGroup);
    if (!btn) {
      const rect = titlebarRef.current?.getBoundingClientRect();
      return {
        position: "fixed",
        top: (rect?.bottom ?? 30),
        left: 0,
        zIndex: 2548,
      };
    }
    const rect = btn.getBoundingClientRect();
    return {
      position: "fixed",
      top: rect.bottom,
      left: rect.left,
      zIndex: 2548,
    };
  }

  function renderSingleItem(item: MenuItem & { pluginId: string }) {
    const key = item.command + (item.label ?? "");
    const hasChildren = item.children && item.children.length > 0;

    return (
      <button
        key={`${item.pluginId}:${key}`}
        className={`titlebar-item${hoveredKey === key ? " titlebar-item-hovered" : ""}`}
        onMouseEnter={() => scheduleHover(hasChildren ? key : null)}
        onClick={() => {
          if (hasChildren) return;
          handleCommand(item.command);
        }}
      >
        <span className="titlebar-item-label">{getLabel(item)}</span>
        <span className="titlebar-item-right">
          {hasChildren && (
            <span className="codicon codicon-chevron-right titlebar-chevron" />
          )}
        </span>
      </button>
    );
  }

  function renderDropdown() {
    if (!openGroup) return null;
    const groupItems = groups.get(openGroup);
    if (!groupItems?.length) return null;

    const flattened = flattenGroupItems(groupItems);

    return (
      <div className="titlebar-dropdown" ref={dropdownRef} style={getDropdownStyle()}>
        <div className="titlebar-main-panel">
          {flattened.map(renderSingleItem)}
        </div>
        {hoveredChildren && (
          <div
            className="titlebar-sub-panel"
            onMouseEnter={() => {
              if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            }}
            onMouseLeave={() => scheduleHover(null)}
          >
            {hoveredChildren.map((child) => (
              <button
                key={`${child.pluginId}:${child.command}:${child.label ?? ""}`}
                className="titlebar-item titlebar-sub-item"
                onClick={() => handleCommand(child.command)}
              >
                <span className="titlebar-item-label">{getLabel(child)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const setBtnRef = useCallback(
    (group: string) => (el: HTMLButtonElement | null) => {
      if (el) btnRefs.current.set(group, el);
      else btnRefs.current.delete(group);
    },
    []
  );

  return (
    <div className="titlebar" ref={titlebarRef}>
      {/* Logo——替换 public/assets/logo.svg 即可换 logo，无需改代码 */}
      <img className="titlebar-logo" src={getAssetPath("assets/logo.svg")} alt="LinkDesk" />

      {/* 菜单按钮——hamburger 模式下隐藏 */}
      {showMenus && <div className="titlebar-menus">
        {sortedGroupNames.map((groupName) => (
          <button
            key={groupName}
            ref={setBtnRef(groupName)}
            className={`titlebar-btn titlebar-menu-btn${openGroup === groupName ? " titlebar-btn-open" : ""}`}
            onClick={() => setOpenGroup(openGroup === groupName ? null : groupName)}
            onMouseEnter={() => handleButtonHover(groupName)}
          >
            {getGroupLabel(groupName)}
          </button>
        ))}
      </div>}

      {/* 拖拽区——填充剩余空间 */}
      <div className="titlebar-drag-area" />

      {/* 下拉面板 */}
      {renderDropdown()}
    </div>
  );
}

export default TitleBar;
