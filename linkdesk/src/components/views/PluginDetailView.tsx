
/**
 * PluginDetailView — 插件详情页。
 * Phase 4：对标 VS Code extension editor。
 *
 * 布局：header(icon+name+author+badges) → action bar →
 *       tab bar(Details|Changelog) → body → info sidebar
 */

import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getViewPlugin, getViewPlugins } from "../../pluginLoader/viewRegistry";
import { disablePlugin, uninstallPlugin, enablePlugin, reinstallPlugin, isPluginDisabled } from "../../pluginLoader/loader";
import type { ViewPluginEntry } from "../../core/types";
import "./PluginDetailView.css";

import { resolvePluginIcon } from "../../pluginLoader/iconUtils";

function deriveType(m: { entry?: string; mode?: string; themes?: unknown[]; languages?: unknown[]; resources?: string[] }): string {
  const types: string[] = [];
  if (m.entry) types.push("view");
  if (m.mode) types.push("protocol");
  if (m.themes) types.push("theme");
  if (m.languages) types.push("language");
  if (m.resources) types.push("resource");
  return types.join(", ") || "unknown";
}

/* ── 主组件 ── */

interface PluginDetailViewProps {
  isActive: boolean;
  pluginId?: string;
}

function PluginDetailView({ isActive: _isActive, pluginId }: PluginDetailViewProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"details" | "changelog">("details");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // ⚠️ 所有 hooks 必须在条件返回之前——React Rules of Hooks
  const installedIds = useMemo(
    () => new Set(getViewPlugins().map((p) => p.pluginId)),
    []
  );
  const reverseRecommends = useMemo(() => {
    if (!pluginId) return [];
    const result: { pluginId: string; name: string }[] = [];
    for (const p of getViewPlugins()) {
      if (p.pluginId === pluginId) continue;
      for (const rec of p.manifest.recommends ?? []) {
        if (rec.plugin === pluginId) result.push({ pluginId: p.pluginId, name: p.manifest.name });
      }
    }
    return result;
  }, [pluginId]);

  const disabled = useMemo(() => pluginId ? isPluginDisabled(pluginId) : false, [pluginId]);

  const handleDisable = useCallback(async () => {
    if (!pluginId || busy) return;
    setBusy(true);
    setActionError(null);
    const r = await disablePlugin(pluginId);
    setBusy(false);
    if (!r.success) setActionError(r.error ?? "未知错误");
  }, [pluginId, busy]);

  const handleEnable = useCallback(async () => {
    if (!pluginId || busy) return;
    setBusy(true);
    setActionError(null);
    const r = await enablePlugin(pluginId);
    setBusy(false);
    if (!r.success) setActionError(r.error ?? "未知错误");
  }, [pluginId, busy]);

  const handleUninstall = useCallback(async () => {
    if (!pluginId || busy) return;
    if (!window.confirm(t("确定要卸载此插件吗？此操作可撤销（文件保留在 .disabled/ 目录）。"))) return;
    setBusy(true);
    setActionError(null);
    const r = await uninstallPlugin(pluginId);
    setBusy(false);
    if (!r.success) setActionError(r.error ?? "未知错误");
  }, [pluginId, busy, t]);

  if (!pluginId) {
    return <div className="plugin-detail-empty">{t("未指定插件 ID")}</div>;
  }

  const plugin = getViewPlugin(pluginId);
  if (!plugin) {
    const _disabled = isPluginDisabled(pluginId);
    return (
      <div className="plugin-detail-empty">
        <p>
          {_disabled
            ? t("插件") + ` "${pluginId}" ` + t("已禁用")
            : t("插件") + ` "${pluginId}" ` + t("未安装")}
        </p>
        {_disabled ? (
          <button
            className="pd-btn pd-btn-enable"
            style={{ marginTop: 12 }}
            onClick={async () => { setBusy(true); await enablePlugin(pluginId); setBusy(false); }}
          >
            <span className="codicon codicon-play" /> {t("启用插件")}
          </button>
        ) : (
          <button
            className="pd-btn pd-btn-install"
            style={{ marginTop: 12 }}
            onClick={async () => { setBusy(true); await reinstallPlugin(pluginId); setBusy(false); }}
          >
            <span className="codicon codicon-cloud-download" /> {t("安装插件")}
          </button>
        )}
      </div>
    );
  }

  const m = plugin.manifest;
  const icon = resolvePluginIcon(m);

  return (
    <div className="plugin-detail">
      {/* ═══ Header — VS Code: icon 128x128 + details ═══ */}
      <header className="pd-header">
        <div className="pd-icon-container">
          {icon.codicon ? (
            <span className={`codicon ${icon.codicon} pd-icon-codicon`} />
          ) : icon.src ? (
            <img src={icon.src} alt="" className="pd-icon-img" />
          ) : (
            <span className="codicon codicon-symbol-misc pd-icon-codicon" />
          )}
          {m.core && <span className="pd-icon-badge codicon codicon-star-full" />}
        </div>

        <div className="pd-header-details">
          <div className="pd-title-row">
            <h1 className="pd-name">{t(m.name)}</h1>
            <span className="pd-version">v{m.version}</span>
            {m.core && <span className="pd-badge pd-badge-core">{t("内置")}</span>}
            {m.tabBehavior?.singleton && (
              <span className="pd-badge pd-badge-singleton">{t("单例")}</span>
            )}
          </div>

          {m.author && (
            <p className="pd-subtitle">
              <span>{m.author}</span>
            </p>
          )}

          {m.description && (
            <p className="pd-short-desc">{t(m.description)}</p>
          )}
        </div>
      </header>

      {/* ═══ Action Bar — 对标 VS Code ═══ */}
      <div className="pd-action-bar">
        {m.core ? (
          <span className="pd-core-notice">
            <span className="codicon codicon-lock" /> {t("核心控制面——不可卸载")}
          </span>
        ) : (
          <>
            {disabled ? (
              <button className="pd-btn pd-btn-enable" onClick={handleEnable} disabled={busy}>
                <span className="codicon codicon-play" /> {t("启用")}
              </button>
            ) : (
              <>
                <button className="pd-btn pd-btn-disable" onClick={handleDisable} disabled={busy}>
                  <span className="codicon codicon-circle-slash" /> {t("禁用")}
                </button>
                <button className="pd-btn pd-btn-uninstall" onClick={handleUninstall} disabled={busy}>
                  <span className="codicon codicon-trash" /> {t("卸载")}
                </button>
              </>
            )}
          </>
        )}

        {actionError && (
          <span className="pd-action-error">{actionError}</span>
        )}

        {/* 反向推荐警告 */}
        {reverseRecommends.length > 0 && (
          <div className="pd-reverse-warn">
            <span className="codicon codicon-warning" />
            <span>
              {t("被以下插件依赖")}:{" "}
              {reverseRecommends.map((r) => r.name).join(", ")}
            </span>
          </div>
        )}
      </div>

      {/* ═══ Tab Bar — VS Code NavBar ═══ */}
      <nav className="pd-navbar">
        <button
          className={`pd-navtab${activeTab === "details" ? " active" : ""}`}
          onClick={() => setActiveTab("details")}
        >
          {t("详情")}
        </button>
        {(m.changelog && m.changelog.length > 0) && (
          <button
            className={`pd-navtab${activeTab === "changelog" ? " active" : ""}`}
            onClick={() => setActiveTab("changelog")}
          >
            {t("更新日志")}
          </button>
        )}
      </nav>

      {/* ═══ Body ═══ */}
      <div className="pd-body">
        {activeTab === "details" && (
          <DetailsTab
            plugin={plugin}
            installedIds={installedIds}
          />
        )}
        {activeTab === "changelog" && m.changelog && (
          <ChangelogTab changelog={m.changelog} />
        )}
      </div>
    </div>
  );
}

/* ── 详情 Tab ── */

function DetailsTab({
  plugin,
  installedIds,
}: {
  plugin: ViewPluginEntry;
  installedIds: Set<string>;
}) {
  const { t } = useTranslation();
  const m = plugin.manifest;

  return (
    <div className="pd-details-layout">
      {/* 主内容 */}
      <div className="pd-details-main">
        {m.description && (
          <p className="pd-description">{t(m.description)}</p>
        )}

        {/* 推荐 */}
        {m.recommends && m.recommends.length > 0 && (
          <div className="pd-recommend-section">
            <h4>📦 {t("推荐同时安装")}</h4>
            <ul>
              {m.recommends.map((rec) => (
                <li key={rec.plugin} className={installedIds.has(rec.plugin) ? "installed" : ""}>
                  <span className="codicon codicon-check" />
                  <span className="pd-rec-name">{rec.plugin}</span>
                  <span className="pd-rec-reason">{rec.reason}</span>
                  {installedIds.has(rec.plugin) && (
                    <span className="pd-rec-status">{t("已安装")}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 可选 */}
        {m.suggests && m.suggests.length > 0 && (
          <div className="pd-recommend-section">
            <h4>💡 {t("可选")}</h4>
            <ul>
              {m.suggests.map((sug) => (
                <li key={sug.plugin} className={installedIds.has(sug.plugin) ? "installed" : ""}>
                  <span className="codicon codicon-circle-outline" />
                  <span className="pd-rec-name">{sug.plugin}</span>
                  <span className="pd-rec-reason">{sug.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 依赖 */}
        {m.requires && m.requires.length > 0 && (
          <div className="pd-recommend-section">
            <h4>🔒 {t("依赖")}</h4>
            <ul>
              {m.requires.map((req) => (
                <li key={req.plugin}>
                  <span className="codicon codicon-lock" />
                  <span className="pd-rec-name">{req.plugin}</span>
                  {req.version && <span className="pd-rec-ver">≥{req.version}</span>}
                  {installedIds.has(req.plugin)
                    ? <span className="pd-rec-status">{t("已安装")}</span>
                    : <span className="pd-rec-status missing">{t("未安装")}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 信息侧栏 — VS Code info grid */}
      <aside className="pd-info-sidebar">
        <InfoItem label={t("标识符")} value={plugin.pluginId} mono />
        <InfoItem label={t("版本")} value={`v${m.version}`} />
        <InfoItem label={t("类型")} value={deriveType(m)} />
        {m.entry && <InfoItem label={t("入口")} value={m.entry} mono />}
        {m.minAppVersion && <InfoItem label={t("最低版本")} value={`≥${m.minAppVersion}`} />}
        {m.tabBehavior?.confirmOnClose && (
          <InfoItem label={t("关闭确认")} value={m.tabBehavior.confirmOnClose} />
        )}
        {m.statusBar && m.statusBar.length > 0 && (
          <InfoItem
            label={t("状态栏贡献")}
            value={m.statusBar.map((s) => s.id).join(", ")}
          />
        )}
      </aside>
    </div>
  );
}

function InfoItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="pd-info-item">
      <span className="pd-info-label">{label}</span>
      <span className={`pd-info-value${mono ? " mono" : ""}`}>{value}</span>
    </div>
  );
}

/* ── 更新日志 Tab ── */

function ChangelogTab({ changelog }: { changelog: NonNullable<PluginManifest["changelog"]> }) {
  return (
    <div className="pd-changelog">
      {changelog.map((entry, i) => (
        <div key={i} className="pd-changelog-entry">
          <div className="pd-changelog-header">
            <span className="pd-changelog-ver">v{entry.version}</span>
            <span className="pd-changelog-date">{entry.date}</span>
          </div>
          {entry.changes && entry.changes.length > 0 && (
            <ul>
              {entry.changes.map((change, j) => (
                <li key={j}>{change}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── 类型引用 ── */
import type { PluginManifest } from "../../core/types";

export default PluginDetailView;
