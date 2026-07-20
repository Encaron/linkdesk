/**
 * IconBar — 图标栏（最左 48px 垂直条）。
 * 对标 VS Code Activity Bar。拖拽换位 + 半透明拖影跟随鼠标。
 * 复用 TabBar 拖拽的 window 级 mousemove/mouseup 模式。
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { getViewPlugins } from "../pluginLoader/viewRegistry";
import { resolvePluginIcon, type ResolvedIcon } from "../pluginLoader/iconUtils";
import PreferenceService from "../core/PreferenceService";
// Phase 5：图标排序迁移到 PluginStateService
import { getPluginStateValue, setPluginStateValue } from "../core/PluginStateService";
import "./IconBar.css";

interface IconBarProps {
  activeTabType: string;
  activePluginId?: string;
  sidebarView?: string | null;
  onOpenOrFocus: (type: string) => void;
}

/** 固定在底部的图标——对标 VS Code Activity Bar 的 Manage 齿轮。布局规则，非类型定义。 */
const BOTTOM_ICONS = new Set(["settings"]);

function getIcon(entry: { pluginId: string; manifest: { icon?: string; iconSource?: string } }) {
  return resolvePluginIcon(entry.manifest) || { src: `/assets/icons/${entry.pluginId}.png` };
}

function loadOrder(): string[] {
  try {
    // Phase 5：优先读 PluginStateService，fallback 旧 PreferenceService
    const fromPss = getPluginStateValue<string[]>("app", "iconOrder");
    if (fromPss) return fromPss;
    return PreferenceService.loadPrefs().iconOrder ?? [];
  } catch { return []; }
}
function saveOrder(order: string[]): void {
  try {
    // Phase 5：写入 PluginStateService
    setPluginStateValue("app", "iconOrder", order);
  } catch { /* 静默 */ }
}

/* ── 拖拽状态 ── */

interface DragState {
  pluginId: string;
  startY: number;
  moved: boolean;
}

function IconBar({ activeTabType, activePluginId, sidebarView, onOpenOrFocus }: IconBarProps) {
  const { t } = useTranslation();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: "top" | "bottom" } | null>(null);
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dropRef = useRef<{ id: string; pos: "top" | "bottom" } | null>(null);
  const wasDragRef = useRef(false); // 标记本次是否拖拽了——防止 onClick 误触发
  const containerRef = useRef<HTMLDivElement>(null);

  const viewPlugins = getViewPlugins();
  const savedOrder = loadOrder();

  type IconEntry = { pluginId: string; icon: ResolvedIcon; label: string };
  const ordered: IconEntry[] = useMemo(() => {
    const result: IconEntry[] = [];
    const remaining = new Set(viewPlugins.map((p) => p.pluginId));
    for (const id of savedOrder) {
      if (remaining.has(id)) {
        remaining.delete(id);
        const p = viewPlugins.find((v) => v.pluginId === id);
        if (p) result.push({ pluginId: id, icon: getIcon(p), label: p.manifest.name });
      }
    }
    for (const id of remaining) {
      const p = viewPlugins.find((v) => v.pluginId === id);
      if (p) result.push({ pluginId: id, icon: getIcon(p), label: p.manifest.name });
    }
    return result;
  }, [viewPlugins, savedOrder]);
  const orderedRef = useRef(ordered);
  orderedRef.current = ordered;

  const topIcons = ordered.filter((x) => !BOTTOM_ICONS.has(x.pluginId));
  const bottomIcons = ordered.filter((x) => BOTTOM_ICONS.has(x.pluginId));

  /* ── 查找鼠标下的图标 ── */

  const findTarget = (clientY: number, excludeId: string) => {
    const container = containerRef.current;
    if (!container) return null;
    const buttons = container.querySelectorAll("[data-plugin-id]");
    for (const btn of buttons) {
      if (btn.getAttribute("data-plugin-id") === excludeId) continue;
      const rect = btn.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        return {
          id: btn.getAttribute("data-plugin-id")!,
          pos: (clientY < rect.top + rect.height / 2 ? "top" : "bottom") as "top" | "bottom",
        };
      }
    }
    return null;
  };

  /* ── 拖拽事件（窗口级，和 TabBar 同一模式） ── */

  const handleDragMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;
    const dy = Math.abs(e.clientY - dragRef.current.startY);
    if (dy < 5) return;

    if (!dragRef.current.moved) {
      dragRef.current.moved = true;
      wasDragRef.current = true;
      setDraggedId(dragRef.current.pluginId);
    }

    const target = findTarget(e.clientY, dragRef.current.pluginId);
    dropRef.current = target;
    setPreviewPos({ x: e.clientX - 24, y: e.clientY - 24 });
    setDropTarget(target);
  }, []);

  const handleDragMouseUp = useCallback(() => {
    const drag = dragRef.current;
    const target = dropRef.current;
    if (!drag) return;

    if (drag.moved && target) {
      const ids = orderedRef.current.map((x) => x.pluginId).filter((x) => x !== drag.pluginId);
      const targetIdx = ids.indexOf(target.id);
      const insertAt = target.pos === "top" ? targetIdx : targetIdx + 1;
      ids.splice(Math.max(0, insertAt), 0, drag.pluginId);
      saveOrder(ids);
    }

    dragRef.current = null;
    dropRef.current = null;
    setDraggedId(null);
    setDropTarget(null);
    setPreviewPos(null);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleDragMouseMove);
    window.addEventListener("mouseup", handleDragMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleDragMouseMove);
      window.removeEventListener("mouseup", handleDragMouseUp);
    };
  }, [handleDragMouseMove, handleDragMouseUp]);

  /* ── 高亮 ── */

  const isActive = (pluginId: string) => {
    if (sidebarView) return sidebarView === pluginId;
    if (activePluginId) return activePluginId === pluginId;
    return activeTabType === pluginId;
  };

  const renderIcon = (entry: IconEntry) => {
    const showBefore = dropTarget?.id === entry.pluginId && dropTarget.pos === "top";
    const showAfter = dropTarget?.id === entry.pluginId && dropTarget.pos === "bottom";
    return (
      <div key={entry.pluginId} className="icon-bar-item-wrapper">
        {showBefore && <div className="icon-drop-indicator" />}
        <button
          className={`icon-btn${isActive(entry.pluginId) ? " active" : ""}${draggedId === entry.pluginId ? " dragging" : ""}`}
          data-plugin-id={entry.pluginId}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault(); // 阻止浏览器原生拖拽
            dragRef.current = { pluginId: entry.pluginId, startY: e.clientY, moved: false };
          }}
          onClick={() => {
            if (wasDragRef.current) {
              wasDragRef.current = false;
              dragRef.current = null;
              return;
            }
            onOpenOrFocus(entry.pluginId);
          }}
          title={t(entry.label)}
          aria-label={t(entry.label)}
        >
          {entry.icon.codicon ? (
            <span className={`codicon ${entry.icon.codicon} icon-codicon`} />
          ) : entry.icon.src ? (
            <img src={entry.icon.src} alt={t(entry.label)} className="icon-img" />
          ) : (
            <span className="icon-emoji">{entry.icon.emoji ?? "📄"}</span>
          )}
        </button>
        {showAfter && <div className="icon-drop-indicator" />}
      </div>
    );
  };

  return (
    <div className="icon-bar" role="navigation" aria-label={t("导航")}>
      <div className="icon-bar-top" ref={containerRef}>
        {topIcons.map(renderIcon)}
      </div>
      <div className="icon-bar-bottom">
        {bottomIcons.map(renderIcon)}
      </div>

      {/* 拖影——对标 TabBar 的半透明跟随 */}
      {previewPos && draggedId && createPortal(
        <div
          className="icon-drag-preview"
          style={{ left: previewPos.x, top: previewPos.y }}
        >
          {((): React.ReactNode => {
            const entry = ordered.find(e => e.pluginId === draggedId);
            if (entry?.icon.codicon) return <span className={`codicon ${entry.icon.codicon} icon-codicon`} />;
            if (entry?.icon.src) return <img src={entry.icon.src} alt="" className="icon-img" />;
            return <span className="icon-emoji">{entry?.icon.emoji ?? "📄"}</span>;
          })()}
        </div>,
        document.body
      )}
    </div>
  );
}

export default IconBar;
