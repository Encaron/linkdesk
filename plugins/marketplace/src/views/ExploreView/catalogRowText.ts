/**
 * catalogRowText——探索视图目录行的两个纯展示取字器（作者名 / 体积）。
 * E6#86b（第 3.6.3 轮）feature-folder 拆分：自 `views/ExploreView.tsx` **逐字节**搬出，零行为变更。
 *
 * ⚠️ 搬运时发现的两处近似重复（**本轮只搬家不改逻辑，故原样保留，未做归一**）：
 *   ① 本文件 `authorLabel` 与 `services/installConfirmPayload.ts` 的同名函数逐字节相同；
 *   ② 本文件 `formatSize` 与 `services/installConfirmPayload.ts` 的 `fmtSize` 是近似重复——
 *      同一量在两处取整不同（本处 KB 恒 `toFixed(0)`，那边 <10240 B 时 `toFixed(1)`），
 *      即同一个体积在两个面可能显示成「4 KB」和「4.9 KB」。归一会改可见文案，属行为变更，
 *      故留待单独立案，不夹带进整理轮。
 */

import type { CatalogEntry } from "../../services/marketCatalog";

/** 目录条目 author 兼容 {name,url} / string 两种形态——抽展示名 */
export function authorLabel(a: CatalogEntry["author"]): string | undefined {
  if (typeof a === "string") return a || undefined;
  return a?.name || undefined;
}

/** size（字节）→ 人类可读（B/KB/MB）——作者数据直显不翻译 */
export function formatSize(bytes?: number): string | undefined {
  if (bytes === undefined) return undefined;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
