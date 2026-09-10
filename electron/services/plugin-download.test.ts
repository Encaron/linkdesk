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
 *   5. cleanupStaleDownloads：清顶层 *.part + 孤立 *.linkdesk-plugin，留 .stage-*（段 B 域不越界）；tmp 缺失无碍
 *   6. E6#73e 空闲超时（挂死不再永远挂着）+ 重试预算（5xx 可重试 / 4xx 不重试 / 用户取消不重试）
 * fixture 全虚构 id/文案（硬约束 21）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as http from "node:http";
import type { Socket } from "node:net";
import JSZip from "jszip";

const electronMock = vi.hoisted(() => {
  const paths: { userData: string } = { userData: "" };
  const app = {
    isPackaged: false,
    getAppPath: () => "",
    getPath: (key: string) => (key === "userData" ? paths.userData : ""),
  };
  return { app, paths };
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

/** 本地 http 服务发一次性 payload——opts.truncateAfter 截断断流（模拟下载中断）、status 自定义响应码 */
function serveOnce(payload: Buffer, opts: { truncateAfter?: number; status?: number } = {}): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
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
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/demo-a.linkdesk-plugin`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
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
function serveScripted(
  handler: (hit: number, res: http.ServerResponse) => void,
): Promise<{ url: string; hits: () => number; close: () => Promise<void> }> {
  let count = 0;
  const sockets = new Set<Socket>();
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      count += 1;
      handler(count, res);
    });
    server.on("connection", (s: Socket) => {
      sockets.add(s);
      s.on("close", () => sockets.delete(s));
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/demo-a.linkdesk-plugin`,
        hits: () => count,
        close: () =>
          new Promise((r) => {
            for (const s of sockets) s.destroy();
            server.close(() => r());
          }),
      });
    });
  });
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

describe("cleanupStaleDownloads——启动扫描清理", () => {
  let userData: string;

  beforeEach(async () => {
    userData = await fs.promises.mkdtemp(path.join(os.tmpdir(), "plugin-download-clean-"));
    electronMock.paths.userData = userData;
  });

  afterEach(async () => {
    await fs.promises.rm(userData, { recursive: true, force: true });
  });

  it("清顶层 *.part + 孤立 *.linkdesk-plugin；留 .stage-*（段 B update 域不越界）", async () => {
    const tmp = downloadTmpDir();
    await fs.promises.mkdir(tmp, { recursive: true });
    await fs.promises.writeFile(path.join(tmp, "demo-a.linkdesk-plugin.part"), "half");
    await fs.promises.writeFile(path.join(tmp, "demo-a.linkdesk-plugin"), "full-orphan");
    await fs.promises.writeFile(path.join(tmp, "unrelated.tmp"), "keep");
    await fs.promises.mkdir(path.join(tmp, ".stage-demo-a"), { recursive: true });
    await fs.promises.writeFile(path.join(tmp, ".stage-demo-a", "plugin.json"), "{}");

    await cleanupStaleDownloads();

    const left = await fs.promises.readdir(tmp);
    expect(left.sort()).toEqual([".stage-demo-a", "unrelated.tmp"]);
  });

  it("tmp 缺失/空：无碍返回", async () => {
    await expect(cleanupStaleDownloads()).resolves.toBeUndefined();
  });
});
