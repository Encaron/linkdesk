/**
 * 共享 `<ContextMenu>` —— 统一右键菜单 UI 组件。
 *
 * E5#44d：支持子菜单——静态 children 或动态 resolveChildren 回调。
 * 对标 VS Code：hover 父项右侧弹出子面板，移开自动收回（150ms 延迟防闪烁）。
 */
import { useEffect, useMemo, useRef, useCallback, useState, useLayoutEffect } from "react";
import OverlayPortal from "./OverlayPortal";
import { MenuId, getMenuItems as getLocalMenuItems } from "../../core/registry/MenuRegistry";
import { getCommand, executeCommand } from "../../core/registry/CommandRegistry";
import { ContextKeyService } from "../../core/registry/ContextKeyService";
import { findKeybindingForCommand } from "../../core/registry/KeybindingRegistry";
import "./ContextMenu.css";

/* ── 类型 ── */

export interface ContextMenuProps {
  menuId: MenuId;
  anchor: { x: number; y: number };
  /** 传给命令的上下文（when 过滤 + handler args） */
  context?: Record<string, unknown>;
  onClose: () => void;
  /**
   * E5#44d：动态子菜单解析器。
   * 当 menu item 声明 children: []（空数组）时调用此函数获取子项。
   * @param parentId 父菜单项的命令 ID（空字符串表示纯标签项）
   * @param ctx 同 context prop
   * @returns 子菜单项列表，或 undefined 表示无子项
   */
  resolveChildren?: (parentId: string, ctx: Record<string, unknown>) => Array<{ id: string; label: string }> | undefined;
}

interface ResolvedItem {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  /** 子菜单项——有值则渲染为可展开项，hover 弹出子面板 */
  children?: ResolvedItem[];
}

/* ── 组件 ── */

export default function ContextMenu({ menuId, anchor, context, onClose, resolveChildren }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const subTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── 插件 WebView 远程菜单 ── */
  const [remoteItems, setRemoteItems] = useState<any[] | null>(null);
  const isPluginWebView = !!window.linkdesk?.pluginViews?.notifyReady;
  useEffect(() => {
    if (!isPluginWebView) return;
    window.linkdesk?.menu?.getItems?.(menuId).then(setRemoteItems);
  }, [menuId, isPluginWebView]);

  /* ── 菜单项解析 ── */
  const resolved = useMemo((): Array<ResolvedItem | { type: "divider"; group: string }> => {
    const rawItems = isPluginWebView ? (remoteItems ?? []) : getLocalMenuItems(menuId);
    const grouped = new Map<string, ResolvedItem[]>();
    const groupOrder: string[] = [];

    for (const item of rawItems) {
      const cmd = getCommand(item.command);
      const rawChildren = (item as any).children as any[] | undefined;
      // 有 children 的父项放行（即使 command 为空）
      if (!cmd && !rawChildren) continue;

      const whenExpr = item.when ?? cmd?.when;
      if (!ContextKeyService.matches(whenExpr, context as Record<string, unknown> | undefined)) continue;

      const group = item.group ?? "__default";
      if (!grouped.has(group)) { grouped.set(group, []); groupOrder.push(group); }

      // 子菜单：静态 children 透传 / 空 children 调 resolveChildren 动态填充
      let children: ResolvedItem[] | undefined;
      if (rawChildren && rawChildren.length > 0) {
        children = rawChildren.map((c: any) => ({
          id: c.command,
          label: getCommand(c.command)?.title ?? c.label ?? c.command,
          group,
        }));
      } else if (rawChildren && rawChildren.length === 0 && resolveChildren) {
        const dyn = resolveChildren(item.command, context ?? {});
        if (dyn && dyn.length > 0) {
          children = dyn.map((c) => ({ id: c.id, label: c.label, group }));
        }
      }

      grouped.get(group)!.push({
        id: item.command || (item as any).label || "",
        label: cmd?.title ?? (item as any).label ?? item.command,
        group,
        shortcut: cmd ? findKeybindingForCommand(item.command)?.key : undefined,
        children,
      });
    }

    const result: Array<ResolvedItem | { type: "divider"; group: string }> = [];
    for (let i = 0; i < groupOrder.length; i++) {
      if (i > 0) result.push({ type: "divider", group: groupOrder[i] });
      result.push(...grouped.get(groupOrder[i])!);
    }
    return result;
  }, [menuId, context, resolveChildren, isPluginWebView, remoteItems]);

  /* ═══ E5#44d：hover 子菜单状态 ═══ */
  const [subData, setSubData] = useState<{ x: number; y: number; items: ResolvedItem[] } | null>(null);

  /* ── 统一失焦 ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (subData) setSubData(null); else onClose(); } };
    const onBlur = () => onClose();
    const onWheel = () => onClose();
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && !subRef.current?.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    window.addEventListener("wheel", onWheel, true);
    window.addEventListener("mousedown", onMouseDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("mousedown", onMouseDown, true);
    };
  }, [onClose, subData]);

  /* ── 键盘导航 ── */
  const [focusIdx, setFocusIdx] = useState(-1);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const clickableItems = useMemo(() => resolved.filter((r) => !("type" in r)) as ResolvedItem[], [resolved]);

  useEffect(() => {
    const onKeyNav = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx((prev) => Math.min(prev + 1, clickableItems.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx((prev) => Math.max(prev - 1, 0)); }
      else if (e.key === "Enter" && focusIdx >= 0) {
        e.preventDefault();
        const item = clickableItems[focusIdx];
        if (item) { executeCommand(item.id, undefined, context); onClose(); }
      }
    };
    window.addEventListener("keydown", onKeyNav);
    return () => window.removeEventListener("keydown", onKeyNav);
  }, [clickableItems, focusIdx, context, onClose]);

  useEffect(() => {
    if (focusIdx >= 0) itemRefs.current.get(focusIdx)?.scrollIntoView({ block: "nearest" });
  }, [focusIdx]);

  /* ── 命令执行 ── */
  const handleItemClick = useCallback(async (commandId: string) => {
    onClose();
    await executeCommand(commandId, undefined, context);
  }, [context, onClose]);

  /* ── 视口自适应（E5#94a：两阶段渲染——先隐藏量测真实 DOM 尺寸再修正位置）── */
  const [menuPos, setMenuPos] = useState({ left: anchor.x, top: anchor.y });
  const [menuReady, setMenuReady] = useState(false);

  useLayoutEffect(() => {
    setMenuPos({ left: anchor.x, top: anchor.y });
    setMenuReady(false);
  }, [anchor.x, anchor.y, resolved.length]);

  /* ── 入场动画 + 定位修正 ── */
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    // 1. 量测真实尺寸 + 修正溢出
    const rect = el.getBoundingClientRect();
    let left = anchor.x;
    let top = anchor.y;
    if (left + rect.width > window.innerWidth) left = Math.max(0, window.innerWidth - rect.width - 4);
    if (top + rect.height > window.innerHeight) top = Math.max(0, window.innerHeight - rect.height - 4);
    setMenuPos({ left, top });
    // 2. 入场动画
    const frame = requestAnimationFrame(() => {
      setMenuReady(true);
      el.classList.add("show");
    });
    return () => cancelAnimationFrame(frame);
  }, [anchor.x, anchor.y, resolved.length]);

  /* ═══ E5#44d：hover 子菜单 handler ═══ */
  const openSub = useCallback((el: HTMLElement, items: ResolvedItem[]) => {
    if (subTimer.current) { clearTimeout(subTimer.current); subTimer.current = null; }
    const r = el.getBoundingClientRect();
    // E5#94b：子菜单方向跟随可用空间——右边放不下就放左边
    const subEstW = 160;
    const x = r.right + subEstW > window.innerWidth ? r.left - subEstW - 4 : r.right + 4;
    setSubData({ x, y: r.top, items });
  }, []);

  const closeSubDelayed = useCallback(() => {
    subTimer.current = setTimeout(() => setSubData(null), 150);
  }, []);

  /* ── 渲染 ── */
  let clickableIdx = 0;

  return (
    <OverlayPortal>
      {/* 主菜单 */}
      <div ref={menuRef} className="ctx-menu" style={{ left: menuPos.left, top: menuPos.top, visibility: menuReady ? undefined : "hidden" }}>
        {resolved.map((item, i) => {
          if ("type" in item) return <div key={`div-${i}`} className="ctx-divider" />;
          const idx = clickableIdx++;
          const hasKids = !!(item.children && item.children.length > 0);
          const isFocused = idx === focusIdx;
          const isDanger = item.group === "delete";

          return (
            <div
              key={item.id}
              ref={(el) => { if (el) itemRefs.current.set(idx, el); else itemRefs.current.delete(idx); }}
              className={`ctx-item${isFocused ? " focused" : ""}${isDanger ? " ctx-item-danger" : ""}`}
              onClick={(e) => { e.stopPropagation(); if (!hasKids) handleItemClick(item.id); }}
              onMouseEnter={(e) => {
                setFocusIdx(idx);
                if (hasKids) openSub(e.currentTarget as HTMLElement, item.children!);
              }}
              onMouseLeave={() => { if (hasKids) closeSubDelayed(); }}
            >
              <span className="ctx-item-label">{item.label}</span>
              {hasKids && <span className="ctx-item-chevron">›</span>}
              {item.shortcut && <span className="ctx-item-shortcut">{item.shortcut}</span>}
            </div>
          );
        })}
      </div>

      {/* 子面板——独立于主菜单，避免 overflow 裁切 */}
      {subData && (
        <div
          ref={subRef}
          className="ctx-menu show"
          style={{ left: subData.x, top: subData.y }}
          onMouseEnter={() => { if (subTimer.current) { clearTimeout(subTimer.current); subTimer.current = null; } }}
          onMouseLeave={closeSubDelayed}
        >
          {subData.items.map((child, ki) => (
            <div key={ki} className="ctx-item" onClick={(e) => { e.stopPropagation(); handleItemClick(child.id); }}>
              <span className="ctx-item-label">{child.label}</span>
            </div>
          ))}
        </div>
      )}
    </OverlayPortal>
  );
}
