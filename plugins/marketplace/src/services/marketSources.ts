/**
 * marketSources — 目录运行时拉取域（E6#30a/30c/30f）。
 *
 * 职责 = 读 marketplace.marketplaceSources 配置 + 官方默认源 → 逐源拉取 marketplace.json →
 * localStorage 5min 缓存 → 合并去重（同 id 取 semver 高）→ 返回目录 + 主状态。
 * 纯格式逻辑在 marketCatalog.ts（parse/normalize/merge/compare/sourceName）；
 * 本模块只管编排 + IO，IO（fetch/localStorage/window.linkdesk.configuration）经 __setCatalogIO 可注入供 jsdom 直测。
 *
 * 状态机（#30f 目录防御，01 §四）：
 *   ok       至少一源交付目录（fresh 缓存 / stale 缓存兜底 / 实时拉取均可）
 *   corrupt  全源 parse 失败且无缓存可兜 → 空态「目录损坏」+ [重试]
 *   offline  全源不可达（fetch 失败）且无缓存可兜 → 空态「无法加载市场，请联网重试」+ [重试]
 *   单源失败 → 不阻塞其他源：有该源缓存用缓存兜底，无缓存记入 errors 展示原因（不整体降级）
 *
 * 缓存语义（01 §四）：5min 内命中读缓存不拉取；手动刷新 = forceRefreshCatalog（跳过 fresh、
 * 重拉 + 重写缓存）。网络失败/坏 parse 时有缓存原文 → 降级用 stale（usedStale=true，展示「可能过期」提示用）。
 */

import { OFFICIAL_SOURCE_URL, normalizeSourceUrl, parseCatalog, mergeCatalogs, sourceNameOfUrl } from "./marketCatalog";
import type { CatalogEntry } from "./marketCatalog";

/* ═══ 类型 ═══ */

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

/* ═══ IO 注入点（jsdom 测试替换） ═══ */

export type FetchFn = (url: string) => Promise<string>;
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

let _fetchFn: FetchFn | null = null;
let _storage: StorageLike | null = null;
/** 测试注入 fetcher / storage；传 null 恢复默认（fetch + localStorage） */
export function __setCatalogIO(fetchFn: FetchFn | null, storage: StorageLike | null): void {
  _fetchFn = fetchFn;
  _storage = storage;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_PREFIX = "ldk-market-catalog:v1:";

/* ═══ 配置读源 ═══ */

/** 官方源恒在 + 配置 marketplace.marketplaceSources 作者源（URL-string 或 {url} 形态兼容归一）——去重，官方排前 */
export async function getSourceUrls(): Promise<string[]> {
  const urls: string[] = [OFFICIAL_SOURCE_URL];
  try {
    const raw = await window.linkdesk?.configuration?.get<unknown>("marketplace.marketplaceSources");
    const list = Array.isArray(raw)
      ? raw.map((it) => (typeof it === "string" ? it : (it as { url?: unknown })?.url ?? ""))
      : [];
    for (const item of list) {
      if (typeof item !== "string") continue;
      const norm = normalizeSourceUrl(item);
      if (norm && !urls.includes(norm)) urls.push(norm);
    }
  } catch {
    /* 配置面不可用/未知键 → 仅官方源（不崩） */
  }
  return urls;
}

/** 读配置作者源（原始 URL 串、排除官方 default 项、按归一去重）——marketplace 弹窗/设置行读当前列表用。
 *  config.get 返回 effective（无 override 时 = default [官方源]）——官方恒不入存盘（读侧 getSourceUrls 前置），
 *  故此处滤官方；返回用户粘的原始形态（仓库主页 URL 保持原样），新增时原样回写、只此一份落盘。 */
export async function readConfiguredAuthorSources(): Promise<string[]> {
  let raw: unknown;
  try {
    raw = await window.linkdesk?.configuration?.get<unknown>("marketplace.marketplaceSources");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const officialNorm = normalizeSourceUrl(OFFICIAL_SOURCE_URL) ?? OFFICIAL_SOURCE_URL;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of raw) {
    if (typeof it !== "string" || !it) continue;
    const norm = normalizeSourceUrl(it);
    if (!norm || norm === officialNorm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(it);
  }
  return out;
}

/* ═══ localStorage 缓存（IO 不可用时静默退化为零缓存——每次拉取） ═══ */

function storage(): StorageLike {
  if (_storage !== null) return _storage;
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null; // 隐私模式无 localStorage
  }
}

interface CacheEntry {
  fetchedAt: number;
  text: string;
}

function readCache(url: string): CacheEntry | null {
  const s = storage();
  if (!s) return null;
  try {
    const parsed = JSON.parse(s.getItem(CACHE_PREFIX + url) ?? "") as Partial<CacheEntry>;
    if (typeof parsed.text !== "string" || typeof parsed.fetchedAt !== "number") return null;
    return { text: parsed.text, fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

function writeCache(url: string, text: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(CACHE_PREFIX + url, JSON.stringify({ fetchedAt: Date.now(), text } satisfies CacheEntry));
  } catch {
    /* 满/禁用 → 缓存失败不阻塞（本次已交付，下次重拉） */
  }
}

function removeCache(url: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(CACHE_PREFIX + url);
  } catch {
    /* ignore */
  }
}

/* ═══ 逐源拉取 ═══ */

/** 单源结果——text = 已通过 parse 校验的交付物（实时或缓存）；reason = 彻底失败原因（无缓存可兜） */
type SourceResult =
  | { sourceName: string; text: string; fresh: boolean; staleFallback: boolean }
  | { sourceName: string; reason: "network" | "parse" };

async function fetchText(url: string): Promise<string> {
  if (_fetchFn) return _fetchFn(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function isParseable(text: string): boolean {
  return parseCatalog(text).ok;
}

async function fetchOne(url: string, force: boolean): Promise<SourceResult> {
  const sourceName = sourceNameOfUrl(url);
  const cached = readCache(url);
  const withinTtl = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;

  // 5min fresh 命中 → 直接交付缓存（01 §四：先读缓存；手动刷新由 force 显式绕过）
  if (cached && withinTtl && !force) {
    return { sourceName, text: cached.text, fresh: true, staleFallback: false };
  }

  let text: string;
  try {
    text = await fetchText(url);
  } catch {
    // 网络失败 → stale 缓存兜底；无缓存 = 该源不可达
    if (cached) return { sourceName, text: cached.text, fresh: false, staleFallback: true };
    return { sourceName, reason: "network" };
  }

  if (isParseable(text)) {
    writeCache(url, text); // 实时内容写入缓存（含 force 重写）
    return { sourceName, text, fresh: true, staleFallback: false };
  }

  // parse 失败 → stale 缓存兜底；无缓存 = 该源目录损坏
  if (cached) return { sourceName, text: cached.text, fresh: false, staleFallback: true };
  return { sourceName, reason: "parse" };
}

/* ═══ 主编排 ═══ */

/** 拉取全部源并合并——force=true 跳过 5min fresh 缓存（手动刷新用） */
export async function loadCatalog(force = false): Promise<CatalogLoadResult> {
  const urls = await getSourceUrls();
  const fetched = await Promise.all(urls.map((url) => fetchOne(url, force)));

  const sources: Array<{ sourceName: string; entries: CatalogEntry[] }> = [];
  const errors: Array<{ sourceName: string; reason: string }> = [];
  let usedStale = false;

  for (const f of fetched) {
    if ("reason" in f) {
      errors.push({ sourceName: f.sourceName, reason: f.reason });
      continue;
    }
    usedStale = usedStale || f.staleFallback;
    const parsed = parseCatalog(f.text); // 交付物已预校验——兜底防御仍判一次
    if (parsed.ok) sources.push({ sourceName: f.sourceName, entries: parsed.catalog.plugins });
    else errors.push({ sourceName: f.sourceName, reason: "parse" });
  }

  // 一次跨源 merge——同 id 取 semver 高；版本平手先到的源胜出（官方排前 → 官方胜）
  const entries = mergeCatalogs(sources);

  let state: CatalogLoadState = "ok";
  if (entries.length === 0) {
    // 全源无交付：#30f 判空态——有 parse 失败（源可达但在传坏数据）→ corrupt；否则不可达 → offline
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
