/**
 * IconBar — 图标栏（最左 42px 垂直条）。
 * Phase 4 P3-10：从 viewRegistry 动态读取图标列表。
 * 对标 VS Code Activity Bar。图标使用 assets/icons/ 下的 PNG/SVG 文件。
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

/** 插件 ID → 图标图片路径映射 */
const PLUGIN_ICON_PATH: Record<string, string> = {
  terminal: "terminal.png",
  workspace: "workspace.png",
  settings: "settings.png",
  marketplace: "extensions.svg",
};

function getIconSrc(pluginId: string): string {
  const path = PLUGIN_ICON_PATH[pluginId];
  if (path) return `/assets/icons/${path}`;
  return `/assets/icons/settings.svg`; // fallback
}

function IconBar({ activeTabType, activePluginId, sidebarView, onOpenOrFocus }: IconBarProps) {
  const { t } = useTranslation();

  const viewPlugins = getViewPlugins();
  const icons = viewPlugins.map((p) => ({
    pluginId: p.pluginId,
    iconSrc: getIconSrc(p.pluginId),
    label: p.manifest.name,
  }));

  // 对标 VS Code Activity Bar：始终只有一个光标
  //   侧栏开着 → 只有侧栏图标高亮。侧栏没开 → 活跃标签页的图标高亮。
  const isActive = (pluginId: string) => {
    if (sidebarView) return sidebarView === pluginId;
    if (activePluginId) return activePluginId === pluginId;
    return activeTabType === pluginId;
  };

  return (
    <div className="icon-bar" role="navigation" aria-label={t("导航")}>
      <div className="icon-bar-top">
        {icons.map((entry) => (
          <button
            key={entry.pluginId}
            className={`icon-btn${isActive(entry.pluginId) ? " active" : ""}`}
            onClick={() => onOpenOrFocus(entry.pluginId)}
            title={t(entry.label)}
            aria-label={t(entry.label)}
          >
            <img
              src={entry.iconSrc}
              alt={t(entry.label)}
              className="icon-img"
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export default IconBar;
