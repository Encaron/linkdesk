/**
 * PluginDetailView — 插件详情页。
 * Phase 4 Step 4 + P2-7：plugin.json 是唯一数据源。
 * P2-7：连锁推荐（recommends/suggests/requires）+ 安装/卸载按钮。
 *
 * 设计依据：[[phase4-design-decisions]] 第 11 条 + [V3-插件系统与UI重构设计.md §6]
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getViewPlugin, getViewPlugins } from "../../pluginLoader/viewRegistry";
import "./PluginDetailView.css";

interface PluginDetailViewProps {
  isActive: boolean;
  pluginId?: string;
}

function PluginDetailView({ isActive: _isActive, pluginId }: PluginDetailViewProps) {
  const { t } = useTranslation();

  if (!pluginId) {
    return <div className="plugin-detail-empty">{t("未指定插件 ID")}</div>;
  }

  const plugin = getViewPlugin(pluginId);
  if (!plugin) {
    return (
      <div className="plugin-detail-empty">
        {t("插件")} "{pluginId}" {t("未安装或已禁用")}
      </div>
    );
  }

  const m = plugin.manifest;

  // P2-7：检查推荐插件是否已安装
  const installedPluginIds = useMemo(
    () => new Set(getViewPlugins().map((p) => p.pluginId)),
    []
  );

  // P2-7：反向推荐——已安装插件中谁推荐了当前插件
  const reverseRecommends = useMemo(() => {
    const result: { pluginId: string; name: string }[] = [];
    for (const p of getViewPlugins()) {
      if (p.pluginId === pluginId) continue;
      const recommends = p.manifest.recommends ?? [];
      if (recommends.some((r) => r.plugin === pluginId)) {
        result.push({ pluginId: p.pluginId, name: p.manifest.name });
      }
    }
    return result;
  }, [pluginId]);

  return (
    <div className="plugin-detail">
      {/* 头部：图标 + 名称 + 版本 + 作者 */}
      <header className="plugin-detail-header">
        <span className="plugin-detail-icon">
          {m.iconSource === "codicon" ? `[${m.icon}]` : (m.icon ?? "🧩")}
        </span>
        <div className="plugin-detail-meta">
          <h2 className="plugin-detail-name">{t(m.name)}</h2>
          <span className="plugin-detail-version">v{m.version}</span>
          {m.author && <span className="plugin-detail-author">{m.author}</span>}
        </div>
        {m.core && <span className="plugin-detail-core-badge">{t("核心")}</span>}
      </header>

      {m.description && (
        <p className="plugin-detail-desc">{t(m.description)}</p>
      )}

      {/* P2-7：安装/卸载按钮 */}
      <div className="plugin-detail-actions">
        {m.core ? (
          <span className="plugin-detail-core-notice">{t("核心控制面——不可卸载")}</span>
        ) : (
          <>
            <button
              className="plugin-detail-btn plugin-detail-btn-uninstall"
              disabled
              title={t("卸载（Phase 5）")}
            >
              {t("卸载")}
            </button>
            <button
              className="plugin-detail-btn plugin-detail-btn-disable"
              disabled
              title={t("禁用（Phase 5）")}
            >
              {t("禁用")}
            </button>
          </>
        )}
      </div>

      {/* P2-7：反向推荐警告（卸载前提示） */}
      {reverseRecommends.length > 0 && (
        <section className="plugin-detail-section plugin-detail-warning">
          <h3>⚠ {t("以下插件推荐此插件")}</h3>
          <ul>
            {reverseRecommends.map((r) => (
              <li key={r.pluginId}>{r.name}</li>
            ))}
          </ul>
          <p className="plugin-detail-warning-hint">
            {t("卸载后这些插件可能功能受限")}
          </p>
        </section>
      )}

      {/* P2-7：硬依赖（requires） */}
      {m.requires && m.requires.length > 0 && (
        <section className="plugin-detail-section">
          <h3>🔒 {t("依赖")}</h3>
          <ul className="plugin-detail-recommend-list">
            {m.requires.map((req) => {
              const installed = installedPluginIds.has(req.plugin);
              return (
                <li key={req.plugin} className={`plugin-detail-recommend-item${installed ? " installed" : ""}`}>
                  <span className="plugin-detail-checkbox locked">🔒</span>
                  <span className="plugin-detail-recommend-name">{req.plugin}</span>
                  {req.version && (
                    <span className="plugin-detail-recommend-version">({req.version}+)</span>
                  )}
                  {installed ? (
                    <span className="plugin-detail-recommend-status installed">{t("已安装")} ✅</span>
                  ) : (
                    <span className="plugin-detail-recommend-status missing">{t("未安装")}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* P2-7：推荐（recommends）——默认勾选 */}
      {m.recommends && m.recommends.length > 0 && (
        <section className="plugin-detail-section">
          <h3>📦 {t("推荐同时安装")}</h3>
          <ul className="plugin-detail-recommend-list">
            {m.recommends.map((rec) => {
              const installed = installedPluginIds.has(rec.plugin);
              return (
                <li key={rec.plugin} className={`plugin-detail-recommend-item${installed ? " installed" : ""}`}>
                  <span className="plugin-detail-checkbox">{installed ? "✅" : "☑"}</span>
                  <span className="plugin-detail-recommend-name">{rec.plugin}</span>
                  {rec.reason && (
                    <span className="plugin-detail-recommend-reason">{rec.reason}</span>
                  )}
                  {installed && (
                    <span className="plugin-detail-recommend-status installed">{t("已安装")}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* P2-7：可选（suggests）——默认不勾选 */}
      {m.suggests && m.suggests.length > 0 && (
        <section className="plugin-detail-section">
          <h3>💡 {t("可选")}</h3>
          <ul className="plugin-detail-recommend-list">
            {m.suggests.map((sug) => {
              const installed = installedPluginIds.has(sug.plugin);
              return (
                <li key={sug.plugin} className={`plugin-detail-recommend-item${installed ? " installed" : ""}`}>
                  <span className="plugin-detail-checkbox">{installed ? "✅" : "☐"}</span>
                  <span className="plugin-detail-recommend-name">{sug.plugin}</span>
                  {sug.reason && (
                    <span className="plugin-detail-recommend-reason">{sug.reason}</span>
                  )}
                  {installed && (
                    <span className="plugin-detail-recommend-status installed">{t("已安装")}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 基本信息 */}
      <section className="plugin-detail-section">
        <h3>{t("基本信息")}</h3>
        <div className="plugin-detail-info-grid">
          <span>{t("类型")}: <code>{m.type}</code></span>
          <span>{t("入口")}: <code>{m.entry ?? "index.tsx"}</code></span>
          {m.minAppVersion && (
            <span>{t("最低版本")}: <code>{m.minAppVersion}</code></span>
          )}
        </div>
      </section>

      {m.tabBehavior && Object.keys(m.tabBehavior).length > 0 && (
        <section className="plugin-detail-section">
          <h3>{t("标签页行为")}</h3>
          <ul>
            {m.tabBehavior.singleton && <li>{t("单例——全局只允许一个实例")}</li>}
            {m.tabBehavior.isFallback && <li>{t("保底——关闭所有标签页后自动显示")}</li>}
            {m.tabBehavior.confirmOnClose && <li>{t("关闭确认")}：{m.tabBehavior.confirmOnClose}</li>}
          </ul>
        </section>
      )}

      {m.statusBar && m.statusBar.length > 0 && (
        <section className="plugin-detail-section">
          <h3>{t("状态栏贡献")}</h3>
          <ul>
            {m.statusBar.map((item) => (
              <li key={item.id}>
                {item.icon && <code>[{item.icon}]</code>} {item.label || item.id}
                {item.align === "right" && ` (${t("右侧")})`}
              </li>
            ))}
          </ul>
        </section>
      )}

      {m.changelog && m.changelog.length > 0 && (
        <section className="plugin-detail-section">
          <h3>{t("更新日志")}</h3>
          {m.changelog.map((entry, i) => (
            <div key={i} className="plugin-detail-changelog-entry">
              <span className="changelog-version">v{entry.version}</span>
              <span className="changelog-date">{entry.date}</span>
              {entry.changes && entry.changes.length > 0 && (
                <ul>
                  {entry.changes.map((change, j) => (
                    <li key={j}>{change}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export default PluginDetailView;
