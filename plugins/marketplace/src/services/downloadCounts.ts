/**
 * downloadCounts — 下载数（E6#30.8b）——GitHub Releases API 资产级 read-only 计数。
 *
 * 来源不是我们统计（08 §二）：GitHub 每个发布资产自带 download_count（GitHub 替所有下载者统计，
 * 我们只读）。从目录条目 downloadUrl（github.com/{owner}/{repo}/releases/download/{tag}/{file}）
 * 解析出唯一发布资产 → GET repos/{owner}/{repo}/releases/tags/{tag} → 命中同名资产 download_count。
 *
 * 诚实边界（08 §二/04 §三）：只读 GitHub 现成数据，不伪造——
 *   - 非 github.com releases/download 形态的 downloadUrl（gitee 自定义源/直链等）→ hidden 不显示
 *   - 拉取失败（断网/未认证 60/hr 超限/代理）→ hidden 不显示（无数据不造空位）
 *   - 本地插件无 marketEntry → 调用方不传 downloadUrl → hidden
 *
 * 缓存：localStorage 资产级 10min TTL（前缀 ldk-market-dl:v1:，独立于目录 5min 缓存——目录文本缓存不
 * 携带统计；拉取计数是单独只读面）。未认证 GitHub API 60 次/小时——每资产至少 10 分钟才一次，绰绰有余。
 *
 * 纯解析 + fetch 编排单模块；hook 只服务详情页元数据「下载」（30.8b 显示点），列表卡片不显示。
 * IO 经 localStorage/fetch 全局——无 window.linkdesk 依赖（与目录源同层信任）。React 侧 useEffect 常驻。
 */

import { useEffect, useState } from "react";

/** 下载数显示态——hidden = 不适用/拉取失败（诚实不造假）；loading = 拉取中（瞬态） */
export type DownloadCountState =
  | { status: "hidden" }
  | { status: "loading" }
  | { status: "ready"; count: number };

/** github.com 发布下载 URL 解析目标（owner/repo/tag/filename） */
export interface GithubReleaseTarget {
  owner: string;
  repo: string;
  tag: string;
  filename: string;
}

const DL_CACHE_PREFIX = "ldk-market-dl:v1:";
const DL_TTL_MS = 10 * 60 * 1000;
const DL_FETCH_TIMEOUT_MS = 6_000;

/** 解析 GitHub Releases 下载直链 → 资产坐标；非该形态（gitee/自定义直链）→ null（不显示下载数） */
export function parseGithubReleaseDownloadUrl(downloadUrl?: string): GithubReleaseTarget | null {
  if (!downloadUrl) return null;
  const m =
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/([^/?#]+)$/.exec(
      downloadUrl.trim(),
    );
  if (!m) return null;
  return { owner: m[1], repo: m[2], tag: m[3], filename: m[4] };
}

/* ═══ 资产级缓存 ═══ */

function cacheKey(t: GithubReleaseTarget): string {
  return `${DL_CACHE_PREFIX}${t.owner}/${t.repo}/${t.tag}/${t.filename}`;
}

function readCachedCount(t: GithubReleaseTarget): number | undefined {
  try {
    const raw = JSON.parse(localStorage.getItem(cacheKey(t)) ?? "") as {
      fetchedAt?: number;
      count?: number;
    };
    if (typeof raw.fetchedAt === "number" && typeof raw.count === "number") {
      if (Date.now() - raw.fetchedAt < DL_TTL_MS) return raw.count;
      // 过期缓存 → 视为无（拉到新值前不显示 stale，避免误导）
    }
  } catch {
    /* 无/坏缓存 */
  }
  return undefined;
}

function writeCachedCount(t: GithubReleaseTarget, count: number): void {
  try {
    localStorage.setItem(cacheKey(t), JSON.stringify({ fetchedAt: Date.now(), count }));
  } catch {
    /* 满/禁用 → 本次不缓存（下次重拉） */
  }
}

/* ═══ 拉取（单飞去重——StrictMode/重入防双 fetch） ═══ */

const _inflight = new Map<string, Promise<number | null>>();

async function fetchAssetDownloadCount(t: GithubReleaseTarget): Promise<number | null> {
  const hit = readCachedCount(t);
  if (hit !== undefined) return hit;
  const key = cacheKey(t);
  const existing = _inflight.get(key);
  if (existing) return existing;
  const p = doFetchAsset(t).finally(() => _inflight.delete(key));
  _inflight.set(key, p);
  return p;
}

async function doFetchAsset(t: GithubReleaseTarget): Promise<number | null> {
  const api = `https://api.github.com/repos/${encodeURIComponent(t.owner)}/${encodeURIComponent(
    t.repo,
  )}/releases/tags/${encodeURIComponent(t.tag)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DL_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(api, {
      headers: { Accept: "application/vnd.github+json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { assets?: Array<{ name?: string; download_count?: number }> };
    if (!Array.isArray(json.assets)) return null;
    const asset = json.assets.find((a) => a?.name === t.filename);
    const n = typeof asset?.download_count === "number" ? asset.download_count : undefined;
    if (n === undefined) return null;
    writeCachedCount(t, n);
    return n;
  } catch {
    return null; // 断网/超时 → 不显示（诚实）
  } finally {
    clearTimeout(timer);
  }
}

/* ═══ React hook ═══ */

/**
 * 订阅单资产下载数——downloadUrl 变化即解析+拉取。返回：
 *   hidden  = 非 github 资产形态 / 拉取失败（不显示）
 *   loading = 拉取中（详情页不发空位，仅瞬态）
 *   ready   = count 就绪
 */
export function useDownloadCount(downloadUrl?: string): DownloadCountState {
  const [state, setState] = useState<DownloadCountState>(
    downloadUrl ? { status: "loading" } : { status: "hidden" },
  );

  useEffect(() => {
    const target = parseGithubReleaseDownloadUrl(downloadUrl);
    if (!target) {
      setState({ status: "hidden" });
      return;
    }
    const cached = readCachedCount(target);
    if (cached !== undefined) {
      setState({ status: "ready", count: cached });
      return;
    }
    let alive = true;
    setState({ status: "loading" });
    void fetchAssetDownloadCount(target).then((n) => {
      if (!alive) return;
      if (n !== null) setState({ status: "ready", count: n });
      else setState({ status: "hidden" });
    });
    return () => {
      alive = false;
    };
  }, [downloadUrl]);

  return state;
}
