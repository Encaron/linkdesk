/**
 * io — 目录域的**全部 IO 与模块级可变状态**（注入点 + localStorage 缓存）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketSources.ts` 原样搬出，零行为变更。
 *
 * 🔴 本文件是 `_fetchFn` / `_storage` 的**唯一属主**（0d.10-8「模块级 mutable 状态各归单域属主」）——
 * `fetch.ts` 要走注入 fetcher 只经 `injectedFetch()`，不许另存一份（另存 = 测试注入失效 + 双真相源）。
 *
 * localStorage 缓存（IO 不可用时静默退化为零缓存——每次拉取）。
 */

import type { FetchFn, StorageLike } from "./types";

let _fetchFn: FetchFn | null = null;
let _storage: StorageLike | null = null;

/** 测试注入 fetcher / storage；传 null 恢复默认（fetch + localStorage） */
export function __setCatalogIO(fetchFn: FetchFn | null, storage: StorageLike | null): void {
  _fetchFn = fetchFn;
  _storage = storage;
}

/** 注入的 fetcher（未注入 = null，调用方回落真实 `fetch`） */
export function injectedFetch(): FetchFn | null {
  return _fetchFn;
}

export const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_PREFIX = "ldk-market-catalog:v1:";

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

export function readCache(url: string): CacheEntry | null {
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

export function writeCache(url: string, text: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(CACHE_PREFIX + url, JSON.stringify({ fetchedAt: Date.now(), text } satisfies CacheEntry));
  } catch {
    /* 满/禁用 → 缓存失败不阻塞（本次已交付，下次重拉） */
  }
}

export function removeCache(url: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(CACHE_PREFIX + url);
  } catch {
    /* ignore */
  }
}

export type { CacheEntry };
