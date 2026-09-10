/**
 * plugin-download 下载服务单测——E6#31a（3.2.2 批）：`.part` 临时文件生命周期（01 §四·五 B1 落地）。
 *
 * mock electron（app.getPath('userData') → 真实临时目录——filesystem-guard/bundled-install 同款
 * vi.hoisted 模式）；本地 http 服务真发包（jszip 真造包），逐场景：
 *   1. 下载成功 → .part 半截写完 rename 正式包（无 .part 残留、字节一致、onProgress 收到 100%）
 *   2. 下载中断（content-length 虚高 + 提前断流）→ reject + 自清 .part + 无正式包残留（不留垃圾）
 *   3. HTTP 失败（404）→ reject + 无 .part
 *   4. downloadNameFromUrl 消毒：保留原名 / 去查询 / 消毒非法字符 / 空 URL 兜底 pkg-<ts>
 *   4b. E6#73q 落盘名唯一化：stripDownloadUniq 剥回原包名 + 同名并发两条下载各持独立文件不互截
 *   5. cleanupStaleDownloads：清顶层 *.part + 孤立 *.linkdesk-plugin + .stage-* 暂存目录（E6#73j G8
 *      ——目录要 recursive，且不碰插件树的 .bak）；tmp 缺失无碍
 *   6. E6#73e 空闲超时（挂死不再永远挂着）+ 重试预算（5xx 可重试 / 4xx 不重试 / 用户取消不重试）
 *   7. E6#73i 下载链健康：F1 无 content-length 改显已下载字节数 / F3 压缩传输不再误判「下载中断」
 *      / F4 分片进度节流（冻结时钟 ⇒ 分片数 ≠ 消息数）
 * fixture 全虚构 id/文案（硬约束 21）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as http from "node:http";
import * as zlib from "node:zlib";
import type { Socket } from "node:net";
import JSZip from "jszip";

const electronMock = vi.hoisted(() => {
  const paths: { userData: string } = { userData: "" };
  const app = {
    isPackaged: false,
    getAppPath: () => "",
    getPath: (key: string) => (key === "userData" ? paths.userData : ""),
  };
  // E6#76：下载腿改走 `net.fetch`（Chromium 网络栈 ⇒ 读系统代理）。替身照契约转调**hoist 时抓下的**
  // 原始 fetch（不是调用时的 `globalThis.fetch`——否则下方「出口锁定」把它打断时替身一起断，断言失效），
  // 本地 http 测试服务照常真发包。**出网出口被换掉这件事由「出口锁定」断言守住**——替身跟着实现一起
  // 错 = 全绿而真机崩（memory 替身照契约非照实现）。
  const nodeFetch = globalThis.fetch;
  const netFetchCalls: string[] = [];
  const net = {
    fetch: (url: string, init?: RequestInit) => {
      netFetchCalls.push(url);
      return nodeFetch(url, init);
    },
  };
  return { app, net, netFetchCalls, paths };
});
vi.mock("electron", () => electronMock);

import {
  downloadPackage,
  cleanupStaleDownloads,
  downloadNameFromUrl,
  downloadTmpDir,
  stripDownloadUniq,
} from "./plugin-download.js";

/** 虚构包字节——jszip 真造（顶层 plugin.json + 一文件） */
async function packageBytes(pluginId: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("plugin.json", JSON.stringify({ pluginId, version: "1.0.0", name: `Demo ${pluginId}` }));
  zip.file("README.md", `demo ${pluginId} readme`);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

/**
 * 起服务并解析出本机 demo 包 URL——各 serve* 助手共用（jscpd 克隆防线）。
 * fixture 路径 `demo-a.linkdesk-plugin` 是虚构值（硬约束 21）。
 */
function listenDemoUrl(server: http.Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve(`http://127.0.0.1:${port}/demo-a.linkdesk-plugin`);
    });
  });
}

/** 记下所有连接：挂死场景会留下未关闭连接，`close` 前必须先 destroy 否则测试卡住 */
function trackSockets(server: http.Server): Set<Socket> {
  const sockets = new Set<Socket>();
  server.on("connection", (s: Socket) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  return sockets;
}

/** 关服务——先 destroy 所有连接再 close（见 trackSockets） */
function closeTracked(server: http.Server, sockets: Set<Socket>): Promise<void> {
  return new Promise((r) => {
    for (const s of sockets) s.destroy();
    server.close(() => r());
  });
}

/** 本地 http 服务发一次性 payload——opts.truncateAfter 截断断流（模拟下载中断）、status 自定义响应码 */
async function serveOnce(payload: Buffer, opts: { truncateAfter?: number; status?: number } = {}): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => {
    if (opts.status) {
      res.writeHead(opts.status, { "content-length": "0" });
      res.end();
      return;
    }
    res.writeHead(200, { "content-length": String(payload.length) });
    if (opts.truncateAfter !== undefined && opts.truncateAfter < payload.length) {
      res.write(payload.subarray(0, opts.truncateAfter));
      res.socket?.destroy(); // 提前断流——声明长度未满足
    } else {
      res.end(payload);
    }
  });
  return { url: await listenDemoUrl(server), close: () => new Promise((r) => server.close(() => r())) };
}

describe("downloadPackage——.part 生命周期（01 §四·五 B1）", () => {
  let userData: string;

  beforeEach(async () => {
    userData = await fs.promises.mkdtemp(path.join(os.tmpdir(), "plugin-download-ud-"));
    electronMock.paths.userData = userData;
  });

  afterEach(async () => {
    await fs.promises.rm(userData, { recursive: true, force: true });
  });

  it("下载成功：.part 半截写完 rename 正式包（无 .part 残留，字节一致，onProgress 收到完成/100%）", async () => {
    const payload = await packageBytes("demo-a");
    const srv = await serveOnce(payload);
    try {
      const msgs: Array<{ message: string; percent?: number }> = [];
      const { zipPath, total } = await downloadPackage(srv.url, (message, percent) => msgs.push({ message, percent }));
      expect(total).toBe(payload.length);
      // rename 后返回正式包路径（非 .part）
      expect(zipPath.endsWith(".part")).toBe(false);
      // E6#73q：落盘名 = 原包名 + 唯一化后缀；剥后缀拿回原包名（zipBase 裁决的依据）
      expect(path.basename(zipPath)).toMatch(/^demo-a\.dl-[0-9a-z]+-[0-9a-z]+\.linkdesk-plugin$/);
      expect(stripDownloadUniq(path.basename(zipPath).replace(/\.linkdesk-plugin$/, ""))).toBe("demo-a");
      // 正式包字节与源一致
      expect(await fs.promises.readFile(zipPath)).toEqual(payload);
      // tmp 顶层无 .part 残留
      const left = await fs.promises.readdir(downloadTmpDir());
      expect(left).toHaveLength(1);
      expect(left[0]).toMatch(/^demo-a\.dl-[0-9a-z]+-[0-9a-z]+\.linkdesk-plugin$/);
      // 进度回调：见过带 percent 的下载中 + 100%（或完成文案）
      const pct = msgs.filter((m) => m.percent !== undefined).map((m) => m.percent);
      expect(pct.length).toBeGreaterThan(0);
      expect(Math.max(...(pct as number[]))).toBe(100);
      expect(msgs.some((m) => m.message.includes("下载完成"))).toBe(true);
    } finally {
      await srv.close();
    }
  });

  it("下载中断（content-length 虚高 + 提前断流）：reject + 自清 .part + 无正式包残留", async () => {
    const payload = await packageBytes("demo-a");
    const srv = await serveOnce(payload, { truncateAfter: 20 });
    try {
      await expect(downloadPackage(srv.url)).rejects.toThrow();
    } finally {
      await srv.close();
    }
    // 缝隙 B1：不留半截垃圾
    expect(await fs.promises.readdir(downloadTmpDir())).toEqual([]);
  });

  it("HTTP 失败（404）：reject + 无 .part 残留", async () => {
    const srv = await serveOnce(Buffer.alloc(0), { status: 404 });
    try {
      await expect(downloadPackage(srv.url)).rejects.toThrow(/HTTP 404/);
    } finally {
      await srv.close();
    }
    expect(await fs.promises.readdir(downloadTmpDir())).toEqual([]);
  });
});

/**
 * 脚本化一次性 http 服务（E6#73e）——逐次请求可给不同响应，并统计命中次数（重试预算的观测口）。
 * 挂死场景会留下未关闭连接，`close()` 先 destroy 所有 socket 再关服务，避免测试卡在 close 上。
 */
async function serveScripted(
  handler: (hit: number, res: http.ServerResponse) => void,
): Promise<{ url: string; hits: () => number; close: () => Promise<void> }> {
  let count = 0;
  const server = http.createServer((_req, res) => {
    count += 1;
    handler(count, res);
  });
  const sockets = trackSockets(server);
  return {
    url: await listenDemoUrl(server),
    hits: () => count,
    close: () => closeTracked(server, sockets),
  };
}

/** 挂死服务器——连上、发头、给十来个字节就再无下文（「还在动吗」判据的反面） */
async function serveStalling(): Promise<{ url: string; hits: () => number; close: () => Promise<void> }> {
  const payload = await packageBytes("demo-a");
  return serveScripted((_hit, res) => {
    res.writeHead(200, { "content-length": String(payload.length) });
    res.write(payload.subarray(0, 10)); // 给点头就再无下文——挂死
  });
}

/**
 * E6#73e 机器一：下载失败归因与重试预算。
 * 此前全文件零超时——服务器半死不活（连上了、头也发了、就是不给字节）→ 永远挂着，用户既看不到失败
 * 也没有 [重试]；且所有非 2xx 一律报「网络不可用」，4xx（地址没了）与 5xx（服务器打嗝）被混为一谈。
 * 超时预算在测试里压到 60ms（`idleTimeoutMs`）——30 秒真等的测试没人会跑。
 */
describe("downloadPackage——空闲超时与重试预算（E6#73e）", () => {
  let userData: string;

  beforeEach(async () => {
    userData = await fs.promises.mkdtemp(path.join(os.tmpdir(), "plugin-download-73e-"));
    electronMock.paths.userData = userData;
  });

  afterEach(async () => {
    await fs.promises.rm(userData, { recursive: true, force: true });
  });

  it("空闲超时：连上却不给字节 → 报超时（不是永远挂着）+ 自清 .part", async () => {
    const srv = await serveStalling();
    try {
      await expect(downloadPackage(srv.url, undefined, { idleTimeoutMs: 60 })).rejects.toThrow(/下载超时/);
    } finally {
      await srv.close();
    }
    // 每次尝试都自清半截（三尝试后 tmp 仍空）
    expect(await fs.promises.readdir(downloadTmpDir())).toEqual([]);
  });

  it("瞬时故障（5xx）自动重试至成功——预算内不再打扰用户", async () => {
    const payload = await packageBytes("demo-a");
    const srv = await serveScripted((hit, res) => {
      if (hit === 1) {
        res.writeHead(500, { "content-length": "0" });
        res.end();
        return;
      }
      res.writeHead(200, { "content-length": String(payload.length) });
      res.end(payload);
    });
    try {
      const msgs: string[] = [];
      const { zipPath } = await downloadPackage(srv.url, (m) => msgs.push(m), { idleTimeoutMs: 2_000 });
      expect(srv.hits()).toBe(2);
      expect(await fs.promises.readFile(zipPath)).toEqual(payload);
      expect(msgs.some((m) => m.includes("正在重试"))).toBe(true);
    } finally {
      await srv.close();
    }
  });

  it("4xx 是确定性拒绝——重试只会同样失败，不消耗预算（只打一次）", async () => {
    const srv = await serveScripted((_hit, res) => {
      res.writeHead(404, { "content-length": "0" });
      res.end();
    });
    try {
      await expect(downloadPackage(srv.url, undefined, { idleTimeoutMs: 2_000 })).rejects.toThrow(/HTTP 404/);
    } finally {
      await srv.close();
    }
    expect(srv.hits()).toBe(1);
  });

  it("5xx 耗尽重试预算才认输（1 次 + 2 次重试）", async () => {
    const srv = await serveScripted((_hit, res) => {
      res.writeHead(503, { "content-length": "0" });
      res.end();
    });
    try {
      await expect(downloadPackage(srv.url, undefined, { idleTimeoutMs: 2_000 })).rejects.toThrow(/HTTP 503/);
    } finally {
      await srv.close();
    }
    expect(srv.hits()).toBe(3);
  });

  it("用户取消：立刻停、不重试、报「已取消」（取消是意图，重试是违背意图）", async () => {
    const srv = await serveStalling();
    try {
      const ac = new AbortController();
      const p = downloadPackage(srv.url, undefined, { signal: ac.signal, idleTimeoutMs: 30_000 });
      setTimeout(() => ac.abort(), 30);
      await expect(p).rejects.toThrow(/下载已取消/);
    } finally {
      await srv.close();
    }
    expect(srv.hits()).toBe(1);
    expect(await fs.promises.readdir(downloadTmpDir())).toEqual([]);
  });
});

describe("downloadNameFromUrl——落盘名消毒", () => {
  it("保留原名 + 补 .linkdesk-plugin", () => {
    expect(downloadNameFromUrl("https://example.com/pkg/a-plugin.linkdesk-plugin")).toBe("a-plugin.linkdesk-plugin");
    expect(downloadNameFromUrl("https://example.com/pkg/a-plugin")).toBe("a-plugin.linkdesk-plugin");
  });
  it("去查询/参数：只取路径末段名", () => {
    expect(downloadNameFromUrl("https://example.com/dl/my-plugin.linkdesk-plugin?token=abc")).toBe("my-plugin.linkdesk-plugin");
    expect(downloadNameFromUrl("https://example.com/dl/plugin-beta?v=2")).toBe("plugin-beta.linkdesk-plugin");
  });
  it("URL 已编码非法字符消毒（% → _），扩展名保持", () => {
    // new URL() 先把原始空格/非 ASCII 百分号编码——到达消毒函数的是已编码串，% 落 [^\w.\-] → _
    expect(downloadNameFromUrl("https://example.com/dl/a%20b.linkdesk-plugin")).toBe("a_20b.linkdesk-plugin");
  });
  it("空 URL 兜底 pkg-<ts>", () => {
    expect(downloadNameFromUrl("not-a-url")).toMatch(/^pkg-\d+\.linkdesk-plugin$/);
  });
});

/**
 * E6#73q：下载落盘名唯一化——并发 N=3 后不许两条下载共用同一个临时名。
 * 病根：两个不同插件的 downloadUrl 末段同名（第三方仓库把包名取成通用名是常见做法）时，共用 `.part`
 * 会互相截断；共用正式名则更糟——rename→extract 的窗口里 **A 的包被 B 覆盖**（装错插件，静默）。
 * 修法：落盘名挂 `.dl-<seq>-<ts>` 后缀，`zipBase` 裁决前由 stripDownloadUniq 剥回原包名。
 */
describe("下载落盘名唯一化（E6#73q）", () => {
  let userData: string;

  beforeEach(async () => {
    userData = await fs.promises.mkdtemp(path.join(os.tmpdir(), "plugin-download-uniq-"));
    electronMock.paths.userData = userData;
  });

  afterEach(async () => {
    await fs.promises.rm(userData, { recursive: true, force: true });
  });

  it("stripDownloadUniq：剥唯一化后缀；非本服务产出的名字原样返回", () => {
    expect(stripDownloadUniq("demo-a.dl-1-abc123")).toBe("demo-a");
    expect(stripDownloadUniq("demo-a.dl-z9-zzzzzz")).toBe("demo-a");
    // 原包名本身就在用的点段不许误剥（后缀形状严格 = .dl-<36>-<36>）
    expect(stripDownloadUniq("demo-a")).toBe("demo-a");
    expect(stripDownloadUniq("demo-a.v1.2.0")).toBe("demo-a.v1.2.0");
    expect(stripDownloadUniq("demo-a.dl-")).toBe("demo-a.dl-");
    expect(stripDownloadUniq("demo-a.dl-1")).toBe("demo-a.dl-1");
  });

  it("两条同名并发下载各持独立落盘名——互不截断、字节各自完整", async () => {
    const payloadA = await packageBytes("demo-a");
    const payloadB = await packageBytes("demo-b-with-longer-name");
    const srvA = await serveOnce(payloadA);
    const srvB = await serveOnce(payloadB);
    try {
      const [a, b] = await Promise.all([downloadPackage(srvA.url), downloadPackage(srvB.url)]);
      expect(a.zipPath).not.toBe(b.zipPath);
      expect(await fs.promises.readFile(a.zipPath)).toEqual(payloadA);
      expect(await fs.promises.readFile(b.zipPath)).toEqual(payloadB);
      // 两条都剥回同一个原包名（同名 URL），但落盘互不干扰
      const base = (p: string) => stripDownloadUniq(path.basename(p).replace(/\.linkdesk-plugin$/, ""));
      expect(base(a.zipPath)).toBe("demo-a");
      expect(base(b.zipPath)).toBe("demo-a");
    } finally {
      await srvA.close();
      await srvB.close();
    }
  });
});

/**
 * 分片发流且**不声明 content-length**（Node 自动 chunked）——F1 现场：服务器不给包大小时，
 * 客户端拿不到任何基数。`writes()` 记录真发了几片（F4 节流测试的对照）。
 */
async function serveChunked(
  payload: Buffer,
  parts: number,
  delayMs = 0,
  declareLength = false,
): Promise<{ url: string; writes: () => number; close: () => Promise<void> }> {
  let count = 0;
  const server = http.createServer(async (_req, res) => {
    res.writeHead(
      200,
      declareLength
        ? { "content-type": "application/octet-stream", "content-length": String(payload.length) }
        : { "content-type": "application/octet-stream" },
    );
    const step = Math.max(1, Math.ceil(payload.length / parts));
    for (let off = 0; off < payload.length; off += step) {
      res.write(payload.subarray(off, off + step));
      count += 1;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
    res.end();
  });
  const sockets = trackSockets(server);
  return {
    url: await listenDemoUrl(server),
    writes: () => count,
    close: () => closeTracked(server, sockets),
  };
}

/** gzip 压缩传输——F3 现场：`content-length` 是**压缩后**字节数，客户端实收的是**解压后**字节数 */
async function serveCompressed(raw: Buffer): Promise<{ url: string; compressed: number; close: () => Promise<void> }> {
  const gz = zlib.gzipSync(raw);
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-length": String(gz.length), "content-encoding": "gzip" });
    res.end(gz);
  });
  return {
    url: await listenDemoUrl(server),
    compressed: gz.length,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

/**
 * E6#73i 下载链健康——三个真缺陷：
 *   F1 服务器不给包大小 ⇒ 全程零百分比（面板只能落不定态扫动条，「像来回滚的加载条」的真机制）
 *   F3 压缩传输 ⇒ `content-length` 是压缩后、实收是解压后 ⇒ **完整下载被误判「下载中断」且归因网络**
 *   F4 逐分片推 IPC、全链路零节流（旧注释称「节流交给广播层」，广播层实际零节流）
 * fixture 全虚构 id/文案（硬约束 21）。
 */
describe("下载链健康（E6#73i）", () => {
  let userData: string;

  beforeEach(async () => {
    userData = await fs.promises.mkdtemp(path.join(os.tmpdir(), "plugin-download-73i-"));
    electronMock.paths.userData = userData;
  });

  afterEach(async () => {
    await fs.promises.rm(userData, { recursive: true, force: true });
  });

  it("F1：无 content-length 时改显已下载字节数——不再全程一个百分比都没有", async () => {
    const payload = await packageBytes("demo-a");
    const srv = await serveChunked(payload, 5);
    try {
      const msgs: string[] = [];
      const { total } = await downloadPackage(srv.url, (m) => msgs.push(m));
      expect(total).toBe(0); // 服务器确实没给长度（这条测试的前提）
      expect(msgs.some((m) => m.includes("已下载"))).toBe(true);
    } finally {
      await srv.close();
    }
  });

  it("F3：压缩传输的完整下载**不再**被误判「下载中断」（重试救不了的那种失败）", async () => {
    const raw = Buffer.from("x".repeat(5000));
    const srv = await serveCompressed(raw);
    try {
      const msgs: string[] = [];
      // 旧判据 `received !== total`：解压后 5000 ≠ 压缩后 40 → 抛「下载中断」→ 命中 NET_RE 归网络
      // → 「安装失败：网络连接不可用」，重试多少次都是同一个失败。
      const { zipPath, total } = await downloadPackage(srv.url, (m) => msgs.push(m), { idleTimeoutMs: 2_000 });
      expect(total).toBe(srv.compressed);
      expect(msgs.some((m) => m.includes("下载中断"))).toBe(false);
      // 落盘的是解压后字节（fetch 解码 Content-Encoding）
      expect((await fs.promises.readFile(zipPath)).length).toBe(raw.length);
    } finally {
      await srv.close();
    }
  });

  it("F4：分片进度节流——时钟冻结下几十个分片只推一条进度（全链路零节流是洪峰）", async () => {
    const payload = await packageBytes("demo-a");
    const srv = await serveChunked(payload, 30, 2);
    // 冻结时钟 ⇒ 首次之后的所有 tick 都落在 100ms 窗口内 —— 无节流则「分片数 = 消息数」
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000_000_000);
    try {
      const msgs: string[] = [];
      await downloadPackage(srv.url, (m) => msgs.push(m), { idleTimeoutMs: 5_000 });
      expect(srv.writes()).toBeGreaterThan(10); // 服务端确实分了很多片
      expect(msgs.filter((m) => m.startsWith("下载中"))).toHaveLength(1);
    } finally {
      nowSpy.mockRestore();
      await srv.close();
    }
  });

  it("F4：节流吞不掉终态——有长度的分片下载最后一格恒发 100%", async () => {
    const payload = await packageBytes("demo-a");
    const srv = await serveChunked(payload, 30, 2, true);
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000_000_000);
    try {
      const msgs: Array<{ message: string; percent?: number }> = [];
      await downloadPackage(srv.url, (message, percent) => msgs.push({ message, percent }), { idleTimeoutMs: 5_000 });
      // 冻结时钟下只剩两格：开跑那一格 + 终态那一格（否则进度条停在中间值上，直到下个阶段才收走）
      const pcts = msgs.filter((m) => m.percent !== undefined).map((m) => m.percent as number);
      expect(pcts).toHaveLength(2);
      expect(Math.max(...pcts)).toBe(100);
    } finally {
      nowSpy.mockRestore();
      await srv.close();
    }
  });
});

describe("cleanupStaleDownloads——启动扫描清理", () => {
  let userData: string;

  beforeEach(async () => {
    userData = await fs.promises.mkdtemp(path.join(os.tmpdir(), "plugin-download-clean-"));
    electronMock.paths.userData = userData;
  });

  afterEach(async () => {
    await fs.promises.rm(userData, { recursive: true, force: true });
  });

  it("清顶层 *.part + 孤立 *.linkdesk-plugin + .stage-* 暂存目录；留无关文件", async () => {
    const tmp = downloadTmpDir();
    await fs.promises.mkdir(tmp, { recursive: true });
    await fs.promises.writeFile(path.join(tmp, "demo-a.linkdesk-plugin.part"), "half");
    await fs.promises.writeFile(path.join(tmp, "demo-a.linkdesk-plugin"), "full-orphan");
    await fs.promises.writeFile(path.join(tmp, "unrelated.tmp"), "keep");
    await fs.promises.mkdir(path.join(tmp, ".stage-demo-a"), { recursive: true });
    await fs.promises.writeFile(path.join(tmp, ".stage-demo-a", "plugin.json"), "{}");

    await cleanupStaleDownloads();

    const left = await fs.promises.readdir(tmp);
    expect(left.sort()).toEqual(["unrelated.tmp"]);
  });

  // E6#73j（G8）后半：暂存目录是**目录**——只 force 不 recursive 会 ENOTEMPTY/EISDIR，清理形同虚设
  it("暂存目录非空也整棵清掉（不是象征性删一个空目录）", async () => {
    const tmp = downloadTmpDir();
    const stage = path.join(tmp, ".stage-demo-b");
    await fs.promises.mkdir(path.join(stage, "dist"), { recursive: true });
    await fs.promises.writeFile(path.join(stage, "dist", "index.js"), "x");
    await fs.promises.writeFile(path.join(stage, "plugin.json"), "{}");

    await cleanupStaleDownloads();

    await expect(fs.promises.readdir(stage)).rejects.toThrow();
  });

  // `.bak` 落在插件树里、可能是旧版唯一副本——boot 的下载清理绝不能顺手删它
  it("不碰插件树里的 .bak（归 plugin-tree-recovery 按目录在不在复原）", async () => {
    const tmp = downloadTmpDir();
    await fs.promises.mkdir(tmp, { recursive: true });
    await fs.promises.writeFile(path.join(tmp, "demo-c.bak"), "keep");

    await cleanupStaleDownloads();

    expect(await fs.promises.readdir(tmp)).toEqual(["demo-c.bak"]);
  });

  it("tmp 缺失/空：无碍返回", async () => {
    await expect(cleanupStaleDownloads()).resolves.toBeUndefined();
  });
});

/**
 * E6#76——出口锁定。真机实证：主进程全局 fetch（undici）不读系统代理、渲染进程 Chromium 读，
 * 用户开着代理时「商店看得见、插件装不上」（同一 URL 渲染进程 200 / 主进程 fetch failed）。
 * 本组把**出口**本身钉死：全局 fetch 被打断也必须照常下完 ⇒ 出网确实没走它。
 */
describe("主进程出网走 Chromium 网络栈（E6#76）", () => {
  let userData: string;

  beforeEach(async () => {
    userData = await fs.promises.mkdtemp(path.join(os.tmpdir(), "plugin-download-net-"));
    electronMock.paths.userData = userData;
    electronMock.netFetchCalls.length = 0;
  });

  afterEach(async () => {
    await fs.promises.rm(userData, { recursive: true, force: true });
  });

  it("全局 fetch 被打断时下载照常完成，且确实经 net.fetch 出门", async () => {
    const payload = await packageBytes("demo-net");
    const srv = await serveOnce(payload);
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("主进程出网腿不该直呼全局 fetch（E6#76）");
    }) as typeof fetch;
    try {
      const { total } = await downloadPackage(srv.url);
      expect(total).toBe(payload.length);
    } finally {
      globalThis.fetch = original;
      await srv.close();
    }
    expect(electronMock.netFetchCalls).toEqual([srv.url]);
  });
});
