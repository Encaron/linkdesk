/**
 * updateDiscovery — E6#33a 发现编排（2026-09-08 锚② 重裁：市场池首载调度；Batch F #33d 自动更新接入）。
 *
 * 🔴 重裁依据（代码取证推翻「activationEvents:["*"] 池启动即加载」）：activationEvents 只让「壳」loader
 * 决定是否启动 import 插件 entry，对「池」零影响（池经 PluginComponent import.meta.glob + React.lazy，
 * 视图挂载才 import 插件代码）；而发现编排要推铃铛（notifications.show）与读作者源（configuration.get）——
 * 两者只在「池」preload（壳没有）。→ 发现必须落池，落点 = 市场插件池代码**首载**：任何市场池面（侧栏
 * 已装/禁用/内置、详情、主区 tab）首次挂载都经 marketplaceShared → 本模块 import →
 * scheduleStartupDiscovery()（延迟 ~10s，05 §一·四）。首载在「侧栏恢复上次选中（通常即市场）」或「用户
 * 首次打开市场」时到达——若本会话市场从未加载则顺延到下次加载（重裁拍板接受的代价，零壳零新面）。
 *
 * 幂等两道：本会话只调度一次（模块级 guard）；同版本铃铛只推一次（installedUpdateMeta.lastNotifiedVersion，
 * 跨会话持久——05 §二·一）。壳进程/预览也 import 本模块（marketplace entry 双进程执行）→ 无 notifications.show
 * → 不调度不跑（池门控，壳零改动）。
 *
 * 发现语义（05 §一/§二）：
 *   - 发现 = 拉目录 + 比版本，零下载零写文件（§一·五）
 *   - 本地现状 = pluginManager.list()(启用) ∪ getDisabled()(禁用) 两源合并（§一·二 owner 注）
 *   - remote 稳定版 = 条目 versions[] 首个非 prerelease（最新在前）；旧格式无 versions[] → 顶层 version 且非
 *     prerelease（§一·三/§二·四——beta 默认忽略，只看稳定版）
 *   - 唯一判定 = semver.gt(remote, local)；多源冲突已由 marketCatalog.mergeCatalogs 取高（§二·二，源变化回退
 *     按现目录比，不制造额外提示）
 *   - 无内置排除——core:true 不定义更新行为，覆盖全部已装插件（§二·三）
 *   - 有更新 → 通知中心铃铛推一条（每版本一次：lastNotifiedVersion === remote 不重推）+ 记 lastNotifiedVersion
 *   - 自愈清提醒：lastNotifiedVersion ≤ 本地 → 已追上（外部路径更新/重装的兜底），清标记（§二·一「更新成功清」）
 *   - 目录 offline/corrupt（entries 空）→ 静默跳过（无数据不铃不写）；stale 缓存有数据照跑
 *
 * #33d 自动更新——**E6#71k「都问」后整体停摆（2026-09-10 用户拍板）**：
 *   - 停摆原因：自动更新发生在**用户不在场**时，而新的确认规则是**每次更新都要用户看一眼**——弹不出卡就
 *     不能装。二者不可兼得，用户已知悉并接受（原话：「暂时都问吧……关于这个点不能被卡住」）。
 *   - 因此本模块**不再执行任何 auto 升级**：不跑引擎 update、不动文件。全部候选一律留作手动候选。
 *   - ⚠️ 连带撤销：原先「auto 候选不推铃铛」（auto 已代劳，不必打扰）随之作废——**没人代劳了，就必须告知**，
 *     否则开着自动更新的插件会变成「更新无人做、也不通知」的黑洞。见 doRunDiscovery 铃铛环。
 *   - 用户勾开自动更新的那一刻（runAutoUpdateIfDue）会收到一条停摆说明——勾了却没动静是最不能忍的静默。
 *   - `selectAutoCandidates` / `pinnedVersion` 语义保留，供未来安全版本恢复自动更新时复用。
 *
 *   旧行为存档（供日后恢复参考）：auto 候选静默升级、不推铃铛；执行经引擎 update 走稳定版寻址
 *   （versionDownloadUrl，§二·四 auto 只看稳定版）；成功 toast 由引擎发；失败保留作手动候选。
 *
 * 输出：本模块同是 #33b 常驻「可更新」徽标/升级入口与 #33d 自动更新的数据源（getDiscoveredUpdates +
 * onDiscoveredUpdatesChange——发现结果落 store，随批消费）。
 *
 * IO 注入沿用兄弟模块惯例（marketSources.__setCatalogIO / installedUpdateMeta.__setMetaStore）——纯计划
 * planDiscovery 可直测；主编排 runUpdateDiscovery 读 pluginManager/notifications/update 走 window.linkdesk
 * （jsdom 注入同 startMarketInstall 的测试约定），目录经 loadCatalog。
 */

import i18n from "i18next";
import type { PluginListEntry, PluginInfoEntry } from "@linkdesk/contracts";
import type { CatalogEntry } from "./marketCatalog";
import { compareVersions, isVersionNewer, stableLatestVersion } from "./marketCatalog";
import { loadCatalog } from "./marketSources";
import {
  clearNotifiedVersion,
  noteNotifiedVersion,
  readUpdateMetaMap,
} from "./installedUpdateMeta";
import type { InstalledUpdateMetaMap } from "./installedUpdateMeta";

const pm = () => window.linkdesk?.pluginManager;

/* ═══ 本地快照组装（纯） ═══ */

/** 已装插件本地快照——list()(启用) ∪ getDisabled()(禁用) 两源归一（§一·二；禁用也覆盖——F1 禁用可更新） */
export interface InstalledSnapshot {
  pluginId: string;
  /** plugin.json.version（发现比对基准） */
  localVersion: string;
  /** 展示名（铃铛/徽标文案；manifest.name 缺失回退 pluginId） */
  name: string;
  /** 禁用态——更新不改变禁用状态（§二·十 F1，组装保留供 #33b/update 后翻态） */
  disabled: boolean;
}

/** 两源合并为本地版本快照——list() 排除禁用故与 getDisabled() 不重叠；无版本（无法比较）丢弃。
 *  禁用条目覆盖启用条目仅防御（不发生）。缺名回退 pluginId。 */
export function assembleInstalled(enabled: PluginListEntry[], disabled: PluginInfoEntry[]): InstalledSnapshot[] {
  const byId = new Map<string, InstalledSnapshot>();
  for (const p of enabled) {
    const v = p.manifest.version;
    if (!v) continue;
    byId.set(p.pluginId, {
      pluginId: p.pluginId,
      localVersion: v,
      name: p.manifest.name || p.pluginId,
      disabled: false,
    });
  }
  for (const p of disabled) {
    if (!p.version) continue;
    byId.set(p.pluginId, { pluginId: p.pluginId, localVersion: p.version, name: p.name || p.pluginId, disabled: true });
  }
  return [...byId.values()];
}

/* ═══ 发现计划（纯——主测区） ═══ */

/** 可更新候选——稳定 remote > local（#33b 徽标/升级入口、#33d 自动更新共用形态） */
export interface UpdateCandidate {
  pluginId: string;
  localVersion: string;
  /** 远端稳定版最新（marketplace.json 目录比对目标） */
  remoteLatest: string;
  name: string;
  /** 胜出目录条目（#33b 动作取 downloadUrl/versions[]；多源已取高者） */
  entry: CatalogEntry;
}

export interface DiscoveryPlan {
  /** 常驻「可更新」集合（稳定 remote > local）——含已提醒过本版的（徽标常驻到更新完成才消，§一·二） */
  candidates: UpdateCandidate[];
  /** 本趟该推铃铛的——lastNotifiedVersion !== remoteLatest（每版本一次幂等，§二·一） */
  toNotify: UpdateCandidate[];
  /** 已追上曾提醒版本 → 自愈清提醒的插件 id（§二·一「更新成功清」兜底） */
  toClearNotified: string[];
}

/** 纯计划——目录 × 本地快照 × 更新记账 → 发现计划。条目消失/下架（目录无此 id）→ 无信号不提示（§二·五）。
 *  同 id 冲突取高者由 mergeCatalogs 完成（此处目录已是合并产物）；remote 回退按现目录比（§二·二）。 */
export function planDiscovery(
  catalogEntries: CatalogEntry[],
  installed: InstalledSnapshot[],
  meta: InstalledUpdateMetaMap,
): DiscoveryPlan {
  const byId = new Map(catalogEntries.map((e) => [e.id, e] as const));
  const candidates: UpdateCandidate[] = [];
  const toNotify: UpdateCandidate[] = [];
  const toClearNotified: string[] = [];
  for (const inst of installed) {
    const entry = byId.get(inst.pluginId);
    if (!entry) continue; // 未上架/下架 → 无更新信号（§二·五：不提示不动本地）
    const remote = stableLatestVersion(entry);
    if (remote === undefined) continue; // 无稳定版可提示（§二·四：beta 走手动 #33c）
    const notified = meta[inst.pluginId]?.lastNotifiedVersion;
    // 已追上曾提醒版本 → 自愈清（无论是否还有更新的 remote——旧标记作废，新的另判另推）
    if (notified && compareVersions(inst.localVersion, notified) >= 0) {
      toClearNotified.push(inst.pluginId);
    }
    if (!isVersionNewer(remote, inst.localVersion)) continue; // §一·三 唯一判定——不比本地高 → 无更新
    const c: UpdateCandidate = {
      pluginId: inst.pluginId,
      localVersion: inst.localVersion,
      remoteLatest: remote,
      name: inst.name,
      entry,
    };
    candidates.push(c);
    // 同版已提醒过 → 不重推（幂等；semver 相等判——防 v 前缀/缺位补 0 的串漂移重铃）
    if (!notified || compareVersions(remote, notified) !== 0) toNotify.push(c);
  }
  return { candidates, toNotify, toClearNotified };
}

/** #33d 纯选择：autoUpdate 应自动更新的候选——meta.autoUpdate===true 且**未钉版本**（§二·九 pinnedVersion
 *  停旧版 → 自动更新跳过，尊重「停在旧版」的手动意图）。入参 = planDiscovery 的 candidates（已是
 *  stable-only + semver.gt 判定的成员，不重复判）。 */
export function selectAutoCandidates(
  candidates: UpdateCandidate[],
  meta: InstalledUpdateMetaMap,
): UpdateCandidate[] {
  return candidates.filter((c) => {
    const m = meta[c.pluginId];
    return m?.autoUpdate === true && m?.pinnedVersion === undefined;
  });
}

/* ═══ 发现结果 store（#33b 徽标/升级入口 + #33d 自动更新数据源） ═══ */

let _candidates: UpdateCandidate[] = [];
let _discovered = false;
const _listeners = new Set<() => void>();

/** 最近一趟发现的可更新集合（无候选 = []；未跑过 = [] + discovered:false 区分） */
export function getDiscoveredUpdates(): UpdateCandidate[] {
  return _candidates;
}

/** 是否完成过至少一趟发现（离线跳过返回 null 不算——消费方据此区分「未检过」vs「检过无更新」） */
export function hasDiscoveredUpdates(): boolean {
  return _discovered;
}

export function onDiscoveredUpdatesChange(fn: () => void): () => void {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}

/** 更新成功后的候选驱逐（E6#33b——本会话不自动重跑发现，徽标消费方更新后即时重算消失；
 *  store 保持诚实 + #33d 自动更新防「同一候选重复更新」。仅存在时驱逐，返回是否驱逐。 */
export function removeDiscoveredCandidate(pluginId: string): boolean {
  const next = _candidates.filter((c) => c.pluginId !== pluginId);
  if (next.length === _candidates.length) return false;
  commitStore(next);
  return true;
}

/** 测试复位 store/调度/并发态（vitest afterEach 用——模块单例跨用例残留；产线不调） */
export function __resetUpdateDiscovery(): void {
  _candidates = [];
  _discovered = false;
  _listeners.clear();
  _scheduled = false;
  _running = null;
}

function commitStore(candidates: UpdateCandidate[]): void {
  _candidates = candidates;
  _discovered = true;
  _listeners.forEach((f) => f());
}

/* ═══ #33d 自动更新——E6#71k「都问」后整体停摆（2026-09-10 用户拍板） ═══ */

/** 自动更新停摆告知——用户**当场**勾开自动更新时发一条，讲清「为什么勾了也没动静」。
 *  直调 notifications（不经 marketplaceShared——那是本模块的**下游**，import 会成环）。壳进程无
 *  notifications.show → 静默 no-op（同本模块既有池门控）。
 *
 *  ⚠️ 只在「用户主动勾选」这一刻发。发现编排**不发**——那会每趟发现刷一次（每趟都白弹一条，用户要的
 *  是「有新版本」这条信息本身）；改由铃铛照常逐插件告知（见 doRunDiscovery 已撤 auto 抑制）。 */
function notifyAutoPaused(): void {
  const show = window.linkdesk?.notifications?.show;
  if (!show) return;
  void show(
    i18n.t("自动更新已暂停——现在每次更新都要你确认，自动更新无法在你不在场时询问。可在插件详情点「更新」手动确认。"),
    { type: "info" },
  );
}

/* ═══ 主编排（IO——读已装 → 拉目录 → 计划 → 自愈清 + 铃铛推(幂等) + auto 静默跑 + 落 store） ═══ */

/** 读已装快照（IPC 不可用/失败 → 空数组——预览环境不崩） */
export async function readInstalledSnapshot(): Promise<InstalledSnapshot[]> {
  if (!pm()?.list || !pm()?.getDisabled) return [];
  try {
    const [enabled, disabled] = await Promise.all([pm()!.list(), pm()!.getDisabled()]);
    return assembleInstalled(enabled, disabled);
  } catch {
    return [];
  }
}

let _running: Promise<DiscoveryPlan | null> | null = null;

/** 发现主编排。force=true 手动刷新用（跳过 5min fresh 缓存）。并发一趟（启动调度 + 手动重叠）复用。
 *  目录空（offline/corrupt）→ 返回 null 静默跳过（无数据不铃不写）；stale 缓存有数据照跑。 */
export async function runUpdateDiscovery(force = false): Promise<DiscoveryPlan | null> {
  if (_running) return _running;
  _running = doRunDiscovery(force).finally(() => {
    _running = null;
  });
  return _running;
}

async function doRunDiscovery(force: boolean): Promise<DiscoveryPlan | null> {
  const installed = await readInstalledSnapshot();
  if (installed.length === 0) return null; // 无已装 / IPC 不可用 → 无事可发现
  const catalog = await loadCatalog(force);
  if (catalog.entries.length === 0) return null; // 空目录（ok 空/offline/corrupt 一律）→ 无条目可发现，静默不铃
  const meta = await readUpdateMetaMap();
  const plan = planDiscovery(catalog.entries, installed, meta);

  // 自愈清提醒（幂等——无变化不写盘，installedUpdateMeta 内部保证）
  await Promise.all(plan.toClearNotified.map((id) => clearNotifiedVersion(id)));

  // 铃铛推一条 + 记版本（每版本一次）。推失败 → 不记（下趟补推，宁重勿漏）；全插件独立，单败不阻断。
  // E6#71k「都问」：**撤掉原先「auto 候选不铃」的抑制**——自动更新已停摆，不再有人代劳，这些插件
  //  必须和别的插件一样收到铃铛，否则「更新无人做、也不告知」= 用户彻底不知道有新版本。
  const show = window.linkdesk?.notifications?.show;
  for (const c of plan.toNotify) {
    let pushed = false;
    if (show) {
      try {
        await show(updateBellMessage(c), { type: "info" });
        pushed = true;
      } catch {
        pushed = false; // 推送失败 → 不记账（下次发现重推）
      }
    } else {
      pushed = true; // 无铃铛能力（预览/非池）——仍记账防循环重试；发现编排本已池门控，此为兜底
    }
    if (pushed) await noteNotifiedVersion(c.pluginId, c.remoteLatest);
  }

  // #33d auto 执行环已删（E6#71k「都问」）——见文件头「自动更新停摆」。此处不跑引擎 update、不动文件：
  //  全部候选一律留作手动候选（可更新徽标 + 铃铛告知），用户去详情页点「更新」时过确认门。
  commitStore(plan.candidates);
  return plan;
}

/** #33d 勾选即跑 —— E6#71k「都问」后**恒返回 false**：自动更新停摆，本函数只剩「把停摆讲清楚」这一件事。
 *
 *  存在理由：用户勾上「自动更新」的那一刻，是唯一能当面解释的时机（其余时刻用户不在场）。勾了却什么都不
 *  发生 = 静默的谎；故此处对**确实表达过自动更新意图的插件**发一条停摆说明。恒 false 不驱逐候选——
 *  候选照常保留（可更新徽标 + 铃铛），用户手动去详情页点「更新」。
 *  幂等守卫保留（发现编排在跑 → 先等收束），与既有编排不打架。 */
export async function runAutoUpdateIfDue(pluginId: string): Promise<boolean> {
  if (_running) await _running;
  const c = _candidates.find((x) => x.pluginId === pluginId);
  if (!c) return false;
  const meta = await readUpdateMetaMap();
  // 复用纯选择函数判定「这个插件本来该被自动更新吗」（autoUpdate on + 未钉版本）——不是 → 用户没表达过
  // 该意图，没必要解释；是 → 他关心的事停了，必须说。
  if (selectAutoCandidates([c], meta).length > 0) notifyAutoPaused();
  return false;
}

/** 铃铛文案——插件名 + 新版（i18n key = 中文原文；en.json 映射英文，zh 回落 key 中文） */
function updateBellMessage(c: UpdateCandidate): string {
  return i18n.t("「{{name}}」有新版本 {{version}}", { name: c.name, version: c.remoteLatest });
}

/* ═══ 启动调度（2026-09-08 锚② 重裁——市场池首载触发，模块级每进程一次） ═══ */

const DISCOVERY_DELAY_MS = 10_000;

let _scheduled = false;

/** 调度启动发现——市场插件池代码首载时调用一次（marketplaceShared 模块底触发）。
 *  池门控：壳进程/预览无 notifications.show → 不调度（发现编排需铃铛能力，池独占；壳零改动）。 */
export function scheduleStartupDiscovery(delayMs: number = DISCOVERY_DELAY_MS): void {
  if (_scheduled) return;
  _scheduled = true;
  if (!window.linkdesk?.notifications?.show) return; // 池门控（见头注）
  setTimeout(() => {
    void runUpdateDiscovery().catch(() => {
      /* 发现失败静默——后台任务不打扰；下趟（手动/下次首载）再试 */
    });
  }, delayMs);
}
