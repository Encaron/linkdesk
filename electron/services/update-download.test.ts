/**
 * update-download 下载腿 + 启动清理单测——E6#57.6。
 *
 * mock electron（`net.fetch` 转调 **hoist 时抓下的**原始 fetch ⇒ 本地 http 服务真发包；`app.getPath` 指临时目录）
 * ——即「真出网出口 + 真磁盘 + 真 HTTP 流」，只有 GitHub 那一头换成本地服务。
 *
 * 逐条对判据（清单 5.4 轮 `#57.6` 的「验证」行）：
 *   1. 🔴 **`.part` 必须先写、校验通过才改正式名**——失败/中断/校验不符时，`.part` 与正式文件**都不许留**
 *      （半截文件冒充完整安装器 ⇒ 用户点「重启并更新」装的正是坏包）。
 *   2. 🔴 **sha256 不符 → 删除不装**；**未附校验值 → 降级放行 + 记 `checksum-unavailable`**（账落
 *      `downloaded.warning`，2026-09-12 用户拍板选 (a)）。
 *   3. 🔴 **方向守卫**：比当前运行版本新 → 留；同版/更旧/**解析不出** → 删；不是本机制的名字 → **不碰**。
 *      判据与插件侧锚① 同一个函数（`updateTargetDirection`），**不许各写一份判断**。
 *   4. 挂死/断网/截断各自归对类（`network` / `network` / `interrupted`），**都不许不动地挂着**。
 *   5. 出口锁定：全局 fetch 被打断照常成功，且确实经 `net.fetch` 出门（E6#76）。
 * fixture 全虚构（版本 `0.1.49`/`0.1.50`——硬约束 21）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";

// 🔴 共享桩必须先于 SUT import（见 electron-mock.ts 头注「纪律」）
import { electronMock } from "./electron-mock.js";

import {
  cleanupUpdateResidue,
  createUpdateDownloader,
  installerFileName,
  installerPathFor,
  installerVersionFromName,
  updateDownloadDir,
} from "./update-download.js";
import { UpdateLegError } from "./update-service.js";
import { __resetProductCache } from "../product.js";
import type { DownloadProgress, UpdateError, UpdateInfo } from "../../src/core/types/ipc/update";

const CURRENT = "0.1.49";
const NEXT = "0.1.50";
const DOWNLOAD_URL = "https://example.invalid/download/demo-app-setup-0.1.50.exe";
/** 服务端要发的字节（内容无关紧要，只要可复现） */
const PAYLOAD = Buffer.from("installer-binary-".repeat(512), "utf8");
const DIGEST = createHash("sha256").update(PAYLOAD).digest("hex");

// ─────────────────────── 本地二进制服务（真发包、可造挂死/截断） ───────────────────────

interface ServerOpts {
  /** 完整要发的字节（缺省 `PAYLOAD`） */
  payload?: Buffer;
  /** 声明给客户端的 content-length（缺省 = payload 长度）——造「声明多、实发少」的截断 */
  declareLength?: number;
  /** 只发这么多字节就硬断连接 */
  cutAfter?: number;
  /** 分几批发（每批之间停 `gapMs`）——用来证明看门狗按「还有新字节吗」判，不是按总时长掐 */
  chunks?: number;
  gapMs?: number;
  /** **连上了但不回头**——不写响应头也不结束，客户端永远等不到响应头 */
  mute?: boolean;
  /** **回了头就不动**——响应头照发（含 Content-Length），一个字节不写也不再动（下到一半挂死） */
  stall?: boolean;
  status?: number;
}

/** 起一个只服务二进制体的本地服务——返回 URL、命中次数、收摊函数 */
async function serveBinary(opts: ServerOpts = {}): Promise<{
  url: string;
  hits: number;
  close: () => Promise<void>;
}> {
  const seen = { hits: 0 };
  const server = http.createServer((_req, res) => {
    seen.hits += 1;
    if (opts.mute) return; // 不 writeHead、不 end —— 客户端卡在「等响应头」
    if (opts.status && opts.status >= 300) {
      res.writeHead(opts.status);
      res.end();
      return;
    }
    const body = opts.payload ?? PAYLOAD;
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": String(opts.declareLength ?? body.length),
    });
    if (opts.stall) return; // 头发出去了、body 一个字节不给、也不结束 —— 客户端等到空闲超时
    if (opts.chunks && opts.chunks > 1) {
      const size = Math.ceil(body.length / opts.chunks);
      let i = 0;
      const tick = (): void => {
        if (i >= opts.chunks!) {
          res.end();
          return;
        }
        const part = body.subarray(i * size, Math.min((i + 1) * size, body.length));
        i += 1;
        res.write(part, () => setTimeout(tick, opts.gapMs ?? 0));
      };
      tick();
      return;
    }
    const send = Math.min(opts.cutAfter ?? body.length, body.length);
    // 写出去再断——不 flush 就 destroy 会让「断了」和「没发」分不清
    res.write(body.subarray(0, send), () => {
      if (send < body.length) res.destroy();
      else res.end();
    });
  });
  const url = await new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(`http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/asset.exe`);
    });
  });
  return {
    url,
    get hits() {
      return seen.hits;
    },
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}

/** 一份「合法且有更新」的 UpdateInfo——各用例按需改字段 */
function updateFixture(over: Partial<UpdateInfo> = {}): UpdateInfo {
  return {
    version: NEXT,
    currentVersion: CURRENT,
    publishedAt: "2026-09-12T00:00:00Z",
    releaseNotesUrl: "https://example.invalid/releases/tag/v0.1.50",
    downloadUrl: DOWNLOAD_URL,
    checksum: DIGEST,
    size: PAYLOAD.length,
    ...over,
  };
}

/** 抽出腿抛出的结构化错误（非 `UpdateLegError` 直接失败——比强转更能指出「抛了个别的东西」） */
async function legError(p: Promise<unknown>): Promise<UpdateError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof UpdateLegError) return e.detail;
    throw new Error(`期望 UpdateLegError，实得 ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
  }
  throw new Error("期望抛错，实际成功返回了");
}

/** 盘上还剩哪些文件（排序，便于整目录断言） */
function filesIn(dir: string): string[] {
  try {
    return fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
}

let dir: string;
/** 进度回调收集（每条都留——节流归状态机，腿只管逐块报） */
let progress: DownloadProgress[];

beforeEach(async () => {
  electronMock.netFetchCalls.length = 0;
  progress = [];
  dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "update-download-"));
  electronMock.app.userData = path.join(dir, "userData");
  electronMock.app.appPath = dir;
  __resetProductCache();
});

afterEach(async () => {
  await fs.promises.rm(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ─────────────────────────── 1. 成功路径（`.part` → 正式名） ───────────────────────────

describe("流式下载（#57.6a/#57.6c）", () => {
  it("下载完成 → rename 成正式名、内容逐字节一致、无半截残留、有校验值时不记 warning", async () => {
    const srv = await serveBinary();
    const leg = createUpdateDownloader({ getUpdateDir: () => dir });
    try {
      const done = await leg(updateFixture({ downloadUrl: srv.url }), (p) => progress.push(p));
      expect(done.installerPath).toBe(installerPathFor(NEXT, dir));
      expect(done.warning).toBeUndefined();
      expect(filesIn(dir)).toEqual([installerFileName(NEXT)]);
      expect(await fs.promises.readFile(done.installerPath)).toEqual(PAYLOAD);
      // 终态必发 100%——否则进度条停在中间值上看着像卡死
      expect(progress.at(-1)).toEqual({ transferred: PAYLOAD.length, total: PAYLOAD.length, percent: 100 });
      expect(progress.length).toBeGreaterThan(0);
    } finally {
      await srv.close();
    }
  });

  it("进度逐块递增且不超过 100%，total 取 Content-Length", async () => {
    const srv = await serveBinary();
    try {
      await createUpdateDownloader({ getUpdateDir: () => dir })(updateFixture({ downloadUrl: srv.url }), (p) =>
        progress.push(p),
      );
    } finally {
      await srv.close();
    }
    expect(progress.every((p) => p.total === PAYLOAD.length)).toBe(true);
    expect(progress.every((p) => p.percent >= 0 && p.percent <= 100)).toBe(true);
    const transferred = progress.map((p) => p.transferred);
    expect(transferred).toEqual([...transferred].sort((a, b) => a - b)); // 单调不减
  });

  it("🔴 校验值大小写漂移照样过（比对前归一）——大写 HEX 的 Release 不该被误判成篡改", async () => {
    const srv = await serveBinary();
    try {
      const done = await createUpdateDownloader({ getUpdateDir: () => dir })(
        updateFixture({ downloadUrl: srv.url, checksum: DIGEST.toUpperCase() }),
        () => {},
      );
      expect(done.warning).toBeUndefined();
    } finally {
      await srv.close();
    }
  });
});

// ─────────────────────────── 2. 🔴 校验（#57.6b） ───────────────────────────

describe("🔴 sha256 校验（#57.6b）", () => {
  it("包被篡改（内容与校验值不符）→ checksum-mismatch，**.part 与正式文件都不留**", async () => {
    const srv = await serveBinary({ payload: Buffer.from("tampered-installer") });
    try {
      const detail = await legError(
        createUpdateDownloader({ getUpdateDir: () => dir })(
          updateFixture({ downloadUrl: srv.url, size: 18 }), // checksum 仍是 PAYLOAD 的
          () => {},
        ),
      );
      expect(detail.code).toBe("checksum-mismatch");
      expect(filesIn(dir)).toEqual([]); // 坏包不许留在可安装路径上
    } finally {
      await srv.close();
    }
  });

  it("🔴 未附校验值 → 降级放行（照常装上）+ 记 checksum-unavailable（账随成功态走）", async () => {
    const srv = await serveBinary();
    try {
      const done = await createUpdateDownloader({ getUpdateDir: () => dir })(
        updateFixture({ downloadUrl: srv.url, checksum: undefined }),
        () => {},
      );
      expect(done.warning?.code).toBe("checksum-unavailable");
      // 负控：**同样这条腿、只把 checksum 加回来** ⇒ warning 必须消失（否则上面那条断言是恒真的）
      const srv2 = await serveBinary();
      try {
        const again = await createUpdateDownloader({ getUpdateDir: () => dir })(
          updateFixture({ downloadUrl: srv2.url }),
          () => {},
        );
        expect(again.warning).toBeUndefined();
      } finally {
        await srv2.close();
      }
    } finally {
      await srv.close();
    }
  });
});

// ─────────────────────────── 3. 失败归因（不许不动地挂着） ───────────────────────────

describe("失败归因（#57.6a/g）", () => {
  it("network——连不上（端口无监听），且不留 .part", async () => {
    const srv = await serveBinary();
    const deadUrl = srv.url;
    await srv.close();
    const detail = await legError(createUpdateDownloader({ getUpdateDir: () => dir })(
      updateFixture({ downloadUrl: deadUrl }),
      () => {},
    ));
    expect(detail.code).toBe("network");
    expect(filesIn(dir)).toEqual([]);
  });

  // 🔴「服务器收了连接却不回头」的**两种形态 = 同一条判据**（都必须靠「看门狗在出网之前就装上」）。
  //   ① 连 TCP 都不给**响应头** ② 响应头给了、body 一个字节不发。二者用户语义与处置相同（这次没下成），
  //   且**都**是最贵的失败模式——漏了就是「既没有失败提示、也没有 [重试]」的永久卡死。
  it.each([
    ["连上就不给响应头", { mute: true }],
    ["给了响应头就不发字节", { stall: true }],
  ])("network——%s ⇒ 空闲超时判失败，不永远挂着", async (_form, opts) => {
    const srv = await serveBinary(opts);
    try {
      const detail = await legError(createUpdateDownloader({ getUpdateDir: () => dir, idleTimeoutMs: 80 })(
        updateFixture({ downloadUrl: srv.url }),
        () => {},
      ));
      expect(detail.code).toBe("network");
      expect(filesIn(dir)).toEqual([]);
    } finally {
      await srv.close();
    }
  });

  it("负控：**真的在下**就不算挂死——看门狗按「还有新字节吗」判，不按总时长掐", async () => {
    // 分 5 批、批间隔 60ms ⇒ 全程 ≈300ms **超过** 200ms 的预算，但每一段间隔都远短于它。
    // 若实现改成「总时长超时」（那是把慢网上的健康下载判死的同款错误），这条会红。
    const srv = await serveBinary({ payload: PAYLOAD, chunks: 5, gapMs: 60 });
    try {
      const done = await createUpdateDownloader({ getUpdateDir: () => dir, idleTimeoutMs: 200 })(
        updateFixture({ downloadUrl: srv.url }),
        () => {},
      );
      expect(await fs.promises.readFile(done.installerPath)).toEqual(PAYLOAD);
    } finally {
      await srv.close();
    }
  });

  it("🔴 interrupted——传到一半连接断了（**不是** network：已经在下、半路断）", async () => {
    const srv = await serveBinary({ cutAfter: 512 });
    try {
      const detail = await legError(createUpdateDownloader({ getUpdateDir: () => dir })(
        updateFixture({ downloadUrl: srv.url }),
        () => {},
      ));
      expect(detail.code).toBe("interrupted");
      expect(filesIn(dir)).toEqual([]);
    } finally {
      await srv.close();
    }
  });

  it("asset-missing——没有直链时不空手去 fetch（把矛头指向发布侧）", async () => {
    const detail = await legError(createUpdateDownloader({ getUpdateDir: () => dir })(
      updateFixture({ downloadUrl: undefined }),
      () => {},
    ));
    expect(detail.code).toBe("asset-missing");
    expect(electronMock.netFetchCalls).toEqual([]); // 一次网都没出
  });

  it("asset-missing——直链 404（发布侧改过/删过包）", async () => {
    const srv = await serveBinary({ status: 404 });
    try {
      const detail = await legError(createUpdateDownloader({ getUpdateDir: () => dir })(
        updateFixture({ downloadUrl: srv.url }),
        () => {},
      ));
      expect(detail.code).toBe("asset-missing");
    } finally {
      await srv.close();
    }
  });

  it("write-error——下载目录建不出来（父路径是文件），**一个网都不出**", async () => {
    const blocker = path.join(dir, "not-a-dir");
    await fs.promises.writeFile(blocker, "x", "utf8");
    const srv = await serveBinary();
    try {
      const detail = await legError(createUpdateDownloader({ getUpdateDir: () => path.join(blocker, "update") })(
        updateFixture({ downloadUrl: srv.url }),
        () => {},
      ));
      expect(detail.code).toBe("write-error");
      expect(srv.hits).toBe(0);
    } finally {
      await srv.close();
    }
  });
});

// ─────────────────────────── 4. 复用已在盘上的安装器 ───────────────────────────

describe("复用已在盘上的完整安装器（不重下几十兆）", () => {
  it("同名且 sha256 对得上 → 直接交差，**一次网都不出**", async () => {
    const srv = await serveBinary();
    try {
      await fs.promises.writeFile(installerPathFor(NEXT, dir), PAYLOAD);
      const done = await createUpdateDownloader({ getUpdateDir: () => dir })(
        updateFixture({ downloadUrl: srv.url }),
        (p) => progress.push(p),
      );
      expect(done.installerPath).toBe(installerPathFor(NEXT, dir));
      expect(srv.hits).toBe(0);
      expect(progress.at(-1)?.percent).toBe(100);
    } finally {
      await srv.close();
    }
  });

  it("负控：同名但内容不符 → 不复用，照常重下并覆盖", async () => {
    const srv = await serveBinary();
    try {
      await fs.promises.writeFile(installerPathFor(NEXT, dir), "stale-garbage");
      const done = await createUpdateDownloader({ getUpdateDir: () => dir })(
        updateFixture({ downloadUrl: srv.url }),
        () => {},
      );
      expect(srv.hits).toBe(1);
      expect(await fs.promises.readFile(done.installerPath)).toEqual(PAYLOAD);
    } finally {
      await srv.close();
    }
  });

  it("负控：无校验值时不复用（无从证明它完整）——宁可重下", async () => {
    const srv = await serveBinary();
    try {
      await fs.promises.writeFile(installerPathFor(NEXT, dir), PAYLOAD);
      await createUpdateDownloader({ getUpdateDir: () => dir })(
        updateFixture({ downloadUrl: srv.url, checksum: undefined }),
        () => {},
      );
      expect(srv.hits).toBe(1);
    } finally {
      await srv.close();
    }
  });
});

// ─────────────────────────── 5. 出口锁定（E6#76） ───────────────────────────

describe("主进程出网走 Chromium 网络栈（E6#76）", () => {
  it("全局 fetch 被打断时下载照常完成，且确实经 net.fetch 出门", async () => {
    const srv = await serveBinary();
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("主进程出网腿不该直呼全局 fetch（E6#76）");
    }) as typeof fetch;
    try {
      await createUpdateDownloader({ getUpdateDir: () => dir })(updateFixture({ downloadUrl: srv.url }), () => {});
      expect(electronMock.netFetchCalls).toEqual([srv.url]);
    } finally {
      globalThis.fetch = original;
      await srv.close();
    }
  });
});

// ─────────────────────────── 6. 🔴 启动残留清理 + 方向守卫（#57.6d/e） ───────────────────────────

describe("🔴 启动残留清理与方向守卫（#57.6d/#57.6e）", () => {
  it("🔴 三分支：比当前新的留、同版/更旧的删、解析不出的删；`.part` 删；别人的文件不碰", async () => {
    const older = installerFileName("0.1.48");
    const same = installerFileName(CURRENT);
    const newer = installerFileName(NEXT);
    const garbage = installerFileName("nightly");
    const alien = "我的笔记.txt";
    for (const name of [older, same, newer, garbage, `${newer}.part`, `${older}.part`, alien]) {
      await fs.promises.writeFile(path.join(dir, name), "x");
    }

    const report = await cleanupUpdateResidue({ getUpdateDir: () => dir, getCurrentVersion: () => CURRENT });

    expect(report.keptInstallers).toEqual([newer]);
    expect(report.removedInstallers.sort()).toEqual([older, same, garbage].sort());
    expect(report.removedParts.sort()).toEqual([`${newer}.part`, `${older}.part`].sort());
    // 盘上实况——比报告更硬的判据：留下的正好是「比当前新的那份 + 别人的文件」
    expect(filesIn(dir)).toEqual([newer, alien].sort());
  });

  it("🔴 保留的那份不进状态机也不被删——防「点更新把自己降级」的另一半（留着有用，不是垃圾）", async () => {
    await fs.promises.writeFile(path.join(dir, installerFileName(NEXT)), PAYLOAD);
    await cleanupUpdateResidue({ getUpdateDir: () => dir, getCurrentVersion: () => CURRENT });
    expect(await fs.promises.readFile(path.join(dir, installerFileName(NEXT)))).toEqual(PAYLOAD);
  });

  it("目录不存在（从未下载过更新）⇒ 空报告、不抛", async () => {
    const report = await cleanupUpdateResidue({
      getUpdateDir: () => path.join(dir, "never-created"),
      getCurrentVersion: () => CURRENT,
    });
    expect(report).toEqual({ removedParts: [], removedInstallers: [], keptInstallers: [] });
  });

  it("单条清理失败不抛（残留不许拖垮启动）——同名目录删不掉时，其余照删", async () => {
    const weird = `${installerFileName("0.1.48")}.part`; // 是个**目录** ⇒ 非递归 rm 必失败
    await fs.promises.mkdir(path.join(dir, weird));
    const victim = installerFileName("0.1.47");
    await fs.promises.writeFile(path.join(dir, victim), "x");

    const report = await cleanupUpdateResidue({ getUpdateDir: () => dir, getCurrentVersion: () => CURRENT });

    expect(report.removedInstallers).toEqual([victim]); // 别的照删
    expect(report.removedParts).toEqual([]); // 那条失败了，没算进「已删」
    expect(fs.existsSync(path.join(dir, weird))).toBe(true);
  });

  it("扫的是同一个名字（写名 ↔ 扫名往返一致）——两处各写一份字面量就会「扫的不是产出的那批」", () => {
    for (const v of [CURRENT, NEXT, "1.2.3-beta.1"]) {
      expect(installerVersionFromName(installerFileName(v))).toBe(v);
    }
    expect(installerVersionFromName("linkdesk-setup-0.1.50.exe")).toBeNull(); // 发布侧 asset 名不是本机制的产物
    expect(installerVersionFromName(`${installerFileName(NEXT)}.part`)).toBeNull(); // 半截不算正式安装器
  });

  it("零注入的默认路径与默认版本——真读 {userData}/update 与 app.getVersion()", async () => {
    const updateDir = updateDownloadDir();
    await fs.promises.mkdir(updateDir, { recursive: true });
    await fs.promises.writeFile(path.join(updateDir, installerFileName("0.1.48")), "x");
    await fs.promises.writeFile(path.join(updateDir, installerFileName(CURRENT)), "x");
    await fs.promises.writeFile(path.join(updateDir, installerFileName(NEXT)), "x");
    __resetProductCache();

    const report = await cleanupUpdateResidue();
    // 默认版本 = app.getVersion()（product.ts 头注：product.json 的 version 只是产物自证，被覆盖）
    expect(report.removedInstallers.sort()).toEqual([installerFileName("0.1.48"), installerFileName(CURRENT)].sort());
    expect(report.keptInstallers).toEqual([installerFileName(NEXT)]);
    expect(filesIn(updateDir)).toEqual([installerFileName(NEXT)]);
  });
});
