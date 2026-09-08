/**
 * installedUpdateMeta 存储域单测——E6#33 更新元数据三字段（lastNotifiedVersion / autoUpdate /
 * pinnedVersion）落 marketplace pluginState（2026-09-08 拍板：owner 归市场插件自持，零壳改动）。
 * 覆盖：纯 merge/patch 语义（undefined/null = 删字段、删空去条目、未变不写）+ 选择器缺省 +
 * IO 注入读写（store.get 拒绝/垃圾落盘 → 空图不崩、store.set 拒绝 → 静默）。零真实存储。
 * fixture 全虚构（硬约束 21）：demo-* 插件 id，版本纯字面量。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mergeUpdateMeta,
  patchUpdateMetaMap,
  isAutoUpdateOn,
  getPinnedVersion,
  getLastNotified,
  readUpdateMetaMap,
  readPluginUpdateMeta,
  patchUpdateMeta,
  setAutoUpdate,
  setPinnedVersion,
  noteNotifiedVersion,
  clearNotifiedVersion,
  __setMetaStore,
  type MetaStore,
  type InstalledUpdateMetaMap,
  type PluginUpdateMeta,
} from "../services/installedUpdateMeta";

/* ── IO 替身（map 底 + 可拒绝开关——仿真 pluginState 的主进程持久层） ── */

function fakeStore(seed?: InstalledUpdateMetaMap): MetaStore & { map: Map<string, unknown>; failGet?: () => void; failSet?: () => void } {
  const map = new Map<string, unknown>();
  if (seed) map.set("installedUpdateMeta", seed);
  const store = {
    map,
    failGet: undefined as undefined | (() => void),
    failSet: undefined as undefined | (() => void),
    async get<T = unknown>(key: string): Promise<T | undefined> {
      if (store.failGet) store.failGet();
      return map.get(key) as T | undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
      if (store.failSet) store.failSet();
      map.set(key, value);
    },
  };
  return store;
}

describe("installedUpdateMeta 纯语义（E6#33 更新元数据域）", () => {
  beforeEach(() => {
    __setMetaStore(null);
    Reflect.deleteProperty(window, "linkdesk");
  });
  afterEach(() => {
    __setMetaStore(null);
    Reflect.deleteProperty(window, "linkdesk");
  });

  /* ── mergeUpdateMeta ── */

  it("mergeUpdateMeta：空 base 收 patch 全字段", () => {
    const m = mergeUpdateMeta(undefined, { autoUpdate: true, pinnedVersion: "1.0.0", lastNotifiedVersion: "1.0.0" });
    expect(m).toEqual({ autoUpdate: true, pinnedVersion: "1.0.0", lastNotifiedVersion: "1.0.0" });
  });

  it("mergeUpdateMeta：patch 只碰字段，未涉及字段保留（base 不 mutate）", () => {
    const base: PluginUpdateMeta = { autoUpdate: true, pinnedVersion: "1.0.0" };
    const m = mergeUpdateMeta(base, { lastNotifiedVersion: "1.1.0" });
    expect(m).toEqual({ autoUpdate: true, pinnedVersion: "1.0.0", lastNotifiedVersion: "1.1.0" });
    expect(base).toEqual({ autoUpdate: true, pinnedVersion: "1.0.0" }); // 入参原样
  });

  it("mergeUpdateMeta：undefined/null 值字段 = 删除", () => {
    const base: PluginUpdateMeta = { autoUpdate: true, pinnedVersion: "1.0.0", lastNotifiedVersion: "1.0.0" };
    expect(mergeUpdateMeta(base, { autoUpdate: undefined, pinnedVersion: null })).toEqual({ lastNotifiedVersion: "1.0.0" });
  });

  it("mergeUpdateMeta：字段全删 → 空 meta（调用方据此移除条目）", () => {
    expect(mergeUpdateMeta({ autoUpdate: true }, { autoUpdate: undefined })).toEqual({});
    expect(mergeUpdateMeta(undefined, { pinnedVersion: undefined })).toEqual({});
  });

  /* ── patchUpdateMetaMap ── */

  it("patchUpdateMetaMap：空图加条目", () => {
    const m = patchUpdateMetaMap({}, "demo-alpha", { autoUpdate: true });
    expect(m).toEqual({ "demo-alpha": { autoUpdate: true } });
  });

  it("patchUpdateMetaMap：既有条目改单字段 → 他字段保留", () => {
    const m = patchUpdateMetaMap({ "demo-alpha": { autoUpdate: true } }, "demo-alpha", { pinnedVersion: "0.9.0" });
    expect(m["demo-alpha"]).toEqual({ autoUpdate: true, pinnedVersion: "0.9.0" });
  });

  it("patchUpdateMetaMap：清空单条目字段 → 条目删除（不养空壳）", () => {
    const m = patchUpdateMetaMap({ "demo-alpha": { pinnedVersion: "0.9.0" } }, "demo-alpha", { pinnedVersion: undefined });
    expect(m).toEqual({});
  });

  it("patchUpdateMetaMap：无既有 + patch 全删 → 原图引用（零写盘）", () => {
    const m = patchUpdateMetaMap({ "demo-beta": { autoUpdate: true } }, "demo-alpha", { lastNotifiedVersion: undefined });
    expect(m).toEqual({ "demo-beta": { autoUpdate: true } });
  });

  it("patchUpdateMetaMap：空 patch → 原图引用", () => {
    const m = patchUpdateMetaMap({ "demo-alpha": { autoUpdate: true } }, "demo-alpha", {});
    expect(m).toBe(m);
  });

  it("patchUpdateMetaMap：多条目并存互不干扰", () => {
    const seed: InstalledUpdateMetaMap = { "demo-alpha": { autoUpdate: true }, "demo-beta": { pinnedVersion: "2.0.0" } };
    const m = patchUpdateMetaMap(seed, "demo-gamma", { lastNotifiedVersion: "3.0.0" });
    expect(m).toEqual({
      "demo-alpha": { autoUpdate: true },
      "demo-beta": { pinnedVersion: "2.0.0" },
      "demo-gamma": { lastNotifiedVersion: "3.0.0" },
    });
  });

  /* ── 选择器缺省 ── */

  it("选择器：无记录全缺省——autoUpdate off、pinned/notified undefined", () => {
    expect(isAutoUpdateOn({}, "demo-alpha")).toBe(false);
    expect(getPinnedVersion({}, "demo-alpha")).toBeUndefined();
    expect(getLastNotified({}, "demo-alpha")).toBeUndefined();
  });

  it("选择器：有记录读真值；autoUpdate 严格 === true（落 false 不当开）", () => {
    const m: InstalledUpdateMetaMap = {
      "demo-alpha": { autoUpdate: true, pinnedVersion: "1.0.0", lastNotifiedVersion: "1.0.0" },
      "demo-beta": { autoUpdate: false as never },
    };
    expect(isAutoUpdateOn(m, "demo-alpha")).toBe(true);
    expect(getPinnedVersion(m, "demo-alpha")).toBe("1.0.0");
    expect(getLastNotified(m, "demo-alpha")).toBe("1.0.0");
    expect(isAutoUpdateOn(m, "demo-beta")).toBe(false);
    expect(getPinnedVersion(m, "demo-beta")).toBeUndefined();
  });
});

describe("installedUpdateMeta IO（注入 store——读写 + 幂等 + 容错）", () => {
  beforeEach(() => {
    __setMetaStore(null);
    Reflect.deleteProperty(window, "linkdesk");
  });
  afterEach(() => {
    __setMetaStore(null);
    Reflect.deleteProperty(window, "linkdesk");
  });

  it("注入 store 读写整图：patch 落盘 → read 收回（含既有条目保留）", async () => {
    const s = fakeStore();
    __setMetaStore(s);
    await patchUpdateMeta("demo-alpha", { autoUpdate: true });
    await patchUpdateMeta("demo-alpha", { pinnedVersion: "1.0.0" });
    const m = await readUpdateMetaMap();
    expect(m).toEqual({ "demo-alpha": { autoUpdate: true, pinnedVersion: "1.0.0" } });
    expect(s.map.get("installedUpdateMeta")).toEqual({ "demo-alpha": { autoUpdate: true, pinnedVersion: "1.0.0" } });
  });

  it("无变化 patch 不写盘（幂等）：关一个从未开的 autoUpdate → set 不触发", async () => {
    const s = fakeStore();
    __setMetaStore(s);
    const setSpy = vi.spyOn(s, "set");
    await setAutoUpdate("demo-alpha", false); // 无既有记录 → 删字段意图 → 无变化
    expect(setSpy).not.toHaveBeenCalled();
    expect(await readUpdateMetaMap()).toEqual({});
  });

  it("setAutoUpdate 开 → 落 true；关 → 删字段（他字段保留）", async () => {
    const s = fakeStore();
    __setMetaStore(s);
    await setAutoUpdate("demo-alpha", true);
    await setPinnedVersion("demo-alpha", "1.0.0");
    await setAutoUpdate("demo-alpha", false); // 只关 autoUpdate——pinned 不动
    expect(await readUpdateMetaMap()).toEqual({ "demo-alpha": { pinnedVersion: "1.0.0" } });
  });

  it("noteNotifiedVersion 幂等 + clearNotifiedVersion 删字段；字段清空 → 条目移除", async () => {
    const s = fakeStore();
    __setMetaStore(s);
    await noteNotifiedVersion("demo-alpha", "1.1.0");
    expect(await getLastNotified(await readUpdateMetaMap(), "demo-alpha")).toBe("1.1.0");
    await noteNotifiedVersion("demo-alpha", "1.2.0"); // 发现到更新一版 → 覆盖提醒
    expect((await readUpdateMetaMap())["demo-alpha"]?.lastNotifiedVersion).toBe("1.2.0");
    await clearNotifiedVersion("demo-alpha"); // 本地追上 → 清
    expect(await readUpdateMetaMap()).toEqual({}); // 唯一字段清空 → 整条目移除
  });

  it("readPluginUpdateMeta：无记录 {} / 有记录只回该条", async () => {
    const s = fakeStore({ "demo-alpha": { autoUpdate: true }, "demo-beta": { pinnedVersion: "2.0.0" } });
    __setMetaStore(s);
    expect(await readPluginUpdateMeta("demo-gamma")).toEqual({});
    expect(await readPluginUpdateMeta("demo-alpha")).toEqual({ autoUpdate: true });
  });

  it("IO 不可用（无注入 + 无 window.linkdesk）→ 读空图、写静默 no-op", async () => {
    expect(await readUpdateMetaMap()).toEqual({});
    await expect(patchUpdateMeta("demo-alpha", { autoUpdate: true })).resolves.toBeUndefined();
    await expect(setAutoUpdate("demo-alpha", true)).resolves.toBeUndefined();
  });

  it("落盘为垃圾形状（数组/字符串/裸值）→ 读回空图不崩", async () => {
    const s = fakeStore();
    s.map.set("installedUpdateMeta", "garbage" as unknown);
    __setMetaStore(s);
    expect(await readUpdateMetaMap()).toEqual({});
    s.map.set("installedUpdateMeta", [1, 2, 3] as unknown);
    expect(await readUpdateMetaMap()).toEqual({});
  });

  it("store.get 抛错 → 读空图不崩；store.set 抛错 → patch 静默成功（下次写覆盖）", async () => {
    const s = fakeStore();
    s.failGet = () => {
      throw new Error("read boom");
    };
    __setMetaStore(s);
    expect(await readUpdateMetaMap()).toEqual({});
    expect(await readPluginUpdateMeta("demo-alpha")).toEqual({});

    const s2 = fakeStore();
    s2.failSet = () => {
      throw new Error("write boom");
    };
    __setMetaStore(s2);
    await expect(patchUpdateMeta("demo-alpha", { autoUpdate: true })).resolves.toBeUndefined(); // 写失败非致命
  });
});
