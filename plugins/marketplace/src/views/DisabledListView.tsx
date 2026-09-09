/**
 * DisabledListView — 已禁用插件列表。
 * E3.6 E36#7.5：简化行（非 ViewPluginEntry 类型），含启用按钮。
 */

import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { PluginIcon, pickIdentityArt } from "@linkdesk/ui";

import { useMarketplacePlugins, useCatalogEntryById } from "../services/marketplaceShared";
import { updateToVersion } from "../services/marketCatalog";
import "../styles/MarketplaceSidebar.css";

const pm = () => window.linkdesk?.pluginManager;

export default function DisabledListView() {
  const { t } = useTranslation();
  const tabs = window.linkdesk?.tabs;
  const { disabled } = useMarketplacePlugins();
  const catalogById = useCatalogEntryById();

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
      {disabled.map((p) => {
        const updateTo = updateToVersion(catalogById.get(p.pluginId), p.version);
        return (
          <div key={p.pluginId} className="ms-extension-item disabled">
            <div className="ms-item-icon">
              {/* E6#66：禁用子集无 icon 字段（PluginInfoEntry 形状）——行图取目录官方条目兜底
               *  （catalogById 上文已查，顺带复用），目录也没有 → 默认彩色块顶替历史 📄（硬约束 11：
               *  图标只由声明字段/目录条目裁决，不凭空猜）。E6#69c/#69f：共享 pickIdentityArt 同裁决。 */}
              <PluginIcon pluginId={p.pluginId} manifest={pickIdentityArt(catalogById.get(p.pluginId))} />
            </div>
            <div
              className="ms-item-details"
              onClick={makeClickHandler(p.pluginId)}
              style={{ cursor: "pointer" }}
            >
              <div className="ms-item-header">
                <span className="ms-item-name" style={{ opacity: 0.6 }}>
                  {t(p.name)}
                </span>{/* E5.8#37.9.1：插件显示名 t() 解析 */}
                {/* E6#33b：禁用插件也可更新（F1——更新后仍禁用）——徽标只示状态，升级入口归详情 */}
                {updateTo && (
                  <span className="ms-item-badge-update" title={t("可更新")}>
                    <span className="codicon codicon-arrow-up" /> {t("可更新")} v{updateTo}
                  </span>
                )}
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
        );
      })}
    </div>
  );
}
