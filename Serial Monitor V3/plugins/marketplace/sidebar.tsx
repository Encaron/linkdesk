/**
 * MarketplaceSidebar — 插件市场侧栏。
 * Phase 4 UX：对标 VS Code Extensions 侧栏。
 *   点 🧩 → 侧栏切为此列表，主区不动。点某插件 → 主区开详情标签页。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getViewPlugins } from "../../src/pluginLoader/viewRegistry";
import { useTabActions } from "../../src/core/TabActionsContext";
import "./MarketplaceSidebar.css";

function MarketplaceSidebar() {
  const { t } = useTranslation();
  const tabActions = useTabActions();
  const [search, setSearch] = useState("");

  const viewPlugins = getViewPlugins();

  const filtered = viewPlugins.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.manifest.name.toLowerCase().includes(q) ||
      p.pluginId.toLowerCase().includes(q)
    );
  });

  // 分组：核心 / 出厂预装 / 用户安装
  const corePlugins = filtered.filter((p) => p.manifest.core);
  const userPlugins = filtered.filter((p) => !p.manifest.core);

  const handleOpenDetail = (pluginId: string) => {
    if (tabActions) {
      tabActions.createTab("plugin-detail", { pluginId });
    }
  };

  return (
    <div className="marketplace-sidebar">
      {/* 搜索栏 */}
      <div className="ms-search">
        <input
          className="ms-search-input"
          type="text"
          placeholder={t("搜索插件...")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="ms-search-clear" onClick={() => setSearch("")}>
            ✕
          </button>
        )}
      </div>

      {/* 列表 */}
      <div className="ms-list">
        {filtered.length === 0 ? (
          <div className="ms-empty">
            {search ? t("未找到") : t("暂无插件")}
          </div>
        ) : (
          <>
            {userPlugins.length > 0 && (
              <Section
                title={t("已安装") + ` (${userPlugins.length})`}
                plugins={userPlugins}
                onOpenDetail={handleOpenDetail}
              />
            )}
            {corePlugins.length > 0 && (
              <Section
                title={t("内置") + ` (${corePlugins.length})`}
                plugins={corePlugins}
                onOpenDetail={handleOpenDetail}
                collapsed
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 可折叠分区 */
function Section({
  title,
  plugins,
  onOpenDetail,
  collapsed: defaultCollapsed = false,
}: {
  title: string;
  plugins: ReturnType<typeof getViewPlugins>;
  onOpenDetail: (pluginId: string) => void;
  collapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="ms-section">
      <button
        className="ms-section-header"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className={`ms-section-chevron${collapsed ? "" : " open"}`}>▸</span>
        <span className="ms-section-title">{title}</span>
      </button>
      {!collapsed && (
        <div className="ms-section-items">
          {plugins.map((p) => (
            <button
              key={p.pluginId}
              className="ms-item"
              onClick={() => onOpenDetail(p.pluginId)}
              title={p.manifest.description ?? p.manifest.name}
            >
              <span className="ms-item-name">{p.manifest.name}</span>
              <span className="ms-item-version">v{p.manifest.version}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default MarketplaceSidebar;
