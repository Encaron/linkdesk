/**
 * DetailView——插件详情主区渲染面（contributes.views.main["plugin-detail"]，容器 "main" 由壳
 * ShellViewRenderer 在 plugin-detail 标签页消费——E6#30.10b）。
 *
 * E6#30.11 搬迁：布局从壳 PluginDetailPoolView 迁入（header / pending 条 / action bar / navbar /
 * body + info 侧栏），零 @src/core——数据全走 window.linkdesk.* IPC + 本插件模块级 store。
 * 壳 PluginDetailPoolView 降级为保底宿主（无市场插件/无详情贡献时兜底，不崩）。
 *
 * 数据源（30.11c）：list()（已装实时状态）→ catalog（marketEntry，未装可显示）+ list() 实时合并。
 *   已装判定 = list()(启用) ∪ getDisabled()(禁用) 两源合并——list() EXCLUDES 禁用插件（实机探针实证），
 *   禁用已装必须经 disabledRaw 才可见，否则禁用瞬间塌成「未安装」。展示数据：启用 = list() 全 manifest；
 *   禁用 = getDisabled 四字段子集（name/description/version；无 author/core——禁用态 action bar 只画
 *   「启用」钮，core 无关；author 缺省不画）。未装 = catalog 目录数据。
 *   marketEntry 宿主不注入——catalog = 公开文件（marketplace.json）+ 本插件 marketSources 模块级 store，
 *   §五数据继承「换市场插件重读同一份公开文件」，pluginId 足够身份，tab 参数保持轻（30.11c 定案）。
 *   DetailView 同 bundle 内直接 useMarketplaceCatalog 自查 pluginId。宿主将来若注入 marketEntry prop
 *   亦同形可消费（props 契约 { pluginId, marketEntry, pinned, isActive } 结构式各执一份）。
 *
 * 动作（30.11d）：enable/disable/uninstall 走 window.linkdesk.pluginManager.*（E6#18a core:true
 *   只藏卸载钮——UI 防误删旗标，命令/接口层可卸）。执行后本地不翻转状态——lifecycle 事件驱动
 *   useMarketplacePlugins 自动 refreshData（list+disabled 双拉原子替换），视图随刷新收敛到真值。
 *   core 徽标/icon 来自 list() manifest 子集（core/name/version/author/description/pendingReason）；
 *   目录 icon descriptor 来自 catalog（list() IPC 无 icon——搬迁后经 catalog 补上，E5.7#98 卡脖子缓解）。
 */

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { PluginIcon } from "@linkdesk/ui";
import { useMarketplacePlugins, useMarketplaceCatalog } from "../services/marketplaceShared";
import type { CatalogEntry } from "../services/marketCatalog";
import "../styles/MarketplaceDetail.css";

/** 壳→插件详情贡献 props——结构式本地声明（池侧 PluginDetailViewHost 各执一份，字符串即契约） */
type DetailContributedProps = {
  pluginId?: string;
  pinned?: boolean;
  isActive: boolean;
  marketEntry?: unknown;
};

/** 展示合并对象——list() 全 manifest | getDisabled 四字段子集 | null(未装) */
type DetailInfo = {
  manifest: { name?: string; version?: string; author?: string; description?: string; core?: boolean };
  pendingReason?: string;
};

/** 目录条目 author 兼容 {name,url} / string 两种形态——抽展示名 */
function authorLabel(a: CatalogEntry["author"]): string | undefined {
  if (typeof a === "string") return a || undefined;
  return a?.name || undefined;
}

function InfoItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="mpd-info-item">
      <span className="mpd-info-label">{label}</span>
      <span className={mono ? "mpd-info-value mono" : "mpd-info-value"}>{value}</span>
    </div>
  );
}

export default function DetailView({ pluginId }: DetailContributedProps) {
  const { t } = useTranslation();
  const pm = () => window.linkdesk?.pluginManager;
  const { all, disabledRaw, loading: pluginsLoading } = useMarketplacePlugins();
  const catalog = useMarketplaceCatalog();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── 已装判定 = list()(启用) ∪ disabledRaw(禁用)（30.11c 实时合并本意；实机回归实证见文件头） ──
  const enabledEntry = all.find((p) => p.pluginId === pluginId) ?? null;
  const disabledHit = disabledRaw.find((p) => p.pluginId === pluginId) ?? null;
  const disabled = !!disabledHit;
  const info: DetailInfo | null = enabledEntry
    ? {
        manifest: {
          name: enabledEntry.manifest.name,
          version: enabledEntry.manifest.version,
          author: enabledEntry.manifest.author,
          description: enabledEntry.manifest.description,
          core: enabledEntry.manifest.core,
        },
        pendingReason: enabledEntry.pendingReason,
      }
    : disabledHit
      ? {
          manifest: {
            name: disabledHit.name,
            version: disabledHit.version,
            description: disabledHit.description,
          },
        }
      : null;
  const entry: CatalogEntry | undefined = catalog.entries.find((e) => e.id === pluginId);

  const handleEnable = useCallback(async () => {
    if (!pluginId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await pm().enable(pluginId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }, [pluginId, busy]);

  const handleDisable = useCallback(async () => {
    if (!pluginId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await pm().disable(pluginId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }, [pluginId, busy]);

  const handleUninstall = useCallback(async () => {
    if (!pluginId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await pm().uninstall(pluginId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }, [pluginId, busy]);

  // ── 数据未齐（本地列表未到 → 误判「未安装」前等一拍；目录只等未装分支，已装不阻塞） ──
  if (!info) {
    if (pluginsLoading || catalog.loading) {
      return <div className="mpd-empty">{t("加载中...")}</div>;
    }
    if (!entry) {
      return (
        <div className="mpd-empty">
          {pluginId ? (
            <p>{t("插件") + ` "${pluginId}" ` + t("未安装")}</p>
          ) : (
            <p>{t("未指定插件 ID")}</p>
          )}
        </div>
      );
    }
  }

  // ── 展示字段合并：已装 = list()/getDisabled manifest 为准（t() 解析插件显示名/描述——E5.8#37.9.1）；
  //    未装 = 目录作者数据原样（catalog 作者数据绝不 t()） ──
  const m = info?.manifest ?? {};
  const isCore = !!m.core;
  // info 与 entry 的相关性不被 TS 跨 ternary 推导——统一 optional chaining + 兜底（!info 分支早退已保证 entry）
  const nameText = info ? t(m.name ?? pluginId ?? "") : entry?.name ?? pluginId ?? "";
  const versionText = info ? m.version : entry?.version;
  const authorText = info ? m.author : (entry ? authorLabel(entry.author) : undefined);
  const descText = info ? m.description ?? "" : entry?.description ?? "";
  const showDesc = descText.length > 0;
  const iconManifest = entry?.icon || entry?.iconSource ? { icon: entry?.icon, iconSource: entry?.iconSource } : undefined;

  return (
    <div className="mpd-detail">
      {/* ═══ Header ═══ */}
      <header className="mpd-header">
        <div className="mpd-icon">
          {iconManifest ? (
            <PluginIcon pluginId={pluginId ?? ""} manifest={iconManifest} alt={nameText} />
          ) : (
            <span className="codicon codicon-symbol-misc mpd-icon-codicon" />
          )}
          {isCore && <span className="mpd-icon-badge codicon codicon-star-full" />}
        </div>
        <div className="mpd-header-details">
          <div className="mpd-title-row">
            <h1 className="mpd-name">{nameText}</h1>
            {versionText && <span className="mpd-version">v{versionText}</span>}
            {isCore && <span className="mpd-badge mpd-badge-core">{t("内置")}</span>}
          </div>
          {authorText && <p className="mpd-subtitle">{authorText}</p>}
          {showDesc && <p className="mpd-short-desc">{descText}</p>}
        </div>
      </header>

      {/* ═══ E5.8#15.5：缺依赖挂起（PENDING）提示条 ═══ */}
      {info?.pendingReason && (
        <div className="mpd-pending-notice">
          <span className="codicon codicon-info" />
          <span>{info.pendingReason}</span>
        </div>
      )}

      {/* ═══ Action Bar（已装才画；未装 = 30.5b 三态 action 的地盘，本轮展示 catalog 信息不画安装钮） ═══ */}
      {info && (
        <div className="mpd-action-bar">
          {disabled ? (
            <button className="mpd-btn mpd-btn-enable" onClick={handleEnable} disabled={busy}>
              <span className="codicon codicon-play" /> {t("启用")}
            </button>
          ) : (
            <>
              <button className="mpd-btn mpd-btn-disable" onClick={handleDisable} disabled={busy}>
                <span className="codicon codicon-circle-slash" /> {t("禁用")}
              </button>
              {!isCore && (
                <button className="mpd-btn mpd-btn-uninstall" onClick={handleUninstall} disabled={busy}>
                  <span className="codicon codicon-trash" /> {t("卸载")}
                </button>
              )}
            </>
          )}
          {error && <span className="mpd-action-error">{error}</span>}
        </div>
      )}

      {/* ═══ NavBar ═══ */}
      <nav className="mpd-navbar">
        <button className="mpd-navtab active">{t("详情")}</button>
      </nav>

      {/* ═══ Body ═══ */}
      <div className="mpd-body">
        <div className="mpd-details-layout">
          <div className="mpd-details-main">{showDesc && <p className="mpd-description">{descText}</p>}</div>
          <aside className="mpd-info-sidebar">
            <InfoItem label={t("标识符")} value={pluginId ?? ""} mono />
            {versionText && <InfoItem label={t("版本")} value={`v${versionText}`} />}
          </aside>
        </div>
      </div>
    </div>
  );
}
