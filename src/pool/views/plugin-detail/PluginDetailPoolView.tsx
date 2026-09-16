/**
 * PluginDetailPoolView——E5.6#16.7k-1 起为 Pool 侧插件详情页；E6#30.11e 降级为「保底宿主」。
 *
 * 详情页 UI 已归市场插件拥有（E6#30.11 搬迁，布局/CSS/数据/动作迁入 marketplace DetailView）——
 * 本视图只作保底：活跃 marketplace 插件缺主区详情贡献 / 贡献加载失败 / 无市场插件时，
 * ShellViewRenderer → PluginDetailViewHost 兜底渲染本组件（已装插件管理面不崩，对标「默认=内置」）。
 *
 * 数据走 window.linkdesk.* IPC（不 import @src/core——type-only 契约导入除外）。
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
      <div className="ldk-plugin-detail-empty">
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
    <div className="ldk-plugin-detail">
      {/* ═══ Header — 对标壳 PluginDetailView ═══ */}
      <header className="ldk-pd-header">
        <div className="ldk-pd-icon-container">
          {/* list() IPC 只序列化 7 字段（无 icon）——占位 codicon 兜底（E5.7#98） */}
          <span className="codicon codicon-symbol-misc ldk-pd-icon-codicon" />
          {isCore && <span className="ldk-pd-icon-badge codicon codicon-star-full" />}
        </div>

        <div className="ldk-pd-header-details">
          <div className="ldk-pd-title-row">
            <h1 className="ldk-pd-name">{t(m.name ?? pluginId ?? "")}</h1>
            {m.version && <span className="ldk-pd-version">v{m.version}</span>}
            {isCore && <span className="ldk-pd-badge ldk-pd-badge-core">{t("内置")}</span>}
          </div>
          {m.author && (
            <p className="ldk-pd-subtitle"><span>{m.author}</span></p>
          )}
          {m.description && (
            <p className="ldk-pd-short-desc">{t(m.description)}</p>
          )}
        </div>
      </header>

      {/* ═══ E5.8#15.5：缺依赖挂起（PENDING）提示条——原因可读，等待恢复后自动启用 ═══ */}
      {plugin.pendingReason && (
        <div className="ldk-pd-pending-notice">
          <span className="codicon codicon-info" />
          <span>{plugin.pendingReason}</span>
        </div>
      )}

      {/* ═══ Action Bar — E6#18a：core:true 只藏「卸载」钮（防误删旗标），禁用/启用照常（可禁）；
          「不可卸载」不再是诚实文案（命令/接口层可卸）——藏钮即防误删机制，不画锁死声明 ═══ */}
      <div className="ldk-pd-action-bar">
        {disabled ? (
          <button className="ldk-pd-btn ldk-pd-btn-enable" onClick={handleEnable} disabled={busy}>
            <span className="codicon codicon-play" /> {t("启用")}
          </button>
        ) : (
          <>
            <button className="ldk-pd-btn ldk-pd-btn-disable" onClick={handleDisable} disabled={busy}>
              <span className="codicon codicon-circle-slash" /> {t("禁用")}
            </button>
            {!isCore && (
              <button className="ldk-pd-btn ldk-pd-btn-uninstall" onClick={handleUninstall} disabled={busy}>
                <span className="codicon codicon-trash" /> {t("卸载")}
              </button>
            )}
          </>
        )}
        {error && <span className="ldk-pd-action-error">{error}</span>}
      </div>

      {/* ═══ NavBar — 对标壳 ═══ */}
      <nav className="ldk-pd-navbar">
        <button className="ldk-pd-navtab active">{t("详情")}</button>
      </nav>

      {/* ═══ Body ═══ */}
      <div className="ldk-pd-body">
        <div className="ldk-pd-details-layout">
          <div className="ldk-pd-details-main">
            {m.description && (
              <div className="pd-readme">
                <p>{t(m.description)}</p>
              </div>
            )}

            {/* E5.7#98：entry/homepage/license 不在 list() 的 7 字段序列化内——死代码删除 */}
          </div>

          {/* Info Sidebar */}
          <aside className="ldk-pd-info-sidebar">
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
    <div className="ldk-pd-info-item">
      <span className="ldk-pd-info-label">{label}</span>
      <span className={mono ? "ldk-pd-info-value mono" : "ldk-pd-info-value"}>{value}</span>
    </div>
  );
}
