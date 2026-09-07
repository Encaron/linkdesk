/**
 * PluginDetailPoolView——E5.6#16.7k-1 临时方案。
 *
 * Pool 侧插件详情页。对标壳 PluginDetailView.tsx，布局复用同一套 CSS。
 * 数据走 window.linkdesk.* IPC（不 import @src/core——Path B 合规）。
 *
 * ⚠️ 临时方案——未来联网后会有完整插件市场预览（未下载也能看详情/评分/截图）。
 *   当前仅覆盖已安装插件的元数据查看 + 启用/禁用/卸载操作。
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import "./PluginDetailView.css";
// E5.7#98：list() 返回 PluginListEntry[]——state/回调全程有型（import type 只引入类型，Path B 合规）
import type { PluginListEntry } from "@src/core/api/linkdesk-api";

interface PluginDetailPoolViewProps {
  pluginId?: string;
}

export default function PluginDetailPoolView({ pluginId }: PluginDetailPoolViewProps) {
  const { t } = useTranslation();
  const api = window.linkdesk;

  const [plugin, setPlugin] = useState<PluginListEntry | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── 加载插件元数据 ──
  useEffect(() => {
    if (!pluginId || !api) return;
    (async () => {
      try {
        const plugins = await api.pluginManager?.list?.();
        const found = plugins?.find((p) => p.pluginId === pluginId);
        setPlugin(found ?? null);
      } catch { setPlugin(null); }
    })();
  }, [pluginId, api]);

  useEffect(() => {
    if (!pluginId || !api) return;
    (async () => {
      try { setDisabled(!!(await api.pluginManager?.isDisabled?.(pluginId))); }
      catch { /* 静默 */ }
    })();
  }, [pluginId, api]);

  // ── Actions ──
  const handleEnable = useCallback(async () => {
    if (!pluginId || busy) return;
    setBusy(true); setError(null);
    try { await api.pluginManager?.enable?.(pluginId); setDisabled(false); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }, [pluginId, busy, api]);

  const handleDisable = useCallback(async () => {
    if (!pluginId || busy) return;
    setBusy(true); setError(null);
    try { await api.pluginManager?.disable?.(pluginId); setDisabled(true); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }, [pluginId, busy, api]);

  const handleUninstall = useCallback(async () => {
    if (!pluginId || busy) return;
    setBusy(true); setError(null);
    try { await api.pluginManager?.uninstall?.(pluginId); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }, [pluginId, busy, api]);

  // ── 未找到 ──
  if (!plugin) {
    return (
      <div className="plugin-detail-empty">
        {pluginId ? (
          <p>{t("插件") + ` "${pluginId}" ` + t("未安装")}</p>
        ) : (
          <p>{t("未指定插件 ID")}</p>
        )}
      </div>
    );
  }

  const m = plugin.manifest ?? {};
  // E6#18a：core:true = 纯 UI 防误删旗标——只用于「不画卸载按钮」+「内置」分组徽标，无行为特权
  const isCore = !!m.core;

  return (
    <div className="plugin-detail">
      {/* ═══ Header — 对标壳 PluginDetailView ═══ */}
      <header className="pd-header">
        <div className="pd-icon-container">
          {/* list() IPC 只序列化 7 字段（无 icon）——占位 codicon 兜底（E5.7#98） */}
          <span className="codicon codicon-symbol-misc pd-icon-codicon" />
          {isCore && <span className="pd-icon-badge codicon codicon-star-full" />}
        </div>

        <div className="pd-header-details">
          <div className="pd-title-row">
            <h1 className="pd-name">{t(m.name ?? pluginId ?? "")}</h1>
            {m.version && <span className="pd-version">v{m.version}</span>}
            {isCore && <span className="pd-badge pd-badge-core">{t("内置")}</span>}
          </div>
          {m.author && (
            <p className="pd-subtitle"><span>{m.author}</span></p>
          )}
          {m.description && (
            <p className="pd-short-desc">{t(m.description)}</p>
          )}
        </div>
      </header>

      {/* ═══ E5.8#15.5：缺依赖挂起（PENDING）提示条——原因可读，等待恢复后自动启用 ═══ */}
      {plugin.pendingReason && (
        <div className="pd-pending-notice">
          <span className="codicon codicon-info" />
          <span>{plugin.pendingReason}</span>
        </div>
      )}

      {/* ═══ Action Bar — E6#18a：core:true 只藏「卸载」钮（防误删旗标），禁用/启用照常（可禁）；
          「不可卸载」不再是诚实文案（命令/接口层可卸）——藏钮即防误删机制，不画锁死声明 ═══ */}
      <div className="pd-action-bar">
        {disabled ? (
          <button className="pd-btn pd-btn-enable" onClick={handleEnable} disabled={busy}>
            <span className="codicon codicon-play" /> {t("启用")}
          </button>
        ) : (
          <>
            <button className="pd-btn pd-btn-disable" onClick={handleDisable} disabled={busy}>
              <span className="codicon codicon-circle-slash" /> {t("禁用")}
            </button>
            {!isCore && (
              <button className="pd-btn pd-btn-uninstall" onClick={handleUninstall} disabled={busy}>
                <span className="codicon codicon-trash" /> {t("卸载")}
              </button>
            )}
          </>
        )}
        {error && <span className="pd-action-error">{error}</span>}
      </div>

      {/* ═══ NavBar — 对标壳 ═══ */}
      <nav className="pd-navbar">
        <button className="pd-navtab active">{t("详情")}</button>
      </nav>

      {/* ═══ Body ═══ */}
      <div className="pd-body">
        <div className="pd-details-layout">
          <div className="pd-details-main">
            {m.description && (
              <div className="pd-readme">
                <p>{t(m.description)}</p>
              </div>
            )}

            {/* E5.7#98：entry/homepage/license 不在 list() 的 7 字段序列化内——死代码删除 */}
          </div>

          {/* Info Sidebar */}
          <aside className="pd-info-sidebar">
            <InfoItem label={t("标识符")} value={plugin.pluginId} mono />
            {m.version && <InfoItem label={t("版本")} value={`v${m.version}`} />}
          </aside>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="pd-info-item">
      <span className="pd-info-label">{label}</span>
      <span className={mono ? "pd-info-value mono" : "pd-info-value"}>{value}</span>
    </div>
  );
}
