/**
 * MenuRenderer —— 归一化菜单渲染器。
 * E3h #64：从 TitleBar + HamburgerMenu 提取公共菜单渲染逻辑。
 *
 * 管理：hover 状态、延迟防闪烁、子面板弹出、快捷键显示、when 条件禁用态。
 * 不管理：菜单打开/关闭、面板定位、group 按钮——这些由父组件（TitleBar/HamburgerMenu）负责。
 *
 * 设计文档：docs/02-Electron架构/E3_多WebView与壳收尾_暂定/09-E3h-美化专题.md §一
 */

import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getCommand } from "../../core/registry/CommandRegistry";
import { getKeybindings } from "../../core/registry/KeybindingRegistry";
import { ContextKeyService } from "../../core/registry/ContextKeyService";
import type { MenuItem } from "../../core/registry/MenuRegistry";

export interface MenuRendererProps {
  /** 菜单项列表（已由父组件按需分组/展平） */
  items: Array<MenuItem & { pluginId: string }>;
  /** 点击叶子命令的回调 */
  onCommand: (command: string) => void;
  /** CSS 类名前缀——区分两个菜单的样式命名空间（"titlebar" | "hamburger"） */
  cssPrefix: string;
  /** 是否在菜单项右侧显示快捷键（HamburgerMenu=true，TitleBar=false） */
  showKeybindings?: boolean;
  /** 是否按 group 分组显示——true 时按 item.group 分组并渲染 group 标签 */
  showGroups?: boolean;
  /** 是否检查 when 条件——不满足时灰显禁用（HamburgerMenu=true，TitleBar=false） */
  checkWhen?: boolean;
}

export function MenuRenderer({
  items,
  onCommand,
  cssPrefix,
  showKeybindings = false,
  showGroups = false,
  checkWhen = false,
}: MenuRendererProps) {
  const { t } = useTranslation();
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 仅在需要时读快捷键表——避免不必要的计算
  const allKeybindings = showKeybindings ? getKeybindings() : [];

  /** 获取菜单项的显示标签——item.label > command.title > command id */
  function getLabel(item: MenuItem): string {
    if (item.label) return item.label;
    if (item.command) return getCommand(item.command)?.title ?? item.command;
    return "";
  }

  /** 格式化快捷键显示——chord: "ctrl+k ctrl+t" → "Ctrl+K Ctrl+T" */
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

  /** 获取命令的快捷键显示文本 */
  function getKeyLabel(command: string): string | null {
    if (!showKeybindings) return null;
    const kb = allKeybindings.find((k) => k.command === command);
    if (!kb?.key) return null;
    return formatKeyLabel(kb.key);
  }

  /** when 条件不满足 → 菜单项禁用（灰色不可点击） */
  function isDisabled(item: MenuItem): boolean {
    if (!checkWhen) return false;
    return !ContextKeyService.matches(item.when);
  }

  /** tiny 延迟——防止快速划过时闪烁（100ms 进入 / 150ms 离开） */
  const scheduleHover = useCallback((key: string | null) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (key === null) {
      hoverTimerRef.current = setTimeout(() => setHoveredKey(null), 150);
    } else {
      hoverTimerRef.current = setTimeout(() => setHoveredKey(key), 100);
    }
  }, []);

  /** 当前 hover 项的 children——用于右侧子面板 */
  const hoveredChildren = (() => {
    if (!hoveredKey) return null;
    for (const item of items) {
      const key = item.command + (item.label ?? "");
      if (key === hoveredKey && item.children?.length) {
        return item.children as Array<MenuItem & { pluginId: string }>;
      }
    }
    return null;
  })();

  /** 渲染单个菜单项按钮 */
  function renderSingleItem(item: MenuItem & { pluginId: string }) {
    const key = item.command + (item.label ?? "");
    const hasChildren = item.children && item.children.length > 0;
    const disabled = isDisabled(item);

    return (
      <button
        key={`${item.pluginId}:${key}`}
        className={`${cssPrefix}-item${hoveredKey === key ? ` ${cssPrefix}-item-hovered` : ""}${disabled ? ` ${cssPrefix}-item-disabled` : ""}`}
        disabled={disabled}
        onMouseEnter={() => scheduleHover(hasChildren ? key : null)}
        onClick={() => {
          if (disabled || hasChildren) return;
          onCommand(item.command);
        }}
      >
        <span className={`${cssPrefix}-item-label`}>{t(getLabel(item))}</span>
        <span className={`${cssPrefix}-item-right`}>
          {getKeyLabel(item.command) && (
            <span className={`${cssPrefix}-item-key`}>{getKeyLabel(item.command)}</span>
          )}
          {hasChildren && (
            <span className={`codicon codicon-chevron-right ${cssPrefix}-chevron`} />
          )}
        </span>
      </button>
    );
  }

  /** 按 group 分组（仅在 showGroups 时） */
  const groupedItems = (() => {
    if (!showGroups) return null;
    const groupMap = new Map<string, Array<MenuItem & { pluginId: string }>>();
    for (const item of items) {
      const g = item.group ?? "other";
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g)!.push(item);
    }
    return [...groupMap.entries()].sort(
      (a, b) => (a[1][0]?.order ?? 99) - (b[1][0]?.order ?? 99)
    );
  })();

  return (
    <>
      {/* 主面板——菜单项列表 */}
      <div
        className={`${cssPrefix}-main-panel`}
        onMouseLeave={() => scheduleHover(null)}
      >
        {showGroups && groupedItems
          ? groupedItems.map(([group, groupItems]) => (
              <div key={group} className={`${cssPrefix}-group`}>
                <div className={`${cssPrefix}-group-label`}>
                  {t(groupItems[0]?.label ?? group)}
                </div>
                {groupItems.map(renderSingleItem)}
              </div>
            ))
          : items.map(renderSingleItem)}
      </div>

      {/* 子面板——hover 有 children 的项时右侧弹出 */}
      {hoveredChildren && (
        <div
          className={`${cssPrefix}-sub-panel`}
          onMouseEnter={() => {
            // 鼠标移入子面板——保持 hover 状态
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          }}
          onMouseLeave={() => scheduleHover(null)}
        >
          {hoveredChildren.map((child) => {
            const childDisabled = isDisabled(child);
            return (
              <button
                key={`${child.pluginId}:${child.command}:${child.label ?? ""}`}
                className={`${cssPrefix}-item ${cssPrefix}-sub-item${childDisabled ? ` ${cssPrefix}-item-disabled` : ""}`}
                disabled={childDisabled}
                onClick={() => {
                  if (!childDisabled) onCommand(child.command);
                }}
              >
                <span className={`${cssPrefix}-item-label`}>{t(getLabel(child))}</span>
                {getKeyLabel(child.command) && (
                  <span className={`${cssPrefix}-item-key`}>{getKeyLabel(child.command)}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
