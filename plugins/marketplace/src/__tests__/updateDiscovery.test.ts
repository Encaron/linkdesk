/**
 * updateDiscovery 发现编排域单测——E6#33a（2026-09-08 锚② 重裁：市场池首载调度）。
 * 覆盖：assembleInstalled 两源归一（list ∪ getDisabled，禁用标记保留）+ planDiscovery 纯计划
 * （目录×本地×记账——稳定版判定/幂等 lastNotifiedVersion/自愈清/无内置排除）+ 主编排 runUpdateDiscovery
 * IO 注入（pluginManager/notifications 走 window.linkdesk + 目录 __setCatalogIO + 记账 __setMetaStore）。
 * 调度池门控（无 notifications.show 不跑）。fixture 全虚构（硬约束 21）：demo-* 插件、example.invalid 源。
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import i18n from "i18next";
import type { PluginListEntry, PluginInfoEntry } from "@linkdesk/contracts";
import { OFFICIAL_SOURCE_URL } from "../services/marketCatalog";
import type { CatalogEntry } from "../services/marketCatalog";
import type { FetchFn, StorageLike } from "../services/marketSources";
import { __setCatalogIO } from "../services/marketSources";
import { __setMetaStore, readUpdateMetaMap } from "../services/installedUpdateMeta";
import type { MetaStore } from "../services/installedUpdateMeta";
import {
  assembleInstalled,
  planDiscovery,
  runUpdateDiscovery,
  scheduleStartupDiscovery,
  getDiscoveredUpdates,
  hasDiscoveredUpdates,
  __resetUpdateDiscovery,
} from "../services/updateDiscovery";
import type { DiscoveryPlan, InstalledSnapshot, UpdateCandidate } from "../services/updateDiscovery";

/* ── fixture（全虚构） ── */

function catEntry(id: string, version: string, versions?: Array<{ version: string }>): CatalogEntry {
  return {
    id,
    name: `Demo ${id}`,
    version,
    versions,
    downloadUrl: `https://example.invalid/releases/${id}-${version}.linkdesk-plugin`,
  };
}

function enabled(id: string, version: string, name?: string, core = false): PluginListEntry {
  return { pluginId: id, manifest: { name: name ?? `Demo ${id}`, version, core } } as PluginListEntry;
}
function disabled(id: string, version: string, name?: string): PluginInfoEntry {
  return { pluginId: id, name: name ?? id, version };
}
function inst(id: string, localVersion: string, name = `Demo ${id}`, isDisabled = false): InstalledSnapshot {
  return { pluginId: id, localVersion, name, disabled: isDisabled };
}

function catalogText(...plugins: CatalogEntry[]): string {
  return JSON.stringify({ version: "1", updatedAt: "2026-09-01T00:00:00Z", plugins });
}

function memStorage(seed?: Map<string, string>): StorageLike {
  const map = seed ?? new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

/** installedUpdateMeta 记账 store 替身 */
function metaStore(seed?: Record<string, unknown>): MetaStore & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  if (seed) map.set("installedUpdateMeta", seed);
  return {
    map,
    async get<T = unknown>(key: string): Promise<T | undefined> {
      return map.get(key) as T | undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
      map.set(key, value);
    },
  };
}

/** window.linkdesk 替身——pluginManager(list/getDisabled) + notifications.show（withShow:false = 壳进程无铃铛面） */
function stubWindow(opts: { enabled?: PluginListEntry[]; disabled?: PluginInfoEntry[]; withShow?: boolean }) {
  const show = opts.withShow === false ? undefined : vi.fn(async () => undefined);
  const list = vi.fn(async () => opts.enabled ?? []);
  const getDisabled = vi.fn(async () => opts.disabled ?? []);
  Object.defineProperty(window, "linkdesk", {
    value: { pluginManager: { list, getDisabled }, notifications: show ? { show } : undefined },
    configurable: true,
  });
  return { show, list, getDisabled };
}

/* 生产铃铛文案前提 = marketplace 入口 i18n init 先行（资源并入全局 "translation" ns）——发现编排 10s 后才跑必已 init。
 * 单测不走入口 → 手动 init 同款默认实例（updateBellMessage 的 t 才返回真实串而非 undefined）。 */
beforeAll(async () => {
  await i18n.init({
    lng: "en",
    fallbackLng: false,
    nsSeparator: false,
    keySeparator: false,
    interpolation: { escapeValue: false },
    resources: {
      en: { translation: { "「{{name}}」有新版本 {{version}}": "“{{name}}” has a new version: {{version}}" } },
    },
  });
});

const discover = (p: DiscoveryPlan) => ({
  toNotify: p.toNotify.map((c) => c.pluginId).sort(),
  toClear: p.toClearNotified.sort(),
  candidates: p.candidates.map((c) => c.pluginId).sort(),
});
const ids = (list: UpdateCandidate[]) => list.map((c) => c.pluginId).sort();

describe("assembleInstalled（两源归一）", () => {
  it("启用 ∪ 禁用两源 → 快照带禁用标记（F1 禁用插件也要发现）", () => {
    const snap = assembleInstalled([enabled("demo-alpha", "1.0.0")], [disabled("demo-beta", "2.0.0", "Beta")]);
    expect(snap).toEqual([
      { pluginId: "demo-alpha", localVersion: "1.0.0", name: "Demo demo-alpha", disabled: false },
      { pluginId: "demo-beta", localVersion: "2.0.0", name: "Beta", disabled: true },
    ]);
  });

  it("无版本条目丢弃（无法比较）；缺名回退 pluginId", () => {
    const snap = assembleInstalled(
      [enabled("demo-alpha", "1.0.0"), { pluginId: "demo-no-ver", manifest: {} } as PluginListEntry],
      [disabled("demo-beta", "2.0.0")],
    );
    expect(snap.map((s) => s.pluginId)).toEqual(["demo-alpha", "demo-beta"]);
    const namesByPlugin: Record<string, string> = Object.fromEntries(snap.map((s) => [s.pluginId, s.name]));
    expect(namesByPlugin["demo-beta"]).toBe("demo-beta");
  });

  it("同 id 出现在两源（防御）→ 禁用条目覆盖", () => {
    const snap = assembleInstalled([enabled("demo-alpha", "1.0.0")], [disabled("demo-alpha", "0.9.0")]);
    expect(snap).toEqual([{ pluginId: "demo-alpha", localVersion: "0.9.0", name: "demo-alpha", disabled: true }]);
  });
});

describe("planDiscovery（纯计划）", () => {
  it("空已装 → 空计划", () => {
    expect(discover(planDiscovery([], [], {}))).toEqual({ toNotify: [], toClear: [], candidates: [] });
  });

  it("目录无此 id（未上架/下架）→ 不提示不动本地（§二·五）", () => {
    const plan = planDiscovery([catEntry("demo-remote", "1.1.0")], [inst("demo-local", "1.0.0")], {});
    expect(discover(plan)).toEqual({ toNotify: [], toClear: [], candidates: [] });
  });

  it("remote === 本地 → 无更新（§一·三 唯一判定 semver.gt）", () => {
    const plan = planDiscovery([catEntry("demo-alpha", "1.0.0")], [inst("demo-alpha", "1.0.0")], {});
    expect(discover(plan)).toEqual({ toNotify: [], toClear: [], candidates: [] });
  });

  it("remote > 本地 → 候选 + 待推（无记账）", () => {
    const plan = planDiscovery([catEntry("demo-alpha", "1.2.0")], [inst("demo-alpha", "1.0.0", "Alpha")], {});
    expect(discover(plan)).toEqual({ toNotify: ["demo-alpha"], toClear: [], candidates: ["demo-alpha"] });
    const c = plan.candidates[0];
    expect(c).toMatchObject({ remoteLatest: "1.2.0", localVersion: "1.0.0", name: "Alpha" });
    expect(c.entry.version).toBe("1.2.0");
  });

  it("remote < 本地 → 无更新（本地反超，不降级提示）", () => {
    const plan = planDiscovery([catEntry("demo-alpha", "1.0.0")], [inst("demo-alpha", "2.0.0")], {});
    expect(discover(plan)).toEqual({ toNotify: [], toClear: [], candidates: [] });
  });

  it("最新是 beta → 回落前一个稳定版候选（§二·四 不提示 beta）", () => {
    const e = catEntry("demo-alpha", "1.3.0-beta.1", [{ version: "1.3.0-beta.1" }, { version: "1.2.0" }]);
    const plan = planDiscovery([e], [inst("demo-alpha", "1.1.0")], {});
    expect(discover(plan)).toEqual({ toNotify: ["demo-alpha"], toClear: [], candidates: ["demo-alpha"] });
    expect(plan.candidates[0].remoteLatest).toBe("1.2.0");
  });

  it("条目全 prerelease → 无稳定版 → 不提示（beta 走手动 #33c）", () => {
    const e = catEntry("demo-alpha", "1.3.0-beta.1", [{ version: "1.3.0-beta.1" }]);
    const plan = planDiscovery([e], [inst("demo-alpha", "1.0.0")], {});
    expect(discover(plan)).toEqual({ toNotify: [], toClear: [], candidates: [] });
  });

  it("幂等：lastNotifiedVersion === remote → 候选仍在（徽标常驻）但不重推铃铛（§二·一）", () => {
    const plan = planDiscovery([catEntry("demo-alpha", "1.2.0")], [inst("demo-alpha", "1.0.0")], {
      "demo-alpha": { lastNotifiedVersion: "1.2.0" },
    });
    expect(plan.candidates.map((c) => c.pluginId)).toEqual(["demo-alpha"]);
    expect(plan.toNotify).toEqual([]);
  });

  it("幂等：同版但 v 前缀/缺位串漂移 → semver 判不重推（防串比较假新）", () => {
    const plan = planDiscovery([catEntry("demo-alpha", "1.2.0")], [inst("demo-alpha", "1.0.0")], {
      "demo-alpha": { lastNotifiedVersion: "v1.2.0" },
    });
    expect(plan.toNotify).toEqual([]);
    expect(plan.candidates).toHaveLength(1);
  });

  it("已提醒旧版 + 更新一版 → 推新版（提醒随版本演进）", () => {
    const plan = planDiscovery([catEntry("demo-alpha", "1.3.0")], [inst("demo-alpha", "1.0.0")], {
      "demo-alpha": { lastNotifiedVersion: "1.2.0" },
    });
    expect(discover(plan)).toEqual({ toNotify: ["demo-alpha"], toClear: [], candidates: ["demo-alpha"] });
  });

  it("自愈清：本地已追上曾提醒版 + remote 未超 → 清标记，非候选", () => {
    const plan = planDiscovery([catEntry("demo-alpha", "1.1.0")], [inst("demo-alpha", "1.1.0")], {
      "demo-alpha": { lastNotifiedVersion: "1.0.0" },
    });
    expect(discover(plan)).toEqual({ toNotify: [], toClear: ["demo-alpha"], candidates: [] });
  });

  it("自愈清 + 新候选并存：本地追上旧提醒但 remote 更新 → 清旧 + 推新", () => {
    const plan = planDiscovery([catEntry("demo-alpha", "1.2.0")], [inst("demo-alpha", "1.1.0")], {
      "demo-alpha": { lastNotifiedVersion: "1.0.0" },
    });
    expect(discover(plan)).toEqual({ toNotify: ["demo-alpha"], toClear: ["demo-alpha"], candidates: ["demo-alpha"] });
  });

  it("无内置排除：core:true 插件有新版同样候选（core 不定义更新行为，§二·三）", () => {
    const plan = planDiscovery(
      [catEntry("demo-core", "1.1.0")],
      [{ pluginId: "demo-core", localVersion: "1.0.0", name: "Core Demo", disabled: false }],
      {},
    );
    expect(discover(plan)).toEqual({ toNotify: ["demo-core"], toClear: [], candidates: ["demo-core"] });
  });

  it("多插件混合：部分有更新部分没有——各归其位互不干扰", () => {
    const catalog = [catEntry("demo-alpha", "2.0.0"), catEntry("demo-beta", "1.0.0"), catEntry("demo-gamma", "1.5.0")];
    const installed = [inst("demo-alpha", "1.0.0"), inst("demo-beta", "1.0.0"), inst("demo-gamma", "1.6.0")];
    const plan = planDiscovery(catalog, installed, {});
    expect(discover(plan)).toEqual({ toNotify: ["demo-alpha"], toClear: [], candidates: ["demo-alpha"] });
  });
});

describe("runUpdateDiscovery（主编排 IO）", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  function okCatalogFetch(plugins: CatalogEntry[]): void {
    fetchSpy = vi.fn(async (url: string) => {
      if (url === OFFICIAL_SOURCE_URL) return catalogText(...plugins);
      throw new Error("unexpected url " + url);
    });
    __setCatalogIO(fetchSpy as unknown as FetchFn, memStorage());
  }

  beforeEach(() => {
    __setCatalogIO(null, null);
    __setMetaStore(null);
    __resetUpdateDiscovery();
    Reflect.deleteProperty(window, "linkdesk");
  });
  afterEach(() => {
    __setCatalogIO(null, null);
    __setMetaStore(null);
    Reflect.deleteProperty(window, "linkdesk");
  });

  it("无已装 → null（目录不拉、铃铛不推）", async () => {
    const { show } = stubWindow({ enabled: [] });
    okCatalogFetch([catEntry("demo-alpha", "1.2.0")]);
    expect(await runUpdateDiscovery()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
    expect(hasDiscoveredUpdates()).toBe(false);
  });

  it("有已装有新版 → 铃铛推一条 + 记 lastNotifiedVersion + 落 store；再跑幂等不重推", async () => {
    const meta = metaStore();
    __setMetaStore(meta);
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0", "Alpha")] });
    okCatalogFetch([catEntry("demo-alpha", "1.2.0")]);

    const first = await runUpdateDiscovery();
    expect(first).not.toBeNull();
    expect(ids(first!.candidates)).toEqual(["demo-alpha"]);
    expect(first!.toNotify.map((c) => c.pluginId)).toEqual(["demo-alpha"]);
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(expect.any(String), { type: "info" });
    expect(await readUpdateMetaMap()).toEqual({ "demo-alpha": { lastNotifiedVersion: "1.2.0" } });
    expect(getDiscoveredUpdates().map((c) => c.pluginId)).toEqual(["demo-alpha"]);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // 首跑真实拉取

    // 二跑：5min 缓存命中 + 已提醒过 → 不重推铃铛、不再拉；徽标常驻
    const second = await runUpdateDiscovery();
    expect(ids(second!.candidates)).toEqual(["demo-alpha"]);
    expect(second!.toNotify).toEqual([]);
    expect(show).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("禁用插件有新版 → 同样发现（F1——更新后保持禁用态由组装保留）", async () => {
    const { show } = stubWindow({ disabled: [disabled("demo-beta", "1.0.0", "Beta")] });
    okCatalogFetch([catEntry("demo-beta", "1.5.0")]);
    const plan = await runUpdateDiscovery();
    expect(ids(plan!.candidates)).toEqual(["demo-beta"]);
    expect(plan!.toNotify.map((c) => c.pluginId)).toEqual(["demo-beta"]);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("目录 offline（拉取抛）→ null 静默，不铃不记不落 store", async () => {
    __setMetaStore(metaStore());
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0")] });
    fetchSpy = vi.fn(async () => {
      throw new Error("net down");
    });
    __setCatalogIO(fetchSpy as unknown as FetchFn, memStorage());
    expect(await runUpdateDiscovery()).toBeNull();
    expect(show).not.toHaveBeenCalled();
    expect(await readUpdateMetaMap()).toEqual({});
    expect(hasDiscoveredUpdates()).toBe(false);
    expect(getDiscoveredUpdates()).toEqual([]);
  });

  it("自愈：本地已追上曾提醒版 → 一趟清标记（readUpdateMetaMap 后无 lastNotifiedVersion）", async () => {
    const meta = metaStore({ "demo-alpha": { lastNotifiedVersion: "1.0.0" } });
    __setMetaStore(meta);
    stubWindow({ enabled: [enabled("demo-alpha", "1.0.0")] });
    okCatalogFetch([catEntry("demo-alpha", "1.0.0")]); // remote 不超 → 只清
    const plan = await runUpdateDiscovery();
    expect(plan!.toClearNotified).toEqual(["demo-alpha"]);
    expect(await readUpdateMetaMap()).toEqual({});
  });

  it("schedule 池门控：无 notifications.show（壳进程面）→ 调度不执行发现", async () => {
    stubWindow({ enabled: [enabled("demo-alpha", "1.0.0")], withShow: false });
    okCatalogFetch([catEntry("demo-alpha", "1.2.0")]);
    const lk = (window as unknown as { linkdesk?: { pluginManager: { list: ReturnType<typeof vi.fn> } } }).linkdesk!;
    scheduleStartupDiscovery(0);
    await new Promise((r) => setTimeout(r, 20));
    expect(lk.pluginManager.list).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("schedule 池有铃铛 → 首载延迟后跑发现推铃铛", async () => {
    __setMetaStore(metaStore());
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0", "Alpha")] });
    okCatalogFetch([catEntry("demo-alpha", "1.2.0")]);
    scheduleStartupDiscovery(0);
    // waitFor 折叠 meta 断言——noteNotifiedVersion 在 show resolve 之后才落盘，单等 show 会读在半程
    await vi.waitFor(async () => {
      expect(show).toHaveBeenCalledTimes(1);
      expect(await readUpdateMetaMap()).toEqual({ "demo-alpha": { lastNotifiedVersion: "1.2.0" } });
    });
  });
});
