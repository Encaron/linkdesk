/**
 * SearchView — 搜索框 + 安装按钮（独立 view，不折叠）。
 * E3.6 E36#7.3 修正：从 InstalledListView 提取——不再绑在"已安装"里。
 * E3.6 E36#7.3c：本地 state 即时响应输入 + 模块级搜索防抖 150ms——每键不再触发 5 view 重渲染。
 * SidePanel 对 title 为空串的 view 不包 SidebarSection，直接渲染。
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { setMarketplaceSearch } from "../marketplaceShared";
import "../MarketplaceSidebar.css";

const lk = () => (window as any).linkdesk;

const DEBOUNCE_MS = 150;

export default function SearchView() {
  const { t } = useTranslation();
  const [installing, setInstalling] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* 输入即时更新本地 state，防抖后同步到模块级搜索 */
  const handleChange = useCallback((value: string) => {
    setInputValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setMarketplaceSearch(value);
    }, DEBOUNCE_MS);
  }, []);

  /* 卸载时清理防抖定时器 */
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleClear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setInputValue("");
    setMarketplaceSearch("");
  }, []);

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
          value={inputValue}
          onChange={(e) => handleChange(e.target.value)}
        />
        {inputValue && (
          <button className="ms-search-clear" onClick={handleClear}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
