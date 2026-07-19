/**
 * IconBar — 图标栏（最左 48px 垂直条）。
 * 对标 VS Code Activity Bar：顶部主图标 + 底部设置图标。
 * 换位方式：点击选中 → 再点另一个图标 → 交换位置。
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

const BOTTOM_ICONS = new Set(["settings"]);

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

/* ── 组件 ── */

function IconBar({ activeTabType, activePluginId, sidebarView, onOpenOrFocus }: IconBarProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const topIcons = ordered.filter((x) => !BOTTOM_ICONS.has(x.pluginId));
  const bottomIcons = ordered.filter((x) => BOTTOM_ICONS.has(x.pluginId));

  // 点击选中 → 再点另一个 → 交换
  const handleIconClick = useCallback(
    (pluginId: string) => {
      if (selectedId && selectedId !== pluginId) {
        // 交换两个图标的位置
        const newOrder = ordered.map((x) => x.pluginId);
        const i = newOrder.indexOf(selectedId);
        const j = newOrder.indexOf(pluginId);
        if (i !== -1 && j !== -1) {
          [newOrder[i], newOrder[j]] = [newOrder[j], newOrder[i]];
          saveOrder(newOrder);
        }
        setSelectedId(null);
      } else {
        // 选中或打开
        if (selectedId === pluginId) {
          setSelectedId(null);
          onOpenOrFocus(pluginId);
        } else {
          setSelectedId(pluginId);
        }
      }
    },
    [selectedId, ordered, onOpenOrFocus]
  );

  // 点击空白取消选中
  const handleBarClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) setSelectedId(null);
    },
    []
  );

  const isActive = (pluginId: string) => {
    if (sidebarView) return sidebarView === pluginId;
    if (activePluginId) return activePluginId === pluginId;
    return activeTabType === pluginId;
  };

  const renderIcon = (entry: IconEntry) => (
    <div key={entry.pluginId} className="icon-bar-item-wrapper">
      <button
        className={`icon-btn${isActive(entry.pluginId) ? " active" : ""}${selectedId === entry.pluginId ? " selected" : ""}`}
        data-plugin-id={entry.pluginId}
        onClick={() => handleIconClick(entry.pluginId)}
        title={t(entry.label)}
        aria-label={t(entry.label)}
      >
        <img src={entry.iconSrc} alt={t(entry.label)} className="icon-img" />
      </button>
    </div>
  );

  return (
    <div className="icon-bar" role="navigation" aria-label={t("导航")} onClick={handleBarClick}>
      <div className="icon-bar-top">
        {topIcons.map(renderIcon)}
      </div>
      <div className="icon-bar-bottom">
        {bottomIcons.map(renderIcon)}
      </div>
      {selectedId && (
        <div className="icon-swap-hint">{t("再点另一个图标交换位置")}</div>
      )}
    </div>
  );
}

export default IconBar;
