/**
 * IconBar — 图标栏（最左 42px 垂直条）。
 * Phase 4 P3-10：从 viewRegistry 动态读取图标列表，不再硬编码。
 * 对标 VS Code Activity Bar。
 */

import { useTranslation } from "react-i18next";
import { getViewPlugins } from "../pluginLoader/viewRegistry";
import "./IconBar.css";

interface IconBarProps {
  activeTabType: string;
  activePluginId?: string;
  onOpenOrFocus: (type: string) => void;
}

/**
 * 插件 ID → 图标图片映射。
 * 出厂图标使用 assets/icons/ 下的 PNG/SVG 文件。
 * 自定义插件的图标从 manifest.icon / manifest.iconSource 读取（未来支持 codicon）。
 */
const PLUGIN_ICON_PATH: Record<string, string> = {
  terminal: "terminal.png",
  workspace: "workspace.png",
  settings: "settings.png",
  marketplace: "extensions.svg",
};

/** 检测是否为出厂自带插件（有预置图标文件） */
function getIconSrc(pluginId: string, _icon?: string, _iconSource?: string): string {
  const path = PLUGIN_ICON_PATH[pluginId];
  if (path) return `/assets/icons/${path}`;
  // 未来：根据 iconSource 渲染 codicon 或 SVG
  return `/assets/icons/settings.svg`; // fallback 默认图标
}

function IconBar({ activeTabType, activePluginId, onOpenOrFocus }: IconBarProps) {
  const { t } = useTranslation();

  // P3-10：从 viewRegistry 动态构建图标列表
  const viewPlugins = getViewPlugins();
  const icons = viewPlugins.map((p) => ({
    pluginId: p.pluginId,
    iconSrc: getIconSrc(p.pluginId, p.manifest.icon, p.manifest.iconSource),
    label: p.manifest.name,
  }));

  const isActive = (pluginId: string) => {
    if (activePluginId) return activePluginId === pluginId;
    return activeTabType === pluginId;
  };

  return (
    <div className="icon-bar" role="navigation" aria-label={t("导航")}>
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
  );
}

export default IconBar;
