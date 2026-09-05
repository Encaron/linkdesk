/**
 * UninstalledListView — 待安装插件列表。
 * E3.6 E36#7.6：简化行（非 ViewPluginEntry 类型），含安装按钮。
 */

import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { PluginIcon } from "@linkdesk/ui";

import { useMarketplacePlugins } from "../services/marketplaceShared";
import "../styles/MarketplaceSidebar.css";

const pm = () => window.linkdesk?.pluginManager;

export default function UninstalledListView() {
  const { t } = useTranslation();
  const tabs = window.linkdesk?.tabs;
  const { uninstalled, refresh } = useMarketplacePlugins();

  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const makeClickHandler = (pluginId: string) => () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      tabs?.create("plugin-detail", { pluginId, pinned: true });
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        tabs?.create("plugin-detail", { pluginId, pinned: false });
      }, 300);
    }
  };

  const handleInstall = useCallback(
    async (pluginId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await pm().reinstall(pluginId);
      refresh();
    },
    [refresh],
  );

  if (uninstalled.length === 0) return null;

  return (
    <div className="ms-section-items">
      {uninstalled.map((p) => (
        <div key={p.pluginId} className="ms-extension-item uninstalled">
          <div className="ms-item-icon">
            <PluginIcon pluginId={p.pluginId} />
          </div>
          <div
            className="ms-item-details"
            onClick={makeClickHandler(p.pluginId)}
            style={{ cursor: "pointer" }}
          >
            <div className="ms-item-header">
              <span className="ms-item-name">{t(p.name)}</span>{/* E5.8#37.9.1：插件显示名 t() 解析 */}
              {p.version && <span className="ms-item-version">v{p.version}</span>}
            </div>
            {p.description && <span className="ms-item-desc">{p.description}</span>}
          </div>
          <button
            className="ms-item-install-btn"
            onClick={(e) => handleInstall(p.pluginId, e)}
            title={t("安装插件")}
          >
            <span className="codicon codicon-cloud-download" /> {t("安装")}
          </button>
        </div>
      ))}
    </div>
  );
}
