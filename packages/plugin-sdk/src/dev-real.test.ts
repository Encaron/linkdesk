/**
 * @vitest-environment node
 *
 * `dev --real` 两条防坑单测——并发互斥锁（E6#28.5e）+ 源码树宿主告警（E6#28.5d），出处 04-作者真机调试环.md §8。
 *
 * ⚠️ 环境必须是 **node**（不是默认的 jsdom）：本文件 import 的 `dev-real.js` 顶层 import `vite`，
 *    而 esbuild 在 jsdom 环境里自检失败（`new TextEncoder().encode("") instanceof Uint8Array` 为假）
 *    ⇒ 用 jsdom 跑本文件连模块都加载不了。本文件零 DOM 需求，node 环境是正确档位。
 *
 * 为什么值得一条测试：这条锁的**两个失效方向都是静默的**——
 *   · 太松（第二个实例照样起）⇒ 它在 `dist/` 上 EPERM，**旧产物原样不动** ⇒ 作者看到的现象
 *     是「改了没反应」，与「源码树宿主发旧代码」症状完全重合（现场骗过 AI 两轮，§8.2/§8.3）；
 *   · 太紧（活锁没识别 / 陈旧锁不覆盖 / 退出不清锁）⇒ **合法开发者被一把死锁挡住**，
 *     而「删锁文件再跑」不会出现在任何文档里（比第一个方向更糟：工具直接不可用）。
 *
 * 🔴 锁的判据只有一条：**pid 是不是还活着**。下面既有纯函数级用例（覆盖陈旧/损坏/他锁），
 * 也有**真起一个子进程**的集成用例（`isProcessAlive` 与「启动即退出」只能真跑才算数）。
 */
import { describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireDevRealLock,
  cdpReloadPool,
  devRealLockPath,
  isProcessAlive,
  isViteSourceHost,
  releaseDevRealLock,
  renderViteSourceHostWarning,
  resetViteSourceHostWarning,
  runPluginDevReal,
  type DevRealLock,
} from "./dev-real.js";

function withTmpDir(fn: (dir: string) => void | Promise<void>): Promise<void> | void {
  const base = mkdtempSync(join(tmpdir(), "dev-real-lock-"));
  const done = (): void => rmSync(base, { recursive: true, force: true });
  try {
    const r = fn(base);
    if (r instanceof Promise) return r.finally(done);
    done();
  } catch (e) {
    done();
    throw e;
  }
  return undefined;
}

function writeLock(lockPath: string, lock: DevRealLock): void {
  mkdirSync(join(lockPath, ".."), { recursive: true });
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

describe("锁文件路径", () => {
  it("落在 plugins 根下的点号文件（壳发现层只认含 plugin.json 的目录 ⇒ 不会被当成插件）", () => {
    const p = devRealLockPath(join("C:", "userData", "plugins"), "serial-monitor");
    expect(p).toBe(join("C:", "userData", "plugins", ".dev-real-serial-monitor.lock"));
  });

  it("pluginId 里的路径分隔/怪字符被压成下划线（锁文件不许逃出 plugins 根）", () => {
    expect(devRealLockPath("/root", "../evil/id")).toBe(join("/root", ".dev-real-.._evil_id.lock"));
  });
});

describe("取锁", () => {
  it("正控：本来没有锁 ⇒ 取到，文件里写的是本进程 pid + 工程信息", () => {
    withTmpDir((dir) => {
      const lockPath = join(dir, "plugins", ".dev-real-demo.lock");
      const r = acquireDevRealLock(lockPath, { pluginId: "demo", root: dir });
      expect(r.ok).toBe(true);
      expect(r.holder).toBeNull();
      const written = JSON.parse(readFileSync(lockPath, "utf8")) as DevRealLock;
      expect(written.pid).toBe(process.pid);
      expect(written.pluginId).toBe("demo");
      expect(written.root).toBe(dir);
      expect(Number.isNaN(Date.parse(written.startedAt))).toBe(false);
    });
  });

  it("负控①（本格存在的唯一理由）：已有**活**实例 ⇒ 拒绝，且 holder 里报得出那个 pid", () => {
    withTmpDir((dir) => {
      const lockPath = join(dir, ".dev-real-demo.lock");
      writeLock(lockPath, { pid: 4242, pluginId: "demo", root: "/other/project", startedAt: "2026-09-18T00:00:00.000Z" });
      const r = acquireDevRealLock(lockPath, { pluginId: "demo", root: dir }, () => true);
      expect(r.ok).toBe(false);
      expect(r.holder?.pid).toBe(4242);
      expect(r.holder?.root).toBe("/other/project");
      // 🔴 拒绝时**不许**改写锁文件——上面那个实例还在跑，它的锁被别人盖掉就失去互斥意义
      expect((JSON.parse(readFileSync(lockPath, "utf8")) as DevRealLock).pid).toBe(4242);
    });
  });

  it("负控②：pid 已死 ⇒ 按陈旧锁覆盖（否则崩过一次的锁会永久挡住所有人）", () => {
    withTmpDir((dir) => {
      const lockPath = join(dir, ".dev-real-demo.lock");
      writeLock(lockPath, { pid: 4242, pluginId: "demo", root: "/gone", startedAt: "2026-09-18T00:00:00.000Z" });
      const r = acquireDevRealLock(lockPath, { pluginId: "demo", root: dir }, () => false);
      expect(r.ok).toBe(true);
      expect(r.notes.join()).toContain("陈旧锁");
      expect((JSON.parse(readFileSync(lockPath, "utf8")) as DevRealLock).pid).toBe(process.pid);
    });
  });

  it("负控③：锁文件损坏（半截 JSON / 缺 pid）⇒ 覆盖，不许让它变永久死锁", () => {
    withTmpDir((dir) => {
      const lockPath = join(dir, ".dev-real-demo.lock");
      writeFileSync(lockPath, '{"pid": 12', "utf8");
      const r = acquireDevRealLock(lockPath, { pluginId: "demo", root: dir });
      expect(r.ok).toBe(true);
      expect(r.notes.join()).toContain("读不出来");
      expect((JSON.parse(readFileSync(lockPath, "utf8")) as DevRealLock).pid).toBe(process.pid);
      // 「有 JSON 但 pid 不是整数」同判
      writeFileSync(lockPath, '{"pid": "abc"}', "utf8");
      expect(acquireDevRealLock(lockPath, { pluginId: "demo", root: dir }).ok).toBe(true);
    });
  });
});

describe("释放锁", () => {
  it("自己的锁 ⇒ 删掉（正常退出 / Ctrl+C 后不留锁）", () => {
    withTmpDir((dir) => {
      const lockPath = join(dir, ".dev-real-demo.lock");
      acquireDevRealLock(lockPath, { pluginId: "demo", root: dir });
      releaseDevRealLock(lockPath);
      expect(existsSync(lockPath)).toBe(false);
    });
  });

  it("别人的锁 ⇒ 不动（免得替在跑的实例解锁）", () => {
    withTmpDir((dir) => {
      const lockPath = join(dir, ".dev-real-demo.lock");
      writeLock(lockPath, { pid: 4242, pluginId: "demo", root: "/other", startedAt: "2026-09-18T00:00:00.000Z" });
      releaseDevRealLock(lockPath);
      expect(existsSync(lockPath)).toBe(true);
    });
  });

  it("锁不存在 ⇒ 静默（退出路径不抛）", () => {
    withTmpDir((dir) => {
      expect(() => releaseDevRealLock(join(dir, ".dev-real-none.lock"))).not.toThrow();
    });
  });
});

describe("pid 活体判据", () => {
  it("本进程 pid ⇒ 活；明显的死 pid ⇒ 死；0 / 非整数 ⇒ 死（不许让坏账把锁判活）", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(999_999_999)).toBe(false);
    expect(isProcessAlive(0)).toBe(false);
    expect(isProcessAlive(Number.NaN)).toBe(false);
  });
});

describe("runPluginDevReal 的并发闸（真起一个子进程当「第一个实例」）", () => {
  it("已有活实例 ⇒ **启动即抛错并报出 pid**（不许先跑完一轮 build 再在 dist/ 上 EPERM）", async () => {
    // 真进程（不是 isAlive 桩）：撑到测试结束就够，pid 活着 = 第二个实例的判据输入
    const holder = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" });
    const holderPid = holder.pid;
    try {
      expect(holderPid).toBeTypeOf("number");
      expect(isProcessAlive(holderPid as number)).toBe(true);

      const base = mkdtempSync(join(tmpdir(), "dev-real-run-"));
      const project = join(base, "my-plugin");
      const pluginsRoot = join(base, "userplugins");
      mkdirSync(project, { recursive: true });
      writeFileSync(
        join(project, "plugin.json"),
        `${JSON.stringify({ pluginId: "demo-plugin", name: "夹具", version: "1.0.0", entry: "src/index.tsx" }, null, 2)}\n`,
        "utf8",
      );
      // 「第一个实例」留在锁里的账：活 pid + 另一个工程根
      writeLock(devRealLockPath(pluginsRoot, "demo-plugin"), {
        pid: holderPid as number,
        pluginId: "demo-plugin",
        root: "/first/instance/project",
        startedAt: "2026-09-18T10:00:00.000Z",
      });

      const prev = process.env.LINKDESK_USER_PLUGINS_DIR;
      process.env.LINKDESK_USER_PLUGINS_DIR = pluginsRoot;
      try {
        await expect(runPluginDevReal(project)).rejects.toThrow(
          new RegExp(`已有一个 dev --real 在跑（pid ${holderPid}）`),
        );
      } finally {
        if (prev === undefined) delete process.env.LINKDESK_USER_PLUGINS_DIR;
        else process.env.LINKDESK_USER_PLUGINS_DIR = prev;
      }
      // 被拒的一方不碰锁：那把锁仍属于「第一个实例」
      expect((JSON.parse(readFileSync(devRealLockPath(pluginsRoot, "demo-plugin"), "utf8")) as DevRealLock).pid).toBe(
        holderPid,
      );
      rmSync(base, { recursive: true, force: true });
    } finally {
      holder.kill();
    }
  });
});

/** 桩 CDP：只答 `/json/list`（列表就是判别的那一步）；WebSocket 一律连不上 ⇒ 告警必须发生在连之前 */
async function withStubCdp(target: Record<string, unknown>, fn: (port: number) => Promise<void>): Promise<void> {
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.setHeader("connection", "close");
    res.end(JSON.stringify([target]));
  });
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", () => res()));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(port);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((res) => server.close(() => res()));
  }
}

describe("源码树宿主判据（E6#28.5d）", () => {
  it("正控：dev server 供的池文档（http(s) / /@fs/）⇒ 判为源码树宿主", () => {
    // 壳 dev 分支：loadURL(`${DEV_SERVER_URL}/pool.html`)（window-manager.ts:218）
    expect(isViteSourceHost("http://localhost:1420/pool.html")).toBe(true);
    expect(isViteSourceHost("http://127.0.0.1:1420/index.html")).toBe(true);
    // 🔴 判 scheme 而不是判端口：dev server 端口被占会漂到 1421/1422…，按端口判会在漂移时**静默漏报**
    expect(isViteSourceHost("http://localhost:1421/pool.html")).toBe(true);
    expect(isViteSourceHost("https://localhost:5173/pool.html")).toBe(true);
    // /@fs/ 是 Vite 外挂磁盘模块的特征，单独成立
    expect(isViteSourceHost("http://localhost:9999/@fs/E:/proj/node_modules/.vite/deps/x.js")).toBe(true);
  });

  it("负控：生产/安装版宿主的池文档形态一条都不命中（不误报）", () => {
    // 壳生产分支（app.isPackaged）：loadFile(.../dist/pool.html)（window-manager.ts:222）
    expect(isViteSourceHost("file:///E:/linkdesk/dist/pool.html")).toBe(false);
    expect(isViteSourceHost("file:///C:/Program%20Files/LinkDesk/resources/app.asar/dist/pool.html")).toBe(false);
    // 其他非 http 文档（加载失败页 / 空白 / 自定义协议）
    expect(isViteSourceHost("linkdesk://pool/pool.html")).toBe(false);
    expect(isViteSourceHost("chrome-error://chromewebdata/")).toBe(false);
    expect(isViteSourceHost("about:blank")).toBe(false);
    // 字段缺失 / 空（旧 CDP 不带 url）⇒ 判不了就不报（宁可不报也不误报）
    expect(isViteSourceHost(undefined)).toBe(false);
    expect(isViteSourceHost("")).toBe(false);
  });

  it("告警正文：报出池 URL ＋ 三条人话（源码树 / 安装版反而新鲜 / 换宿主）+ 可照抄的启动参数", () => {
    const text = renderViteSourceHostWarning(9222, "http://localhost:1420/pool.html");
    expect(text).toContain("http://localhost:1420/pool.html");
    expect(text).toContain("源码树");
    expect(text).toContain("安装版");
    expect(text).toContain("--remote-debugging-port=9222");
  });

  it("真路径（桩 CDP）：池目标出自 dev server ⇒ cdpReloadPool 真打告警，且**只打一次**；file:// 打包形态 ⇒ 一条不打", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const text = (): string => spy.mock.calls.map((c) => c.join(" ")).join("\n");
    try {
      await withStubCdp(
        { title: "LinkDesk Pool", url: "http://localhost:1420/pool.html", webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/page/x" },
        async (port) => {
          resetViteSourceHostWarning();
          // WS 连不上（桩没有 WS 服务端）⇒ 返回 false，但告警在连接之前就该已经打出来
          await cdpReloadPool(port).catch(() => false);
          expect(text()).toContain("源码树");
          expect(text()).toContain(":1420");
          const once = spy.mock.calls.length;
          expect(once).toBeGreaterThan(0);
          // 一个环里每轮 reload 都刷 = 噪音（盖掉真正的日志）⇒ 第二次不再打
          await cdpReloadPool(port).catch(() => false);
          expect(spy.mock.calls.length).toBe(once);
        },
      );

      spy.mockClear();
      await withStubCdp(
        {
          title: "LinkDesk Pool",
          url: "file:///C:/Program%20Files/LinkDesk/resources/app.asar/dist/pool.html",
          webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/page/x",
        },
        async (port) => {
          resetViteSourceHostWarning();
          await cdpReloadPool(port).catch(() => false);
          expect(text()).not.toContain("源码树");
        },
      );

      // 目标里没有 url 字段（旧 CDP / 字段缺失）⇒ 判不了就不报（宁可不报也不误报）
      spy.mockClear();
      await withStubCdp({ title: "LinkDesk Pool", webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/page/x" }, async (port) => {
        resetViteSourceHostWarning();
        await cdpReloadPool(port).catch(() => false);
        expect(text()).not.toContain("源码树");
      });
    } finally {
      spy.mockRestore();
    }
  });
});
