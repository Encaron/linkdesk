/**
 * InstalledListView — 已安装插件列表。
 * E3.6 E36#7.3：搜索框+安装按钮已提取到 SearchView，此处只负责已安装列表。
 * SidePanel 外裹 <SidebarSection>——此组件不包 header。
 */

import { useTranslation } from "react-i18next";
import { useMarketplacePlugins, getMarketplaceSearch, useCatalogEntryById } from "../../services/marketplaceShared";
import { updateTargetFor } from "../../services/marketCatalog";
import { ExtensionItem } from "../../components/ExtensionItem";
/* E6#86d：侧栏样式已按实测分节拆为 3 件（原 MarketplaceSidebar.css 680 行）——**本处按原文档顺序
 *  全量 import**：5 个侧栏 surface 共用同一套样式，且各 surface 吃样式的类分散在自身 JSX 与其子件
 *  （如 ExtensionItem）里，逐件 import 要算传递闭包、收益为零。判据见 styles/detail-shell.css 头注。 */
import "../../styles/sidebar-shell.css";
import "../../styles/sidebar-list.css";
import "../../styles/sidebar-explore.css";

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
