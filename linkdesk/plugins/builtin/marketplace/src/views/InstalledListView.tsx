/**
 * InstalledListView — 已安装插件列表。
 * E3.6 E36#7.3：搜索框 + 安装按钮 + 已安装列表。
 * SidePanel 外裹 <SidebarSection>——此组件不包 header。
 */

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useTabActions } from "@src/core/TabActionsContext";
import {
  useMarketplacePlugins,
  getMarketplaceSearch,
  setMarketplaceSearch,
} from "../marketplaceShared";
import { ExtensionItem } from "../ExtensionItem";
import "../MarketplaceSidebar.css";

const lk = () => (window as any).linkdesk;

export default function InstalledListView() {
  const { t } = useTranslation();
  const tabActions = useTabActions();
  const { installed, loading } = useMarketplacePlugins();
  const [installing, setInstalling] = useState(false);

  const handleOpenDetail = (pluginId: string) => {
    tabActions?.createTab("plugin-detail", { pluginId, pinned: false });
  };
  const handleOpenDetailPinned = (pluginId: string) => {
    tabActions?.createTab("plugin-detail", { pluginId, pinned: true });
  };

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    try {
      const selected = await lk().dialog.open({ directory: true, title: "选择插件目录" });
      if (selected) await lk().pluginManager.install(selected as string);
    } catch {
      /* 静默 */
    } finally {
      setInstalling(false);
    }
  }, []);

  if (loading) return <div className="ms-empty">{t("加载中...")}</div>;

  const search = getMarketplaceSearch();

  return (
    <>
      {/* 搜索框 + 安装按钮 */}
      <div className="ms-header">
        <div className="ms-header-actions">
          <button
            className="ms-install-btn"
            onClick={handleInstall}
            disabled={installing}
            title={t("从本地安装插件")}
          >
            <span className="codicon codicon-add" />
            {installing ? t("安装中...") : t("安装")}
          </button>
        </div>
        <div className="ms-search-container">
          <input
            className="ms-search-box"
            type="text"
            placeholder={t("搜索插件...")}
            value={search}
            onChange={(e) => setMarketplaceSearch(e.target.value)}
          />
          {search && (
            <button className="ms-search-clear" onClick={() => setMarketplaceSearch("")}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 已安装列表 */}
      {installed.length === 0 ? (
        <div className="ms-empty">
          {search ? t("未找到匹配的插件") : t("暂无已安装插件")}
        </div>
      ) : (
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
      )}
    </>
  );
}
