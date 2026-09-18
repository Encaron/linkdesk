/**
 * @vitest-environment node
 *
 * `dev --real` **并发互斥锁**（E6#28.5e）单测——出处 04-作者真机调试环.md §8.2/§8.4。
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
import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireDevRealLock,
  devRealLockPath,
  isProcessAlive,
  releaseDevRealLock,
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
