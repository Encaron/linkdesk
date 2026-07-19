/**
 * IconBar — 图标栏（最左 42px 垂直条）。
 * Phase 4 UX：对标 VS Code Activity Bar——codicon 图标 + viewRegistry 动态列表。
 */

import { useTranslation } from "react-i18next";
import { getViewPlugins } from "../pluginLoader/viewRegistry";
import "./IconBar.css";

interface IconBarProps {
  activeTabType: string;
  activePluginId?: string;
  sidebarView?: string | null;
  onOpenOrFocus: (type: string) => void;
}

/** 对标 VS Code Activity Bar：pluginId → codicon 类名 */
const PLUGIN_CODICON: Record<string, string> = {
  terminal: "codicon-terminal",
  workspace: "codicon-window",
  settings: "codicon-settings-gear",
  marketplace: "codicon-extensions",
};

function IconBar({ activeTabType, activePluginId, sidebarView, onOpenOrFocus }: IconBarProps) {
  const { t } = useTranslation();

  const viewPlugins = getViewPlugins();
  const icons = viewPlugins.map((p) => ({
    pluginId: p.pluginId,
    codiconClass: PLUGIN_CODICON[p.pluginId] ?? "codicon-symbol-misc",
    label: p.manifest.name,
  }));

  const isActive = (pluginId: string) => {
    if (sidebarView === pluginId) return true;
    if (activePluginId) return activePluginId === pluginId;
    return activeTabType === pluginId;
  };

  return (
    <div className="icon-bar" role="navigation" aria-label={t("导航")}>
      {/* 顶部图标区 */}
      <div className="icon-bar-top">
        {icons.map((entry) => (
          <button
            key={entry.pluginId}
            className={`icon-btn${isActive(entry.pluginId) ? " active" : ""}`}
            onClick={() => onOpenOrFocus(entry.pluginId)}
            title={t(entry.label)}
            aria-label={t(entry.label)}
          >
            <span className={`codicon ${entry.codiconClass}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default IconBar;
