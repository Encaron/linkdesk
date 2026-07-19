/**
 * IconBar — 图标栏（最左 48px 垂直条）。
 * 对标 VS Code Activity Bar：拖拽排序 + 蓝色指示条。
 * 用纯鼠标事件实现（不用 HTML5 DnD——Tauri WebView2 兼容性更好）。
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getViewPlugins } from "../pluginLoader/viewRegistry";
import PreferenceService from "../core/PreferenceService";
import "./IconBar.css";

interface IconBarProps {
  activeTabType: string;
  activePluginId?: string;
  sidebarView?: string | null;
  onOpenOrFocus: (type: string) => void;
}

const PLUGIN_ICON_PATH: Record<string, string> = {
  terminal: "terminal.png",
  workspace: "workspace.png",
  settings: "settings.png",
  marketplace: "extensions.svg",
};

function getIconSrc(pluginId: string): string {
  const path = PLUGIN_ICON_PATH[pluginId];
  if (path) return `/assets/icons/${path}`;
  return `/assets/icons/settings.svg`;
}

function loadOrder(): string[] {
  try { return PreferenceService.loadPrefs().iconOrder ?? []; } catch { return []; }
}
function saveOrder(order: string[]): void {
  try {
    const prefs = PreferenceService.loadPrefs();
    prefs.iconOrder = order;
    PreferenceService.savePrefs(prefs).catch(() => {});
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
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: "top" | "bottom" } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dropTargetRef = useRef<{ id: string; pos: "top" | "bottom" } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 图标顺序
  const viewPlugins = getViewPlugins();
  const savedOrder = loadOrder();

  type IconEntry = { pluginId: string; iconSrc: string; label: string };
  const ordered: IconEntry[] = (() => {
    const result: IconEntry[] = [];
    const remaining = new Set(viewPlugins.map((p) => p.pluginId));
    for (const id of savedOrder) {
      if (remaining.has(id)) {
        remaining.delete(id);
        const p = viewPlugins.find((v) => v.pluginId === id);
        if (p) result.push({ pluginId: id, iconSrc: getIconSrc(id), label: p.manifest.name });
      }
    }
    for (const id of remaining) {
      const p = viewPlugins.find((v) => v.pluginId === id);
      if (p) result.push({ pluginId: id, iconSrc: getIconSrc(id), label: p.manifest.name });
    }
    return result;
  })();
  const orderedRef = useRef(ordered);
  orderedRef.current = ordered;

  /* ── 查找鼠标下的图标 ── */

  const findIconAt = useCallback((clientY: number, excludeId: string): { id: string; pos: "top" | "bottom" } | null => {
    const container = containerRef.current;
    if (!container) return null;
    const buttons = container.querySelectorAll("[data-plugin-id]");
    const cur = orderedRef.current;
    for (const btn of buttons) {
      const rect = btn.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom &&
          btn.getAttribute("data-plugin-id") !== excludeId) {
        return {
          id: btn.getAttribute("data-plugin-id")!,
          pos: clientY < rect.top + rect.height / 2 ? "top" : "bottom",
        };
      }
    }
    if (buttons.length > 0 && cur.length > 0) {
      const last = buttons[buttons.length - 1];
      const lastRect = last.getBoundingClientRect();
      if (clientY > lastRect.bottom) {
        return { id: last.getAttribute("data-plugin-id")!, pos: "bottom" };
      }
    }
    return null;
  }, []);

  /* ── 鼠标事件 ── */

  const handleMouseDown = useCallback((e: React.MouseEvent, pluginId: string) => {
    // 只响应左键
    if (e.button !== 0) return;
    dragRef.current = { pluginId, startY: e.clientY, moved: false };
    // 不阻止默认——保留 click 事件用于普通点击
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dy = Math.abs(e.clientY - dragRef.current.startY);
      if (dy < 5) return; // 5px 阈值防误触
      dragRef.current.moved = true;
      setDraggedId(dragRef.current.pluginId);
      const target = findIconAt(e.clientY, dragRef.current.pluginId);
      dropTargetRef.current = target;
      setDropTarget(target);
    };
    const onMouseUp = () => {
      const drag = dragRef.current;
      const target = dropTargetRef.current;
      if (!drag) return;

      if (drag.moved && target) {
        const cur = orderedRef.current.map((x) => x.pluginId).filter((x) => x !== drag.pluginId);
        const targetIndex = cur.indexOf(target.id);
        const insertAt = target.pos === "top" ? targetIndex : targetIndex + 1;
        cur.splice(Math.max(0, insertAt), 0, drag.pluginId);
        saveOrder(cur);
      }

      dragRef.current = null;
      dropTargetRef.current = null;
      setDraggedId(null);
      setDropTarget(null);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 用 ref 获取最新值，不需要重新注册

  /* ── 高亮 ── */

  const isActive = (pluginId: string) => {
    if (sidebarView) return sidebarView === pluginId;
    if (activePluginId) return activePluginId === pluginId;
    return activeTabType === pluginId;
  };

  return (
    <div className="icon-bar" role="navigation" aria-label={t("导航")}>
      <div className="icon-bar-top" ref={containerRef}>
        {ordered.map((entry) => {
          const showBefore = dropTarget?.id === entry.pluginId && dropTarget.pos === "top";
          const showAfter = dropTarget?.id === entry.pluginId && dropTarget.pos === "bottom";
          return (
            <div key={entry.pluginId} className="icon-bar-item-wrapper">
              {showBefore && <div className="icon-drop-indicator" />}
              <button
                className={`icon-btn${isActive(entry.pluginId) ? " active" : ""}${draggedId === entry.pluginId ? " dragging" : ""}`}
                data-plugin-id={entry.pluginId}
                onClick={() => {
                  if (!dragRef.current?.moved) {
                    onOpenOrFocus(entry.pluginId);
                  }
                }}
                onMouseDown={(e) => handleMouseDown(e, entry.pluginId)}
                title={t(entry.label)}
                aria-label={t(entry.label)}
              >
                <img src={entry.iconSrc} alt={t(entry.label)} className="icon-img" />
              </button>
              {showAfter && <div className="icon-drop-indicator" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default IconBar;
