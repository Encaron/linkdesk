/**
 * load — **主编排**：拉全部源 → 合并 → 定主状态（ok / corrupt / offline）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketSources.ts` 原样搬出，零行为变更。
 */

import { mergeCatalogs, parseCatalog, sourceNameOfUrl } from "../marketCatalog";
import type { CatalogEntry } from "../marketCatalog";
import { fetchOne } from "./fetch";
import { removeCache } from "./io";
import { getSourceUrls } from "./sourceConfig";
import type { CatalogLoadResult, CatalogLoadState } from "./types";

/** 拉取全部源并合并——force=true 跳过 5min fresh 缓存（手动刷新用） */
export async function loadCatalog(force = false): Promise<CatalogLoadResult> {
  const urls = await getSourceUrls();
  const fetched = await Promise.all(urls.map((url) => fetchOne(url, force)));

  const sources: Array<{ sourceName: string; sourceUrl?: string; official?: boolean; entries: CatalogEntry[] }> = [];
  const errors: Array<{ sourceName: string; reason: string }> = [];
  let usedStale = false;

  // 下标对齐 fetched ⇄ urls（上一行是直 map——一一对应）；sourceUrl 随条目携带供 E6#71k 判 http 明文源
  for (let i = 0; i < fetched.length; i++) {
    const f = fetched[i];
    if ("reason" in f) {
      errors.push({ sourceName: f.sourceName, reason: f.reason });
      continue;
    }
    usedStale = usedStale || f.staleFallback;
    const parsed = parseCatalog(f.text); // 交付物已预校验——兜底防御仍判一次
    if (parsed.ok) sources.push({ sourceName: f.sourceName, sourceUrl: urls[i], official: f.official, entries: parsed.catalog.plugins });
    else errors.push({ sourceName: f.sourceName, reason: "parse" });
  }

  // 一次跨源 merge——同 id 取 semver 高；版本平手先到的源胜出（官方排前 → 官方胜）
  const entries = mergeCatalogs(sources);

  let state: CatalogLoadState = "ok";
  if (sources.length === 0) {
    // 全源零交付（无一源 parse 通过/有缓存可兜）：#30f 判空态——有 parse 失败（源可达但在传坏数据）→
    // corrupt；否则不可达 → offline。判据 = 交付源数非合并条数：源连上但目录为空（如官方仓库建好未上架）
    // 是合法 ok 空态，不能因 entries 空就误降级成 offline（实证 bug：探索页把「连上但空」显示成「无法加载」）
    const hasParse = errors.some((e) => e.reason === "parse");
    state = hasParse ? "corrupt" : "offline";
  }

  return { entries, state, errors, sourceNames: urls.map(sourceNameOfUrl), usedStale, fetchedAt: Date.now() };
}

/** 手动刷新目录——清缓存 + 强制重拉全部源 */
export async function forceRefreshCatalog(): Promise<CatalogLoadResult> {
  for (const url of await getSourceUrls()) removeCache(url);
  return loadCatalog(true);
}
