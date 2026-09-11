/**
 * BuiltinListView — 内置插件列表。
 * E3.6 E36#7.4：无搜索框，纯列表。空时 return null（对标 hideIfEmpty）。
 */


import { useMarketplacePlugins, useCatalogEntryById } from "../../services/marketplaceShared";
import { updateTargetFor } from "../../services/marketCatalog";
import { ExtensionItem } from "../../components/ExtensionItem";
/* E6#86d：侧栏样式已按实测分节拆为 3 件（原 MarketplaceSidebar.css 680 行）——**本处按原文档顺序
 *  全量 import**：5 个侧栏 surface 共用同一套样式，且各 surface 吃样式的类分散在自身 JSX 与其子件
 *  （如 ExtensionItem）里，逐件 import 要算传递闭包、收益为零。判据见 styles/detail-shell.css 头注。 */
import "../../styles/sidebar-shell.css";
import "../../styles/sidebar-list.css";
import "../../styles/sidebar-explore.css";

export default function BuiltinListView() {
  const tabs = window.linkdesk?.tabs;
  const { builtin, loading } = useMarketplacePlugins();
  const catalogById = useCatalogEntryById();

  if (loading || builtin.length === 0) return null;

  const handleOpenDetail = (pluginId: string) => {
    tabs?.create("plugin-detail", { pluginId, pinned: false });
  };
  const handleOpenDetailPinned = (pluginId: string) => {
    tabs?.create("plugin-detail", { pluginId, pinned: true });
  };

  return (
    <div className="ms-section-items">
      {builtin.map((p) => (
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
