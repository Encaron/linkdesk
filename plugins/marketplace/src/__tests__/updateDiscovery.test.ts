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
import {
  __setMetaStore,
  readUpdateMetaMap,
  setAutoUpdate,
  setPinnedVersion,
} from "../services/installedUpdateMeta";
import type { MetaStore } from "../services/installedUpdateMeta";
import {
  assembleInstalled,
  planDiscovery,
  runUpdateDiscovery,
  scheduleStartupDiscovery,
  selectAutoCandidates,
  selectMetaEvictions,
  runAutoUpdateIfDue,
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

function enabled(id: string, version: string, name?: string, core = false, updatable = true): PluginListEntry {
  return { pluginId: id, manifest: { name: name ?? `Demo ${id}`, version, core }, updatable } as PluginListEntry;
}
function disabled(id: string, version: string, name?: string, updatable = true): PluginInfoEntry {
  return { pluginId: id, name: name ?? id, version, updatable };
}
function inst(id: string, localVersion: string, name = `Demo ${id}`, isDisabled = false, updatable = true): InstalledSnapshot {
  return { pluginId: id, localVersion, name, disabled: isDisabled, updatable };
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

/** 引擎 update mock 签（#33d auto——applyEngineAutoUpdate 调 upd(pluginId,{url})，结果看 success） */
type EngineUpdate = (pluginId: string, opts?: { url?: string; allowOlder?: boolean }) => Promise<{ success: boolean }>;

/** window.linkdesk 替身——pluginManager(list/getDisabled/update) + notifications.show（withShow:false = 壳进程无铃铛面）。
 *  update 注入（#33d auto）：传 vi.fn<EngineUpdate> 自控；null = 无 update 能力（预览面——applyEngineAutoUpdate 无法自动 → 留手动候选）；
 *  缺省 = 恒成功 mock（多数非 auto 用例不触引擎无感）。返回同捕获。 */
function stubWindow(opts: {
  enabled?: PluginListEntry[];
  disabled?: PluginInfoEntry[];
  withShow?: boolean;
  update?: ReturnType<typeof vi.fn<EngineUpdate>> | null;
}) {
  const show = opts.withShow === false ? undefined : vi.fn(async () => undefined);
  const list = vi.fn(async () => opts.enabled ?? []);
  const getDisabled = vi.fn(async () => opts.disabled ?? []);
  const upd =
    opts.update === null
      ? undefined
      : (opts.update ?? vi.fn<EngineUpdate>(async () => ({ success: true })));
  const pm: Record<string, unknown> = { list, getDisabled };
  if (upd !== undefined) pm.update = upd;
  Object.defineProperty(window, "linkdesk", {
    value: { pluginManager: pm, notifications: show ? { show } : undefined },
    configurable: true,
  });
  return { show, list, getDisabled, update: upd };
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
      en: {
        translation: {
          "「{{name}}」有新版本 {{version}}": "“{{name}}” has a new version: {{version}}",
          // E6#73j（G7）汇总文案——与 i18n/en.json 同字面（生产靠插件入口 init 并入）
          "{{names}} 等": "{{names}} and others",
          "{{num}} 个插件有新版本：{{names}}": "{{num}} plugins have new versions: {{names}}",
        },
      },
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
      { pluginId: "demo-alpha", localVersion: "1.0.0", name: "Demo demo-alpha", disabled: false, updatable: true },
      { pluginId: "demo-beta", localVersion: "2.0.0", name: "Beta", disabled: true, updatable: true },
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
    expect(snap).toEqual([
      { pluginId: "demo-alpha", localVersion: "0.9.0", name: "demo-alpha", disabled: true, updatable: true },
    ]);
  });

  it("E6#73j（G6）：住所透传——app 只读根（updatable:false）随快照带出，两源都带", () => {
    const snap = assembleInstalled(
      [enabled("demo-alpha", "1.0.0", undefined, false, false)],
      [disabled("demo-beta", "2.0.0", "Beta", false)],
    );
    expect(snap.map((s) => s.updatable)).toEqual([false, false]);
  });

  it("E6#73j（G6）：住所未知（旧载荷缺字段）→ undefined 原样带出，不臆造 true/false", () => {
    const snap = assembleInstalled(
      [{ pluginId: "demo-alpha", manifest: { name: "Alpha", version: "1.0.0" } } as PluginListEntry],
      [],
    );
    expect(snap[0].updatable).toBeUndefined();
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

  it("E6#73j（G6）：住只读 app 根（updatable:false）→ 非候选、不推铃（点了必失败的死钮不该存在）", () => {
    const plan = planDiscovery([catEntry("demo-app", "2.0.0")], [inst("demo-app", "1.0.0", "App Demo", false, false)], {});
    expect(discover(plan)).toEqual({ toNotify: [], toClear: [], candidates: [] });
  });

  it("E6#73j（G6）：住所未知（undefined）→ 照常候选（fail-open——隐藏「有新版」比一个失败按钮更糟）", () => {
    const plan = planDiscovery(
      [catEntry("demo-alpha", "2.0.0")],
      [{ pluginId: "demo-alpha", localVersion: "1.0.0", name: "Alpha", disabled: false }],
      {},
    );
    expect(discover(plan)).toEqual({ toNotify: ["demo-alpha"], toClear: [], candidates: ["demo-alpha"] });
  });

  it("E6#73j（G6）：不可更新 + 同批可更新混跑 → 只让可更新的过关", () => {
    const catalog = [catEntry("demo-app", "2.0.0"), catEntry("demo-beta", "2.0.0"), catEntry("demo-gamma", "2.0.0")];
    const installed = [
      inst("demo-app", "1.0.0", "App Demo", false, false),
      inst("demo-beta", "1.0.0", "Beta Demo"),
      inst("demo-gamma", "1.0.0", "Gamma Demo", false, false),
    ];
    const plan = planDiscovery(catalog, installed, {});
    expect(discover(plan)).toEqual({ toNotify: ["demo-beta"], toClear: [], candidates: ["demo-beta"] });
  });

  it("E6#73j（G6）：本地已追上曾提醒版 + 不可更新 → 自愈清照跑（跳过候选不等于跳过清账）", () => {
    const plan = planDiscovery([catEntry("demo-app", "3.0.0")], [inst("demo-app", "2.0.0", "App Demo", false, false)], {
      "demo-app": { lastNotifiedVersion: "1.0.0" },
    });
    expect(discover(plan)).toEqual({ toNotify: [], toClear: ["demo-app"], candidates: [] });
  });
});

describe("selectAutoCandidates（#33d 纯选择——auto 候选）", () => {
  const cand = (id: string): UpdateCandidate => ({
    pluginId: id,
    localVersion: "1.0.0",
    remoteLatest: "2.0.0",
    name: `Demo ${id}`,
    entry: catEntry(id, "2.0.0"),
  });

  it("autoUpdate 开 + 未钉版本 → 入选（Opt-IN 已装条目；入参已是候选，不重判 stable/gt）", () => {
    expect(ids(selectAutoCandidates([cand("demo-alpha")], { "demo-alpha": { autoUpdate: true } }))).toEqual([
      "demo-alpha",
    ]);
  });

  it("autoUpdate 缺省 = 关（只存 true，未写即 undefined=false）→ 排除（默认不自动动）", () => {
    const c = cand("demo-alpha");
    expect(selectAutoCandidates([c], {})).toEqual([]);
    expect(selectAutoCandidates([c], { "demo-alpha": {} })).toEqual([]);
    expect(selectAutoCandidates([c], { "demo-alpha": { autoUpdate: false } })).toEqual([]);
  });

  it("§二·九 pinnedVersion 钉旧版 → 排除（尊重「停在旧版」手动意图，auto 让位）", () => {
    const meta = { "demo-alpha": { autoUpdate: true, pinnedVersion: "1.0.0" } };
    expect(selectAutoCandidates([cand("demo-alpha")], meta)).toEqual([]);
  });

  it("多候选混合——只选 auto 开且未钉的，其余（auto 关 / auto+pin / 无记账）不动", () => {
    const meta = {
      "demo-alpha": { autoUpdate: true },
      "demo-beta": { autoUpdate: true, pinnedVersion: "1.0.0" },
    };
    const all = [cand("demo-alpha"), cand("demo-beta"), cand("demo-gamma")];
    expect(ids(selectAutoCandidates(all, meta))).toEqual(["demo-alpha"]);
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
  });

  it("有已装有新版 → 铃铛推一条 + 记 lastNotifiedVersion；再跑幂等不重推", async () => {
    const meta = metaStore();
    __setMetaStore(meta);
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0", "Alpha")] });
    okCatalogFetch([catEntry("demo-alpha", "1.2.0")]);

    const first = await runUpdateDiscovery();
    expect(first).not.toBeNull();
    expect(ids(first!.candidates)).toEqual(["demo-alpha"]);
    expect(first!.toNotify.map((c) => c.pluginId)).toEqual(["demo-alpha"]);
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(expect.any(String), { type: "info", source: "marketplace" });
    expect(await readUpdateMetaMap()).toEqual({ "demo-alpha": { lastNotifiedVersion: "1.2.0" } });
    expect(fetchSpy).toHaveBeenCalledTimes(1); // 首跑真实拉取

    // 二跑：5min 缓存命中 + 已提醒过 → 不重推铃铛、不再拉
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

  it("E6#73j（G6）：住只读 app 根有新版 → 不推铃不候选（点必死的钮与空铃一起消失）", async () => {
    const { show } = stubWindow({ enabled: [enabled("demo-app", "1.0.0", "App Demo", false, false)] });
    okCatalogFetch([catEntry("demo-app", "2.0.0")]);
    const plan = await runUpdateDiscovery();
    expect(plan!.candidates).toEqual([]);
    expect(show).not.toHaveBeenCalled();
  });

  it("E6#73j（G7）：多插件同批有新版 → 只推一条汇总；记账仍逐插件（幂等不失效）", async () => {
    __setMetaStore(metaStore());
    const { show } = stubWindow({
      enabled: [
        enabled("demo-alpha", "1.0.0", "Alpha"),
        enabled("demo-beta", "1.0.0", "Beta"),
        enabled("demo-gamma", "1.0.0", "Gamma"),
      ],
    });
    okCatalogFetch([
      catEntry("demo-alpha", "2.0.0"),
      catEntry("demo-beta", "2.0.0"),
      catEntry("demo-gamma", "2.0.0"),
    ]);
    const plan = await runUpdateDiscovery();
    expect(plan!.toNotify.map((c) => c.pluginId).sort()).toEqual(["demo-alpha", "demo-beta", "demo-gamma"]);
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith("3 plugins have new versions: Alpha、Beta、Gamma", {
      type: "info",
      source: "marketplace",
    });
    expect(await readUpdateMetaMap()).toEqual({
      "demo-alpha": { lastNotifiedVersion: "2.0.0" },
      "demo-beta": { lastNotifiedVersion: "2.0.0" },
      "demo-gamma": { lastNotifiedVersion: "2.0.0" },
    });
    // 二跑：三个都已记账 → 一条都不重推（汇总不破坏逐插件幂等）
    await runUpdateDiscovery();
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("E6#73j（G7）：候选超 3 个 → 只列前三 + 「等」（不让通知胀成一屏名单）", async () => {
    const mk = (id: string) => enabled(id, "1.0.0", `Demo-${id}`);
    const { show } = stubWindow({
      enabled: [mk("demo-alpha"), mk("demo-beta"), mk("demo-gamma"), mk("demo-delta")],
    });
    okCatalogFetch([catEntry("demo-alpha", "2.0.0"), catEntry("demo-beta", "2.0.0"), catEntry("demo-gamma", "2.0.0"), catEntry("demo-delta", "2.0.0")]);
    await runUpdateDiscovery();
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(
      "4 plugins have new versions: Demo-demo-alpha、Demo-demo-beta、Demo-demo-gamma and others",
      { type: "info", source: "marketplace" },
    );
  });

  it("E6#73j（G7）：汇总推送失败 → 一个都不记账（下趟原样重推，不漏不重）", async () => {
    __setMetaStore(metaStore());
    const { show } = stubWindow({
      enabled: [enabled("demo-alpha", "1.0.0", "Alpha"), enabled("demo-beta", "1.0.0", "Beta")],
    });
    show!.mockRejectedValue(new Error("no panel"));
    okCatalogFetch([catEntry("demo-alpha", "2.0.0"), catEntry("demo-beta", "2.0.0")]);
    const plan = await runUpdateDiscovery();
    expect(plan!.toNotify).toHaveLength(2); // 计划仍算推送过——失败只在记账上体现
    expect(await readUpdateMetaMap()).toEqual({});
  });

  it("目录 offline（拉取抛）→ null 静默，不铃不记账", async () => {
    __setMetaStore(metaStore());
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0")] });
    fetchSpy = vi.fn(async () => {
      throw new Error("net down");
    });
    __setCatalogIO(fetchSpy as unknown as FetchFn, memStorage());
    expect(await runUpdateDiscovery()).toBeNull();
    expect(show).not.toHaveBeenCalled();
    expect(await readUpdateMetaMap()).toEqual({});
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

describe("runUpdateDiscovery #33d auto（自动更新编排）", () => {
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

  it("auto 插件有新版 → 自动更新（引擎 update 走稳定版 url）+ 不推「有新版本」铃 + 成功驱逐候选 + 发一条「已自动更新」", async () => {
    __setMetaStore(metaStore({ "demo-alpha": { autoUpdate: true } }));
    const update = vi.fn<EngineUpdate>(async () => ({ success: true }));
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0", "Alpha")], update });
    okCatalogFetch([catEntry("demo-alpha", "2.0.0")]);

    const plan = await runUpdateDiscovery();
    expect(plan).not.toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toBe("demo-alpha");
    expect(typeof update.mock.calls[0][1]?.url).toBe("string"); // 该稳定版资产寻址
    // plan 是纯产物（不过滤，auto 也在内）——过滤只发生在铃那一步，看下条 show 断言
    expect(ids(plan!.toNotify)).toEqual(["demo-alpha"]);
    expect(show).toHaveBeenCalledTimes(1); // 但**结果**必须说（E6#79「装完发一条通知告诉我」）
    expect(show).toHaveBeenCalledWith(expect.stringContaining("Alpha"), { type: "info", source: "marketplace" });
    expect(await readUpdateMetaMap()).toEqual({ "demo-alpha": { autoUpdate: true } }); // 不铃不记 lastNotified
  });

  it("auto 失败（success:false）→ 候选留守手动（徽标在）+ 一条 warning 告知 + 仍不推「有新版本」铃", async () => {
    __setMetaStore(metaStore({ "demo-alpha": { autoUpdate: true } }));
    const update = vi.fn<EngineUpdate>(async () => ({ success: false }));
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0", "Alpha")], update });
    okCatalogFetch([catEntry("demo-alpha", "2.0.0")]);

    const plan = await runUpdateDiscovery();
    expect(plan).not.toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
    expect(ids(plan!.toNotify)).toEqual(["demo-alpha"]); // plan 纯产物；失败回铃与否看下条 show
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(expect.stringContaining("Alpha"), { type: "warning", source: "marketplace" });
  });

  it("auto 引擎抛异常（断网/引擎炸）→ 不崩不阻断，候选留守 + warning 告知", async () => {
    __setMetaStore(metaStore({ "demo-alpha": { autoUpdate: true } }));
    const update = vi.fn<EngineUpdate>(async () => {
      throw new Error("engine update blow");
    });
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0", "Alpha")], update });
    okCatalogFetch([catEntry("demo-alpha", "2.0.0")]);
    expect(ids((await runUpdateDiscovery())!.candidates)).toEqual(["demo-alpha"]);
    expect(show).toHaveBeenCalledWith(expect.any(String), { type: "warning", source: "marketplace" });
  });

  it("auto 插件但钉旧版（§二·九）→ auto 跳过 + 普通铃铛提示（pinned 非 auto 候选，按手动待处理）", async () => {
    __setMetaStore(metaStore({ "demo-alpha": { autoUpdate: true, pinnedVersion: "1.0.0" } }));
    const update = vi.fn<EngineUpdate>(async () => ({ success: true }));
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0", "Alpha")], update });
    okCatalogFetch([catEntry("demo-alpha", "2.0.0")]);

    const plan = await runUpdateDiscovery();
    expect(update).not.toHaveBeenCalled(); // pin 让位 auto
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(expect.any(String), { type: "info", source: "marketplace" }); // 「有新版本」，非 warning
    expect(ids(plan!.toNotify)).toEqual(["demo-alpha"]);
  });

  it("auto 插件无 update 能力（预览面）→ 不崩，候选留守手动 + warning 告知（勾了却没成必须说）", async () => {
    __setMetaStore(metaStore({ "demo-alpha": { autoUpdate: true } }));
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0", "Alpha")], update: null });
    okCatalogFetch([catEntry("demo-alpha", "2.0.0")]);
    expect(ids((await runUpdateDiscovery())!.candidates)).toEqual(["demo-alpha"]);
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(expect.any(String), { type: "warning", source: "marketplace" });
  });

  it("auto 插件远程 beta 领先 → auto 只看稳定版（§二·四 beta 不自动装）——对稳定版跑 + 不推铃", async () => {
    __setMetaStore(metaStore({ "demo-alpha": { autoUpdate: true } }));
    const update = vi.fn<EngineUpdate>(async () => ({ success: true }));
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0", "Alpha")], update });
    const e = catEntry("demo-alpha", "2.1.0-beta.1", [{ version: "2.1.0-beta.1" }, { version: "2.0.0" }]);
    okCatalogFetch([e]);

    const plan = await runUpdateDiscovery();
    expect(plan).not.toBeNull();
    expect(plan!.candidates[0].remoteLatest).toBe("2.0.0"); // 稳定回落
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toBe("demo-alpha");
    expect(typeof update.mock.calls[0][1]?.url).toBe("string");
    expect(ids(plan!.toNotify)).toEqual(["demo-alpha"]); // plan 纯产物；铃那步已滤掉 auto
    expect(show).toHaveBeenCalledWith(expect.stringContaining("2.0.0"), { type: "info", source: "marketplace" }); // 装的是稳定版 2.0.0，不是 beta
  });

  it("多插件：auto 一个代劳 + 非 auto 一个照常铃——铃只点名非 auto（同一件事不说两遍）", async () => {
    __setMetaStore(metaStore({ "demo-alpha": { autoUpdate: true } }));
    const update = vi.fn<EngineUpdate>(async () => ({ success: true }));
    const { show } = stubWindow({
      enabled: [enabled("demo-alpha", "1.0.0", "Alpha"), enabled("demo-beta", "1.0.0", "Beta")],
      update,
    });
    okCatalogFetch([catEntry("demo-alpha", "2.0.0"), catEntry("demo-beta", "1.5.0")]);

    const plan = await runUpdateDiscovery();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toBe("demo-alpha");
    expect(ids(plan!.toNotify)).toEqual(["demo-alpha", "demo-beta"]); // plan 纯产物（auto 也在内）
    expect(show).toHaveBeenCalledTimes(2); // beta 的「有新版本」铃 + alpha 的「已自动更新」结果
    expect(show).toHaveBeenCalledWith(expect.stringContaining("Beta"), { type: "info", source: "marketplace" });
    expect(show).toHaveBeenCalledWith(expect.stringContaining("Alpha"), { type: "info", source: "marketplace" });
  });
});

describe("runAutoUpdateIfDue（#33d DetailView 勾选即跑）", () => {
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

  it("勾开记账 auto（此前未开）→ 立即自动更新 + 发一条告知（用户刚勾的那一下不能没反应）", async () => {
    __setMetaStore(metaStore());
    const update = vi.fn<EngineUpdate>(async () => ({ success: true }));
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0", "Alpha")], update });
    okCatalogFetch([catEntry("demo-alpha", "2.0.0")]);
    await runUpdateDiscovery(); // auto 未开 → 只推「有新版本」铃，不动引擎
    expect(update).not.toHaveBeenCalled();
    show?.mockClear();

    await setAutoUpdate("demo-alpha", true); // DetailView 勾开记账
    expect(await runAutoUpdateIfDue("demo-alpha")).toBe(true); // 即刻跑（免等下趟发现）
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toBe("demo-alpha");
    expect(show).toHaveBeenCalledTimes(1); // 装完了必须说
    expect(show).toHaveBeenCalledWith(expect.stringContaining("Alpha"), { type: "info", source: "marketplace" });
    expect((await readUpdateMetaMap())["demo-alpha"]?.autoUpdate).toBe(true); // 偏好保留
  });

  it("盘上已是最新版（无候选）→ false 不动引擎、不说（没得可更新）", async () => {
    __setMetaStore(metaStore({ "demo-alpha": { autoUpdate: true } }));
    const update = vi.fn<EngineUpdate>(async () => ({ success: true }));
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0", "Alpha")], update });
    okCatalogFetch([catEntry("demo-alpha", "1.0.0")]);
    expect(await runAutoUpdateIfDue("demo-alpha")).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
  });

  it("目录拉不到（离线 / 坏 parse）→ false 不动引擎、不说（判不出有没有新版就不猜）", async () => {
    __setMetaStore(metaStore({ "demo-alpha": { autoUpdate: true } }));
    const update = vi.fn<EngineUpdate>(async () => ({ success: true }));
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0", "Alpha")], update });
    const deadFetch = vi.fn(async () => {
      throw new Error("offline");
    });
    __setCatalogIO(deadFetch as unknown as FetchFn, memStorage());
    expect(await runAutoUpdateIfDue("demo-alpha")).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
  });

  it("🔥 回归（E6#81）：发现一趟都没跑过 + 目录有新版 + 已勾自动 → 照样真装 + 告知", async () => {
    // 旧实现读「发现那趟留下的候选表」——表空即在第一行静默 `return false`，**勾了等于没勾**。
    // 用户实机路径：打开详情页 → 勾「自动更新」→ 什么也没发生（发现要市场池首载后 ~10s 才跑，且离线/无源
    // 时整趟早退不落表）。本用例全程不调 runUpdateDiscovery——断言的就是「不依赖发现跑过」。
    __setMetaStore(metaStore({ "demo-alpha": { autoUpdate: true } }));
    const update = vi.fn<EngineUpdate>(async () => ({ success: true }));
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0", "Alpha")], update });
    okCatalogFetch([catEntry("demo-alpha", "2.0.0")]);
    expect(await runAutoUpdateIfDue("demo-alpha")).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toBe("demo-alpha");
    expect(typeof update.mock.calls[0][1]?.url).toBe("string"); // URL 走稳定版寻址，非空跑
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(expect.stringContaining("Alpha"), { type: "info", source: "marketplace" });
  });

  it("🔥 回归（E6#81）：已勾自动但已钉旧版 → 仍不动引擎、不说（pin 是唯一闸，不许被现算绕开）", async () => {
    __setMetaStore(metaStore({ "demo-alpha": { autoUpdate: true, pinnedVersion: "1.0.0" } }));
    const update = vi.fn<EngineUpdate>(async () => ({ success: true }));
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0", "Alpha")], update });
    okCatalogFetch([catEntry("demo-alpha", "2.0.0")]);
    expect(await runAutoUpdateIfDue("demo-alpha")).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
  });

  it("已装旧版但 auto 未开（Opt-IN 默认关）→ false 不动引擎、不说（用户没要求过自动更新）", async () => {
    __setMetaStore(metaStore());
    const update = vi.fn<EngineUpdate>(async () => ({ success: true }));
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0", "Alpha")], update });
    okCatalogFetch([catEntry("demo-alpha", "2.0.0")]);
    expect(await runAutoUpdateIfDue("demo-alpha")).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
  });

  it("已装旧版 + auto 开但已钉旧版（§二·九）→ false 不动引擎、不说（pin 时就已放弃自动）", async () => {
    __setMetaStore(metaStore());
    const update = vi.fn<EngineUpdate>(async () => ({ success: true }));
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0", "Alpha")], update });
    okCatalogFetch([catEntry("demo-alpha", "2.0.0")]);

    await setAutoUpdate("demo-alpha", true);
    await setPinnedVersion("demo-alpha", "1.0.0");
    expect(await runAutoUpdateIfDue("demo-alpha")).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
  });

  it("auto 执行失败 → false + warning 告知（盘上版本没变 ⇒ 「可更新」徽标照挂，手动重试的口还在）", async () => {
    __setMetaStore(metaStore());
    const update = vi.fn<EngineUpdate>(async () => ({ success: false }));
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0", "Alpha")], update });
    okCatalogFetch([catEntry("demo-alpha", "2.0.0")]);
    await setAutoUpdate("demo-alpha", true);
    expect(await runAutoUpdateIfDue("demo-alpha")).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(expect.any(String), { type: "warning", source: "marketplace" });
  });
});

/* ═══ E6#79 × 确认门（用户 2026-09-11 更正：确认门管**手动路径**，自动路径不过门——勾选即授权） ═══ */

describe("auto × 确认门（E6#79——第三方来源同样不过门，勾选即授权）", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  /** 第三方源 URL 的目录 fetch——官方源给**空目录**（否则同版条目会经 mergeCatalogs 落到官方、
   *  被 official 短路，测的就不是第三方了）；非官方 URL 给被测条目。 */
  function thirdPartyCatalogFetch(plugins: CatalogEntry[]): void {
    fetchSpy = vi.fn(async (url: string) =>
      url === OFFICIAL_SOURCE_URL ? catalogText() : catalogText(...plugins),
    );
    __setCatalogIO(fetchSpy as unknown as FetchFn, memStorage());
  }

  /** stubWindow 只给 pluginManager/notifications；作者源另需 configuration 面——
   *  在其后补装。作者源用 github 仓库主页形态（归一后 owner/repo = demo-owner/demo-repo）。 */
  function withConfiguration(seed: Record<string, unknown> = {}): void {
    const map = new Map<string, unknown>([
      ["marketplace.marketplaceSources", ["https://github.com/demo-owner/demo-repo"]],
      ...Object.entries(seed),
    ]);
    const cur = (window as unknown as { linkdesk: Record<string, unknown> }).linkdesk;
    Object.defineProperty(window, "linkdesk", {
      value: {
        ...cur,
        configuration: {
          get: async (k: string) => map.get(k),
          set: async (k: string, v: unknown) => {
            map.set(k, v);
          },
        },
      },
      configurable: true,
    });
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

  it("第三方来源的 auto 候选 → 照常自动更新（**零弹卡**）：引擎跑、结果一条 info", async () => {
    __setMetaStore(metaStore({ "demo-alpha": { autoUpdate: true } }));
    const update = vi.fn<EngineUpdate>(async () => ({ success: true }));
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0", "Alpha")], update });
    withConfiguration();
    thirdPartyCatalogFetch([catEntry("demo-alpha", "2.0.0")]);

    const plan = await runUpdateDiscovery();
    expect(plan).not.toBeNull();
    expect(update).toHaveBeenCalledTimes(1); // 勾选即授权——来源不参与判定
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(expect.any(String), { type: "info", source: "marketplace" }); // 结果告知，非警告
  });

  it("勾选即跑（runAutoUpdateIfDue）→ 真的自动更新 + 告知（用户刚勾的那一下不能没反应）", async () => {
    __setMetaStore(metaStore());
    const update = vi.fn<EngineUpdate>(async () => ({ success: true }));
    const { show } = stubWindow({ enabled: [enabled("demo-alpha", "1.0.0", "Alpha")], update });
    withConfiguration();
    thirdPartyCatalogFetch([catEntry("demo-alpha", "2.0.0")]);
    await setAutoUpdate("demo-alpha", true); // DetailView 勾开 → 即刻跑
    expect(await runAutoUpdateIfDue("demo-alpha")).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(expect.any(String), { type: "info", source: "marketplace" });
  });
});

/* ── E6#81 记账销账（同一处 bug 类的第二处：meta 图有、盘上已无 ⇒ 谁销账？此前没人销账） ── */

describe("selectMetaEvictions（纯选择）", () => {
  it("盘上已无此插件 → 它的 pin / 已提醒记账进销账名单", () => {
    const meta = {
      "demo-gone": { pinnedVersion: "0.1.0", lastNotifiedVersion: "0.1.2" },
      "demo-alive": { pinnedVersion: "0.1.0" },
    };
    expect(selectMetaEvictions(meta, ["demo-alive"])).toEqual(["demo-gone"]);
  });

  it("只挑记账类字段——只有 autoUpdate 的幽灵条目不写盘（意愿不随卸载消失）", () => {
    const meta = { "demo-gone": { autoUpdate: true } };
    expect(selectMetaEvictions(meta, [])).toEqual([]);
  });

  it("autoUpdate 与记账并存 → 条目进名单，但调用方只清记账两字段（autoUpdate 留下）", () => {
    const meta = { "demo-gone": { autoUpdate: true, pinnedVersion: "0.1.0" } };
    expect(selectMetaEvictions(meta, [])).toEqual(["demo-gone"]);
  });

  it("全部健在 / 空图 → 无销账", () => {
    expect(selectMetaEvictions({ "demo-a": { pinnedVersion: "1.0.0" } }, ["demo-a"])).toEqual([]);
    expect(selectMetaEvictions({}, ["demo-a"])).toEqual([]);
    expect(selectMetaEvictions({ "demo-a": { pinnedVersion: "1.0.0" } }, [])).toEqual(["demo-a"]);
  });
});

describe("runUpdateDiscovery 销账（🔴 用户实机路径：装旧版停钉 → 卸载 → 重装 ⇒ 残留钉让自动更新静默失效）", () => {
  const ghostCatalog = (plugins: CatalogEntry[]) => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url === OFFICIAL_SOURCE_URL) return catalogText(...plugins);
      throw new Error("unexpected url " + url);
    });
    __setCatalogIO(fetchSpy as unknown as FetchFn, memStorage());
  };

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

  it("🔥 回归：插件已不在盘上 + 目录里也没有它 → 钉与已提醒被清（无人销账 = 幽灵永远在）", async () => {
    const store = metaStore({ "demo-gone": { pinnedVersion: "0.1.0", lastNotifiedVersion: "0.1.2" } });
    __setMetaStore(store);
    stubWindow({ enabled: [enabled("demo-alive", "1.0.0")] });
    ghostCatalog([catEntry("demo-alive", "1.0.0")]);

    await runUpdateDiscovery();

    expect(await readUpdateMetaMap()).toEqual({});
  });

  it("插件全卸光（installed.length === 0 早退）→ 销账仍要发生", async () => {
    __setMetaStore(metaStore({ "demo-gone": { pinnedVersion: "0.1.0" } }));
    stubWindow({ enabled: [] });
    ghostCatalog([]);

    await runUpdateDiscovery();

    expect(await readUpdateMetaMap()).toEqual({});
  });

  it("🔴 读盘不可信（IPC 缺面）→ 一律不销账（一次瞬时故障不得清光全机记账）", async () => {
    __setMetaStore(metaStore({ "demo-gone": { pinnedVersion: "0.1.0" } }));
    Reflect.deleteProperty(window, "linkdesk"); // pluginManager 无面 → available:false
    ghostCatalog([]);

    await runUpdateDiscovery();

    expect(await readUpdateMetaMap()).toEqual({ "demo-gone": { pinnedVersion: "0.1.0" } });
  });

  it("禁用插件不算卸载 → 记账保住（禁用不改住所，也不改记账）", async () => {
    __setMetaStore(metaStore({ "demo-off": { pinnedVersion: "0.1.0" } }));
    stubWindow({ disabled: [disabled("demo-off", "0.1.0")] });
    ghostCatalog([]);

    await runUpdateDiscovery();

    expect(await readUpdateMetaMap()).toEqual({ "demo-off": { pinnedVersion: "0.1.0" } });
  });

  it("autoUpdate 不随卸载清除——意愿类字段留下（与记账类分开处置）", async () => {
    __setMetaStore(metaStore({ "demo-gone": { autoUpdate: true, pinnedVersion: "0.1.0" } }));
    stubWindow({ enabled: [enabled("demo-alive", "1.0.0")] });
    ghostCatalog([catEntry("demo-alive", "1.0.0")]);

    await runUpdateDiscovery();

    expect(await readUpdateMetaMap()).toEqual({ "demo-gone": { autoUpdate: true } });
  });
});
