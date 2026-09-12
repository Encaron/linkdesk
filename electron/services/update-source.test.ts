/**
 * update-source 检查腿单测——E6#57.5。
 *
 * mock electron（`net.fetch` 转调**hoist 时抓下的**原始 fetch ⇒ 本地 http 服务真发包；
 * `app.getAppPath` 指向每个用例自建的真实临时目录，product.json / package.json 真读）——即
 * 「真出网出口 + 真身份文件 + 真 HTTP 响应」，只有 GitHub 那一头换成本地服务（plugin-download 同款）。
 *
 * 逐条对判据（清单 5.4 轮 `#57.5` 的「验证」行）：
 *   1. 🔴 **校验值取 `asset.digest` 不是 `asset.checksum`**——正例（带 digest 无 checksum ⇒ 必须拿到值）
 *      ＋ 负控（带 checksum 无 digest ⇒ 必须 `undefined`）。**这两条是全文件最贵的两条**
 *      （05-文档与发布/02-发布流水线.md §1.5.1：照名字取恒 undefined ⇒ 校验永久静默失效且不出声）。
 *   2. 有更新 → `available`（UpdateInfo 逐字段）；不比当前新 / 预发布 → `up-to-date`
 *   3. 六类失败各自归对类、**六种文案互不相同**；断网不崩（返回 error 结果，不是抛）
 *   4. asset 命名不符 → `asset-missing` **而非 network**
 *   5. 出口锁定：全局 fetch 被打断照常成功，且确实经 `net.fetch` 出门（E6#76）
 *   6. 零注入的默认接线（真读 product.json.updateUrl + package.json.name）
 * fixture 全虚构（app 名 `demo-app`、版本 `0.1.49`/`0.1.50`——硬约束 21）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as http from "node:http";

// 🔴 共享桩必须先于 SUT import（见 electron-mock.ts 头注「纪律」）
import { electronMock } from "./electron-mock.js";

import {
  createUpdateProbe,
  installerAssetName,
  isUpdateSourceConfigured,
} from "./update-source.js";
import { __resetProductCache } from "../product.js";
import type { UpdateProbeResult } from "./update-service.js";

const APP_NAME = "demo-app";
const CURRENT = "0.1.49";
const NEXT = "0.1.50";
/** 64 位 hex——形状与 GitHub `digest` 的真实值一致（`sha256:<64hex>`） */
const DIGEST_HEX = "0123456789abcdef".repeat(4);
const ASSET_NAME = `${APP_NAME}-setup-${NEXT}.exe`;
const DOWNLOAD_URL = "https://example.invalid/download/demo-app-setup-0.1.50.exe";
const PUBLISHED_AT = "2026-09-12T00:00:00Z";
const NOTES_URL = "https://example.invalid/releases/tag/v0.1.50";

/** 一份「合法且带更新」的 Releases 响应——各用例按需改字段 */
function releaseResponse(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tag_name: `v${NEXT}`,
    published_at: PUBLISHED_AT,
    html_url: NOTES_URL,
    prerelease: false,
    assets: [{ name: ASSET_NAME, size: 12345, digest: `sha256:${DIGEST_HEX}`, browser_download_url: DOWNLOAD_URL }],
    ...over,
  };
}

/** 「有更新」时 UpdateInfo 的完整期望——两个用例共用（同一份契约，不许各写一遍） */
const EXPECTED_UPDATE = {
  version: NEXT,
  currentVersion: CURRENT,
  publishedAt: PUBLISHED_AT,
  releaseNotesUrl: NOTES_URL,
  downloadUrl: DOWNLOAD_URL,
  checksum: DIGEST_HEX,
  size: 12345,
};

/** 造腿——除 URL/版本/产品名外的默认值就是生产默认值（真读 product.json / package.json） */
function makeProbe(over: Record<string, unknown> = {}) {
  return createUpdateProbe({
    getUpdateUrl: () => "http://127.0.0.1:1/unused",
    getCurrentVersion: () => CURRENT,
    getAppName: () => APP_NAME,
    ...over,
  });
}

// ─────────────────────────── 本地 http 服务（真发包） ───────────────────────────

interface ServeOpts {
  status?: number;
  body?: unknown;
  /** 直接发原文（测「2xx 但不是 JSON」）——优先于 body */
  raw?: string;
  headers?: Record<string, string>;
  /** 永不响应——测超时；收摊时由 closeAllConnections 断开 */
  hang?: boolean;
}

/** 起一个只答一次的服务，返回它的 URL 与收摊函数（socket 由 closeAllConnections 收，不留悬挂连接） */
async function serveOnce(opts: ServeOpts): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => {
    if (opts.hang) return;
    const payload = opts.raw ?? JSON.stringify(opts.body ?? {});
    res.writeHead(opts.status ?? 200, {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(payload)),
      ...opts.headers,
    });
    res.end(payload);
  });
  const url = await new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(`http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/releases/latest`);
    });
  });
  return {
    url,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}

/** 起服务 → 跑一次腿（`context: true`）→ 收摊——把「起/关」样板从每个用例里消掉 */
async function probeOnce(opts: ServeOpts, deps: Record<string, unknown> = {}): Promise<UpdateProbeResult> {
  const srv = await serveOnce(opts);
  try {
    return await makeProbe({ getUpdateUrl: () => srv.url, ...deps })(true);
  } finally {
    await srv.close();
  }
}

/** 真·断网：先占一个端口再关掉 ⇒ 该端口确定无监听（比赌某个固定端口可靠） */
async function probeDeadPort(): Promise<UpdateProbeResult> {
  const srv = await serveOnce({ body: {} });
  const deadUrl = srv.url;
  await srv.close();
  return makeProbe({ getUpdateUrl: () => deadUrl })(true);
}

/** 抽出错误结果（断言用；非 error 直接失败——比 `as` 强转更能指出「归错类了」） */
function errorOf(result: UpdateProbeResult): { code: string; message: string } {
  if (result.kind !== "error") throw new Error(`期望错误结果，实得 ${result.kind}`);
  return result.error;
}

/** 抽出可用更新的 UpdateInfo（断言用；其余 kind 直接失败） */
function updateOf(result: UpdateProbeResult) {
  if (result.kind !== "available") throw new Error(`期望 available，实得 ${result.kind}`);
  return result.update;
}

/** 身份文件目录——product.json / package.json 真读真写（loadProduct 有缓存，用前先 reset） */
let appPath: string;

beforeEach(async () => {
  electronMock.netFetchCalls.length = 0;
  appPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), "update-source-"));
  await fs.promises.mkdir(path.join(appPath, "electron"), { recursive: true });
  electronMock.app.appPath = appPath;
  __resetProductCache();
});

afterEach(async () => {
  await fs.promises.rm(appPath, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ─────────────────────────── 1. 🔴 校验值来源 ───────────────────────────

describe("🔴 校验值取 asset.digest（05-文档与发布/02-发布流水线.md §1.5.1）", () => {
  it("asset 带 digest、**不带** checksum ⇒ checksum = digest 的 hex（解析出 undefined 即红）", async () => {
    // 响应的 asset 里只有 digest——照字段名取 `asset.checksum` 的实现会拿到 undefined
    expect(updateOf(await probeOnce({ body: releaseResponse() })).checksum).toBe(DIGEST_HEX);
  });

  it("负控：只带 checksum、不带 digest ⇒ checksum = undefined（照名字取字段的实现会在这里红）", async () => {
    const body = releaseResponse({
      // 🔴 API 里没有 checksum 这个字段——照它取 = 恒「未附」= 降级放行成常态
      assets: [{ name: ASSET_NAME, size: 12345, checksum: DIGEST_HEX, browser_download_url: DOWNLOAD_URL }],
    });
    expect(updateOf(await probeOnce({ body })).checksum).toBeUndefined();
  });

  it("digest 为 null / 算法不是 sha256 / 长度不对 ⇒ 一律 undefined（真「未附」⇒ 降级放行，不把杂串当校验值）", async () => {
    for (const digest of [null, `md5:${DIGEST_HEX}`, `sha256:${DIGEST_HEX.slice(0, 32)}`]) {
      const body = releaseResponse({
        assets: [{ name: ASSET_NAME, size: 1, digest, browser_download_url: DOWNLOAD_URL }],
      });
      expect(updateOf(await probeOnce({ body })).checksum).toBeUndefined();
    }
  });
});

// ─────────────────────────── 2. 版本比对 ───────────────────────────

describe("版本比对（#57.5b）", () => {
  it("latest > current → available，UpdateInfo 逐字段来自响应", async () => {
    expect(await probeOnce({ body: releaseResponse() })).toEqual({
      kind: "available",
      update: EXPECTED_UPDATE,
    });
  });

  it("latest === current / latest < current → up-to-date（不是错误）", async () => {
    for (const tag of [`v${CURRENT}`, "v0.1.48"]) {
      expect(await probeOnce({ body: releaseResponse({ tag_name: tag }) })).toEqual({ kind: "up-to-date" });
    }
  });

  it("v 前缀被剥掉——`v0.1.50` 报给壳的版本号不带前缀", async () => {
    expect(updateOf(await probeOnce({ body: releaseResponse() })).version).toBe(NEXT);
  });

  it("🔴 预发布一律视为无更新——tag 自带 prerelease 段 / Release 旗标为 true 两路都拦", async () => {
    for (const over of [{ tag_name: "v0.1.50-beta.1" }, { prerelease: true }]) {
      // ⚠️ 若不拦：compareVersions("0.1.50-beta.1","0.1.49") > 0 ⇒ 预览版被当成正式更新推给所有人
      expect(await probeOnce({ body: releaseResponse(over) })).toEqual({ kind: "up-to-date" });
    }
  });

  it("context（手动/后台）不改变结论——本格两条路同一套取数与归类", async () => {
    const srv = await serveOnce({ body: releaseResponse() });
    try {
      const probe = makeProbe({ getUpdateUrl: () => srv.url });
      expect(await probe(true)).toEqual(await probe(false));
    } finally {
      await srv.close();
    }
  });
});

// ─────────────────────────── 3. 六类失败各自归对类 ───────────────────────────

describe("六类失败归因（#57.5c）", () => {
  it("network——连不上（端口无监听）**不崩**，返回 error 结果而不是抛", async () => {
    expect(errorOf(await probeDeadPort()).code).toBe("network");
  });

  it("network——服务不响应（超时）", async () => {
    expect(errorOf(await probeOnce({ hang: true }, { timeoutMs: 50 })).code).toBe("network");
  });

  it("rate-limited——403 / 429（GitHub 用 403 表达限流）", async () => {
    for (const status of [403, 429]) {
      expect(errorOf(await probeOnce({ status, headers: { "x-ratelimit-remaining": "0" } })).code).toBe(
        "rate-limited",
      );
    }
  });

  it("not-found——404；更新源为空串也归此类（不拿空 URL 去 fetch 说成网络不好）", async () => {
    expect(errorOf(await probeOnce({ status: 404 })).code).toBe("not-found");
    expect(errorOf(await makeProbe({ getUpdateUrl: () => "" })(true)).code).toBe("not-found");
  });

  it("invalid-response——非 JSON 响应体 / 缺 tag_name / 缺 published_at", async () => {
    const bodies: ServeOpts[] = [
      { raw: "<html>502 Bad Gateway</html>" },
      { body: releaseResponse({ tag_name: undefined }) },
      { body: releaseResponse({ published_at: undefined }) },
    ];
    for (const opts of bodies) {
      expect(errorOf(await probeOnce(opts)).code).toBe("invalid-response");
    }
  });

  it("🔴 asset-missing——Release 到手但安装包名不符（命名漂移），**不许报成 network**", async () => {
    // 大小写漂移：electron-builder 的 `${name}` 是小写 —— 这正是 T-3 真因的形状
    const body = releaseResponse({
      assets: [{ name: "Demo-App-Setup-0.1.50.exe", size: 1, digest: null, browser_download_url: DOWNLOAD_URL }],
    });
    expect(errorOf(await probeOnce({ body })).code).toBe("asset-missing");
  });

  it("asset-missing——assets 是空数组（发布了但没传安装包）", async () => {
    expect(errorOf(await probeOnce({ body: releaseResponse({ assets: [] }) })).code).toBe("asset-missing");
  });

  it("🔴 version-unparsable——`v1.0`（缺段）/ `release-0.2.0`（带前缀）与「无更新」分开报", async () => {
    for (const tag of ["v1.0", "release-0.2.0", "v0.1.50.1", "nightly"]) {
      expect(errorOf(await probeOnce({ body: releaseResponse({ tag_name: tag }) })).code).toBe(
        "version-unparsable",
      );
    }
  });

  it("🔴 六类文案互不相同（各归一半 = 找不到真因）", async () => {
    const messages = [
      errorOf(await probeOnce({ status: 404 })).message, //                        not-found
      errorOf(await probeOnce({ status: 403 })).message, //                        rate-limited
      errorOf(await probeOnce({ status: 503 })).message, //                        network
      errorOf(await probeOnce({ body: releaseResponse({ tag_name: "v1.0" }) })).message, // version-unparsable
      errorOf(await probeOnce({ body: releaseResponse({ assets: [] }) })).message, //       asset-missing
      errorOf(await probeOnce({ raw: "not json" })).message, //                     invalid-response
      errorOf(await probeDeadPort()).message, //                                    network（真·断网）
    ];
    // 503 与断网同属 network（同一条文案），其余各一条 ⇒ 去重后 6 种
    expect(new Set(messages).size).toBe(6);
  });
});

// ─────────────────────────── 4. 出口锁定（E6#76） ───────────────────────────

describe("主进程出网走 Chromium 网络栈（E6#76）", () => {
  it("全局 fetch 被打断时检查照常完成，且确实经 net.fetch 出门", async () => {
    const srv = await serveOnce({ body: releaseResponse() });
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("主进程出网腿不该直呼全局 fetch（E6#76）");
    }) as typeof fetch;
    try {
      expect((await makeProbe({ getUpdateUrl: () => srv.url })(true)).kind).toBe("available");
      expect(electronMock.netFetchCalls).toEqual([srv.url]);
    } finally {
      globalThis.fetch = original;
      await srv.close();
    }
  });
});

// ─────────────────────────── 5. 默认接线 + 拼名 ───────────────────────────

describe("默认接线与拼名（零注入）", () => {
  it("installerAssetName 按 electron-builder 模板拼名（与 assert-installer-name.mjs 判据④ 同一形状）", () => {
    expect(installerAssetName(APP_NAME, NEXT)).toBe(ASSET_NAME);
  });

  it("isUpdateSourceConfigured 真读 product.json.updateUrl（配了 true / 空串 false / 缺文件 false）", async () => {
    const productJson = path.join(appPath, "electron", "product.json");
    const write = async (json: Record<string, unknown>) => {
      await fs.promises.writeFile(productJson, JSON.stringify(json), "utf8");
      __resetProductCache();
    };

    await write({ updateUrl: "https://example.invalid/releases/latest" });
    expect(isUpdateSourceConfigured()).toBe(true);

    await write({ updateUrl: "" });
    expect(isUpdateSourceConfigured()).toBe(false);

    await fs.promises.rm(productJson);
    __resetProductCache();
    expect(isUpdateSourceConfigured()).toBe(false); // 缺文件 → 兜底空串（product.ts 的 DEFAULT_PRODUCT）
  });

  it("零注入的腿：真读 product.json.updateUrl + package.json.name + app.getVersion()", async () => {
    const srv = await serveOnce({ body: releaseResponse() });
    await fs.promises.writeFile(
      path.join(appPath, "package.json"),
      JSON.stringify({ name: APP_NAME, version: CURRENT }),
      "utf8",
    );
    await fs.promises.writeFile(
      path.join(appPath, "electron", "product.json"),
      JSON.stringify({ updateUrl: srv.url }),
      "utf8",
    );
    __resetProductCache();

    try {
      // 三件身份全部走生产默认实现——注入一个都不给
      expect(await createUpdateProbe()(true)).toEqual({ kind: "available", update: EXPECTED_UPDATE });
    } finally {
      await srv.close();
    }
  });
});
