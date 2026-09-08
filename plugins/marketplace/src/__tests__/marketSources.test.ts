/**
 * marketSources 目录运行时拉取域单测——E6#30a 5min 缓存 / #30c 多源合并去重 / #30f 目录防御。
 * IO 全注入（fetch / localStorage / window.linkdesk.configuration），零网络零真实存储。
 * fixture 全虚构（硬约束 21）：demo-* 插件、owner-two/catalog-repo-b 作者源仓库。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadCatalog, forceRefreshCatalog, getSourceUrls, readConfiguredAuthorSources, __setCatalogIO } from "../services/marketSources";
import { OFFICIAL_SOURCE_URL } from "../services/marketCatalog";
import type { FetchFn, StorageLike } from "../services/marketSources";

/** 作者源 raw marketplace.json 直链（虚构仓库） */
const AUTHOR_URL = "https://raw.githubusercontent.com/owner-two/catalog-repo-b/main/marketplace.json";
const OFFICIAL_NAME = "encaron/linkdesk-marketplace";
const AUTHOR_NAME = "owner-two/catalog-repo-b";
const CACHE_PREFIX = "ldk-market-catalog:v1:";

/* ── fixture 生成（全虚构） ── */

function entry(id: string, version: string): Record<string, string> {
  return { id, name: `Demo ${id}`, version, downloadUrl: `https://example.invalid/releases/${id}-${version}.linkdesk-plugin` };
}
function catalogText(...plugins: Array<Record<string, string>>): string {
  return JSON.stringify({ version: "1", updatedAt: "2026-09-01T00:00:00Z", plugins });
}

/* ── IO 替身 ── */

function fakeStorage(seed?: Map<string, string>): StorageLike & { map: Map<string, string> } {
  const map = seed ?? new Map<string, string>();
  return {
    map,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function cacheKey(url: string): string {
  return CACHE_PREFIX + url;
}
/** 预置过期（stale）缓存——fetchedAt 在 TTL 之外 */
function seedStale(storage: StorageLike & { map: Map<string, string> }, url: string, text: string): void {
  storage.map.set(cacheKey(url), JSON.stringify({ fetchedAt: Date.now() - 6 * 60 * 1000, text }));
}

/** 配置面替身——configuration.get 返回配置的 marketplaceSources（undefined = 官方源缺省） */
function stubConfig(sources?: string[]): void {
  const cfg = {
    configuration: {
      get: vi.fn(async () => sources),
    },
  };
  Object.defineProperty(window, "linkdesk", { value: cfg, configurable: true });
}

describe("marketSources (E6#30a/30c/30f)", () => {
  beforeEach(() => {
    stubConfig(); // 缺省：仅官方源
  });
  afterEach(() => {
    __setCatalogIO(null, null);
    // 还原 window.linkdesk 为未定义（jsdom 无 preload 注入）
    Reflect.deleteProperty(window, "linkdesk");
  });

  /* ── getSourceUrls（#30c 官方恒在 + 配置作者源） ── */

  it("getSourceUrls：官方源恒在，配置作者源排官方后", async () => {
    stubConfig([AUTHOR_URL, "https://github.com/owner-three/catalog-repo-c"]);
    const urls = await getSourceUrls();
    expect(urls[0]).toBe(OFFICIAL_SOURCE_URL);
    expect(urls[1]).toBe(AUTHOR_URL); // 已直链作者源原样收
    expect(urls[2]).toBe("https://raw.githubusercontent.com/owner-three/catalog-repo-c/HEAD/marketplace.json"); // repo 主页归一
    expect(urls).toHaveLength(3);
  });

  it("getSourceUrls：配置含官方重复/垃圾值 → 去重且跳过", async () => {
    stubConfig([OFFICIAL_SOURCE_URL, "", "  ", "not-a-url"]);
    const urls = await getSourceUrls();
    expect(urls).toEqual([OFFICIAL_SOURCE_URL]);
  });

  /* ── 官方身份回归（E6#30c——owner/repo 分支无关，修仓库主页形态官方漏判） ── */

  it("getSourceUrls：配置官方仓库主页形态 → 不二次拉取（只官方 main 一次）", async () => {
    stubConfig(["https://github.com/encaron/linkdesk-marketplace"]);
    const urls = await getSourceUrls();
    expect(urls).toEqual([OFFICIAL_SOURCE_URL]); // 仓库主页官方身份与 main 直链同一源 → 滤除
  });

  it("getSourceUrls：配置官方 HEAD 直链形态 → 不二次拉取", async () => {
    stubConfig(["https://raw.githubusercontent.com/encaron/linkdesk-marketplace/HEAD/marketplace.json"]);
    const urls = await getSourceUrls();
    expect(urls).toEqual([OFFICIAL_SOURCE_URL]);
  });

  it("getSourceUrls：官方其他形态 + 真作者源并存 → 只官方 main + 作者源", async () => {
    stubConfig(["https://github.com/encaron/linkdesk-marketplace", AUTHOR_URL]);
    const urls = await getSourceUrls();
    expect(urls).toEqual([OFFICIAL_SOURCE_URL, AUTHOR_URL]);
  });

  it("readConfiguredAuthorSources：官方仓库主页形态不入作者列表（残留滤除）", async () => {
    stubConfig(["https://github.com/encaron/linkdesk-marketplace", AUTHOR_URL]);
    const authors = await readConfiguredAuthorSources();
    expect(authors).toEqual([AUTHOR_URL]);
  });

  it("readConfiguredAuthorSources：纯官方残留 → 空作者列表", async () => {
    stubConfig(["https://github.com/encaron/linkdesk-marketplace"]);
    expect(await readConfiguredAuthorSources()).toEqual([]);
  });

  it("readConfiguredAuthorSources：作者源同仓库多形态按身份去重、保留首个原始形态", async () => {
    stubConfig(["https://github.com/owner-two/catalog-repo-b", AUTHOR_URL]);
    expect(await readConfiguredAuthorSources()).toEqual(["https://github.com/owner-two/catalog-repo-b"]);
  });

  /* ── 拉取 + 5min 缓存（#30a） ── */

  it("实时拉取成功 → ok + 缓存写入；5min 内二次 loadCatalog 走缓存不再 fetch", async () => {
    const fetchFn: FetchFn = vi.fn(async (url) => {
      if (url === OFFICIAL_SOURCE_URL) return catalogText(entry("demo-alpha", "1.2.0"));
      throw new Error("unexpected url");
    });
    const storage = fakeStorage();
    __setCatalogIO(fetchFn, storage);

    const first = await loadCatalog();
    expect(first.state).toBe("ok");
    expect(first.entries).toHaveLength(1);
    expect(first.entries[0]).toMatchObject({ id: "demo-alpha", version: "1.2.0" });
    expect(first.usedStale).toBe(false);
    expect(storage.map.has(cacheKey(OFFICIAL_SOURCE_URL))).toBe(true);

    const fetchCalls = (fetchFn as ReturnType<typeof vi.fn>).mock.calls.length;
    const second = await loadCatalog();
    expect(second.entries).toHaveLength(1); // 命中缓存仍有数据
    expect((fetchFn as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCalls); // 未再 fetch
  });

  it("forceRefreshCatalog 跳过 fresh 缓存强制重拉 + 重写缓存", async () => {
    let served = catalogText(entry("demo-alpha", "1.0.0"));
    const fetchFn = vi.fn(async () => served);
    const storage = fakeStorage();
    __setCatalogIO(fetchFn, storage);

    const first = await loadCatalog();
    expect(first.entries[0].version).toBe("1.0.0");
    served = catalogText(entry("demo-alpha", "1.1.0")); // 服务器内容更新
    const refreshed = await forceRefreshCatalog();
    expect(refreshed.entries[0].version).toBe("1.1.0");
    expect((fetchFn as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  /* ── 目录防御（#30f） ── */

  it("单源网络失败 + 无缓存 → offline + 该源 error", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.state).toBe("offline");
    expect(r.entries).toEqual([]);
    expect(r.errors).toEqual([{ sourceName: OFFICIAL_NAME, reason: "network" }]);
  });

  it("网络失败 + 有 stale 缓存 → 缓存兜底交付，usedStale=true，state 仍 ok", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("timeout");
    });
    const storage = fakeStorage();
    seedStale(storage, OFFICIAL_SOURCE_URL, catalogText(entry("demo-alpha", "1.0.0")));
    __setCatalogIO(fetchFn, storage);
    const r = await loadCatalog();
    expect(r.state).toBe("ok");
    expect(r.entries[0].id).toBe("demo-alpha");
    expect(r.usedStale).toBe(true);
  });

  it("单源 parse 失败 + 无缓存 → corrupt", async () => {
    const fetchFn = vi.fn(async () => "<html>not json</html>");
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.state).toBe("corrupt");
    expect(r.entries).toEqual([]);
    expect(r.errors).toEqual([{ sourceName: OFFICIAL_NAME, reason: "parse" }]);
  });

  it("parse 失败 + 有 stale 缓存 → 缓存兜底交付，usedStale=true", async () => {
    const fetchFn = vi.fn(async () => "garbage{");
    const storage = fakeStorage();
    seedStale(storage, OFFICIAL_SOURCE_URL, catalogText(entry("demo-alpha", "1.0.0")));
    __setCatalogIO(fetchFn, storage);
    const r = await loadCatalog();
    expect(r.state).toBe("ok");
    expect(r.entries).toHaveLength(1);
    expect(r.usedStale).toBe(true);
  });

  /* ── 多源（#30c） ── */

  it("多源合并去重：作者源更高版本胜出 + sourceName 标注作者", async () => {
    stubConfig([AUTHOR_URL]);
    const fetchFn = vi.fn(async (url: string) =>
      url === OFFICIAL_SOURCE_URL ? catalogText(entry("demo-alpha", "1.0.0")) : catalogText(entry("demo-alpha", "1.2.0")),
    );
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.state).toBe("ok");
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ version: "1.2.0", sourceName: AUTHOR_NAME });
    expect(r.sourceNames).toEqual([OFFICIAL_NAME, AUTHOR_NAME]);
  });

  it("单源失败不阻塞他源：官方 ok + 作者源不可达 → ok，errors 记作者源", async () => {
    stubConfig([AUTHOR_URL]);
    const fetchFn = vi.fn(async (url: string) => {
      if (url === OFFICIAL_SOURCE_URL) return catalogText(entry("demo-alpha", "1.0.0"));
      throw new Error("refused");
    });
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.state).toBe("ok");
    expect(r.entries).toHaveLength(1);
    expect(r.errors).toEqual([{ sourceName: AUTHOR_NAME, reason: "network" }]);
  });

  it("官方不可达但有 stale 缓存 + 作者源实时 ok → 两源条目都合并（缓存不阻断）", async () => {
    stubConfig([AUTHOR_URL]);
    const storage = fakeStorage();
    seedStale(storage, OFFICIAL_SOURCE_URL, catalogText(entry("demo-alpha", "1.0.0")));
    const fetchFn = vi.fn(async (url: string) => {
      if (url === AUTHOR_URL) return catalogText(entry("demo-beta", "2.0.0"));
      throw new Error("refused"); // 官方网络失败
    });
    __setCatalogIO(fetchFn, storage);
    const r = await loadCatalog();
    expect(r.state).toBe("ok");
    const ids = r.entries.map((e) => e.id).sort();
    expect(ids).toEqual(["demo-alpha", "demo-beta"]);
    expect(r.usedStale).toBe(true);
  });

  /* ── 数据形状完整性 ── */

  it("返回条目含来源标注、fetchedAt 毫秒时间戳", async () => {
    const fetchFn = vi.fn(async () => catalogText(entry("demo-alpha", "1.2.0")));
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.entries[0].sourceName).toBe(OFFICIAL_NAME);
    expect(r.fetchedAt).toBeGreaterThan(0);
    expect(typeof r.fetchedAt).toBe("number");
  });

  /* ── 官方身份随源携带（E6#30.8f 官方徽标数据源） ── */

  it("仅官方源 → 条目 official=true", async () => {
    const fetchFn = vi.fn(async () => catalogText(entry("demo-alpha", "1.0.0")));
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.entries[0].official).toBe(true);
  });

  it("多源：官方条目 official=true、仅作者源独有条目不带官方身份", async () => {
    stubConfig([AUTHOR_URL]);
    const fetchFn = vi.fn(async (url: string) =>
      url === OFFICIAL_SOURCE_URL
        ? catalogText(entry("demo-official", "1.0.0"))
        : catalogText(entry("demo-author-only", "1.0.0")),
    );
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    const officialEntry = r.entries.find((e) => e.id === "demo-official");
    const authorEntry = r.entries.find((e) => e.id === "demo-author-only");
    expect(officialEntry?.official).toBe(true);
    expect(authorEntry?.official).toBeFalsy();
    expect(authorEntry?.sourceName).toBe(AUTHOR_NAME);
  });

  it("官方源走缓存命中 → official 身份不丢（fetchOne 各返回路径一致携带）", async () => {
    const fetchFn = vi.fn(async () => catalogText(entry("demo-alpha", "1.0.0")));
    const storage = fakeStorage();
    __setCatalogIO(fetchFn, storage);
    await loadCatalog(); // 实时 → 写缓存
    const r2 = await loadCatalog(); // 5min fresh 命中
    expect(r2.entries[0].official).toBe(true);
    expect((fetchFn as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});
