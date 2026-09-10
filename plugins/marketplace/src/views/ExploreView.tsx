/**
 * ExploreView — 探索插件（市场目录浏览视图）。
 * E6#30d 承接：旧「待安装」站（.disabled/ 文件扫描）数据源切换为市场目录（loader.ts 第 7 步退役 +
 * marketplaceShared 头注）——本组件 = marketplace.json 目录驱动（marketSources fetch / 5min 缓存 / 多源合并）。
 *
 * 行状态交叉比对（E6#30b——用 useMarketplacePlugins 的未过滤 `all` 列表，搜索词过滤后的
 * installed/builtin 会污染状态判定：搜词期间目录行的安装状态不能被过滤串扰）：
 *   - pluginId ∉ list()                          → 「安装」钮（→ startMarketInstall 单活跃会话，#30.9a/b 消费）
 *   - pluginId ∈ list() 且本地版本 ≥ 目录版本      → 「已安装」徽标
 *   - pluginId ∈ list() 且目录版本 > 本地版本      → 「可更新」徽标（升级动作归更新轮——此处只示状态）
 *   - pluginId ∈ getDisabled()（list() 排除禁用） → 「已禁用」徽标（30.11c 实机回归——防禁用行误显「安装」
 *     撞装前冲突；启用/卸载归详情与已装列表）
 * 安装行态（#30.9）：本行 = 全局单活跃会话 pluginId →「安装中 62%」进度徽标（30.9a M4 二）/「安装失败·归因」
 *   + [重试]（30.9b M4 三）；离线（G3）≠ 失败——钮置灰 + title「联网后重试」，无 [重试]。
 *
 * 目录防御（E6#30f）：空态三分支——ok 空（源连上但目录空）「暂无插件」（非故障，无重试）；offline 空态
 *   「无法加载市场」+ [重试]；corrupt 空态「目录损坏」+ [重试]；单源失败 / 离线缓存兜底 → 列表顶部注记
 *   （不整体降级，成功源照常展示）。
 *
 * 图标（E6#30e 第一站）：PluginIcon 显式 descriptor 入参（manifest={icon, iconSource}）——目录条目
 *   未安装、无 viewRegistry/元数据缓存条目，图标只由 catalog 声明字段裁决（硬约束 11）；iconSource
 *   "url" → resolvePluginIcon 返 src → 以 img 元素直接加载作者彩色图标。
 *   E6#69c/#69f：目录行 = 详情同裁决走共享 pickIdentityArt（marketIcon ?? icon ?? 默认彩色块）——
 *   目录条目本无 marketIcon 字段（架构三图模型：目录只存 icon；marketIcon 只在已装 plugin.json 内），
 *   pickIdentityArt 在 icon 有则显、无则落默认彩色块（顶替 📄/#66 640 场景默认）。
 *
 * 目录条目标题/作者/来源仓库名是作者数据——不走 t()（i18n 只翻壳文案）。
 */

import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PluginIcon, pickIdentityArt } from "@linkdesk/ui";

import {
  useMarketplaceCatalog,
  useMarketplacePlugins,
  useOnlineStatus,
  getMarketplaceSearch,
  startMarketInstall,
  retryMarketInstall,
  installFailLabelKey,
  classifyInstallError,
  notifyError,
} from "../services/marketplaceShared";
import { useInstallJobsSubscription, pickInstallJob, installJobLabel } from "../services/installJobs";
import type { CatalogEntry } from "../services/marketCatalog";
import { updateToVersion } from "../services/marketCatalog";
// E6#71k「都问」：安装确认门——行内安装与详情页走同一门（双入口单门，零漂移）
import { confirmMarketInstall } from "../services/installGate";
import "../styles/MarketplaceSidebar.css";

const lk = () => window.linkdesk;

type RowStatus = "install" | "installed" | "update" | "disabled";

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
  // 本地未过滤全量列表——#30b 交叉比对基准（勿用 filter 后的 installed/builtin）；
  // list() EXCLUDES 禁用插件（30.11c 实机回归）——禁用已装另经 disabledRaw 双源合并，防禁用行误显「安装」
  const { all, disabledRaw, loading: localLoading } = useMarketplacePlugins();
  const catalog = useMarketplaceCatalog();
  /* E6#73c 第 2 步：安装状态读壳侧 job 表广播（`plugin:installJobs`）——本视图只订阅**一次**拿到全表，
   *  行内按 entry.id 现查（每行的 job 由 `pickInstallJob` 挑：在跑 > 排队 > 最新一条已出结果）。
   *  同一份数据也是通知面板 job 行的来源 ⇒ 行徽标与面板永不打架。
   *  #30.9b 离线态——离线 ≠ 失败：钮置灰 + title「联网后重试」，无 [重试]（G3） */
  useInstallJobsSubscription();
  const online = useOnlineStatus();

  /* 行点击开详情（E6#30.5b——详情页三态 action bar 的未装验证入口）——与已装列表同款 plugin-detail 标签。
   *  E6#30.7b：目录行带 label（entry.name）——未装目标插件壳 viewRegistry 无 manifest 无法命名
   *  （getDefaultLabel 只解析已装），目录名即标签；已装行同名无害。 */
  const handleOpenDetail = useCallback((id: string, name: string) => {
    lk()?.tabs?.create("plugin-detail", { pluginId: id, pinned: false, label: name });
  }, []);

  /* ── #30b 状态推导：list()(启用) ∪ getDisabled()(禁用) 两源 → 本地版本表/禁用集，每行 O(1) ── */
  const localById = useMemo(
    () => new Map(all.map((p) => [p.pluginId, p.manifest.version])),
    [all],
  );
  const disabledIds = useMemo(() => new Set(disabledRaw.map((p) => p.pluginId)), [disabledRaw]);

  const statusOf = useCallback(
    (entry: CatalogEntry): RowStatus => {
      // 已装但禁用 → 不显安装/更新钮（启用/卸载归详情/已装列表，装前冲突由此防——#30.9d）
      if (disabledIds.has(entry.id)) return "disabled";
      const lv = localById.get(entry.id);
      if (lv === undefined) return "install";
      // E6#33b：可更新判定与详情/发现/铃铛同源单函数（stable-only + semver.gt，§一·三）——
      // 不再用顶层 entry.version 裸比（顶层是 beta 时旧逻辑误判可更新，而详情/铃铛 stable 不提示 = 判定分裂）
      return updateToVersion(entry, lv) ? "update" : "installed";
    },
    [localById, disabledIds],
  );

  /* ── 安装钮 → E6#31 下载安装链路（统一 startMarketInstall 单活跃会话——#30.9a 行进度 + #30.9b
   *  失败态行/toast[重试] 消费同源；成功 lifecycle 事件驱动列表翻态）。
   *  E6#71d 归一：行内安装 = 详情页同款富内容确认（installConfirmPayload + ConfirmInstall 视图——
   *  mockup 02 本意两入口都先确认；71c 前侧栏直装是漏做，71d 补齐）。确认卡显示的版本 = 本行将装的
   *  entry.downloadUrl 对应 entry.version（installConfirmPayload 缺省 installVer），行显 v{version} 不撒谎。 ── */
  const handleInstall = useCallback(
    async (entry: CatalogEntry) => {
      if (!online) return; // 离线钮置灰（G3）——此处防御不发起（title 已提示「联网后重试」）
      if (!entry.downloadUrl) {
        // #64 A1：阻塞式弹窗 → 事件型 error toast（定案 5——toast 报一次即可，零页面占位）
        notifyError(t("该插件缺少下载地址"));
        return;
      }
      // installWithProgress 契约上选填（老 preload 面无此法）——缺 = 安装链路不可用，别静默
      if (!lk()?.pluginManager?.installWithProgress) {
        notifyError(t("安装失败"));
        return;
      }
      // E6#71k「都问」：行内安装与详情页走同一个门（installGate）——**恒弹卡**，官方来源不豁免。
      // 门在模块里统一弹 ConfirmInstall 富内容卡，本视图只消费布尔结果（零判定逻辑在此）。
      const confirmed = await confirmMarketInstall(entry, "install");
      if (!confirmed) return;
      // 进度/失败/重试全走 startMarketInstall（进等待队列 → settle 归因 + toast[重试]，幂等单发）
      // E6#73c 第 1 步：带显示名——壳侧 job 行需要它（目录未加载时进程内也能兜底解析，不传则退化为 id）
      await startMarketInstall(entry.id, entry.downloadUrl, entry.name);
    },
    [online, t],
  );

  /* 数据未齐 → 加载占位（目录 + 本地列表双门——防本地列表未到前整屏误显「安装」） */
  if (catalog.loading || localLoading) {
    return <div className="ms-empty">{t("加载中...")}</div>;
  }

  /* ── #30f 目录空态三分支：ok 空 = 源连上但目录空（官方仓库建好未上架）→ 诚实空态「暂无插件」，非故障，
   *  无意义重试不给；corrupt / offline 才示故障 + [重试]（修实证 bug：entries 空一律当故障显示「无法加载」） ── */
  if (catalog.entries.length === 0) {
    if (catalog.state === "ok") {
      return <div className="ms-empty">{t("市场暂无插件")}</div>;
    }
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
    /* #30.9 行态：本行 job（进度/失败由壳侧 job 表按 pluginId 匹配而来——详情页起装的 job 也同步到目录行）。
     *  E6#73c 第 2 步：并发上限在壳（N=3），另一插件安装中不再影响本行——点得动、进得去、画得出来。 */
    const jobHere = pickInstallJob(entry.id);
    const installingHere = jobHere?.state === "running";
    const errHere =
      jobHere?.state === "settled" && jobHere.terminal === "failed" ? jobHere : null;
    const queuedHere = jobHere?.state === "queued";

    if (status === "install") {
      if (installingHere) {
        /* 30.9a M4 二：安装中——阶段/进度标签（校验中/下载中 x%/解压中/加载中，i18n 全量已有 key） */
        action = (
          <span className="ms-catalog-status installing" title={t("安装插件")}>
            <span className="codicon codicon-cloud-download" />
            {installJobLabel(t, jobHere)}
          </span>
        );
      } else if (queuedHere) {
        /* E6#73c 第 1 步：等待安装中——回执（此前这里是一条静默 return false：点了等于没点）。
         *  复用 installing 徽标样式（零新 CSS）；文案与 §五 I.4 排队行同词。 */
        action = (
          <span className="ms-catalog-status installing" title={t("等待安装中")}>
            <span className="codicon codicon-clock" />
            {t("等待安装中")}
          </span>
        );
      } else if (errHere) {
        /* 30.9b M4 三：安装失败——归因文案截断 + [重试]（手动无自动风暴；✕ 关闭归详情行，目录行不重复，
         *  另起安装会覆盖失败会话自清） */
        action = (
          <span className="ms-item-fail" title={errHere.error}>
            <span className="codicon codicon-error" />
            <span className="ms-item-fail-text">
              {t(installFailLabelKey(classifyInstallError(errHere.error)))}
            </span>
            <button
              className="ms-item-fail-act"
              onClick={(e) => {
                e.stopPropagation();
                void retryMarketInstall(entry.id, entry.downloadUrl ?? "", entry.name);
              }}
              title={t("重试")}
            >
              <span className="codicon codicon-refresh" />
            </button>
          </span>
        );
      } else {
        action = (
          <button
            className="ms-item-install-btn"
            onClick={(e) => {
              // 行点击开详情（30.5b）——安装钮自身动作需隔离，别误触开标签
              e.stopPropagation();
              void handleInstall(entry);
            }}
            disabled={!online} // #30.9b 离线态（G3）：置灰不发请求，联网自动回可用
            title={!online ? t("联网后重试") : t("安装插件")}
          >
            <span className="codicon codicon-cloud-download" /> {t("安装")}
          </button>
        );
      }
    } else if (status === "disabled") {
      /* 已装但禁用（list() 排除禁用插件）——静置徽标，无动作（#30.9d 冲突由此防） */
      action = (
        <span className="ms-catalog-status disabled" title={t("已禁用")}>
          <span className="codicon codicon-circle-slash" />
          {t("已禁用")}
        </span>
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
      <div
        className="ms-extension-item catalog"
        key={entry.id}
        onClick={() => handleOpenDetail(entry.id, entry.name)}
        title={t("详情")}
      >
        <div className="ms-item-icon">
          {/* E6#30e：目录 icon descriptor——manifest 只供 icon/iconSource 裁决（未装无 registry 条目）；
           *  E6#69c/#69f：行 = 详情同裁决，走共享 pickIdentityArt = marketIcon ?? icon ?? 默认彩色块（顶替 📄/640 场景默认） */}
          <PluginIcon
            pluginId={entry.id}
            manifest={pickIdentityArt(entry)}
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

  /* 此处 filtered 空 ⟺ 有搜索词且零命中（无搜索词 + entries>0 → 全量非空；entries 空已在顶部 ok/corrupt/offline
   *  空态三分支返回）→ 只需「未找到」；「暂无插件」由顶部 ok 空态承担 */
  if (filtered.length === 0) {
    return <div className="ms-empty">{t("未找到匹配的插件")}</div>;
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
