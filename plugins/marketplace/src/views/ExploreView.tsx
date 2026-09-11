/**
 * ExploreView — 探索插件（市场目录浏览视图）。
 * E6#30d 承接：旧「待安装」站（.disabled/ 文件扫描）数据源切换为市场目录（loader.ts 第 7 步退役 +
 * marketplaceShared 头注）——本组件 = marketplace.json 目录驱动（marketSources fetch / 5min 缓存 / 多源合并）。
 *
 * E6#86b（第 3.6.3 轮）feature-folder 化：**本文件是门面**——原 325 行按职责拆进同名夹 `ExploreView/`
 * （行状态推导 `useCatalogStatus` / 行取字 `catalogRowText` / 行骨架 `CatalogRow` / 行态动作槽
 *  `CatalogRowAction` / 四种空态 `CatalogEmpty`）。**零行为变更、零消费方改动**（视图路径
 * `views/ExploreView.tsx` 不变，SDK bundle key = basename 亦不变）。
 * 拆法逐段对照见 docs/02-Electron架构/E6_插件生态与发布/文件整理层/03-市场插件整理.md §二。
 *
 * 安装行态（#30.9）：本行 = 全局单活跃会话 pluginId →「安装中 62%」进度徽标（30.9a M4 二）/「安装失败·归因」
 *   + [重试]（30.9b M4 三）；离线（G3）≠ 失败——钮置灰 + title「联网后重试」，无 [重试]。
 *
 * 目录防御（E6#30f）：空态三分支——ok 空（源连上但目录空）「暂无插件」（非故障，无重试）；offline 空态
 *   「无法加载市场」+ [重试]；corrupt 空态「目录损坏」+ [重试]；单源失败 / 离线缓存兜底 → 列表顶部注记
 *   （不整体降级，成功源照常展示）。
 *
 * 图标（E6#30e 第一站）：PluginIcon 显式 descriptor 入参（manifest={icon, iconSource}）——细节见 CatalogRow。
 * 目录条目标题/作者/来源仓库名是作者数据——不走 t()（i18n 只翻壳文案）。
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import {
  useMarketplaceCatalog,
  useOnlineStatus,
  getMarketplaceSearch,
} from "../services/marketplaceShared";
import { useInstallJobsSubscription } from "../services/installJobs";
import { useCatalogStatus } from "./ExploreView/useCatalogStatus";
import { useCatalogInstall } from "./ExploreView/useCatalogInstall";
import CatalogRow from "./ExploreView/CatalogRow";
import { CatalogErrorState, CatalogLoading, CatalogNoMatch, CatalogNone } from "./ExploreView/CatalogEmpty";
/* E6#86d：侧栏样式已按实测分节拆为 3 件（原 MarketplaceSidebar.css 680 行）——**本处按原文档顺序
 *  全量 import**：5 个侧栏 surface 共用同一套样式，且各 surface 吃样式的类分散在自身 JSX 与其子件
 *  （如 ExtensionItem）里，逐件 import 要算传递闭包、收益为零。判据见 styles/detail-shell.css 头注。 */
import "../styles/sidebar-shell.css";
import "../styles/sidebar-list.css";
import "../styles/sidebar-explore.css";

const lk = () => window.linkdesk;

export default function ExploreView() {
  const { t } = useTranslation();
  /* 目录 + 本地列表双门（`localLoading` 由 useCatalogStatus 自同一 store 透出——勿再单独订阅一次） */
  const catalog = useMarketplaceCatalog();
  /* E6#73c 第 2 步：安装状态读壳侧 job 表广播（`plugin:installJobs`）——本视图只订阅**一次**拿到全表，
   *  行内按 entry.id 现查（每行的 job 由 `pickInstallJob` 挑：在跑 > 排队 > 最新一条已出结果）。
   *  同一份数据也是通知面板 job 行的来源 ⇒ 行徽标与面板永不打架。
   *  #30.9b 离线态——离线 ≠ 失败：钮置灰 + title「联网后重试」，无 [重试]（G3） */
  useInstallJobsSubscription();
  const online = useOnlineStatus();
  const { statusOf, localLoading } = useCatalogStatus();
  const { handleInstall } = useCatalogInstall(online);

  /* 行点击开详情（E6#30.5b——详情页三态 action bar 的未装验证入口）——与已装列表同款 plugin-detail 标签。
   *  E6#30.7b：目录行带 label（entry.name）——未装目标插件壳 viewRegistry 无 manifest 无法命名
   *  （getDefaultLabel 只解析已装），目录名即标签；已装行同名无害。 */
  const handleOpenDetail = useCallback((id: string, name: string) => {
    lk()?.tabs?.create("plugin-detail", { pluginId: id, pinned: false, label: name });
  }, []);

  /* 数据未齐 → 加载占位（目录 + 本地列表双门——防本地列表未到前整屏误显「安装」） */
  if (catalog.loading || localLoading) {
    return <CatalogLoading />;
  }

  /* ── #30f 目录空态三分支：ok 空 = 源连上但目录空（官方仓库建好未上架）→ 诚实空态「暂无插件」，非故障，
   *  无意义重试不给；corrupt / offline 才示故障 + [重试]（修实证 bug：entries 空一律当故障显示「无法加载」） ── */
  if (catalog.entries.length === 0) {
    if (catalog.state === "ok") {
      return <CatalogNone />;
    }
    return (
      <CatalogErrorState corrupt={catalog.state === "corrupt"} onRetry={() => catalog.refresh()} />
    );
  }

  const search = getMarketplaceSearch().toLowerCase();

  /* ── 列表顶注：单源失败 / 离线缓存兜底（#30c/#30f——成功源照常展示，不整体降级） ── */
  const failedSources = catalog.errors.map((e) => e.sourceName).join("、");

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
    return <CatalogNoMatch />;
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
        {filtered.map((e) => (
          <CatalogRow
            key={e.id}
            entry={e}
            status={statusOf(e)}
            online={online}
            onOpenDetail={handleOpenDetail}
            onInstall={handleInstall}
          />
        ))}
      </div>
    </>
  );
}
