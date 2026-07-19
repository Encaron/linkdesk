/**
 * IconBar — 图标栏（最左 48px 垂直条）。
 * 对标 VS Code Activity Bar：拖拽排序 + 蓝色指示条 + 图片图标。
 */

import { useState, useCallback } from "react";
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
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<"top" | "bottom">("bottom");

  // 图标顺序：先按持久化顺序排，新插件追加到末尾
  const viewPlugins = getViewPlugins();
  const savedOrder = loadOrder();

  type IconEntry = { pluginId: string; iconSrc: string; label: string };
  const ordered = (() => {
    const result: IconEntry[] = [];
    const remaining = new Set(viewPlugins.map((p) => p.pluginId));
    // 先按保存的顺序
    for (const id of savedOrder) {
      if (remaining.has(id)) {
        remaining.delete(id);
        const p = viewPlugins.find((v) => v.pluginId === id);
        if (p) result.push({ pluginId: id, iconSrc: getIconSrc(id), label: p.manifest.name });
      }
    }
    // 新插件追加到末尾
    for (const id of remaining) {
      const p = viewPlugins.find((v) => v.pluginId === id);
      if (p) result.push({ pluginId: id, iconSrc: getIconSrc(id), label: p.manifest.name });
    }
    return result;
  })();

  /* ── 拖拽 ── */

  const handleDragStart = useCallback((e: React.DragEvent, pluginId: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", pluginId);
    // 让被拖拽的图标半透明
    const el = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => el.classList.add("dragging"));
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove("dragging");
    setDragOverId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, pluginId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(pluginId);
    // 判断鼠标在图标上半还是下半
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragPosition(e.clientY < rect.top + rect.height / 2 ? "top" : "bottom");
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData("text/plain");
      if (!draggedId || draggedId === targetId) return;

      setDragOverId(null);

      // 重新排序
      const newOrder = ordered.map((x) => x.pluginId).filter((id) => id !== draggedId);
      const targetIndex = newOrder.indexOf(targetId);
      const insertAt = dragPosition === "top" ? targetIndex : targetIndex + 1;
      newOrder.splice(insertAt, 0, draggedId);
      saveOrder(newOrder);
    },
    [ordered, dragPosition]
  );

  /* ── 高亮 ── */

  const isActive = (pluginId: string) => {
    if (sidebarView) return sidebarView === pluginId;
    if (activePluginId) return activePluginId === pluginId;
    return activeTabType === pluginId;
  };

  return (
    <div className="icon-bar" role="navigation" aria-label={t("导航")}>
      <div className="icon-bar-top">
        {ordered.map((entry) => {
          const showDropBefore = dragOverId === entry.pluginId && dragPosition === "top";
          const showDropAfter = dragOverId === entry.pluginId && dragPosition === "bottom";
          return (
            <div key={entry.pluginId} className="icon-bar-item-wrapper">
              {showDropBefore && <div className="icon-drop-indicator" />}
              <button
                className={`icon-btn${isActive(entry.pluginId) ? " active" : ""}`}
                onClick={() => onOpenOrFocus(entry.pluginId)}
                onDragStart={(e) => handleDragStart(e, entry.pluginId)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, entry.pluginId)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, entry.pluginId)}
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
              {showDropAfter && <div className="icon-drop-indicator" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default IconBar;
