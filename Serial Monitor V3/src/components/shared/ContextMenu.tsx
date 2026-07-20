/**
 * 共享 `<ContextMenu>` —— 统一右键菜单 UI 组件。
 * Phase 5b：归一化——所有右键菜单走这一个组件，四种统一失焦方式。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-右键菜单系统.md §六
 * VS Code 对标：VS Code context menu block layer + MenuActions
 *
 * 核心保证：
 * - 打开右键菜单 → 点空白处 → 消失 ✅
 * - 打开右键菜单 → Escape → 消失 ✅
 * - 打开右键菜单 → 移动窗口/Alt+Tab → 消失 ✅ (window.blur)
 * - 打开右键菜单 → 滚动页面 → 消失 ✅ (scroll capture)
 * - 所有右键菜单渲染实例共享同一套失焦逻辑——修一个 bug 全受益
 */

import { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { MenuId, getMenuItems } from "../../core/MenuRegistry";
import { getCommand, executeCommand } from "../../core/CommandRegistry";
import "./ContextMenu.css";

/* ── 类型 ── */

export interface ContextMenuProps {
  /** 菜单注册点——决定哪些菜单项出现 */
  menuId: MenuId;
  /** 菜单锚点（固定定位，clientX/clientY 即 left/top） */
  anchor: { x: number; y: number };
  /** 传给命令的上下文（when 过滤 + handler args） */
  context?: Record<string, unknown>;
  /** 关闭回调——调用方 setState(null) */
  onClose: () => void;
}

/* ── 组件 ── */

export default function ContextMenu({ menuId, anchor, context, onClose }: ContextMenuProps) {
  // ── 从 Registry 解析菜单项 ──
  const resolved = useMemo(() => {
    const rawItems = getMenuItems(menuId);
    // 按 group 分组——保留同 group 内的 order 排序
    const grouped = new Map<string, Array<{ id: string; label: string; shortcut?: string }>>();
    const groupOrder: string[] = [];

    for (const item of rawItems) {
      const cmd = getCommand(item.command);
      if (!cmd) continue; // 命令未注册——静默跳过（应对异步加载竞态）

      const group = item.group ?? "__default";
      if (!grouped.has(group)) {
        grouped.set(group, []);
        groupOrder.push(group);
      }
      grouped.get(group)!.push({
        id: item.command,
        label: cmd.title,
        // 快捷键暂时不显示——KeybindingRegistry 的 resolve 逻辑留 Phase 5c
        shortcut: undefined,
      });
    }

    // 展开为平铺数组，组间插分隔符。"navigation" → 分隔符 → "split" → ...
    const result: Array<{ id: string; label: string; shortcut?: string } | { type: "divider"; group: string }> = [];
    for (let i = 0; i < groupOrder.length; i++) {
      const group = groupOrder[i];
      if (i > 0) {
        result.push({ type: "divider", group });
      }
      result.push(...grouped.get(group)!);
    }
    return result;
  }, [menuId]);

  /* ── 四种统一失焦 ── */

  useEffect(() => {
    // 1. Escape
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // 2. 窗口失焦（移动窗口/Alt+Tab）
    const onBlur = () => onClose();
    // 3. 滚动——菜单跟着内容滚动会错位
    const onScroll = () => onClose();

    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    window.addEventListener("scroll", onScroll, true); // capture——捕获所有滚动事件

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  /* ── 键盘导航（ArrowUp/ArrowDown/Enter） ── */

  const [focusIdx, setFocusIdx] = useState(-1);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // 过滤出实际菜单项（非分隔符）
  const clickableItems = useMemo(
    () => resolved.filter((r) => !("type" in r)) as Array<{ id: string; label: string; shortcut?: string }>,
    [resolved]
  );

  useEffect(() => {
    const onKeyNav = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((prev) => Math.min(prev + 1, clickableItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && focusIdx >= 0) {
        e.preventDefault();
        const item = clickableItems[focusIdx];
        if (item) {
          executeCommand(item.id, undefined, context);
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKeyNav);
    return () => window.removeEventListener("keydown", onKeyNav);
  }, [clickableItems, focusIdx, context, onClose]);

  // 聚焦项自动滚动到视野
  useEffect(() => {
    if (focusIdx >= 0) {
      itemRefs.current.get(focusIdx)?.scrollIntoView({ block: "nearest" });
    }
  }, [focusIdx]);

  /* ── 点击菜单项 → 执行命令 + 关闭 ── */

  const handleItemClick = useCallback(
    (commandId: string) => {
      executeCommand(commandId, undefined, context);
      onClose();
    },
    [context, onClose]
  );

  /* ── 自动定位——防止菜单超出视口 ── */

  const adjustedAnchor = useMemo(() => {
    // 估测菜单尺寸（160px 宽，每项 ~30px 高）
    const estWidth = 180;
    const estHeight = Math.min(resolved.length * 30 + 8, 400); // 8px padding

    let left = anchor.x;
    let top = anchor.y;

    if (left + estWidth > window.innerWidth) {
      left = Math.max(0, window.innerWidth - estWidth - 4);
    }
    if (top + estHeight > window.innerHeight) {
      top = Math.max(0, window.innerHeight - estHeight - 4);
    }

    return { left, top };
  }, [anchor, resolved.length]);

  /* ── 渲染 ── */

  // 跟踪当前活跃分组——用于设置 ref index
  let clickableIdx = 0;

  return (
    <>
      {/*
        backdrop：全屏透明层——点击外部关闭菜单。
        对标 VS Code context menu block layer。
        onContextMenu 也关闭——防止右键在其他位置打开第二个菜单。
      */}
      <div
        className="ctx-backdrop"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      {/* 菜单面板 */}
      <div
        className="ctx-menu"
        style={{ left: adjustedAnchor.left, top: adjustedAnchor.top }}
      >
        {resolved.map((item, i) => {
          if ("type" in item) {
            return <div key={`div-${i}`} className="ctx-divider" />;
          }

          const idx = clickableIdx++;
          const isFocused = idx === focusIdx;

          return (
            <div
              key={item.id}
              ref={(el) => {
                if (el) itemRefs.current.set(idx, el);
                else itemRefs.current.delete(idx);
              }}
              className={`ctx-item${isFocused ? " focused" : ""}`}
              onClick={() => handleItemClick(item.id)}
              onMouseEnter={() => setFocusIdx(idx)}
            >
              <span className="ctx-item-label">{item.label}</span>
              {item.shortcut && (
                <span className="ctx-item-shortcut">{item.shortcut}</span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
