/**
 * TitleBar —— 自定义标题栏，对标 VS Code 桌面版 titlebarPart。
 * E3f #52f：HTML/CSS 渲染，数据来自 MenuRegistry。插件可扩展顶级菜单。
 *
 * 设计文档：docs/02-Electron架构/E3_多WebView与壳收尾_暂定/06-E3f-壳UI收尾.md §二
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getMenuItems, MenuId, type MenuItem } from "../core/MenuRegistry";
import { getCommand, executeCommand } from "../core/CommandRegistry";
import "./TitleBar.css";

function TitleBar() {
  const { t } = useTranslation();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titlebarRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!openGroup) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownRef.current?.contains(target)) return;
      // 检查是否点击了触发按钮——由按钮 onClick 处理
      const btn = btnRefs.current.get(openGroup);
      if (btn?.contains(target)) return;
      setOpenGroup(null);
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [openGroup]);

  // 菜单关闭时清除 hover
  useEffect(() => {
    if (!openGroup) setHoveredKey(null);
  }, [openGroup]);

  const handleCommand = useCallback((command: string) => {
    if (!command) return;
    setOpenGroup(null);
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

  /**
   * 展平一个 group 的菜单项——跳过无 command 的父项，将其 children 提升到顶层。
   * 如果某个子项还有 children，保留为可展开项。
   */
  function flattenGroupItems(
    groupItems: Array<MenuItem & { pluginId: string }>
  ): Array<MenuItem & { pluginId: string }> {
    const result: Array<MenuItem & { pluginId: string }> = [];
    for (const item of groupItems) {
      if (item.children?.length) {
        if (!item.command) {
          // 父项无 command → 将 children 提升到顶层
          for (const child of item.children) {
            result.push({ ...child, pluginId: item.pluginId });
          }
        } else {
          // 有 command + children → 保留为可展开项
          result.push(item);
        }
      } else if (item.command) {
        // 普通叶子项
        result.push(item);
      }
    }
    return result;
  }

  /** 获取当前 hover 项的 children（子面板数据） */
  const hoveredChildren = (() => {
    if (!hoveredKey || !openGroup) return null;
    const groupItems = openGroup === "hamburger"
      ? sortedGroupNames.flatMap((g) => groups.get(g) ?? [])
      : flattenGroupItems(groups.get(openGroup) ?? []);
    for (const item of groupItems) {
      const key = item.command + (item.label ?? "");
      if (key === hoveredKey && item.children?.length) {
        return item.children as Array<MenuItem & { pluginId: string }>;
      }
    }
    return null;
  })();

  /** 获取 group 的按钮标签——取第一个有 label 的项的 label */
  function getGroupLabel(groupName: string): string {
    const items = groups.get(groupName);
    if (!items?.length) return groupName;
    return items[0].label ?? groupName;
  }

  /** hover 另一个菜单按钮时自动切换 */
  const handleButtonHover = useCallback(
    (group: string) => {
      if (openGroup && openGroup !== group) {
        setOpenGroup(group);
        setHoveredKey(null);
      }
    },
    [openGroup]
  );

  /** 计算下拉面板定位 */
  function getDropdownStyle(): React.CSSProperties {
    if (!openGroup) return { display: "none" };
    const btn = btnRefs.current.get(openGroup);
    if (!btn) {
      // fallback——TitleBar 左下角
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
      left: openGroup === "hamburger" ? 0 : rect.left,
      zIndex: 2548,
    };
  }

  /** 渲染菜单项列表 */
  function renderMenuItems(
    menuItems: Array<MenuItem & { pluginId: string }>,
    showGroupLabel?: boolean
  ) {
    if (showGroupLabel) {
      // ☰ 模式——分组显示
      const groupMap = new Map<string, Array<MenuItem & { pluginId: string }>>();
      for (const item of menuItems) {
        const g = item.group ?? "other";
        if (!groupMap.has(g)) groupMap.set(g, []);
        groupMap.get(g)!.push(item);
      }
      const sorted = [...groupMap.entries()].sort(
        (a, b) => (a[1][0]?.order ?? 99) - (b[1][0]?.order ?? 99)
      );
      return sorted.map(([groupName, gItems]) => (
        <div key={groupName} className="titlebar-group">
          <div className="titlebar-group-label">{getGroupLabel(groupName)}</div>
          {gItems.map(renderSingleItem)}
        </div>
      ));
    }
    // 单 group 模式——平铺
    return flattenGroupItems(menuItems).map(renderSingleItem);
  }

  /** 渲染单个菜单项 */
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

  /** 渲染下拉面板 */
  function renderDropdown() {
    if (!openGroup) return null;
    const isHamburger = openGroup === "hamburger";
    const groupItems = isHamburger
      ? allItems
      : groups.get(openGroup) ?? [];

    if (groupItems.length === 0) return null;

    const flattened = isHamburger ? null : flattenGroupItems(groupItems);

    return (
      <div className="titlebar-dropdown" ref={dropdownRef} style={getDropdownStyle()}>
        <div className="titlebar-main-panel">
          {isHamburger
            ? renderMenuItems(groupItems, true)
            : flattened!.map(renderSingleItem)}
        </div>
        {/* 子面板——hover 时右侧弹出 */}
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

  /** 设置按钮 ref */
  const setBtnRef = useCallback(
    (group: string) => (el: HTMLButtonElement | null) => {
      if (el) btnRefs.current.set(group, el);
      else btnRefs.current.delete(group);
    },
    []
  );

  return (
    <div className="titlebar" ref={titlebarRef}>
      {/* ☰ 按钮 */}
      <button
        ref={setBtnRef("hamburger")}
        className={`titlebar-btn titlebar-hamburger${openGroup === "hamburger" ? " titlebar-btn-open" : ""}`}
        onClick={() => setOpenGroup(openGroup === "hamburger" ? null : "hamburger")}
        onMouseEnter={() => handleButtonHover("hamburger")}
        title={t("菜单")}
      >
        <span className="codicon codicon-menu" />
      </button>

      {/* 应用名 */}
      <span className="titlebar-app-name">LinkDesk</span>

      {/* 菜单按钮——每个 group 一个按钮 */}
      <div className="titlebar-menus">
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
      </div>

      {/* 右侧拖拽区——填充剩余空间 */}
      <div className="titlebar-drag-area" />

      {/* 下拉面板 */}
      {renderDropdown()}
    </div>
  );
}

export default TitleBar;
