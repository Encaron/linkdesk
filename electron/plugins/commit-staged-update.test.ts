/**
 * commit-staged-update 单测——0.2.48「被占用挡下的更新，启动补提交」。
 *
 * 钉住：① busy 耗尽 ⇒ {@link DirBusyError} 且**磁盘未动**（target 原样 + 暂存原样，deferred 的前提）；
 * ② 正常提交（target→bak→staged→target→rm bak 全链）；③ 启动补提交三关校验——清单可读＋pluginId 一致 /
 * 目标在场 / 版本方向，任何一关不过**不盲装**（留给启动清理）；④ 暂存目录不在受控 tmp ⇒ 拒绝提交。
 * 全部真 fs（临时目录），无 mock——rename 链的语义只有真盘能证明。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

let root: string;

/** 环境注入口——downloadTmpDir/userPluginsRoot 均以 app.getPath 为锚，测试改写这两个 path */
vi.mock("electron", () => ({
  app: { getPath: (_: string) => root },
}));

import {
  applyStagedUpdate,
  commitPendingStagedUpdates,
  DirBusyError,
} from "./commit-staged-update";

const OLD_MANIFEST = JSON.stringify({ pluginId: "demo-app", name: "Demo", version: "1.0.0" });
const NEW_MANIFEST = JSON.stringify({ pluginId: "demo-app", name: "Demo", version: "1.1.0" });

/** 造盘：已装旧版 + 受控 tmp 内的新版暂存 */
async function seedStaged(): Promise<{ target: string; staged: string }> {
  const target = path.join(root, "plugins", "demo-app");
  const staged = path.join(root, "tmp", ".stage-demo-app");
  await fs.mkdir(path.join(target), { recursive: true });
  await fs.writeFile(path.join(target, "plugin.json"), OLD_MANIFEST);
  await fs.writeFile(path.join(target, "index.js"), "old");
  await fs.mkdir(staged, { recursive: true });
  await fs.writeFile(path.join(staged, "plugin.json"), NEW_MANIFEST);
  await fs.writeFile(path.join(staged, "index.js"), "new");
  return { target, staged };
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "commit-staged-"));
  await fs.mkdir(path.join(root, "plugins"), { recursive: true });
  await fs.mkdir(path.join(root, "tmp"), { recursive: true });
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("applyStagedUpdate（提交单复本）", () => {
  it("① 正常提交：新版入位、.bak 清掉、返回暂存版本号", async () => {
    const { target, staged } = await seedStaged();
    const r = await applyStagedUpdate("demo-app", staged);
    expect(r).toEqual({ pluginId: "demo-app", version: "1.1.0" });
    expect(await fs.readFile(path.join(target, "index.js"), "utf8")).toBe("new");
    expect(await fs.readFile(path.join(target, "plugin.json"), "utf8")).toBe(NEW_MANIFEST);
    await expect(fs.stat(`${target}.bak`)).rejects.toThrow();
    await expect(fs.stat(staged)).rejects.toThrow(); // 暂存目录已 rename 入位
  });

  it("② 暂存目录不在受控 tmp ⇒ 拒绝提交（防任意路径替换）", async () => {
    await fs.mkdir(path.join(root, "plugins", "demo-app"), { recursive: true }); // 先有目标（实现先验目标再验路径）
    const outside = path.join(root, "outside-stage");
    await fs.mkdir(outside, { recursive: true });
    await fs.writeFile(path.join(outside, "plugin.json"), NEW_MANIFEST);
    await expect(applyStagedUpdate("demo-app", outside)).rejects.toThrow("受控 tmp");
  });

  it("③ 目标不存在 ⇒ 报错（提交只做替换，不越权安装）", async () => {
    const staged = path.join(root, "tmp", ".stage-demo-app");
    await fs.mkdir(staged, { recursive: true });
    await fs.writeFile(path.join(staged, "plugin.json"), NEW_MANIFEST);
    await expect(applyStagedUpdate("demo-app", staged)).rejects.toThrow("未安装");
  });

  it("④ 目录被占（本进程 CWD 锚住）⇒ DirBusyError 且磁盘未动（deferred 的前提）", async () => {
    // Windows 上「目录是某进程的 CWD」⇒ rename 报 EBUSY（handler 注释的实测取证）——本测试进程自己 chdir 进去当持柄者。
    // 重试表总时长 ~5s 走满 ⇒ 本例是慢测试（全文件唯一一例）。用完立刻 chdir 还原（worker 进程共用）。
    const { target, staged } = await seedStaged();
    const prevCwd = process.cwd();
    process.chdir(target);
    try {
      await expect(applyStagedUpdate("demo-app", staged)).rejects.toBeInstanceOf(DirBusyError);
      // 磁盘未动：旧版在位（target 原名）、暂存原样——deferred 之后启动补提交才动它们
      expect(await fs.readFile(path.join(target, "index.js"), "utf8")).toBe("old");
      expect(await fs.readFile(path.join(staged, "index.js"), "utf8")).toBe("new");
    } finally {
      process.chdir(prevCwd);
    }
  }, 20000);
});

describe("commitPendingStagedUpdates（启动补提交 · 三关校验）", () => {
  it("① 合法遗留 ⇒ 提交入位并返回 pluginId", async () => {
    await seedStaged();
    expect(await commitPendingStagedUpdates()).toEqual(["demo-app"]);
    expect(await fs.readFile(path.join(root, "plugins", "demo-app", "index.js"), "utf8")).toBe("new");
  });

  it("② 半截暂存（无清单）/ pluginId 不符 ⇒ 不盲装，留给启动清理", async () => {
    const half = path.join(root, "tmp", ".stage-demo-app");
    await fs.mkdir(half, { recursive: true });
    await fs.writeFile(path.join(half, "index.js"), "broken"); // 无 plugin.json
    expect(await commitPendingStagedUpdates()).toEqual([]);
    expect(await fs.readFile(path.join(half, "index.js"), "utf8")).toBe("broken");

    const fake = path.join(root, "tmp", ".stage-demo-app");
    await fs.rm(half, { recursive: true, force: true });
    await fs.mkdir(fake, { recursive: true });
    await fs.writeFile(path.join(fake, "plugin.json"), JSON.stringify({ pluginId: "other-app", version: "9.0.0" }));
    expect(await commitPendingStagedUpdates()).toEqual([]);
  });

  it("③ 版本方向：暂存不比已装新 ⇒ 作废（不回退）", async () => {
    const { target, staged } = await seedStaged();
    // 已装改成比暂存还新
    await fs.writeFile(path.join(target, "plugin.json"), JSON.stringify({ pluginId: "demo-app", version: "2.0.0" }));
    expect(await commitPendingStagedUpdates()).toEqual([]);
    expect(await fs.readFile(path.join(target, "plugin.json"), "utf8")).toContain("2.0.0");
    await expect(fs.stat(staged)).resolves.toBeTruthy(); // 暂存留给启动清理删
  });

  it("④ 目标已卸载 ⇒ 暂存作废", async () => {
    const { target, staged } = await seedStaged();
    await fs.rm(target, { recursive: true, force: true });
    expect(await commitPendingStagedUpdates()).toEqual([]);
    await expect(fs.stat(staged)).resolves.toBeTruthy();
  });
});
