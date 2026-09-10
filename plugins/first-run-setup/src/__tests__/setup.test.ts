/**
 * setup 单测——E6#73p：插件在本机做一次性配置并**发一条带自己来源的通知**。
 *
 * 本文件盯的是这个插件存在的全部理由，所以断言集中在两件事：**盘上真的落了东西**、
 * **通知只在真落盘时才发且 source 报的是自己**。这两条错一条，样板就教坏后来人。
 *
 * fixture 全虚构（硬约束 21）：目录名/配置内容用明显虚构值，不指向真实插件与真实用户路径。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SetupResult } from "../services/setup";

/** 内存假文件系统——只实现被测面用到的四个方法 */
interface FakeFs {
  files: Map<string, string>;
  failWrite: boolean;
}

/** 记录一次 notifications.show 调用 */
interface ShowCall {
  message: string;
  opts: { type?: string; source?: string } | undefined;
}

/** 搭一个 window.linkdesk 替身，返回可观测的调用记录 + 假 FS */
function installLinkdesk(opts: { dataDir?: string | null; fs?: FakeFs } = {}) {
  const fs: FakeFs = opts.fs ?? { files: new Map(), failWrite: false };
  const shows: ShowCall[] = [];
  const writes: string[] = [];
  const dataDir = opts.dataDir === undefined ? "/fake-userdata/plugins/demo-setup/data" : opts.dataDir;

  window.linkdesk = {
    workspace: {
      env: {
        get: () =>
          Promise.resolve({
            appDataDir: "/fake-userdata",
            pluginsRootDir: "/fake-userdata/plugins",
            appPluginsDir: "/fake-app-plugins",
            userPluginsDir: "/fake-userdata/plugins",
            pluginDataDir: dataDir ?? undefined,
            pluginCacheDir: dataDir ? `${dataDir}/../cache` : undefined,
            pluginExportsDir: dataDir ? `${dataDir}/../exports` : undefined,
          }),
      },
      path: {
        normalize: (p: string) => p,
        join: (...parts: string[]) => parts.join("/"),
        basename: (p: string) => p.split("/").pop() ?? p,
        dirname: (p: string) => p.split("/").slice(0, -1).join("/"),
        extname: () => ".json",
      },
    },
    filesystem: {
      exists: (p: string) => Promise.resolve(fs.files.has(p)),
      readTextFile: (p: string) => {
        const v = fs.files.get(p);
        if (v === undefined) return Promise.reject(new Error("ENOENT"));
        return Promise.resolve(v);
      },
      writeTextFile: (p: string, d: string) => {
        if (fs.failWrite) return Promise.reject(new Error("EACCES: 只读"));
        fs.files.set(p, d);
        writes.push(p);
        return Promise.resolve();
      },
    },
    notifications: {
      show: (message: string, o?: { type?: string; source?: string }) => {
        shows.push({ message, opts: o });
        return Promise.resolve({ id: "handle-1" });
      },
    },
  } as unknown as typeof window.linkdesk;

  return { fs, shows, writes, dataDir };
}

/** 每个用例拿模块新实例——`_inflight`/配置内容都是模块级之外的盘上状态，必须隔离 */
async function loadSetup() {
  vi.resetModules();
  return import("../services/setup");
}

const CONFIG_PATH = "/fake-userdata/plugins/demo-setup/data/config.json";

beforeEach(() => {
  vi.resetModules();
});

describe("首次配置——本机没配过", () => {
  it("落盘 config.json + 发一条通知，source 报自己", async () => {
    const { shows, writes, fs } = installLinkdesk();
    const { runFirstRunSetup } = await loadSetup();

    const r = (await runFirstRunSetup()) as Extract<SetupResult, { ok: true }>;

    expect(r.ok).toBe(true);
    expect(r.already).toBe(false);
    expect(writes).toEqual([CONFIG_PATH]);

    // 落盘内容写的是**本机事实**，不是偏好
    const written = JSON.parse(fs.files.get(CONFIG_PATH)!);
    expect(written.schema).toBe(1);
    expect(written.pluginId).toBe("first-run-setup");
    expect(written.dirs.data).toBe("/fake-userdata/plugins/demo-setup/data");
    expect(typeof written.configuredAt).toBe("string");
    expect(Number.isNaN(Date.parse(written.configuredAt))).toBe(false);

    expect(shows).toHaveLength(1);
    expect(shows[0].opts?.source).toBe("first-run-setup");
  });

  it("env 拿不到 pluginDataDir → 失败，且不写盘、不发通知", async () => {
    const { shows, writes } = installLinkdesk({ dataDir: null });
    const { runFirstRunSetup } = await loadSetup();

    const r = await runFirstRunSetup();

    expect(r.ok).toBe(false);
    expect(writes).toEqual([]);
    expect(shows).toEqual([]);
  });

  it("写盘失败 → 失败，且**不发通知**（通知不得掩盖没配成）", async () => {
    const { shows, fs } = installLinkdesk();
    fs.failWrite = true;
    const { runFirstRunSetup } = await loadSetup();

    const r = await runFirstRunSetup();

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toContain("EACCES");
    expect(shows).toEqual([]);
  });
});

describe("已配置过——安静，不重播", () => {
  it("config.json 已在 → already:true，不写盘、**不发通知**", async () => {
    const { shows, writes, fs } = installLinkdesk();
    const prev = JSON.stringify({ schema: 1, pluginId: "first-run-setup", configuredAt: "2026-01-01T00:00:00.000Z", dirs: { data: "d", cache: "c", exports: "e" } });
    fs.files.set(CONFIG_PATH, prev);
    const { runFirstRunSetup } = await loadSetup();

    const r = (await runFirstRunSetup()) as Extract<SetupResult, { ok: true }>;

    expect(r.ok).toBe(true);
    expect(r.already).toBe(true);
    expect(r.config.configuredAt).toBe("2026-01-01T00:00:00.000Z");
    expect(writes).toEqual([]);
    // 一次性的事重复播报就是噪声——这里一条都不该有
    expect(shows).toEqual([]);
  });

  it("config.json 读坏（非法 JSON）→ 当没配过，重写 + 出声", async () => {
    const { shows, writes, fs } = installLinkdesk();
    fs.files.set(CONFIG_PATH, "{ 这不是 JSON");
    const { runFirstRunSetup } = await loadSetup();

    const r = (await runFirstRunSetup()) as Extract<SetupResult, { ok: true }>;

    expect(r.already).toBe(false);
    expect(writes).toEqual([CONFIG_PATH]);
    expect(shows).toHaveLength(1);
  });

  it("config.json schema 不是 1（将来换形状）→ 当没配过，重写", async () => {
    const { fs, shows } = installLinkdesk();
    fs.files.set(CONFIG_PATH, JSON.stringify({ schema: 0 }));
    const { runFirstRunSetup } = await loadSetup();

    const r = (await runFirstRunSetup()) as Extract<SetupResult, { ok: true }>;

    expect(r.already).toBe(false);
    expect(shows).toHaveLength(1);
  });
});

describe("force——重新配置（按钮/命令走这条）", () => {
  it("已配置过也覆盖重写，并**再发一次**通知", async () => {
    const { shows, writes, fs } = installLinkdesk();
    fs.files.set(CONFIG_PATH, JSON.stringify({ schema: 1, pluginId: "first-run-setup", configuredAt: "2026-01-01T00:00:00.000Z", dirs: { data: "d", cache: "c", exports: "e" } }));
    const { runFirstRunSetup } = await loadSetup();

    const r = (await runFirstRunSetup({ force: true })) as Extract<SetupResult, { ok: true }>;

    expect(r.already).toBe(false);
    expect(writes).toEqual([CONFIG_PATH]);
    expect(JSON.parse(fs.files.get(CONFIG_PATH)!).configuredAt).not.toBe("2026-01-01T00:00:00.000Z");
    expect(shows).toHaveLength(1);
    expect(shows[0].opts?.source).toBe("first-run-setup");
  });
});

describe("并发合并——视图与状态栏各触发一次，只该配一遍", () => {
  it("两次并发调用 → 一次写盘、一条通知", async () => {
    const { shows, writes } = installLinkdesk();
    const { runFirstRunSetup } = await loadSetup();

    const [a, b] = await Promise.all([runFirstRunSetup(), runFirstRunSetup()]);

    expect(a).toBe(b); // 同一次进行中的 Promise——不是各跑一遍
    expect(writes).toEqual([CONFIG_PATH]);
    expect(shows).toHaveLength(1);
  });

  it("头一次结束后再调 → 走「已配置」安静分支（不重复出声）", async () => {
    const { shows, writes } = installLinkdesk();
    const { runFirstRunSetup } = await loadSetup();

    await runFirstRunSetup();
    const again = (await runFirstRunSetup()) as Extract<SetupResult, { ok: true }>;

    expect(again.already).toBe(true);
    expect(writes).toEqual([CONFIG_PATH]);
    expect(shows).toHaveLength(1);
  });
});
