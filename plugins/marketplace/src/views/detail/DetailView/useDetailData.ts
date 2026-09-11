/**
 * useDetailData——详情视图的目录/依赖数据层：缺依赖、依赖显示名、反向依赖、仓库/许可证等元数据。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailView.tsx` 原样搬出，零行为变更。
 */

import { useMemo } from "react";
import { categoryListFromEntry } from "../../../services/marketCategories";
import { pluginRepoUrl } from "../../../services/marketCatalog";
import type { DetailIdentity } from "./useDetailIdentity";
import { reqOf } from "./types";

export function useDetailData(id: DetailIdentity) {
  const { pluginId, all, catalog, entry, enabledEntry, pending } = id;

  /* 30.5e：挂起·缺依赖——缺失依赖 = requires − 已加载 */
  const missingDeps = useMemo(() => {
    if (!pending) return [] as string[];
    const req = reqOf(enabledEntry?.manifest);
    if (req.length === 0) return [];
    const loaded = new Set(all.filter((p) => !p.pendingReason).map((p) => p.pluginId));
    return req.filter((d) => !loaded.has(d));
  }, [pending, all, enabledEntry]);

  /* 缺失依赖展示名——已装名 / 目录名兜底 / 原始 id（缺失依赖未必在目录里，mono id 亦可读） */
  const depLabel = (dep: string): string => {
    const localName = all.find((p) => p.pluginId === dep)?.manifest.name;
    if (localName) return localName;
    return catalog.entries.find((e) => e.id === dep)?.name ?? dep;
  };

  /* 元数据侧栏派生（30.6c2/c3） */
  const requiresList = reqOf(enabledEntry?.manifest);
  const dependents = all.filter(
    (p) => p.pluginId !== pluginId && reqOf(p.manifest).includes(pluginId ?? ""),
  );
  const sourceName = entry?.sourceName;
  /* E6#77：资源组「仓库 / 问题」指向**插件自己的**主页——此前拿 sourceName（目录货架名）拼 URL，
     官方目录里的插件全体跳同一个货架仓库。派生规则见 marketCatalog.pluginRepoUrl：
     乙（作者声明 repository）优先 → 甲（downloadUrl / readmeUrl 推 github owner/repo）→ 推不出不渲染。 */
  const repoUrl = pluginRepoUrl(entry);
  const issuesUrl = repoUrl ? `${repoUrl}/issues` : undefined;
  const firstRelease = entry?.versions && entry.versions.length > 0
    ? entry.versions[entry.versions.length - 1].publishedAt
    : entry?.publishedAt;
  const lastUpdate = entry?.versions?.[0]?.publishedAt ?? entry?.publishedAt;

  /* E6#32b + #63c B3：分类值 = legacy `category` + `categories[]` 并集去重、逐 slug 走 category.* i18n
   *  （英文 slug 作身份，zh/en 双值表）；渲染改**每分类一枚 chip 并排**（VS Code renderCategories 实证——
   *  数据 categories[] 本就数组，纯显示改，非「 · 」粘串）。空 → []（无分类不渲染「类别」组）。 */
  const categoryList = entry ? categoryListFromEntry(entry.category, entry.categories) : [];

  return { missingDeps, depLabel, requiresList, dependents, sourceName, repoUrl, issuesUrl, firstRelease, lastUpdate, categoryList };
}
