/**
 * MarketplaceView — 插件市场（本地管理）。
 * Phase 4 P0-1：对标 VS Code Extensions 面板——浏览已安装插件。
 *
 * 设计依据：[V3-插件系统与UI重构设计.md §5]
 *
 * 当前阶段：展示已安装插件列表（搜索/过滤/基本信息）。
 * 安装/卸载/禁用按钮 — Phase 5（需 Tauri fs 操作）。
 * 在线搜索/社区商店 — Phase 6+（需服务端）。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getViewPlugins } from "../../src/pluginLoader/viewRegistry";
import { useTabActions } from "../../src/core/TabActionsContext";
import type { ViewPluginEntry } from "../../src/core/types";
import "./MarketplaceView.css";

function MarketplaceView({ isActive: _isActive }: { isActive: boolean }) {
  const { t } = useTranslation();
  const tabActions = useTabActions();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const viewPlugins = getViewPlugins();

  const filtered = viewPlugins.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.manifest.name.toLowerCase().includes(q) ||
      p.pluginId.toLowerCase().includes(q) ||
      (p.manifest.description ?? "").toLowerCase().includes(q) ||
      (p.manifest.author ?? "").toLowerCase().includes(q)
    );
  });

  const handleOpenDetail = (pluginId: string) => {
    if (tabActions) {
      tabActions.createTab("plugin-detail", { pluginId });
    }
  };

  const handleToggleExpand = (pluginId: string) => {
    setExpandedId((prev) => (prev === pluginId ? null : pluginId));
  };

  return (
    <div className="marketplace-view">
      {/* 搜索栏 */}
      <div className="marketplace-search-bar">
        <span className="marketplace-search-icon">🔍</span>
        <input
          className="marketplace-search-input"
          type="text"
          placeholder={t("搜索插件...")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            className="marketplace-search-clear"
            onClick={() => setSearch("")}
          >
            ✕
          </button>
        )}
      </div>

      {/* 已安装 */}
      <section className="marketplace-section">
        <h3 className="marketplace-section-title">
          {t("已安装")} ({filtered.length})
        </h3>
        {filtered.length === 0 ? (
          <div className="marketplace-empty">
            {search ? t("未找到匹配的插件") : t("暂无已安装插件")}
          </div>
        ) : (
          <div className="marketplace-list">
            {filtered.map((plugin) => (
              <MarketplaceRow
                key={plugin.pluginId}
                plugin={plugin}
                expanded={expandedId === plugin.pluginId}
                onToggleExpand={() => handleToggleExpand(plugin.pluginId)}
                onOpenDetail={() => handleOpenDetail(plugin.pluginId)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ── 插件行 ── */

function MarketplaceRow({
  plugin,
  expanded,
  onToggleExpand,
  onOpenDetail,
}: {
  plugin: ViewPluginEntry;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenDetail: () => void;
}) {
  const { t } = useTranslation();
  const m = plugin.manifest;

  return (
    <div className={`marketplace-row${expanded ? " expanded" : ""}`}>
      <div
        className="marketplace-row-main"
        onClick={onToggleExpand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") onToggleExpand();
        }}
      >
        <span className="marketplace-row-icon">
          {m.iconSource === "codicon"
            ? `[${m.icon}]`
            : m.icon ?? "🧩"}
        </span>
        <div className="marketplace-row-info">
          <span className="marketplace-row-name">{t(m.name)}</span>
          <span className="marketplace-row-meta">
            v{m.version}
            {m.author && ` · ${m.author}`}
          </span>
        </div>
        <div className="marketplace-row-badges">
          {m.core && (
            <span className="marketplace-badge marketplace-badge-core">
              {t("核心")}
            </span>
          )}
          {m.tabBehavior?.singleton && (
            <span className="marketplace-badge marketplace-badge-singleton">
              {t("单例")}
            </span>
          )}
        </div>
        <div className="marketplace-row-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="marketplace-btn marketplace-btn-detail"
            onClick={onOpenDetail}
            title={t("查看详情")}
          >
            {t("详情")}
          </button>
          {!m.core && (
            <button
              className="marketplace-btn marketplace-btn-uninstall"
              disabled
              title={t("卸载（Phase 5）")}
            >
              {t("卸载")}
            </button>
          )}
        </div>
        <span className={`marketplace-row-chevron${expanded ? " open" : ""}`}>
          ▸
        </span>
      </div>

      {/* 展开的详情预览 */}
      {expanded && (
        <div className="marketplace-row-detail">
          {m.description && (
            <p className="marketplace-detail-desc">{t(m.description)}</p>
          )}
          <div className="marketplace-detail-grid">
            <span>
              {t("类型")}: <code>{m.type}</code>
            </span>
            <span>
              {t("入口")}: <code>{m.entry ?? "index.tsx"}</code>
            </span>
            {m.statusBar && m.statusBar.length > 0 && (
              <span>
                {t("状态栏贡献")}: {m.statusBar.length} {t("项")}
              </span>
            )}
          </div>
          <button
            className="marketplace-btn marketplace-btn-detail"
            onClick={onOpenDetail}
          >
            {t("打开完整详情")} →
          </button>
        </div>
      )}
    </div>
  );
}

export default MarketplaceView;
