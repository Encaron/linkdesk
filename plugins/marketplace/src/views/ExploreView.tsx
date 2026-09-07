/**
 * ExploreView — 探索插件（市场目录浏览视图）。
 * E6#30d 承接：旧「待安装」站（.disabled/ 文件扫描）数据源切换为市场目录（loader.ts 第 7 步退役 +
 * marketplaceShared 头注）——本组件 = marketplace.json 目录驱动（marketSources fetch / 5min 缓存 / 多源合并）。
 *
 * 行三态交叉比对（E6#30b——用 useMarketplacePlugins 的未过滤 `all` 列表，搜索词过滤后的
 * installed/builtin 会污染状态判定：搜词期间目录行的安装状态不能被过滤串扰）：
 *   - pluginId ∉ pluginManager.list()        → 「安装」（绿色实心钮 → installWithProgress(downloadUrl)）
 *   - pluginId ∈ list() 且本地版本 ≥ 目录版本  → 「已安装」徽标
 *   - pluginId ∈ list() 且目录版本 > 本地版本  → 「可更新」徽标（升级动作归更新轮——此处只示状态）
 *
 * 目录防御（E6#30f）：offline 空态「无法加载市场」+ [重试]；corrupt 空态「目录损坏」+ [重试]；
 *   单源失败 / 离线缓存兜底 → 列表顶部注记（不整体降级，成功源照常展示）。
 *
 * 图标（E6#30e 第一站）：PluginIcon 显式 descriptor 入参（manifest={icon, iconSource}）——目录条目
 *   未安装、无 viewRegistry/元数据缓存条目，图标只由 catalog 声明字段裁决（硬约束 11）；iconSource
 *   "url" → resolvePluginIcon 返 src → <img> 直接加载作者彩色图标。
 *
 * 目录条目标题/作者/来源仓库名是作者数据——不走 t()（i18n 只翻壳文案）。
 */

import { useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PluginIcon } from "@linkdesk/ui";

import { useMarketplaceCatalog, useMarketplacePlugins, getMarketplaceSearch } from "../services/marketplaceShared";
import type { CatalogEntry } from "../services/marketCatalog";
import { isVersionNewer } from "../services/marketCatalog";
import "../styles/MarketplaceSidebar.css";

const lk = () => window.linkdesk;

type RowStatus = "install" | "installed" | "update";

/** 目录条目 author 兼容 {name,url} / string 两种形态——抽展示名 */
function authorLabel(a: CatalogEntry["author"]): string | undefined {
  if (typeof a === "string") return a || undefined;
  return a?.name || undefined;
}

/** size（字节）→ 人类可读（B/KB/MB）——作者数据直显不翻译 */
function formatSize(bytes?: number): string | undefined {
  if (bytes === undefined) return undefined;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ExploreView() {
  const { t } = useTranslation();
  // 本地未过滤全量列表——#30b 交叉比对基准（勿用 filter 后的 installed/builtin）
  const { all, loading: localLoading } = useMarketplacePlugins();
  const catalog = useMarketplaceCatalog();
  const [installingId, setInstallingId] = useState<string | null>(null);

  /* ── #30b 状态推导：list() 集合 → { id → 本地版本 }，每行 O(1) 比对 ── */
  const localById = useMemo(
    () => new Map(all.map((p) => [p.pluginId, p.manifest.version])),
    [all],
  );

  const statusOf = useCallback(
    (entry: CatalogEntry): RowStatus => {
      const lv = localById.get(entry.id);
      if (lv === undefined) return "install";
      if (lv && isVersionNewer(entry.version, lv)) return "update";
      return "installed";
    },
    [localById],
  );

  /* ── 安装钮 → E6#31 下载安装链路（pool installWithProgress 自路由 url 源） ── */
  const handleInstall = useCallback(
    async (entry: CatalogEntry) => {
      if (installingId) return;
      if (!entry.downloadUrl) {
        await lk().dialog.alert(t("该插件缺少下载地址"));
        return;
      }
      // installWithProgress 契约上选填（老 preload 面无此法）——缺 = 安装链路不可用，别静默
      const installWithProgress = lk().pluginManager.installWithProgress;
      if (!installWithProgress) {
        await lk().dialog.alert(t("安装失败"));
        return;
      }
      setInstallingId(entry.id);
      try {
        const r = await installWithProgress(entry.downloadUrl);
        if (r && !r.success) {
          await lk().dialog.alert(r.error || t("安装失败"));
        }
      } catch (e) {
        await lk().dialog.alert(e instanceof Error ? e.message : String(e));
      } finally {
        setInstallingId(null);
      }
    },
    [installingId, t],
  );

  /* 数据未齐 → 加载占位（目录 + 本地列表双门——防本地列表未到前整屏误显「安装」） */
  if (catalog.loading || localLoading) {
    return <div className="ms-empty">{t("加载中...")}</div>;
  }

  /* ── #30f 目录空态防御：全源无交付 ── */
  if (catalog.entries.length === 0) {
    const corrupted = catalog.state === "corrupt";
    return (
      <div className="ms-empty">
        <span className="ms-empty-icon codicon codicon-error" />
        <p>{corrupted ? t("市场目录数据已损坏，请稍后重试") : t("无法加载市场，请检查网络后重试")}</p>
        <button className="ms-empty-action" onClick={() => catalog.refresh()}>
          {t("重试")}
        </button>
      </div>
    );
  }

  const search = getMarketplaceSearch().toLowerCase();

  /* ── 列表顶注：单源失败 / 离线缓存兜底（#30c/#30f——成功源照常展示，不整体降级） ── */
  const failedSources = catalog.errors.map((e) => e.sourceName).join("、");

  /* 行渲染 ── 目录条目标题走原文（作者数据不 t()） */
  const renderRow = (entry: CatalogEntry, status: RowStatus) => {
    let action: ReactNode;
    if (status === "install") {
      action = (
        <button
          className="ms-item-install-btn"
          onClick={() => handleInstall(entry)}
          disabled={installingId === entry.id}
          title={t("安装插件")}
        >
          {installingId === entry.id ? (
            t("安装中...")
          ) : (
            <>
              <span className="codicon codicon-cloud-download" /> {t("安装")}
            </>
          )}
        </button>
      );
    } else {
      const isUpdate = status === "update";
      action = (
        <span className={`ms-catalog-status${isUpdate ? " update" : ""}`} title={t(isUpdate ? "可更新" : "已安装")}>
          <span className={`codicon ${isUpdate ? "codicon-arrow-up" : "codicon-check"}`} />
          {t(isUpdate ? "可更新" : "已安装")}
        </span>
      );
    }

    return (
      <div className="ms-extension-item catalog" key={entry.id}>
        <div className="ms-item-icon">
          {/* E6#30e：目录 icon descriptor——manifest 只供 icon/iconSource 裁决（未装无 registry 条目） */}
          <PluginIcon
            pluginId={entry.id}
            manifest={{ icon: entry.icon, iconSource: entry.iconSource }}
            alt={entry.name}
          />
        </div>
        <div className="ms-item-details">
          <div className="ms-item-header">
            <span className="ms-item-name" title={entry.name}>{entry.name}</span>
            <span className="ms-item-version">v{entry.version}</span>
          </div>
          {entry.description && <span className="ms-item-desc">{entry.description}</span>}
          <div className="ms-item-footer">
            {authorLabel(entry.author) && (
              <span className="ms-item-author">{authorLabel(entry.author)}</span>
            )}
            {entry.sourceName && (
              <span className="ms-item-tag" title={entry.sourceName}>{entry.sourceName}</span>
            )}
            {formatSize(entry.size) && <span className="ms-item-tag">{formatSize(entry.size)}</span>}
          </div>
        </div>
        {action}
      </div>
    );
  };

  /* 搜索过滤——目录条目按 name/id/description 命中（与本地各组同规则） */
  const filtered = catalog.entries.filter((e) => {
    if (!search) return true;
    return (
      e.name.toLowerCase().includes(search) ||
      e.id.toLowerCase().includes(search) ||
      (e.description ?? "").toLowerCase().includes(search)
    );
  });

  if (filtered.length === 0) {
    return <div className="ms-empty">{search ? t("未找到匹配的插件") : t("市场暂无插件")}</div>;
  }

  return (
    <>
      {(catalog.usedStale || failedSources.length > 0) && (
        <div className="ms-catalog-note">
          <span className="codicon codicon-warning" />
          {catalog.usedStale && <span>{t("目录为离线缓存，可能不是最新")}</span>}
          {failedSources.length > 0 && (
            <span title={failedSources}>
              {t("部分来源加载失败，已显示可用目录")}
            </span>
          )}
        </div>
      )}
      <div className="ms-section-items">
        {filtered.map((e) => renderRow(e, statusOf(e)))}
      </div>
    </>
  );
}
