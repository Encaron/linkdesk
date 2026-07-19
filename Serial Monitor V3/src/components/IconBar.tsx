/**
 * IconBar — 图标栏（最左 48px 垂直条）。
 * 对标 VS Code Activity Bar：拖拽排序 + 蓝色指示条。
 */

import { useState, useCallback, useRef } from "react";
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

/* ── 图标顺序持久化 ── */

function loadOrder(): string[] {
  try {
    return PreferenceService.loadPrefs().iconOrder ?? [];
  } catch {
    return [];
  }
}

function saveOrder(order: string[]): void {
  try {
    const prefs = PreferenceService.loadPrefs();
    prefs.iconOrder = order;
    PreferenceService.savePrefs(prefs).catch(() => {});
  } catch {
    // 静默
  }
}

/* ── 组件 ── */

function IconBar({ activeTabType, activePluginId, sidebarView, onOpenOrFocus }: IconBarProps) {
  const { t } = useTranslation();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: "top" | "bottom" } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 图标顺序
  const viewPlugins = getViewPlugins();
  const savedOrder = loadOrder();

  type IconEntry = { pluginId: string; iconSrc: string; label: string };
  const ordered = (() => {
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

  /* ── 拖拽：在容器级别统一处理 dragover/drop ── */

  const handleDragStart = useCallback((e: React.DragEvent, pluginId: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", pluginId);
    setDraggedId(pluginId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDropTarget(null);
  }, []);

  // 在容器上统一处理 dragover——避免被拖拽元素遮挡
  const handleContainerDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (!draggedId) return;

      // 找到鼠标下的图标按钮
      const container = containerRef.current;
      if (!container) return;
      const buttons = container.querySelectorAll(".icon-btn");
      let targetId: string | null = null;
      let pos: "top" | "bottom" = "bottom";

      for (const btn of buttons) {
        const rect = btn.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          targetId = btn.getAttribute("data-plugin-id");
          pos = e.clientY < rect.top + rect.height / 2 ? "top" : "bottom";
          break;
        }
      }
      // 如果鼠标在所有图标下方，放在末尾
      if (!targetId && ordered.length > 0) {
        const lastBtn = buttons[buttons.length - 1];
        if (lastBtn) {
          const lastRect = lastBtn.getBoundingClientRect();
          if (e.clientY > lastRect.bottom) {
            targetId = lastBtn.getAttribute("data-plugin-id");
            pos = "bottom";
          }
        }
      }
      if (targetId && targetId !== draggedId) {
        setDropTarget({ id: targetId, pos });
      } else {
        setDropTarget(null);
      }
    },
    [draggedId, ordered]
  );

  const handleContainerDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      if (!id || !dropTarget || id === dropTarget.id) {
        setDraggedId(null);
        setDropTarget(null);
        return;
      }

      const newOrder = ordered.map((x) => x.pluginId).filter((x) => x !== id);
      const targetIndex = newOrder.indexOf(dropTarget.id);
      const insertAt = dropTarget.pos === "top" ? targetIndex : targetIndex + 1;
      newOrder.splice(insertAt, 0, id);
      saveOrder(newOrder);

      setDraggedId(null);
      setDropTarget(null);
    },
    [ordered, dropTarget]
  );

  /* ── 高亮 ── */

  const isActive = (pluginId: string) => {
    if (sidebarView) return sidebarView === pluginId;
    if (activePluginId) return activePluginId === pluginId;
    return activeTabType === pluginId;
  };

  return (
    <div className="icon-bar" role="navigation" aria-label={t("导航")}>
      <div
        className="icon-bar-top"
        ref={containerRef}
        onDragOver={handleContainerDragOver}
        onDrop={handleContainerDrop}
      >
        {ordered.map((entry) => {
          const showBefore = dropTarget?.id === entry.pluginId && dropTarget.pos === "top";
          const showAfter = dropTarget?.id === entry.pluginId && dropTarget.pos === "bottom";
          return (
            <div key={entry.pluginId} className="icon-bar-item-wrapper">
              {showBefore && <div className="icon-drop-indicator" />}
              <button
                className={`icon-btn${isActive(entry.pluginId) ? " active" : ""}${draggedId === entry.pluginId ? " dragging" : ""}`}
                data-plugin-id={entry.pluginId}
                onClick={() => onOpenOrFocus(entry.pluginId)}
                onDragStart={(e) => handleDragStart(e, entry.pluginId)}
                onDragEnd={handleDragEnd}
                draggable
                title={t(entry.label)}
                aria-label={t(entry.label)}
              >
                <img
                  src={entry.iconSrc}
                  alt={t(entry.label)}
                  className="icon-img"
                  draggable={false}
                />
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
