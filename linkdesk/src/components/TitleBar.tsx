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
import { executeCommand } from "../core/CommandRegistry";
import { MenuRenderer } from "./shared/MenuRenderer";
import "./TitleBar.css";

function TitleBar({ showMenus = true }: { showMenus?: boolean }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
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

  const handleCommand = useCallback((command: string) => {
    if (!command) return;
    setOpenGroup(null);
    executeCommand(command);
  }, []);

  // 菜单数据——按 group 分组，每个 group = TitleBar 上一个按钮
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

  /**
   * 展平 group 内的菜单项——无 command 的父项展开为其 children。
   * TitleBar 下拉面板不显示嵌套父项，直接平铺最终命令。
   */
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

  function getGroupLabel(groupName: string): string {
    const items = groups.get(groupName);
    if (!items?.length) return groupName;
    return items[0].label ?? groupName;
  }

  /** 鼠标划过不同 group 按钮时自动切换下拉 */
  const handleButtonHover = useCallback(
    (group: string) => {
      if (openGroup && openGroup !== group) {
        setOpenGroup(group);
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

  /** 下拉面板——委托 MenuRenderer 归一化渲染（E3h #64） */
  function renderDropdown() {
    if (!openGroup) return null;
    const groupItems = groups.get(openGroup);
    if (!groupItems?.length) return null;

    const flattened = flattenGroupItems(groupItems);

    return (
      <div className="titlebar-dropdown" ref={dropdownRef} style={getDropdownStyle()}>
        <MenuRenderer
          key={openGroup}
          items={flattened}
          onCommand={handleCommand}
          cssPrefix="titlebar"
          showKeybindings
        />
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
