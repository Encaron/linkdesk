/**
 * IconBar — 图标栏（最左 42px 垂直条）。
 * Phase 4：出厂 4 个图标（终端/工作台/设置/插件市场）+ viewRegistry 动态插件。
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

/** 出厂内置图标（始终显示，即使不是插件）——统一使用 24x24 SVG */
interface BuiltinIcon {
  pluginId: string;
  iconPath: string;
  label: string;
}

const BUILTIN_ICONS: BuiltinIcon[] = [
  { pluginId: "terminal", iconPath: "terminal.png", label: "终端" },
  { pluginId: "workspace", iconPath: "workspace.png", label: "工作台" },
  { pluginId: "settings", iconPath: "settings.png", label: "设置" },
  { pluginId: "marketplace", iconPath: "extensions.svg", label: "插件市场" },
];

function IconBar({ activeTabType, activePluginId, onOpenOrFocus }: IconBarProps) {
  const { t } = useTranslation();

  const viewPlugins = getViewPlugins();

  // 从内置图标开始，追加 viewRegistry 中的非内置插件
  const builtinIds = new Set(BUILTIN_ICONS.map((b) => b.pluginId));
  const extraIcons = viewPlugins
    .filter((p) => !builtinIds.has(p.pluginId))
    .map((p) => ({
      pluginId: p.pluginId,
      iconPath: "settings.svg", // 默认图标
      label: p.manifest.name,
    }));

  const allIcons = [...BUILTIN_ICONS, ...extraIcons];

  const isActive = (pluginId: string) => {
    if (activePluginId) return activePluginId === pluginId;
    return activeTabType === pluginId;
  };

  return (
    <div className="icon-bar" role="navigation" aria-label={t("导航")}>
      {allIcons.map((entry) => (
        <button
          key={entry.pluginId}
          className={`icon-btn${isActive(entry.pluginId) ? " active" : ""}`}
          onClick={() => onOpenOrFocus(entry.pluginId)}
          title={t(entry.label)}
          aria-label={t(entry.label)}
        >
          <img
            src={`/assets/icons/${entry.iconPath}`}
            alt={t(entry.label)}
            className="icon-img"
          />
        </button>
      ))}
    </div>
  );
}

export default IconBar;
