/**
 * MarketplaceView — 插件市场视图。
 * Phase 4 最小可用版：列出已安装的视图插件。
 * Phase 5+：搜索/安装/卸载/禁用/推荐连锁。
 */

import { useTranslation } from "react-i18next";
import { getViewPlugins } from "../../pluginLoader/viewRegistry";
import "./MarketplaceView.css";

interface MarketplaceViewProps {
  isActive: boolean;
}

function MarketplaceView({ isActive: _isActive }: MarketplaceViewProps) {
  const { t } = useTranslation();
  const plugins = getViewPlugins();

  return (
    <div className="marketplace-view">
      <h2 className="marketplace-title">{t("插件市场")}</h2>
      <p className="marketplace-subtitle">
        {plugins.length > 0
          ? t("已安装 {{count}} 个视图插件", { count: plugins.length })
          : t("暂无已安装插件")}
      </p>

      {plugins.length > 0 ? (
        <div className="marketplace-list">
          {plugins.map((p) => (
            <div key={p.pluginId} className="marketplace-item">
              <span className="marketplace-item-icon">
                {ICON_MAP[p.pluginId] ?? "📄"}
              </span>
              <div className="marketplace-item-info">
                <span className="marketplace-item-name">{t(p.manifest.name)}</span>
                <span className="marketplace-item-desc">
                  {p.manifest.description ?? ""}
                </span>
              </div>
              <span className="marketplace-item-version">v{p.manifest.version}</span>
              <span className="marketplace-item-badge">
                {p.manifest.author === "官方" ? t("官方") : p.manifest.author ?? t("社区")}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="marketplace-empty">
          {t("暂无可用视图，请在插件市场搜索安装")}
        </p>
      )}
    </div>
  );
}

const ICON_MAP: Record<string, string> = {
  terminal: "\u{1F4DF}",
  workspace: "\u{1F4CA}",
  settings: "\u{2699}\u{FE0F}",
};

export default MarketplaceView;
