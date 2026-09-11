/**
 * merge — 多源目录合并去重（同 id 取版本高者，来源身份随胜出条目携带）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketCatalog.ts` 原样搬出，零行为变更。
 */

import type { CatalogEntry } from "./types";
import { isVersionNewer } from "./semver";

/** 多源合并去重——同 id 取 semver 高者；版本平手用先出现的源（官方排前 → 官方胜出）。
 *  E6#30.8f：来源记录可带 official 标记，胜出条目的来源身份（sourceName + official）随条目携带——UI 读
 *  单一字段即可显示「官方发布」徽标，不把官方身份跟"源 URL 长啥样"耦合回视图层。
 *  E6#71k：连带携带 sourceUrl（同时注入，同一条记录的两个面）——信任门判 http 明文源需要它，
 *  sourceName 对 http/https 同形判不出。 */
export function mergeCatalogs(
  sources: Array<{ sourceName: string; sourceUrl?: string; official?: boolean; entries: CatalogEntry[] }>,
): CatalogEntry[] {
  const byId = new Map<string, CatalogEntry>();
  for (const src of sources) {
    for (const e of src.entries) {
      const prev = byId.get(e.id);
      const carried: CatalogEntry = { ...e, sourceName: src.sourceName, sourceUrl: src.sourceUrl };
      if (src.official) carried.official = true;
      if (!prev) {
        byId.set(e.id, carried);
      } else if (isVersionNewer(e.version, prev.version)) {
        byId.set(e.id, carried);
      }
    }
  }
  return [...byId.values()];
}
