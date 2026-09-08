/**
 * plugin-download 下载服务单测——E6#31a（3.2.2 批）：`.part` 临时文件生命周期（01 §四·五 B1 落地）。
 *
 * mock electron（app.getPath('userData') → 真实临时目录——filesystem-guard/bundled-install 同款
 * vi.hoisted 模式）；本地 http 服务真发包（jszip 真造包），逐场景：
 *   1. 下载成功 → .part 半截写完 rename 正式包（无 .part 残留、字节一致、onProgress 收到 100%）
 *   2. 下载中断（content-length 虚高 + 提前断流）→ reject + 自清 .part + 无正式包残留（不留垃圾）
 *   3. HTTP 失败（404）→ reject + 无 .part
 *   4. downloadNameFromUrl 消毒：保留原名 / 去查询 / 消毒非法字符 / 空 URL 兜底 pkg-<ts>
 *   5. cleanupStaleDownloads：清顶层 *.part + 孤立 *.linkdesk-plugin，留 .stage-*（段 B 域不越界）；tmp 缺失无碍
 * fixture 全虚构 id/文案（硬约束 21）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as http from "node:http";
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

import { downloadPackage, cleanupStaleDownloads, downloadNameFromUrl, downloadTmpDir } from "./plugin-download.js";

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
      expect(path.basename(zipPath)).toBe("demo-a.linkdesk-plugin");
      // 正式包字节与源一致
      expect(await fs.promises.readFile(zipPath)).toEqual(payload);
      // tmp 顶层无 .part 残留
      expect(await fs.promises.readdir(downloadTmpDir())).toEqual(["demo-a.linkdesk-plugin"]);
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
