/**
 * SearchView — 搜索框 + 安装按钮（独立 view，不折叠）。
 * E3.6 E36#7.3 修正：从 InstalledListView 提取——不再绑在"已安装"里。
 * SidePanel 对 title 为空串的 view 不包 SidebarSection，直接渲染。
 */

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getMarketplaceSearch, setMarketplaceSearch } from "../marketplaceShared";
import "../MarketplaceSidebar.css";

const lk = () => (window as any).linkdesk;

export default function SearchView() {
  const { t } = useTranslation();
  const [installing, setInstalling] = useState(false);

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

  const search = getMarketplaceSearch();

  return (
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
  );
}
