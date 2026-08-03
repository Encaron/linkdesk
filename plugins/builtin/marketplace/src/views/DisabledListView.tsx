/**
 * DisabledListView — 已禁用插件列表。
 * E3.6 E36#7.5：简化行（非 ViewPluginEntry 类型），含启用按钮。
 */

import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { PluginIcon } from "@src/components/shared/PluginIcon";

import { useMarketplacePlugins } from "../marketplaceShared";
import "../MarketplaceSidebar.css";

const pm = () => (window as any).linkdesk?.pluginManager;

export default function DisabledListView() {
  const { t } = useTranslation();
  const tabs = (window as any).linkdesk?.tabs;
  const { disabled } = useMarketplacePlugins();

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

  const handleEnable = useCallback(async (pluginId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await pm().enable(pluginId);
  }, []);

  if (disabled.length === 0) return null;

  return (
    <div className="ms-section-items">
      {disabled.map((p) => (
        <div key={p.pluginId} className="ms-extension-item disabled">
          <div className="ms-item-icon">
            <PluginIcon pluginId={p.pluginId} />
          </div>
          <div
            className="ms-item-details"
            onClick={makeClickHandler(p.pluginId)}
            style={{ cursor: "pointer" }}
          >
            <div className="ms-item-header">
              <span className="ms-item-name" style={{ opacity: 0.6 }}>
                {p.name}
              </span>
              {p.version && <span className="ms-item-version">v{p.version}</span>}
            </div>
            {p.description && (
              <span className="ms-item-desc" style={{ opacity: 0.5 }}>
                {p.description}
              </span>
            )}
          </div>
          <button
            className="ms-item-enable-btn"
            onClick={(e) => handleEnable(p.pluginId, e)}
            title={t("启用插件")}
          >
            <span className="codicon codicon-play" />
          </button>
        </div>
      ))}
    </div>
  );
}
