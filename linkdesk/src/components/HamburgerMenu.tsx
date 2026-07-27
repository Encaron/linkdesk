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
import { ContextKeyService } from "../core/ContextKeyService";
import "./HamburgerMenu.css";

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
    (a, b) => (a[1][0]?.order ?? 99) - (b[1][0]?.order ?? 99)
  );
  const allKeybindings = getKeybindings();

  function getLabel(item: MenuItem): string {
    if (item.label) return item.label;
    if (item.command) return getCommand(item.command)?.title ?? item.command;
    return "";
  }

  /** 格式化快捷键显示——chord 如 ctrl+k ctrl+t → Ctrl+K Ctrl+T */
  function formatKeyLabel(key: string): string {
    return key
      .split(" ")
      .map((chord) =>
        chord
          .replace(/ctrl\+/i, "Ctrl+")
          .replace(/alt\+/i, "Alt+")
          .replace(/shift\+/i, "Shift+")
          .replace(/\+\w/g, (m) => m.toUpperCase())
      )
      .join(" ");
  }

  function getKeyLabel(command: string): string | null {
    const kb = allKeybindings.find((k) => k.command === command);
    if (!kb?.key) return null;
    return formatKeyLabel(kb.key);
  }

  /** when 条件不满足 → 菜单项禁用（灰色不可点击） */
  function isDisabled(item: MenuItem): boolean {
    if (!open) return false; // 菜单关闭时全部显示为可用——避免闪烁
    return !ContextKeyService.matches(item.when);
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
                <div className="hamburger-group-label">{groupItems[0]?.label ?? group}</div>
                {groupItems.map((item) => {
                  const key = item.command + (item.label ?? "");
                  const hasChildren = item.children && item.children.length > 0;

                  const disabled = isDisabled(item);

                  return (
                    <button
                      key={`${item.pluginId}:${key}`}
                      className={`hamburger-item${hoveredKey === key ? " hamburger-item-hovered" : ""}${disabled ? " hamburger-item-disabled" : ""}`}
                      disabled={disabled}
                      onMouseEnter={() => scheduleHover(hasChildren ? key : null)}
                      onClick={() => {
                        if (disabled || hasChildren) return;
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
              {hoveredChildren.map((child) => {
                const childDisabled = isDisabled(child);
                return (
                  <button
                    key={`${child.pluginId}:${child.command}:${child.label}`}
                    className={`hamburger-item hamburger-sub-item${childDisabled ? " hamburger-item-disabled" : ""}`}
                    disabled={childDisabled}
                    onClick={() => {
                      if (!childDisabled) handleCommand(child.command);
                    }}
                  >
                    <span className="hamburger-item-label">{getLabel(child)}</span>
                    {getKeyLabel(child.command) && (
                      <span className="hamburger-item-key">{getKeyLabel(child.command)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default HamburgerMenu;
