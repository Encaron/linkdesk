/**
 * fetch — **单源**拉取（5min fresh 缓存 → fetch → parse 校验 → stale 兜底）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketSources.ts` 原样搬出，零行为变更。
 *
 * 缓存态读写归 `io.ts`（模块级 mutable 状态的唯一属主）；本文件只编排「一次拉取怎么走」。
 */

import { OFFICIAL_SOURCE_URL, parseCatalog, sourceNameOfUrl } from "../marketCatalog";
import { CACHE_TTL_MS, injectedFetch, readCache, writeCache } from "./io";
import type { SourceResult } from "./types";

async function fetchText(url: string): Promise<string> {
  const injected = injectedFetch();
  if (injected) return injected(url);
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

export async function fetchOne(url: string, force: boolean): Promise<SourceResult> {
  const sourceName = sourceNameOfUrl(url);
  const official = url === OFFICIAL_SOURCE_URL;
  const cached = readCache(url);
  const withinTtl = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;

  // 5min fresh 命中 → 直接交付缓存（01 §四：先读缓存；手动刷新由 force 显式绕过）
  if (cached && withinTtl && !force) {
    return { sourceName, official, text: cached.text, fresh: true, staleFallback: false };
  }

  let text: string;
  try {
    text = await fetchText(url);
  } catch {
    // 网络失败 → stale 缓存兜底；无缓存 = 该源不可达
    if (cached) return { sourceName, official, text: cached.text, fresh: false, staleFallback: true };
    return { sourceName, official, reason: "network" };
  }

  if (isParseable(text)) {
    writeCache(url, text); // 实时内容写入缓存（含 force 重写）
    return { sourceName, official, text, fresh: true, staleFallback: false };
  }

  // parse 失败 → stale 缓存兜底；无缓存 = 该源目录损坏
  if (cached) return { sourceName, official, text: cached.text, fresh: false, staleFallback: true };
  return { sourceName, official, reason: "parse" };
}
