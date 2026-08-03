/**
 * BuiltinListView — 内置插件列表。
 * E3.6 E36#7.4：无搜索框，纯列表。空时 return null（对标 hideIfEmpty）。
 */


import { useMarketplacePlugins } from "../marketplaceShared";
import { ExtensionItem } from "../ExtensionItem";
import "../MarketplaceSidebar.css";

export default function BuiltinListView() {
  const tabs = (window as any).linkdesk?.tabs;
  const { builtin, loading } = useMarketplacePlugins();

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
          onClick={() => handleOpenDetail(p.pluginId)}
          onDoubleClick={() => handleOpenDetailPinned(p.pluginId)}
        />
      ))}
    </div>
  );
}
