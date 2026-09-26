/**
 * update-release-notes 取数腿单测——E6#57.8e。
 *
 * mock electron（`net.fetch` 转调 hoist 时抓下的原始 fetch ⇒ 本地 http 服务真发包）——
 * 即「真出网出口 + 真 HTTP 响应 + 真缓存文件」，只有 GitHub 那一头换成本地服务（同 `update-source.test.ts`）。
 *
 * 逐条对判据（本格的清单格「验证」行）：
 *   1. 取数四条——网络成功（字段逐条）/ 24h 内不出网 / 过期重出网 / 网挂兜底 / 网挂**且**无缓存才抛
 *   2. 🔴 **第二失效判据**——缓存新鲜但**不含所请求的那一版** ⇒ 仍然出网（只按 24h 判会给
 *      刚更新完的用户看上一版的说明，首启自动弹正是这个场景）
 *   3. 选版两条——点名命中 / 点名未命中回落（且返回体暴露这个事实）
 *   4. 列表清洗——预发布与草稿不进；**非 SemVer 的 tag 不丢**（排末尾）
 *   5. 归因复用共用表——403 → rate-limited（不另立一套）
 *   6. 缓存本身**不是正确性的一环**——写不进去照样返回数据；坏缓存当作没有缓存
 *
 * fixture 全部虚构（版本 `2.0.0`/`2.1.0`/`2.2.0`、域名 `example.invalid`——硬约束 21）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as http from "node:http";

// 🔴 共享桩必须先于 SUT import（见 electron-mock.ts 头注「纪律」）
import { electronMock } from "./electron-mock.js";

import { fetchReleaseNotes, type ReleaseNotesDeps } from "./update-release-notes.js";
import { UpdateLegError } from "./update-service.js";
import { __resetProductCache } from "../product.js";

const NEWEST = "2.2.0";
const MIDDLE = "2.1.0";
const OLDEST = "2.0.0";
/** 非 SemVer 的 tag——发布侧打错的那种（本仓历史上真有 `e5-start` 这类） */
const ODD_TAG = "nightly-2026.09";

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-09-13T00:00:00Z");

/** 一条 Release——各用例按需改字段 */
function release(version: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tag_name: `v${version}`,
    published_at: "2026-09-12T00:00:00Z",
    html_url: `https://example.invalid/releases/tag/v${version}`,
    body: `## v${version}\n\n- 虚构变更`,
    prerelease: false,
    draft: false,
    ...over,
  };
}

/** 三条历史的「正常」响应——NEWEST/MIDDLE/OLDEST（API 本来就是倒序） */
const THREE_RELEASES = [release(NEWEST), release(MIDDLE), release(OLDEST)];

// ─────────────────────────── 本地 http 服务（真发包 + 记请求） ───────────────────────────

interface Answer {
  status?: number;
  body?: unknown;
  /** 直接发原文（测「2xx 但不是 JSON」）——优先于 body */
  raw?: string;
}

interface Server {
  /** 更新源 URL（检查腿那种带 `/latest` 的形态）——取数腿要自己推出列表端点 */
  updateUrl: string;
  /** 收到的请求路径（含 query）——钉 URL 推导与「这一趟到底有没有出网」 */
  requests: string[];
  close: () => Promise<void>;
}

/**
 * 起服务：**记下每个请求**、按**队列**依次作答（队列空了答 500——「用例没打算的第二次出网」
 * 会当场以失败暴露，而不是悄悄拿到一份陈旧数据当作通过）。
 */
async function startServer(answers: Answer[]): Promise<Server> {
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url ?? "");
    const a = answers.shift() ?? { status: 500, body: {} };
    const payload = a.raw ?? JSON.stringify(a.body ?? {});
    res.writeHead(a.status ?? 200, {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(payload)),
    });
    res.end(payload);
  });
  const origin = await new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(`http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`);
    });
  });
  return {
    updateUrl: `${origin}/releases/latest`,
    requests,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}

/** 真·断网：起一个再关掉 ⇒ 该端口确定无监听（比赌某个固定端口可靠） */
async function deadUpdateUrl(): Promise<string> {
  const srv = await startServer([]);
  await srv.close();
  return srv.updateUrl;
}

// ─────────────────────────── 落地现场 ───────────────────────────

/** 宿目录（缓存与身份文件都建在它下面） */
let root: string;
/** 注入给取数腿的缓存目录（= 生产里的 `{userData}/update`） */
let cacheDir: string;
/** 当前时间——24h 过期那两条靠它推进，**不真等也不上假定时器**（见 `ReleaseNotesDeps.now` 头注） */
let clock: number;

const cacheFile = (): string => path.join(cacheDir, "releases-cache.json");

/** 读盘上的缓存——「写没写进去 / 写进去了什么」断言用（读不出就失败，比 `as` 强转更能指出问题） */
function readCacheFile(): { fetchedAt: string; releases: { version: string }[] } {
  const parsed: unknown = JSON.parse(fs.readFileSync(cacheFile(), "utf8"));
  if (typeof parsed !== "object" || parsed === null) throw new Error("缓存文件不是对象");
  return parsed as { fetchedAt: string; releases: { version: string }[] };
}

/** 造腿——除 URL 外全走生产默认值（目录/时间注入由 `opts` 给） */
function makeDeps(updateUrl: string, over: ReleaseNotesDeps = {}): ReleaseNotesDeps {
  return { getUpdateUrl: () => updateUrl, getCacheDir: () => cacheDir, now: () => clock, ...over };
}

/** 起服务 → 跑一次腿 → 收摊（把「起/关」样板从每个用例里消掉；抛错照常往外传） */
async function fetchOnce(
  answers: Answer[],
  opts: { version?: string; deps?: (url: string) => ReleaseNotesDeps } = {},
): Promise<{ notes: Awaited<ReturnType<typeof fetchReleaseNotes>>; requests: string[] }> {
  const server = await startServer(answers);
  try {
    const deps = opts.deps ? opts.deps(server.updateUrl) : makeDeps(server.updateUrl);
    const notes = await fetchReleaseNotes(opts.version, deps);
    return { notes, requests: server.requests };
  } finally {
    await server.close();
  }
}

/** 抽出 `UpdateLegError` 的码（不是它就直接失败——比 `as` 强转更能指出「抛错类型不对」） */
async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof UpdateLegError) return e.detail.code;
    throw new Error(`期望 UpdateLegError，实得 ${String(e)}`);
  }
  throw new Error("期望抛出，实得成功返回");
}

beforeEach(async () => {
  electronMock.netFetchCalls.length = 0;
  root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "update-notes-"));
  cacheDir = path.join(root, "update");
  clock = T0;
});

afterEach(async () => {
  await fs.promises.rm(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ─────────────────────────── 1. 出网：字段 + URL 推导 ───────────────────────────

describe("取数成功——字段逐条 + 列表端点由 updateUrl 推出", () => {
  it("返回最近一版的正文 + 全部历史；请求打到 `/releases?per_page=30`（**不是** `/latest`）", async () => {
    const { notes, requests } = await fetchOnce([{ body: THREE_RELEASES }]);

    expect(notes.source).toBe("network");
    expect(notes.version).toBe(NEWEST);
    expect(notes.publishedAt).toBe("2026-09-12T00:00:00Z");
    expect(notes.body).toContain("虚构变更");
    expect(notes.htmlUrl).toBe(`https://example.invalid/releases/tag/v${NEWEST}`);
    expect(notes.historical.map((h) => h.version)).toEqual([NEWEST, MIDDLE, OLDEST]);

    // 🔴 列表端点由 `updateUrl` 去掉 `/latest` 推出来——硬编码仓库地址就是第二处真值源
    // （仓库名改过一次：serial-v3 → linkdesk；两处漂了 = 「检查能用、说明 404」的分裂）
    expect(requests).toEqual(["/releases?per_page=30"]);
  });

  it("缓存落盘：形状合法、`fetchedAt` = 注入的当前时间", async () => {
    await fetchOnce([{ body: THREE_RELEASES }]);
    const cache = readCacheFile();
    expect(new Date(cache.fetchedAt).getTime()).toBe(T0);
    expect(cache.releases.map((r) => r.version)).toEqual([NEWEST, MIDDLE, OLDEST]);
  });
});

// ─────────────────────────── 2. 两条失效判据 ───────────────────────────

describe("🔴 失效判据两条（24h ＋「含不含所请求的那一版」）", () => {
  it("24h 内第二次调用：**不出网**、source=cache（先把缓存喂上，再把网掐掉）", async () => {
    const first = await startServer([{ body: THREE_RELEASES }]);
    await fetchReleaseNotes(undefined, makeDeps(first.updateUrl));
    await first.close(); // 网没了——此时若还出网，这条用例会红

    const again = await fetchReleaseNotes(undefined, makeDeps(first.updateUrl));
    expect(again.source).toBe("cache");
    expect(again.version).toBe(NEWEST);
    expect(again.historical).toHaveLength(3);
  });

  it("过了 24h：重新出网、source=network（把过期判据删掉这条必红）", async () => {
    const server = await startServer([{ body: THREE_RELEASES }, { body: [release("2.3.0")] }]);
    try {
      await fetchReleaseNotes(undefined, makeDeps(server.updateUrl));
      clock += DAY_MS + 1; // 刚过线
      const fresh = await fetchReleaseNotes(undefined, makeDeps(server.updateUrl));

      expect(server.requests).toHaveLength(2); // 真出了第二趟
      expect(fresh.source).toBe("network");
      expect(fresh.version).toBe("2.3.0");
    } finally {
      await server.close();
    }
  });

  it("🔴 缓存才 1 分钟、但**不含所请求的那一版** ⇒ 仍然出网（否则刚更新完的用户看到的是上一版的说明）", async () => {
    const server = await startServer([{ body: THREE_RELEASES }, { body: [release("2.9.9"), ...THREE_RELEASES] }]);
    try {
      await fetchReleaseNotes(NEWEST, makeDeps(server.updateUrl)); // 缓存里只有到 2.2.0
      clock += 60_000; // 远在 24h 之内——只按 24h 判的实现会在这里发不出去网

      const notes = await fetchReleaseNotes("2.9.9", makeDeps(server.updateUrl));

      expect(server.requests).toHaveLength(2);
      expect(notes.source).toBe("network");
      expect(notes.version).toBe("2.9.9");
    } finally {
      await server.close();
    }
  });

  it("缓存**含**所请求的那一版且没过期 ⇒ 不出网（正控：上一条不是「凡点名就出网」）", async () => {
    const first = await startServer([{ body: THREE_RELEASES }]);
    await fetchReleaseNotes(undefined, makeDeps(first.updateUrl));
    await first.close();

    const notes = await fetchReleaseNotes(MIDDLE, makeDeps(first.updateUrl));
    expect(notes.source).toBe("cache");
    expect(notes.version).toBe(MIDDLE);
  });
});

// ─────────────────────────── 2b. force（04「发行说明刷新按钮」） ───────────────────────────

describe("force——绕过缓存命中短路现拉，两条铁律不变", () => {
  it("缓存**新鲜** + force ⇒ 仍然出网、source=network（跳过 24h 与「含不含那版」整条短路）", async () => {
    const server = await startServer([{ body: THREE_RELEASES }, { body: [release("2.3.0"), ...THREE_RELEASES] }]);
    try {
      await fetchReleaseNotes(undefined, makeDeps(server.updateUrl));
      // 时钟一毫秒没走——缓存新鲜得很，force 也必须真出第二趟（刷新按钮的正控）
      const fresh = await fetchReleaseNotes(undefined, { ...makeDeps(server.updateUrl), force: true });

      expect(server.requests).toHaveLength(2);
      expect(fresh.source).toBe("network");
      expect(fresh.version).toBe("2.3.0");
    } finally {
      await server.close();
    }
  });

  it("force 成功仍写缓存：`fetchedAt` 刷成本次时间（铁律③），下次**不带** force 走缓存", async () => {
    const server = await startServer([{ body: THREE_RELEASES }, { body: THREE_RELEASES }]);
    try {
      await fetchReleaseNotes(undefined, makeDeps(server.updateUrl));
      clock += 60_000;
      await fetchReleaseNotes(undefined, { ...makeDeps(server.updateUrl), force: true });

      const cache = readCacheFile();
      expect(new Date(cache.fetchedAt).getTime()).toBe(T0 + 60_000);
      expect(cache.releases.map((r) => r.version)).toEqual([NEWEST, MIDDLE, OLDEST]);
    } finally {
      await server.close();
    }
  });

  it("force 失败 + 有缓存 ⇒ 兜底 source=cache 且**不回写** `fetchedAt`（铁律④）", async () => {
    const first = await startServer([{ body: THREE_RELEASES }]);
    await fetchReleaseNotes(undefined, makeDeps(first.updateUrl));
    const before = readCacheFile().fetchedAt;
    await first.close(); // 网没了——force 也拉不到

    const notes = await fetchReleaseNotes(undefined, { ...makeDeps(first.updateUrl), force: true });
    expect(notes.source).toBe("cache");
    expect(readCacheFile().fetchedAt).toBe(before); // 一次断网不许把 24h 续命成永久
  });
});

// ─────────────────────────── 3. 失败兜底 ───────────────────────────

describe("失败 ⇒ 缓存兜底；无缓存才抛（07 §4.1）", () => {
  it("网挂 + 有缓存 ⇒ source=cache，**且不刷新 `fetchedAt`**（一次断网不许把 24h 续命成永久）", async () => {
    const server = await startServer([{ body: THREE_RELEASES }]);
    await fetchReleaseNotes(undefined, makeDeps(server.updateUrl));
    const before = readCacheFile().fetchedAt;
    await server.close();

    clock += DAY_MS + 1; // 已过期 ⇒ 走网络 ⇒ 网络已死 ⇒ 兜底
    const notes = await fetchReleaseNotes(undefined, makeDeps(server.updateUrl));

    expect(notes.source).toBe("cache");
    expect(readCacheFile().fetchedAt).toBe(before); // ← 没被刷新
  });

  it("网挂 + **无**缓存 ⇒ 抛 `UpdateLegError`，码 = network（不许静默返回空列表）", async () => {
    const url = await deadUpdateUrl();
    expect(await codeOf(fetchReleaseNotes(undefined, makeDeps(url)))).toBe("network");
  });

  it("缓存文件坏掉（截断的 JSON）⇒ 当作**没有缓存**：抛，而不是崩、也不是当成空历史", async () => {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile(), '{"fetchedAt":"2026-09-13T00:00:00Z","releases":[{"ver');
    const url = await deadUpdateUrl();

    expect(await codeOf(fetchReleaseNotes(undefined, makeDeps(url)))).toBe("network");
  });

  it("缓存时间戳读不出来 ⇒ 当作没有缓存（`fetchedAt` 是过期的唯一判据来源，读不出就无法判断它多旧）", async () => {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      cacheFile(),
      JSON.stringify({ fetchedAt: "不是时间", releases: [{ version: NEWEST, publishedAt: "x", body: "x", htmlUrl: "x" }] }),
    );
    const url = await deadUpdateUrl();

    expect(await codeOf(fetchReleaseNotes(undefined, makeDeps(url)))).toBe("network");
  });
});

// ─────────────────────────── 4. 选版 ───────────────────────────

describe("选版", () => {
  it("点名存在的版本 ⇒ 给那一版的正文（不出网）", async () => {
    const { notes } = await fetchOnce([{ body: THREE_RELEASES }], { version: MIDDLE });
    expect(notes.version).toBe(MIDDLE);
    expect(notes.body).toContain(`v${MIDDLE}`);
  });

  it("点名**不存在**的版本 ⇒ 回落最近一版，且返回体暴露这个事实（`version` ≠ 请求的那个）", async () => {
    const { notes } = await fetchOnce([{ body: THREE_RELEASES }], { version: "9.9.9" });
    expect(notes.version).toBe(NEWEST);
    expect(notes.version).not.toBe("9.9.9");
  });

  it("不点名 ⇒ 最近一版（`v` 前缀输入也认）", async () => {
    const { notes } = await fetchOnce([{ body: THREE_RELEASES }], { version: `v${OLDEST}` });
    expect(notes.version).toBe(OLDEST);
  });
});

// ─────────────────────────── 5. 列表清洗 ───────────────────────────

describe("列表清洗", () => {
  it("预发布与草稿不进历史——**两种信号都看**（旗标 + tag 自带 `-beta`）", async () => {
    const { notes } = await fetchOnce([
      {
        body: [
          release(NEWEST),
          release("2.3.0-beta.1"), // tag 自带预发布段，但旗标是 false
          release("2.4.0", { prerelease: true }), // 旗标为真
          release("2.5.0", { draft: true }),
        ],
      },
    ]);
    expect(notes.historical.map((h) => h.version)).toEqual([NEWEST]);
    expect(notes.version).toBe(NEWEST); // 最近那一版不许是预发布
  });

  it("🔴 非 SemVer 的 tag **不丢**，排在末尾且**不会**成为默认展示的那一版", async () => {
    const { notes } = await fetchOnce([{ body: [release(OLDEST), release(ODD_TAG)] }]);
    expect(notes.historical.map((h) => h.version)).toEqual([OLDEST, ODD_TAG]);
    expect(notes.version).toBe(OLDEST);
  });

  it("缺字段的条目丢掉（一条不合法不许拖垮整份历史）", async () => {
    const { notes } = await fetchOnce([{ body: [release(NEWEST), { tag_name: "v2.3.0" }, null, "垃圾"] }]);
    expect(notes.historical.map((h) => h.version)).toEqual([NEWEST]);
  });

  it("响应不是数组 / 数组里一条都解析不出 ⇒ invalid-response（不许当成「历史是空的」）", async () => {
    expect(await codeOf(fetchOnce([{ body: { message: "Not Found" } }]).then((r) => r.notes))).toBe("invalid-response");
    expect(await codeOf(fetchOnce([{ body: [null, 42] }]).then((r) => r.notes))).toBe("invalid-response");
  });

  it("2xx 但不是 JSON ⇒ invalid-response（GitHub 异常页 / 认证中间盒）", async () => {
    const server = await startServer([{ raw: "<html>nope</html>" }]);
    try {
      const p = fetchReleaseNotes(undefined, makeDeps(server.updateUrl));
      expect(await codeOf(p)).toBe("invalid-response");
    } finally {
      await server.close();
    }
  });
});

// ─────────────────────────── 6. 状态码归因（复用共用表） ───────────────────────────

describe("状态码归因——复用 `update-http.ts` 那一张表，不另立一套", () => {
  it("403 ⇒ rate-limited（GitHub 用 403 表达限流）", async () => {
    expect(await codeOf(fetchOnce([{ status: 403, body: {} }]).then((r) => r.notes))).toBe("rate-limited");
  });

  it("404 ⇒ not-found；500 ⇒ network（就近而非准确，理由在共用表的注释里）", async () => {
    expect(await codeOf(fetchOnce([{ status: 404, body: {} }]).then((r) => r.notes))).toBe("not-found");
    expect(await codeOf(fetchOnce([{ status: 500, body: {} }]).then((r) => r.notes))).toBe("network");
  });

  it("更新源没配（空 URL）⇒ not-found，**不拿空 URL 去 fetch**（那会把「没配置」说成「网络不好」）", async () => {
    expect(await codeOf(fetchReleaseNotes(undefined, makeDeps("")))).toBe("not-found");
    expect(electronMock.netFetchCalls).toEqual([]); // 真的没出门
  });
});

// ─────────────────────────── 7. 缓存不是正确性的一环 ───────────────────────────

describe("缓存本身**不是**正确性的一环", () => {
  it("缓存目录建不出来（父路径是个文件）⇒ 照样返回数据，只是没缓存上", async () => {
    const blocker = path.join(root, "blocker");
    fs.writeFileSync(blocker, "我是文件，不是目录");
    const { notes } = await fetchOnce([{ body: THREE_RELEASES }], {
      deps: (url) => makeDeps(url, { getCacheDir: () => path.join(blocker, "update") }),
    });

    expect(notes.source).toBe("network");
    expect(notes.version).toBe(NEWEST);
  });
});

// ─────────────────────────── 8. 零注入的默认接线 ───────────────────────────

describe("零注入的默认接线（真读 product.json.updateUrl + 真落 {userData}/update）", () => {
  it("不注入 URL / 目录 / 时间——取数腿自己从 product.json 推出端点、落到 userData 下的 update/", async () => {
    const server = await startServer([{ body: THREE_RELEASES }]);
    try {
      // 造一份身份文件现场：app.getAppPath() 下的 electron/product.json
      electronMock.app.appPath = root;
      electronMock.app.userData = root; // {userData} —— updateDownloadDir() 取的就是它
      await fs.promises.mkdir(path.join(root, "electron"), { recursive: true });
      await fs.promises.writeFile(
        path.join(root, "electron", "product.json"),
        JSON.stringify({ nameLong: "Demo", nameShort: "Demo", quality: "stable", updateUrl: server.updateUrl }),
      );
      __resetProductCache();

      const notes = await fetchReleaseNotes(); // ← 零注入

      expect(notes.source).toBe("network");
      expect(server.requests).toEqual(["/releases?per_page=30"]);
      // `{userData}/update/`——与安装器同目录（见腿文件头 ①），不是 05 §2.4 原文的 `updates/`
      expect(fs.existsSync(path.join(root, "update", "releases-cache.json"))).toBe(true);
    } finally {
      await server.close();
    }
  });
});
