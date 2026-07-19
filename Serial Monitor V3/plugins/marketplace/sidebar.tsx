/**
 * MarketplaceSidebar — 插件管理侧栏。
 * Phase 4 UX：对标 VS Code Extensions 侧栏。
 *   header（搜索）→ extension list（icon + name/version/desc + actions）
 */

import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getViewPlugins } from "../../src/pluginLoader/viewRegistry";
import { useTabActions } from "../../src/core/TabActionsContext";
import type { ViewPluginEntry } from "../../src/core/types";
import "./MarketplaceSidebar.css";

function MarketplaceSidebar() {
  const { t } = useTranslation();
  const tabActions = useTabActions();
  const [search, setSearch] = useState("");

  const allPlugins = getViewPlugins();

  const filtered = allPlugins.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.manifest.name.toLowerCase().includes(q) ||
      p.pluginId.toLowerCase().includes(q) ||
      (p.manifest.description ?? "").toLowerCase().includes(q)
    );
  });

  // VS Code 分组：Installed / Built-in
  const userPlugins = filtered.filter((p) => !p.manifest.core);
  const builtinPlugins = filtered.filter((p) => p.manifest.core);

  // 单击 → 预览模式（替换现有预览标签页）
  const handleOpenDetail = (pluginId: string) => {
    tabActions?.createTab("plugin-detail", { pluginId });
  };
  // 双击 → 固定模式（新建或固定现有标签页）
  const handleOpenDetailPinned = (pluginId: string) => {
    tabActions?.createTab("plugin-detail", { pluginId, pinned: true });
  };

  return (
    <div className="marketplace-sidebar">
      {/* VS Code: .header 41px, search box 28px */}
      <div className="ms-header">
        <div className="ms-search-container">
          <input
            className="ms-search-box"
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
      </div>

      {/* VS Code: .extensions list area (height: calc(100% - 41px)) */}
      <div className="ms-extensions">
        {filtered.length === 0 ? (
          <div className="ms-empty">
            {search ? t("未找到匹配的插件") : t("暂无插件")}
          </div>
        ) : (
          <>
            {userPlugins.length > 0 && (
              <Section
                title={t("已安装") + ` (${userPlugins.length})`}
                plugins={userPlugins}
                onOpenDetail={handleOpenDetail}
                onOpenDetailPinned={handleOpenDetailPinned}
              />
            )}
            {builtinPlugins.length > 0 && (
              <Section
                title={t("内置") + ` (${builtinPlugins.length})`}
                plugins={builtinPlugins}
                onOpenDetail={handleOpenDetail}
                onOpenDetailPinned={handleOpenDetailPinned}
                defaultCollapsed
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── 分区 ── */

function Section({
  title,
  plugins,
  onOpenDetail,
  onOpenDetailPinned,
  defaultCollapsed = false,
}: {
  title: string;
  plugins: ViewPluginEntry[];
  onOpenDetail: (pluginId: string) => void;
  onOpenDetailPinned: (pluginId: string) => void;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="ms-section">
      <button
        className="ms-section-header"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className={`codicon ${collapsed ? "codicon-chevron-right" : "codicon-chevron-down"}`} />
        <span className="ms-section-title">{title}</span>
      </button>
      {!collapsed && (
        <div className="ms-section-items">
          {plugins.map((p) => (
            <ExtensionItem
              key={p.pluginId}
              plugin={p}
              onClick={() => onOpenDetail(p.pluginId)}
              onDoubleClick={() => onOpenDetailPinned(p.pluginId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 对标 VS Code .extension-list-item ── */

function ExtensionItem({
  plugin,
  onClick,
  onDoubleClick,
}: {
  plugin: ViewPluginEntry;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  const m = plugin.manifest;
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // VS Code 风格：计时器区分单击/双击。300ms 内两次点击 = 双击（固定打开）
  const handleClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      onDoubleClick();
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        onClick();
      }, 300);
    }
  };

  return (
    <button className="ms-extension-item" onClick={handleClick}>
      {/* icon: 使用 assets/icons/ 下的图片，fallback 到 codicon */}
      <div className="ms-item-icon">
        {PLUGIN_ICON_PATH[plugin.pluginId] ? (
          <img
            src={`/assets/icons/${PLUGIN_ICON_PATH[plugin.pluginId]}`}
            alt=""
            className="ms-item-icon-img"
          />
        ) : (
          <span className={`codicon ${PLUGIN_CODICON[plugin.pluginId] ?? "codicon-symbol-misc"}`} />
        )}
        {m.core && <span className="ms-item-badge codicon codicon-star-full" />}
      </div>

      {/* VS Code: .details */}
      <div className="ms-item-details">
        <div className="ms-item-header">
          <span className="ms-item-name">{m.name}</span>
          <span className="ms-item-version">v{m.version}</span>
        </div>
        {m.description && (
          <span className="ms-item-desc">{m.description}</span>
        )}
        <div className="ms-item-footer">
          {m.author && <span className="ms-item-author">{m.author}</span>}
          {m.statusBar && m.statusBar.length > 0 && (
            <span className="ms-item-tag">{m.statusBar.length} status</span>
          )}
        </div>
      </div>
    </button>
  );
}

const PLUGIN_ICON_PATH: Record<string, string> = {
  terminal: "terminal.png",
  workspace: "workspace.png",
  settings: "settings.png",
  marketplace: "extensions.svg",
};

const PLUGIN_CODICON: Record<string, string> = {
  terminal: "codicon-terminal",
  workspace: "codicon-window",
  settings: "codicon-settings-gear",
  marketplace: "codicon-extensions",
};

export default MarketplaceSidebar;
