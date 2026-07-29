/**
 * InstalledListView — 已安装插件列表。
 * E3.6 E36#7.3：搜索框+安装按钮已提取到 SearchView，此处只负责已安装列表。
 * SidePanel 外裹 <SidebarSection>——此组件不包 header。
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useTabActions } from "@src/core/TabActionsContext";
import { ViewContainerService } from "@src/core/ViewContainerService";
import { useMarketplacePlugins, getMarketplaceSearch } from "../marketplaceShared";
import { ExtensionItem } from "../ExtensionItem";
import "../MarketplaceSidebar.css";

export default function InstalledListView() {
  const { t } = useTranslation();
  const tabActions = useTabActions();
  const { installed, loading } = useMarketplacePlugins();

  /* 动态更新 badge——已安装数量变化时同步到 section header */
  useEffect(() => {
    const descriptor = ViewContainerService.getView("installed");
    if (!descriptor) return;
    ViewContainerService.registerView("marketplace", "marketplace", {
      id: "installed",
      title: descriptor.title,
      render: descriptor.render,
      badge: installed.length,
    });
  }, [installed.length]);

  const handleOpenDetail = (pluginId: string) => {
    tabActions?.createTab("plugin-detail", { pluginId, pinned: false });
  };
  const handleOpenDetailPinned = (pluginId: string) => {
    tabActions?.createTab("plugin-detail", { pluginId, pinned: true });
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
          onClick={() => handleOpenDetail(p.pluginId)}
          onDoubleClick={() => handleOpenDetailPinned(p.pluginId)}
        />
      ))}
    </div>
  );
}
