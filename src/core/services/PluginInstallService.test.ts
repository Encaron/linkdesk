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
  markRemoved,
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

describe("reconcileDiff（纯函数——E6#18③ 墓碑语义：目录有则加/清章，目录缺则置章，永不整条删）", () => {
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

  it("活性记录但目录已无 → 置 removed 墓碑（E6#18d——永不整条删，条目存活成历史）", () => {
    const current: InstalledLedger = {
      "demo-gone": { version: "1.0.0", installedAt: "2026-01-01T00:00:00.000Z", source: "user" },
      "demo-here": { version: "1.0.0", installedAt: "2026-01-01T00:00:00.000Z", source: "user" },
    };
    const disc = [{ pluginId: "demo-here", version: "1.0.0", source: "user" as const }];
    const { removed, next } = reconcileDiff(current, disc);
    expect(removed).toEqual(["demo-gone"]);
    // 墓碑化而非删除——demo-gone 存活，removed:true；demo-here 不受影响（无 removed）
    expect(next["demo-gone"]).toMatchObject({ version: "1.0.0", removed: true });
    expect(next["demo-here"].removed).toBeUndefined();
    expect(Object.keys(next).sort()).toEqual(["demo-gone", "demo-here"]);
  });

  it("目录重现 + removed 墓碑 → 清章（restored——装回语义），保留原 installedAt", () => {
    const current: InstalledLedger = {
      "demo-back": { version: "1.0.0", installedAt: "2026-01-01T00:00:00.000Z", source: "user", removed: true },
    };
    const disc = [{ pluginId: "demo-back", version: "1.0.0", source: "user" as const }];
    const { restored, added, removed, next } = reconcileDiff(current, disc);
    expect(restored).toEqual(["demo-back"]);
    expect(next["demo-back"].removed).toBeUndefined(); // 章已清
    expect(next["demo-back"].installedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });

  it("目录缺 + 已是墓碑 → 保留不重计（removed[] 不含墓碑条目）", () => {
    const current: InstalledLedger = {
      "demo-dead": { version: "1.0.0", installedAt: "2026-01-01T00:00:00.000Z", source: "user", removed: true },
    };
    const disc: Array<{ pluginId: string; version: string; source: "user" | "builtin" }> = [];
    const { removed, next } = reconcileDiff(current, disc);
    expect(removed).toEqual([]); // 已是墓碑——不重计
    expect(next["demo-dead"]).toMatchObject({ removed: true }); // 墓碑原样保留
  });

  it("marketplace 记录目录缺 → 同样置章（零来源分支——source 是出身记录非行为开关）", () => {
    const current: InstalledLedger = {
      "demo-market": { version: "1.0.0", installedAt: "2026-01-01T00:00:00.000Z", source: "marketplace" },
    };
    const disc: Array<{ pluginId: string; version: string; source: "user" | "builtin" }> = [];
    const { removed, next } = reconcileDiff(current, disc);
    expect(removed).toEqual(["demo-market"]);
    expect(next["demo-market"]).toMatchObject({ removed: true }); // 置章非删条
  });
});

describe("I/O——add/markRemoved/isInstalled/getSource（经 StorageService 内存桩）", () => {
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

  it("add 装回销章（E6#18e）：removed 墓碑 → 新条目不带 removed，isInstalled 复 true", async () => {
    await add("demo-alpha", "1.0.0", "user");
    await markRemoved("demo-alpha"); // 先卸载墓碑化
    expect(await isInstalled("demo-alpha")).toBe(false);
    await add("demo-alpha", "1.0.0", "user"); // 装回（市场/手装 zip/update 同走 add）
    const calls = storage.write.mock.calls;
    const after = (calls[calls.length - 1][1] as InstalledLedger);
    expect(after["demo-alpha"]).toMatchObject({ version: "1.0.0", source: "user" });
    expect(after["demo-alpha"].removed).toBeUndefined(); // 章清 = 用户改主意 = 解除豁免
    expect(await isInstalled("demo-alpha")).toBe(true);
  });

  it("markRemoved 墓碑化：保留版本/来源历史，isInstalled=false、getSource 仍返回出身（E6#18f 不动 getSource）", async () => {
    await add("demo-alpha", "1.0.0", "user");
    expect(await isInstalled("demo-alpha")).toBe(true);
    await markRemoved("demo-alpha");
    expect(await isInstalled("demo-alpha")).toBe(false); // 墓碑不显「已装」
    expect(await getSource("demo-alpha")).toBe("user"); // source 是出身记录，读墓碑也返回（update.ts 保源重装依赖）
    const ledger = await getInstalled();
    expect(ledger["demo-alpha"]).toMatchObject({ version: "1.0.0", removed: true });
  });

  it("markRemoved 无既有条目 → upsert 占位墓碑（0.0.0）——堵 crash 窗口种子腿复活缝", async () => {
    await markRemoved("demo-ghost");
    const ledger = await getInstalled();
    expect(ledger["demo-ghost"]).toMatchObject({ version: "0.0.0", source: "user", removed: true });
    expect(await isInstalled("demo-ghost")).toBe(false);
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
    expect(res).toEqual({ added: [], updated: [], restored: [], removed: [] });
    expect(storage.write).not.toHaveBeenCalled();
  });

  it("接线 restored——墓碑 + 目录重现 → 清章落盘 + 幂等", async () => {
    await markRemoved("demo-alpha"); // 模拟卸载墓碑
    expect(await isInstalled("demo-alpha")).toBe(false);
    const entries = [entry("demo-alpha", { originHome: "userData" })]; // 目录又回来了（装回/重铺）
    const first = await reconcileInstalledLedger(entries);
    expect(first.restored).toEqual(["demo-alpha"]);
    expect(await isInstalled("demo-alpha")).toBe(true); // 章已清
    // 幂等——章清后同状态再跑不写盘
    vi.clearAllMocks();
    const second = await reconcileInstalledLedger(entries);
    expect(second.restored).toEqual([]);
    expect(storage.write).not.toHaveBeenCalled();
  });
});

/**
 * E6#73q：账本写串行化——`add`/`markRemoved`/`reconcile*` 都是读-改-写。
 * 病根：7 路安装并发（N=3 槽放开后更是常态）时各自读到同一份旧账本、各自写回，
 * **后者覆盖前者 → 最多丢 6 条账本**（插件装了但「已安装」判定说没有）。修法 = 一条 Promise 链。
 */
describe("账本写串行化（E6#73q 并发不丢条目）", () => {
  it("7 路并发 add（含慢读）——全部落账，无丢失更新", async () => {
    // 让 read 慢一拍：不串行化时 7 个 add 会全部读到同一份空账本，只有最后一个的写生效
    const realRead = storage.read.getMockImplementation()!;
    storage.read.mockImplementation(async (key: string) => {
      await new Promise((r) => setTimeout(r, 1));
      return realRead(key);
    });

    const ids = [1, 2, 3, 4, 5, 6, 7].map((i) => `demo-install-${i}`);
    await Promise.all(ids.map((id) => add(id, "1.0.0", "marketplace")));

    const ledger = await getInstalled();
    expect(Object.keys(ledger).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(await isInstalled(id)).toBe(true);
  });

  it("并发 add + markRemoved 交错——两者都生效（不互相覆盖）", async () => {
    await add("demo-target", "1.0.0", "user");
    const other = [1, 2, 3].map((i) => `demo-other-${i}`);
    await Promise.all([...other.map((id) => add(id, "1.0.0", "marketplace")), markRemoved("demo-target")]);

    const ledger = await getInstalled();
    expect(ledger["demo-target"].removed).toBe(true);
    for (const id of other) expect(ledger[id]).toBeDefined();
  });

  it("单次写失败不毒化写链——本次如实 reject，后续写照常成功", async () => {
    const realWrite = storage.write.getMockImplementation()!;
    storage.write.mockImplementationOnce(async () => { throw new Error("磁盘满了"); });
    // 失败如实上报（调用方该知道这次没写进去），但链尾已吞异常——不能让后续写全部连坐
    await expect(add("demo-boom", "1.0.0", "user")).rejects.toThrow("磁盘满了");
    storage.write.mockImplementation(realWrite as never);

    await add("demo-after", "1.0.0", "user");
    expect(await isInstalled("demo-after")).toBe(true);
    expect(await isInstalled("demo-boom")).toBe(false);
  });
});
