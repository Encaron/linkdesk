/**
 * 共享 `<ContextMenu>` —— 统一右键菜单 UI 组件。
 * Phase 5b：归一化——所有右键菜单走这一个组件，四种统一失焦方式。
 */

import { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { MenuId, getMenuItems as getLocalMenuItems } from "../../core/registry/MenuRegistry";
import { getCommand, executeCommand } from "../../core/registry/CommandRegistry";
import { ContextKeyService } from "../../core/registry/ContextKeyService";
import { findKeybindingForCommand } from "../../core/registry/KeybindingRegistry";
import "./ContextMenu.css";

export interface ContextMenuProps {
  menuId: MenuId;
  anchor: { x: number; y: number };
  context?: Record<string, unknown>;
  onClose: () => void;
  resolveChildren?: (parentId: string, ctx: Record<string, unknown>) => Array<{ id: string; label: string }> | undefined;
}

interface ResolvedItem {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  children?: ResolvedItem[];
}

export default function ContextMenu({ menuId, anchor, context, onClose, resolveChildren }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const [remoteItems, setRemoteItems] = useState<any[] | null>(null);
  const isPluginWebView = !!(window as any).linkdesk?.pluginViews?.notifyReady;
  useEffect(() => {
    if (!isPluginWebView) return;
    (window as any).linkdesk?.menu?.getItems?.(menuId).then(setRemoteItems);
  }, [menuId, isPluginWebView]);

  const resolved = useMemo((): Array<ResolvedItem | { type: "divider"; group: string }> => {
    const rawItems = isPluginWebView ? (remoteItems ?? []) : getLocalMenuItems(menuId);
    const grouped = new Map<string, ResolvedItem[]>();
    const groupOrder: string[] = [];

    for (const item of rawItems) {
      const cmd = getCommand(item.command);
      if (!cmd && !(item as any).children) continue;
      const whenExpr = item.when ?? cmd?.when;
      if (!ContextKeyService.matches(whenExpr, context as Record<string, unknown> | undefined)) continue;

      const group = item.group ?? "__default";
      if (!grouped.has(group)) { grouped.set(group, []); groupOrder.push(group); }

      let children: ResolvedItem[] | undefined;
      const rawChildren = (item as any).children;
      if (rawChildren?.length) {
        children = rawChildren.map((c: any) => ({
          id: c.command, label: getCommand(c.command)?.title ?? c.label ?? c.command, group,
        }));
      } else if (rawChildren && rawChildren.length === 0 && resolveChildren) {
        const dyn = resolveChildren(item.command, context ?? {});
        if (dyn?.length) children = dyn.map(c => ({ id: c.id, label: c.label, group }));
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onBlur = () => onClose();
    const onWheel = () => onClose();
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && !subRef.current?.contains(e.target as Node)) onClose();
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
  }, [onClose]);

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

  const handleItemClick = useCallback(async (commandId: string) => {
    onClose();
    await executeCommand(commandId, undefined, context);
  }, [context, onClose]);

  const adjustedAnchor = useMemo(() => {
    const estWidth = 180;
    const estHeight = Math.min(resolved.length * 30 + 8, 400);
    let left = anchor.x, top = anchor.y;
    if (left + estWidth > window.innerWidth) left = Math.max(0, window.innerWidth - estWidth - 4);
    if (top + estHeight > window.innerHeight) top = Math.max(0, window.innerHeight - estHeight - 4);
    return { left, top };
  }, [anchor, resolved.length]);

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => el.classList.add("show"));
    return () => cancelAnimationFrame(frame);
  }, []);

  // E5#44d：点击展开子面板
  const [subAnchor, setSubAnchor] = useState<{ x: number; y: number; items: ResolvedItem[] } | null>(null);
  const subRef = useRef<HTMLDivElement>(null);

  let clickableIdx = 0;

  return (
    <>
    <div ref={menuRef} className="ctx-menu" style={{ left: adjustedAnchor.left, top: adjustedAnchor.top }}>
      {resolved.map((item, i) => {
        if ("type" in item) return <div key={`div-${i}`} className="ctx-divider" />;
        const idx = clickableIdx++;
        const isFocused = idx === focusIdx;
        const isDanger = item.group === "delete";
        const hasKids = item.children && item.children.length > 0;

        return (
          <div
            key={item.id}
            ref={(el) => { if (el) itemRefs.current.set(idx, el); else itemRefs.current.delete(idx); }}
            className={`ctx-item${isFocused ? " focused" : ""}${isDanger ? " ctx-item-danger" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              if (hasKids) {
                const rect = e.currentTarget.getBoundingClientRect();
                setSubAnchor({ x: rect.right + 4, y: rect.top, items: item.children! });
              } else {
                handleItemClick(item.id);
              }
            }}
            onMouseEnter={() => setFocusIdx(idx)}
          >
            <span className="ctx-item-label">{item.label}</span>
            {hasKids && <span className="ctx-item-chevron">›</span>}
            {item.shortcut && <span className="ctx-item-shortcut">{item.shortcut}</span>}
          </div>
        );
      })}
    </div>
    {subAnchor && (
      <div ref={subRef} className="ctx-menu" style={{ left: subAnchor.x, top: subAnchor.y }}>
        {subAnchor.items.map((child) => (
          <div key={child.id} className="ctx-item" onClick={(e) => { e.stopPropagation(); handleItemClick(child.id); }}>
            <span className="ctx-item-label">{child.label}</span>
          </div>
        ))}
      </div>
    )}
    </>
  );
}
