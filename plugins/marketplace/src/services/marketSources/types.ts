/**
 * types — 目录运行时拉取域的数据形状。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketSources.ts` 原样搬出，零行为变更。
 */

import type { CatalogEntry } from "../marketCatalog";

export type CatalogLoadState = "ok" | "corrupt" | "offline";

export interface CatalogLoadResult {
  entries: CatalogEntry[];
  state: CatalogLoadState;
  /** 单源彻底失败明细（{sourceName, reason}）——错误行展示/诊断不吞 */
  errors: Array<{ sourceName: string; reason: string }>;
  /** 当前在用的源名（官方 + 配置作者源）——条目来源标注、空态诊断展示 */
  sourceNames: string[];
  /** 是否有源走了降级 stale 缓存（网络失败/坏 parse 兜底，非 5min fresh 命中） */
  usedStale: boolean;
  /** 拉取时刻——「最后更新 x 前」展示 */
  fetchedAt: number;
}

/** 目录 IO 注入点类型（jsdom 测试替换） */
export type FetchFn = (url: string) => Promise<string>;
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

/** 单源结果——text = 已通过 parse 校验的交付物（实时或缓存）；reason = 彻底失败原因（无缓存可兜）。
 *  official：该源即官方默认源（E6#30.8f——官方身份与拉取 URL 同源判定，缓存/网络路径一致携带） */
export type SourceResult =
  | { sourceName: string; official: boolean; text: string; fresh: boolean; staleFallback: boolean }
  | { sourceName: string; official: boolean; reason: "network" | "parse" };
