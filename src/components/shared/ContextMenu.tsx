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
 * - 打开右键菜单 → 鼠标滚轮 → 消失 ✅ (wheel capture——不含 CM6 程序化滚动)
 * - 所有右键菜单渲染实例共享同一套失焦逻辑——修一个 bug 全受益
 *
 * 🔧 5b fix：backdrop div 改为 window mousedown 监听——解决"右键换位置需要点两次"的 bug。
 *    backdrop div 拦截了 contextmenu 事件 → 新目标收不到 → 菜单关但不打开。
 *    mousedown 不拦截事件，只关菜单——contextmenu 正常到达新目标。
 * 🔧 5b fix：scroll → wheel——CM6 接收数据时频繁触发 scroll 事件 → 菜单闪关。
 *    wheel 只对用户主动滚轮输入反应，不受程序化滚动影响。
 */

import { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { MenuId, getMenuItems as getLocalMenuItems } from "../../core/MenuRegistry";
import { getCommand, executeCommand } from "../../core/CommandRegistry";
import { ContextKeyService } from "../../core/ContextKeyService";
import { findKeybindingForCommand } from "../../core/KeybindingRegistry";
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

/** 解析后的菜单项（已从 CommandRegistry 补全 title） */
interface ResolvedItem {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
}

/* ── 组件 ── */

export default function ContextMenu({ menuId, anchor, context, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // E5#69f：插件 WebView 中菜单项从壳侧取（IPC），壳内直接用本地 Registry
  const [remoteItems, setRemoteItems] = useState<any[] | null>(null);
  const isPluginWebView = !!(window as any).linkdesk?.pluginViews?.notifyReady;
  useEffect(() => {
    if (!isPluginWebView) return;
    (window as any).linkdesk?.menu?.getItems?.(menuId).then(setRemoteItems);
  }, [menuId, isPluginWebView]);

  // ── 从 Registry 解析菜单项 ──
  const resolved = useMemo((): Array<ResolvedItem | { type: "divider"; group: string }> => {
    const rawItems = isPluginWebView ? (remoteItems ?? []) : getLocalMenuItems(menuId);
    // 按 group 分组——保留同 group 内的 order 排序
    const grouped = new Map<string, ResolvedItem[]>();
    const groupOrder: string[] = [];

    for (const item of rawItems) {
      const cmd = getCommand(item.command);
      if (!cmd) continue; // 命令未注册——静默跳过（应对异步加载竞态）

      // Phase 5d：when 条件过滤——菜单项 when 优先（更具体），fallback 命令 when
      // 对标 VS Code：菜单项 when 覆盖命令 when，条件不满足 → 不显示
      const whenExpr = item.when ?? cmd.when;
      if (!ContextKeyService.matches(whenExpr)) continue;

      const group = item.group ?? "__default";
      if (!grouped.has(group)) {
        grouped.set(group, []);
        groupOrder.push(group);
      }
      grouped.get(group)!.push({
        id: item.command,
        label: cmd.title,
        group,
        // E3.5: 接线 KeybindingRegistry——自动查找命令对应的快捷键
        shortcut: findKeybindingForCommand(item.command)?.key,
      });
    }

    // 展开为平铺数组，组间插分隔符。"navigation" → 分隔符 → "split" → ...
    const result: Array<ResolvedItem | { type: "divider"; group: string }> = [];
    for (let i = 0; i < groupOrder.length; i++) {
      const group = groupOrder[i];
      if (i > 0) {
        result.push({ type: "divider", group });
      }
      result.push(...grouped.get(group)!);
    }
    return result;
  }, [menuId]);

  /* ── 统一失焦（四种方式） ── */

  useEffect(() => {
    // 1. Escape
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // 2. 窗口失焦（移动窗口/Alt+Tab）
    const onBlur = () => onClose();
    // 3. 鼠标滚轮——菜单跟着内容滚动会错位。wheel 而非 scroll：避免 CM6 程序化滚动误关
    const onWheel = () => onClose();
    // 4. 点击/右键菜单外——mousedown capture，不阻止事件传播
    //    对标 VS Code context menu block layer，但用 mousedown 替代 backdrop div：
    //    backdrop div 拦截了 contextmenu 事件 → 新目标收不到右键 → 需要点两次。
    //    mousedown 只检测位置然后关菜单，不拦截事件 → contextmenu 正常到达新目标。
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    window.addEventListener("wheel", onWheel, true); // capture——捕获所有滚轮事件
    window.addEventListener("mousedown", onMouseDown, true); // capture——在目标元素之前检测

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("mousedown", onMouseDown, true);
    };
  }, [onClose]);

  /* ── 键盘导航（ArrowUp/ArrowDown/Enter） ── */

  const [focusIdx, setFocusIdx] = useState(-1);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // 过滤出实际菜单项（非分隔符）
  const clickableItems = useMemo(
    () => resolved.filter((r) => !("type" in r)) as ResolvedItem[],
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
    async (commandId: string) => {
      // 先关菜单再执行命令——避免弹窗（showConfirm 等）与菜单同时显示。
      // context 对象 { uri, isDirectory } 是直接传参的，不依赖 ContextKeyService。
      onClose();
      await executeCommand(commandId, undefined, context);
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

  /* ── 出现动画——首帧渲染后下一帧加 .show 触发 transition ── */

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => el.classList.add("show"));
    return () => cancelAnimationFrame(frame);
  }, []);

  /* ── 渲染 ── */

  let clickableIdx = 0;

  return (
    <div
      ref={menuRef}
      className="ctx-menu"
      style={{ left: adjustedAnchor.left, top: adjustedAnchor.top }}
    >
      {resolved.map((item, i) => {
        if ("type" in item) {
          return <div key={`div-${i}`} className="ctx-divider" />;
        }

        const idx = clickableIdx++;
        const isFocused = idx === focusIdx;
        // "delete" 组的菜单项自动标红（危险操作——对标 VS Code menu item destructive）
        const isDanger = item.group === "delete";

        return (
          <div
            key={item.id}
            ref={(el) => {
              if (el) itemRefs.current.set(idx, el);
              else itemRefs.current.delete(idx);
            }}
            className={`ctx-item${isFocused ? " focused" : ""}${isDanger ? " ctx-item-danger" : ""}`}
            onClick={(e) => { e.stopPropagation(); handleItemClick(item.id); }}
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
  );
}
