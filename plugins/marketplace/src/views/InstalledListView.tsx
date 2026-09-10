/**
 * InstalledListView — 已安装插件列表。
 * E3.6 E36#7.3：搜索框+安装按钮已提取到 SearchView，此处只负责已安装列表。
 * SidePanel 外裹 <SidebarSection>——此组件不包 header。
 */

import { useTranslation } from "react-i18next";
import { useMarketplacePlugins, getMarketplaceSearch, useCatalogEntryById } from "../services/marketplaceShared";
import { updateTargetFor } from "../services/marketCatalog";
import { ExtensionItem } from "../components/ExtensionItem";
import "../styles/MarketplaceSidebar.css";

export default function InstalledListView() {
  const { t } = useTranslation();
  const tabs = window.linkdesk?.tabs;
  const { installed, loading } = useMarketplacePlugins();
  const catalogById = useCatalogEntryById();

  const handleOpenDetail = (pluginId: string) => {
    tabs?.create("plugin-detail", { pluginId, pinned: false });
  };
  const handleOpenDetailPinned = (pluginId: string) => {
    tabs?.create("plugin-detail", { pluginId, pinned: true });
  };

  if (loading) return <div className="ms-empty">{t("加载中...")}</div>;

  const search = getMarketplaceSearch();

  if (installed.length === 0) {
    return (
      <div className="ms-empty">
        {search ? t("未找到匹配的插件") : t("暂无已安装插件")}
      </div>
    );
  }

  return (
    <div className="ms-section-items">
      {installed.map((p) => (
        <ExtensionItem
          key={p.pluginId}
          plugin={p}
          updateTo={updateTargetFor(catalogById.get(p.pluginId), p.manifest.version, p.updatable)}
          onClick={() => handleOpenDetail(p.pluginId)}
          onDoubleClick={() => handleOpenDetailPinned(p.pluginId)}
        />
      ))}
    </div>
  );
}
