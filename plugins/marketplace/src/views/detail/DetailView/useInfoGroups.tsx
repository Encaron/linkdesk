/**
 * useInfoGroups——详情页元数据侧栏的**分组求解**（#63c B3 分组定稿，mockup 04）。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailInfoSidebar.tsx` 的 groups 装配段原样搬出
 * （每行判据一字未改），零行为变更——展示件因此只剩「把组壳铺出来」。
 *
 * 结构（mockup 04）：顶部无节题小段 标识符/作者/版本/大小（+数据位置）+ 组 市场/类别/资源/依赖 · 环境；
 * label 左 | value 右 横排 + 项间细分隔；结构全插件固定、行值无数据给 Dash 占位不缩结构、空组不渲染
 * （「空组不渲染」的判据只在 `info-bits.InfoGroup` 一处）；分类 = 每枚 chip 并排；
 * 字段集全保留不精简（用户 2026-09-09 拍板）。
 */

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { PluginDiskLocation, PluginFolderKind } from "@linkdesk/contracts";
import type { CatalogEntry } from "../../../services/marketCatalog";
import { localizeCategory } from "../../../services/marketCategories";
import { Dash, fmtCount, InfoItem } from "./info-bits";
import { DependentValues, DepValues, depEnvGroupOf, resourcesGroupOf } from "./info-groups";
import { topGroupOf } from "./info-top";

/** 侧栏全量输入——即 `DetailInfoSidebar` 的 props（展示件与求解共用一份，免得两处各抄一份会漂移） */
export type InfoGroupsInput = {
  pluginId?: string;
  installed: boolean;
  entry?: CatalogEntry;
  authorText?: string;
  versionText?: string;
  diskLoc: PluginDiskLocation | null;
  appBelowMin: boolean;
  /** 下载数——`status==="ready"` 才有值，无数据不造空位 */
  dlCount?: number;
  sourceName?: string;
  repoUrl?: string;
  issuesUrl?: string;
  firstRelease?: string;
  lastUpdate?: string;
  categoryList: string[];
  requiresList: string[];
  missingDeps: string[];
  dependents: Array<{ pluginId: string; name: string }>;
  depLabel: (dep: string) => string;
  onOpenDir: (kind: PluginFolderKind) => void;
  onJumpToDep: (dep: string) => void;
};

export function useInfoGroups(o: InfoGroupsInput): Array<{ title?: string; items: ReactNode[] }> {
  const { t } = useTranslation();
  const {
    pluginId,
    installed,
    entry,
    authorText,
    versionText,
    diskLoc,
    appBelowMin,
    dlCount,
    sourceName,
    repoUrl,
    issuesUrl,
    firstRelease,
    lastUpdate,
    categoryList,
    requiresList,
    missingDeps,
    dependents,
    depLabel,
    onOpenDir,
    onJumpToDep,
  } = o;

  const groups: Array<{ title?: string; items: ReactNode[] }> = [];

  /* 顶部无节题小段（mockup 04 开首——不落「信息」总词；行装配在 `info-top.tsx`） */
  groups.push({ items: topGroupOf({ t, pluginId, authorText, versionText, entry, diskLoc, onOpenDir }) });

  /* 组：市场（mockup 04 归组——来源/首次发布/更新时间/下载；「来源」行即目录身份，无外链概念） */
  const market: ReactNode[] = [];
  if (sourceName) market.push(<InfoItem key="src" label={t("来源")} value={sourceName} mono />);
  if (firstRelease)
    market.push(<InfoItem key="first" label={t("首次发布")} value={firstRelease.slice(0, 10)} />);
  if (lastUpdate) market.push(<InfoItem key="last" label={t("更新时间")} value={lastUpdate.slice(0, 10)} />);
  /* E6#30.8b 下载数（read-only GitHub 计数）——仅 ready 显，无数据不造空位 */
  if (dlCount !== undefined) market.push(<InfoItem key="dl" label={t("下载")} value={fmtCount(dlCount)} />);
  groups.push({ title: t("市场"), items: market });

  /* 组：类别——每分类一枚 chip 并排（VS Code renderCategories 实证；空 → 整组不渲染） */
  const cats: ReactNode[] =
    categoryList.length > 0
      ? [
          <div key="cats" className="mpd-info-cats">
            {categoryList.map((slug) => (
              <span key={slug} className="mpd-info-cat">
                {localizeCategory(t, slug)}
              </span>
            ))}
          </div>,
        ]
      : [];
  groups.push({ title: t("类别"), items: cats });

  /* 组：资源（逐行「有才显」） + 组：依赖 · 环境（需 LinkDesk / 依赖 / 被依赖） */
  groups.push({ title: t("资源"), items: resourcesGroupOf({ t, repoUrl, issuesUrl, license: entry?.license }) });
  groups.push({
    title: t("依赖 · 环境"),
    items: depEnvGroupOf({
      t,
      minAppVersion: entry?.minAppVersion,
      appBelowMin,
      installed,
      hasEntry: !!entry,
      depsValue: installed ? (
        <DepValues deps={requiresList} missing={missingDeps} labelOf={depLabel} onJump={onJumpToDep} />
      ) : (
        <Dash />
      ),
      dependentsValue: <DependentValues dependents={dependents} onJump={onJumpToDep} />,
    }),
  });

  return groups;
}
