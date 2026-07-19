/**
 * IconBar — 图标栏（最左 42px 垂直条）。
 * Phase 4 Step 3：从硬编码改为从 viewRegistry 动态读取。
 * 对标 VS Code Activity Bar。
 */

import { useTranslation } from "react-i18next";
import type { TabType } from "../hooks/useTabManager";
import { getViewPlugins } from "../pluginLoader/viewRegistry";
import "./IconBar.css";

interface IconBarProps {
  activeTabType: TabType;
  activePluginId?: string;
  onOpenOrFocus: (type: string) => void;
}

/** 插件 ID → 图标文件名映射（临时——后续插件自带 icon 文件） */
const PLUGIN_ICON_FILE: Record<string, string> = {
  terminal: "terminal",
  workspace: "workspace",
  settings: "settings",
  marketplace: "settings", // 暂时复用 settings 图标
};

function IconBar({ activeTabType, activePluginId, onOpenOrFocus }: IconBarProps) {
  const { t } = useTranslation();

  const viewPlugins = getViewPlugins();

  // Phase 4：动态图标列表——从 viewRegistry 派生
  const iconEntries = viewPlugins.map((p) => ({
    pluginId: p.pluginId,
    iconFile: PLUGIN_ICON_FILE[p.pluginId] ?? "settings",
    label: p.manifest.name,
  }));

  // 判断哪个图标处于激活态
  const isActive = (pluginId: string) => {
    if (activePluginId) return activePluginId === pluginId;
    // Fallback：旧 tab type → pluginId 映射
    return activeTabType === pluginId;
  };

  return (
    <div className="icon-bar" role="navigation" aria-label={t("导航")}>
      {iconEntries.map((entry) => (
        <button
          key={entry.pluginId}
          className={`icon-btn${isActive(entry.pluginId) ? " active" : ""}`}
          onClick={() => onOpenOrFocus(entry.pluginId)}
          title={t(entry.label)}
          aria-label={t(entry.label)}
        >
          <img
            src={`/assets/icons/${entry.iconFile}.png`}
            alt={t(entry.label)}
            className="icon-img"
          />
        </button>
      ))}
    </div>
  );
}

export default IconBar;
