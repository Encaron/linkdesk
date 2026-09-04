/**
 * PluginInstallService 测试——E6#12（1.2-4）账本 owner 纯函数 + I/O。
 *
 * 测试卫生：账本文件名/字面量只准出现在 PluginInstallService.ts（审计 grep 规则）；
 * 本测试经 vi.mock StorageService + 内存状态桩测 I/O，文件内不出现该字面量。
 * fixture 全部虚构 id（硬约束 21）。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PluginDiscoveryEntry } from "../api/linkdesk-api/types";
import type { PluginManifest } from "../api/types";

// 状态桩：StorageService.read/write 背后一个内存账本（I/O 测试替身，不含文件名字面量）
const storage = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  return {
    store,
    read: vi.fn(async <T>(key: string): Promise<T | null> => (store.has(key) ? (store.get(key) as T) : null)),
    write: vi.fn(async (key: string, value: unknown): Promise<void> => { store.set(key, value); }),
  };
});

vi.mock("./configuration/StorageService", () => ({
  read: storage.read,
  write: storage.write,
}));

import {
  selectUserDataPlugins,
  reconcileDiff,
  add,
  remove,
  isInstalled,
  getSource,
  getInstalled,
  reconcileInstalledLedger,
  type InstalledLedger,
} from "./PluginInstallService";

/** 造一条发现条目——manifest 带 name/version，origin 由参数给 */
function entry(
  pluginId: string,
  opts: { originHome?: "app" | "userData"; subdir?: string | null; version?: string } = {},
): PluginDiscoveryEntry {
  const manifest: PluginManifest = {
    name: pluginId,
    version: opts.version ?? "1.0.0",
  };
  const e: PluginDiscoveryEntry = { pluginId, manifest };
  if (opts.originHome !== undefined) {
    e.origin = { home: opts.originHome, subdir: opts.subdir ?? "user" };
  }
  return e;
}

beforeEach(() => {
  storage.store.clear();
  vi.clearAllMocks();
});

describe("selectUserDataPlugins（纯函数）", () => {
  it("只收 userData 家——app 根与无 origin（浏览器 glob 种子）恒滤除", () => {
    const got = selectUserDataPlugins([
      entry("demo-alpha", { originHome: "userData" }),
      entry("demo-beta", { originHome: "app" }),
      entry("demo-gamma"), // 无 origin
    ]);
    expect(got.map((d) => d.pluginId)).toEqual(["demo-alpha"]);
  });

  it("subdir → source：user → user；builtin → builtin；root-direct（null）→ user", () => {
    const got = selectUserDataPlugins([
      entry("demo-user", { originHome: "userData", subdir: "user" }),
      entry("demo-builtin", { originHome: "userData", subdir: "builtin" }),
      entry("demo-root", { originHome: "userData", subdir: null }),
    ]);
    const byId = Object.fromEntries(got.map((d) => [d.pluginId, d.source]));
    expect(byId["demo-user"]).toBe("user");
    expect(byId["demo-builtin"]).toBe("builtin");
    expect(byId["demo-root"]).toBe("user");
  });

  it("version 取 manifest.version；manifest 无 version → 0.0.0 占位", () => {
    // 磁盘上残缺 manifest（无 version）——类型层不允，runtime 可能（cast 模拟真实脏盘）
    const noVersion = { name: "demo-nover" } as PluginManifest;
    const got = selectUserDataPlugins([
      entry("demo-ver", { originHome: "userData", version: "2.1.0" }),
      { pluginId: "demo-nover", manifest: noVersion, origin: { home: "userData", subdir: "user" } },
    ]);
    expect(got).toContainEqual({ pluginId: "demo-ver", version: "2.1.0", source: "user" });
    expect(got).toContainEqual({ pluginId: "demo-nover", version: "0.0.0", source: "user" });
  });

  it("结果按 pluginId 字典序确定性排列", () => {
    const got = selectUserDataPlugins([
      entry("demo-zz", { originHome: "userData" }),
      entry("demo-aa", { originHome: "userData" }),
    ]);
    expect(got.map((d) => d.pluginId)).toEqual(["demo-aa", "demo-zz"]);
  });
});

describe("reconcileDiff（纯函数——目录有则加、builtin/user 目录无则删、marketplace 不动）", () => {
  it("空账本 + 有目录 → 全部 added；不 mutate 入参", () => {
    const current: InstalledLedger = {};
    const disc = [
      { pluginId: "demo-alpha", version: "1.0.0", source: "user" as const },
      { pluginId: "demo-beta", version: "1.0.0", source: "user" as const },
    ];
    const { next, added, removed, updated } = reconcileDiff(current, disc);
    expect(added.sort()).toEqual(["demo-alpha", "demo-beta"]);
    expect(removed).toEqual([]);
    expect(updated).toEqual([]);
    expect(Object.keys(next).sort()).toEqual(["demo-alpha", "demo-beta"]);
    expect(next["demo-alpha"]).toMatchObject({ version: "1.0.0", source: "user" });
    expect(next["demo-alpha"].installedAt).toBeTruthy();
    expect(current).toEqual({}); // 入参未被改
  });

  it("同版本已记录 → 幂等无变化", () => {
    const current: InstalledLedger = {
      "demo-alpha": { version: "1.0.0", installedAt: "2026-01-01T00:00:00.000Z", source: "user" },
    };
    const disc = [{ pluginId: "demo-alpha", version: "1.0.0", source: "user" as const }];
    const { added, updated, removed } = reconcileDiff(current, disc);
    expect(added).toEqual([]);
    expect(updated).toEqual([]);
    expect(removed).toEqual([]);
  });

  it("版本不同 → updated 且保留原 installedAt", () => {
    const current: InstalledLedger = {
      "demo-alpha": { version: "1.0.0", installedAt: "2026-01-01T00:00:00.000Z", source: "user" },
    };
    const disc = [{ pluginId: "demo-alpha", version: "2.0.0", source: "user" as const }];
    const { next, updated } = reconcileDiff(current, disc);
    expect(updated).toEqual(["demo-alpha"]);
    expect(next["demo-alpha"]).toMatchObject({ version: "2.0.0", installedAt: "2026-01-01T00:00:00.000Z" });
  });

  it("builtin/user 记录但目录已无 → removed（删文件=删记录）", () => {
    const current: InstalledLedger = {
      "demo-gone": { version: "1.0.0", installedAt: "2026-01-01T00:00:00.000Z", source: "user" },
      "demo-here": { version: "1.0.0", installedAt: "2026-01-01T00:00:00.000Z", source: "user" },
    };
    const disc = [{ pluginId: "demo-here", version: "1.0.0", source: "user" as const }];
    const { removed } = reconcileDiff(current, disc);
    expect(removed).toEqual(["demo-gone"]);
  });

  it("marketplace 源记录不被目录差集自动删（市场记录语义独立）", () => {
    const current: InstalledLedger = {
      "demo-market": { version: "1.0.0", installedAt: "2026-01-01T00:00:00.000Z", source: "marketplace" },
    };
    const disc: Array<{ pluginId: string; version: string; source: "user" | "builtin" }> = [];
    const { removed } = reconcileDiff(current, disc);
    expect(removed).toEqual([]);
  });
});

describe("I/O——add/remove/isInstalled/getSource（经 StorageService 内存桩）", () => {
  it("add 首次装记 installedAt + source；重装保 installedAt、更 version", async () => {
    await add("demo-alpha", "1.0.0", "user");
    const afterFirst = (storage.write.mock.calls[0][1] as InstalledLedger);
    expect(afterFirst["demo-alpha"]).toMatchObject({ version: "1.0.0", source: "user" });
    const firstAt = afterFirst["demo-alpha"].installedAt;
    expect(firstAt).toBeTruthy();

    await add("demo-alpha", "2.0.0", "user");
    const afterSecond = (storage.write.mock.calls[1][1] as InstalledLedger);
    expect(afterSecond["demo-alpha"].version).toBe("2.0.0");
    expect(afterSecond["demo-alpha"].installedAt).toBe(firstAt); // 安装日期保留
  });

  it("getInstalled 全量读——经内存桩反映 add 后的账本", async () => {
    await add("demo-alpha", "1.0.0", "user");
    const all = await getInstalled();
    expect(Object.keys(all)).toEqual(["demo-alpha"]);
  });

  it("remove 删记录；isInstalled/getSource 反映状态", async () => {
    await add("demo-alpha", "1.0.0", "user");
    expect(await isInstalled("demo-alpha")).toBe(true);
    expect(await getSource("demo-alpha")).toBe("user");
    await remove("demo-alpha");
    expect(await isInstalled("demo-alpha")).toBe(false);
    expect(await getSource("demo-alpha")).toBeNull();
  });
});

describe("reconcileInstalledLedger（loader 启动接线：userData 家 → 账本对齐；幂等无写盘）", () => {
  it("发现 userData 插件 → 写账本；同状态二次跑 → 不写", async () => {
    const entries = [entry("demo-alpha", { originHome: "userData" })];
    const first = await reconcileInstalledLedger(entries);
    expect(first.added).toEqual(["demo-alpha"]);
    expect(storage.write).toHaveBeenCalledTimes(1);

    // 幂等——同版本同目录再跑，无 diff → 不再写盘
    vi.clearAllMocks();
    const second = await reconcileInstalledLedger(entries);
    expect(second.added).toEqual([]);
    expect(storage.write).not.toHaveBeenCalled();
  });

  it("app 根插件永不写账本", async () => {
    const entries = [entry("demo-src", { originHome: "app" })];
    const res = await reconcileInstalledLedger(entries);
    expect(res).toEqual({ added: [], updated: [], removed: [] });
    expect(storage.write).not.toHaveBeenCalled();
  });
});
