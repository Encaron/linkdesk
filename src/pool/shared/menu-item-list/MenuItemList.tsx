/**
 * MenuItemList——池侧归一化菜单项渲染器。E5.7#6 从 TitleBarZone 提取（#5 建，供汉堡复用）。
 *
 * E5.8#2：壳 MenuRenderer.tsx 已删（零消费）——本组件为菜单项渲染唯一实现。
 * 池 = 哑渲染器：label/shortcut 全部壳侧解析后推送（显示文本铁律），
 * 池只做 hover 时序（100ms 进 / 150ms 出——壳同款）与子面板弹出。
 *
 * 两种模式（对标壳 MenuRenderer 的 cssPrefix 参数）：
 *   - items（titlebar 下拉）：单列表，无组标题、无快捷键
 *   - groups（☰ 汉堡）：分组区块 + 组标题，快捷键（壳 showGroups+showKeybindings）
 *   - E5.8#37.6：when 不满足项由壳过滤隐藏（原灰显）——池不再接收 disabled 字段
 */

import { useState, useRef, useCallback } from "react";
import type { PoolMenuItem, PoolMenuGroup } from "../../../core/types/pool/poolLayout";

interface MenuItemListProps {
  /** 单列表模式（titlebar 下拉） */
  items?: PoolMenuItem[];
  /** 分组模式（☰ 汉堡下拉） */
  groups?: PoolMenuGroup[];
  onCommand: (command: string) => void;
  /** CSS 类名前缀——"titlebar" | "hamburger"，样式在各自 Zone 的 CSS 里 */
  cssPrefix: string;
}

/** 递归菜单列表——hover 有 children 的项 → 右侧子面板（壳 MenuRenderer 时序同款） */
function MenuItemList({ items, groups, onCommand, cssPrefix }: MenuItemListProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // E5.8#1d EXEMPT：Path B（池不 import 壳组件）→ MenuRenderer↔MenuItemList 孪生（hover 子面板时序）
  /* jscpd:ignore-start */
  const scheduleHover = useCallback((key: string | null) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (key === null) {
      hoverTimerRef.current = setTimeout(() => setHoveredKey(null), 150);
    } else {
      hoverTimerRef.current = setTimeout(() => setHoveredKey(key), 100);
    }
  }, []);
  /* jscpd:ignore-end */

  const flatItems = items ?? (groups?.flatMap((g) => g.items) ?? []);

  // 当前 hover 项的 children——右侧子面板
  const hoveredItem = hoveredKey
    ? flatItems.find((item) => `${item.command}:${item.label}` === hoveredKey && item.children?.length)
    : undefined;

  const renderItem = (item: PoolMenuItem) => {
    const key = `${item.command}:${item.label}`;
    const hasChildren = !!item.children?.length;
    return (
      <button
        key={key}
        className={`${cssPrefix}-item${hoveredKey === key ? ` ${cssPrefix}-item-hovered` : ""}`}
        onMouseEnter={() => scheduleHover(hasChildren ? key : null)}
        onClick={() => {
          if (hasChildren) return;
          onCommand(item.command);
        }}
      >
        <span className={`${cssPrefix}-item-label`}>{item.label}</span>
        <span className={`${cssPrefix}-item-right`}>
          {item.shortcut && <span className={`${cssPrefix}-item-key`}>{item.shortcut}</span>}
          {hasChildren && <span className={`codicon codicon-chevron-right ${cssPrefix}-chevron`} />}
        </span>
      </button>
    );
  };

  return (
    <>
      {/* 主面板——items 单列表，或 groups 分组区块 */}
      <div className={`${cssPrefix}-main-panel`} onMouseLeave={() => scheduleHover(null)}>
        {groups
          ? groups.map((g) => (
              <div key={g.group} className={`${cssPrefix}-group`}>
                <div className={`${cssPrefix}-group-label`}>{g.label}</div>
                {g.items.map(renderItem)}
              </div>
            ))
          : flatItems.map(renderItem)}
      </div>

      {/* 子面板——hover 有 children 的项时右侧弹出（递归支持 N 层；壳仅 2 层，实际数据 ≤2） */}
      {hoveredItem?.children?.length && (
        <div
          className={`${cssPrefix}-sub-panel`}
          onMouseEnter={() => {
            // 鼠标移入子面板——保持 hover 状态
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          }}
          onMouseLeave={() => scheduleHover(null)}
        >
          <MenuItemList items={hoveredItem.children} onCommand={onCommand} cssPrefix={cssPrefix} />
        </div>
      )}
    </>
  );
}

export default MenuItemList;
