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
 * #33d 自动更新——**E6#79 恢复运转（2026-09-11 用户拍板）**：
 *   🔴 **推翻经过（动这里之前务必读完）**：#71k（2026-09-10）曾把自动更新**整体停摆**，理由写成「自动更新在你
 *     不在场时弹不出确认卡，与『每次都问』不可兼得」。**那条推论不是用户的意思**——用户 2026-09-11 当面更正：
 *     「暂时都问吧，我当时指的是那个确认安装的弹窗呀，和这个自动更新有半毛钱关系？」。
 *     确认卡管的是**手动路径**（用户点「安装」/「更新」时问一次）；自动更新是**另一条路**——勾选本身就是那次
 *     授权，不经确认卡。两条路各走各的，互不冲突。
 *     **教训：把一条规则从 A 外推到 B，不等于用户同意了 B。**（同类错误本项目已犯两次：铃铛开关、本次；两次都是
 *      AI 自洽性论证盖过用户原话。）停摆期间的产物（notifyAutoPaused + 勾选框「暂不生效」文案）已随本次删除。
 *   - auto 候选 = `selectAutoCandidates`（meta.autoUpdate===true 且未钉版本；§二·九 pinnedVersion 停旧版
 *     → 跳过，尊重手动意图）。**不推「有新版本」铃铛**——auto 已代劳，再推 = 同一件事说两遍。
 *   - 执行 = 串行跑引擎 update，url 走稳定版寻址（versionDownloadUrl——§二·四 auto 只看稳定版，beta 不自动装）。
 *   - **成功 → 发一条汇总通知**（E6#79 用户拍板「装完发一条通知告诉我」）：单个点名到版本，多个给条数 + 头几个
 *     名字（同 updateBellMessage 结构）。静默装完会让用户回来发现「版本变了、但不知道是谁动的手」。
 *   - **失败 → 候选保留**（「可更新」徽标仍在，下次发现 / 手动重试）+ 发一条汇总告知：失败比成功更需要用户知道。
 *   - 勾选开 = DetailView 立即 `runAutoUpdateIfDue`（**候选就地现算，不读 store**——见该函数头注 E6#81）。
 *   - G6：插件标签页开着也照常 stage + 替换 + 重启生效（引擎 needRestart 恒 true——原子替换已证开着也能成，§二·七）。
 *
 * 输出：⚠️ E6#81 审视更正——**#33b 常驻「可更新」徽标不读本模块 store**（徽标由 DetailView / 列表页经
 * `updateTargetFor` 现算，是同一判定的另一处消费）。本模块 store（getDiscoveredUpdates /
 * onDiscoveredUpdatesChange / hasDiscoveredUpdates）**产线已无读者**，仅剩 vitest 断言与
 * `removeDiscoveredCandidate` 的两处调用（DetailView 手动更新成功、marketplaceShared 手动重试成功）——
 * 后者在 store 本就为空时是 no-op。是否连同测试断言一并拆除待用户拍板；在那之前保持原状，不得据其做判断。
 *
 * IO 注入沿用兄弟模块惯例（marketSources.__setCatalogIO / installedUpdateMeta.__setMetaStore）——纯计划
 * planDiscovery 可直测；主编排 runUpdateDiscovery 读 pluginManager/notifications/update 走 window.linkdesk
 * （jsdom 注入同 startMarketInstall 的测试约定），目录经 loadCatalog。
 */

import i18n from "i18next";
import type { PluginListEntry, PluginInfoEntry } from "@linkdesk/contracts";
import type { CatalogEntry } from "./marketCatalog";
import { compareVersions, isVersionNewer, stableLatestVersion, versionDownloadUrl } from "./marketCatalog";
import { loadCatalog } from "./marketSources";
import {
  clearNotifiedVersion,
  noteNotifiedVersion,
  patchUpdateMeta,
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
  /** E6#73j（G6）：住所——`false` = 住只读 app 根（随包发货件 / 目录源安装），**不可能被包更新**。
   *  发现编排不得为它产候选（引擎对它会抛「不在用户安装区」）——否则铃铛年年提醒一件永远做不成的事。 */
  updatable?: boolean;
}

/** 两源合并为本地版本快照——list() 排除禁用故与 getDisabled() 不重叠；无版本（无法比较）丢弃。
 *  禁用条目覆盖启用条目仅防御（不发生）。缺名回退 pluginId。
 *  E6#73j（G6）：updatable 随行（两源都带——禁用不改住所）。 */
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
      updatable: p.updatable,
    });
  }
  for (const p of disabled) {
    if (!p.version) continue;
    byId.set(p.pluginId, { pluginId: p.pluginId, localVersion: p.version, name: p.name || p.pluginId, disabled: true, updatable: p.updatable });
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
    // E6#73j（G6）：住只读 app 根的插件不是候选——引擎对它必抛「不在用户安装区」，
    // 推进候选 = 徽标挂着一个点不动的入口 + 铃铛年年提醒一件永远做不成的事。自愈清照跑（上方）。
    if (inst.updatable === false) continue;
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

/* ═══ E6#81 审视：记账销账（谁销账？——此前没人销账） ═══ */

/** 销账选择（纯）：meta 图里**有**、但盘上**已无**此插件的 id——只挑**记账类**字段（pinnedVersion /
 *  lastNotifiedVersion）非空的（无记账可清的不写盘，省一次 IO）。
 *
 *  🔴 **为什么不连 `autoUpdate` 一起清**——两类字段的依附对象不同：
 *    · `pinnedVersion`（停旧版）/ `lastNotifiedVersion`（已就哪版提醒过）依附于**某一次安装事实**。
 *      卸载 = 那次事实结束 ⇒ **必须清**。不清的实机路径：装 0.1.0 停旧版（记 pin）→ 卸载 → 重装最新
 *      0.1.2 ⇒ 残留 pin 让 `selectAutoCandidates` **永远跳过它**——自动更新静默失效，界面上一个字都不说。
 *    · `autoUpdate` 依附于**用户对这个插件的意愿**（「它更新了就自动装」）。卸载不改变意愿 ⇒ **留**。
 *  「该不该留」是两件不同的事——同 E6#80 对 `metadataCache` 的处置（卸载不删，因市场仍要能浏览详情）。 */
export function selectMetaEvictions(
  meta: InstalledUpdateMetaMap,
  installedIds: Iterable<string>,
): string[] {
  const alive = installedIds instanceof Set ? installedIds : new Set(installedIds);
  const out: string[] = [];
  for (const [pluginId, m] of Object.entries(meta)) {
    if (alive.has(pluginId)) continue;
    if (m.pinnedVersion !== undefined || m.lastNotifiedVersion !== undefined) out.push(pluginId);
  }
  return out;
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

/* ═══ #33d 单候选自动更新执行（doRunDiscovery 与勾选即跑共用——引擎 update，结果由 market 侧告知） ═══ */

/** 对单候选跑引擎更新——url = versionDownloadUrl 取该稳定版资产（§二·四 auto 只看稳定版；顶层兜底同 #33b 寻址）。
 *  无 update 能力（预览 / 非池）/ 无 url / 引擎抛错 → false（无法自动，候选保留作手动可更新）。
 *  needRestart 恒 true 也计成功：文件已原子替换，重启生效（§二·七）。
 *  ⚠️ **不过确认门**——这是自动路径，勾选本身就是授权；确认卡只管手动路径（见文件头 E6#79 推翻经过）。 */
async function applyEngineAutoUpdate(c: UpdateCandidate): Promise<boolean> {
  const upd = pm()?.update;
  if (!upd) return false;
  const url = versionDownloadUrl(c.entry, c.remoteLatest) ?? c.entry.downloadUrl;
  if (!url) return false;
  try {
    const r = await upd(c.pluginId, { url });
    return !!r && r.success;
  } catch {
    return false; // 引擎抛 / 断网 → 失败；候选保留（下次发现 / 手动重试）
  }
}

/* ═══ 主编排（IO——读已装 → 拉目录 → 计划 → 自愈清 + 铃铛推(幂等) + auto 静默跑 + 落 store） ═══ */

/** 读已装快照 + 盘上 id 全集 + 「这次读盘可不可信」（IPC 不可用/失败 → 空 + `available:false`——预览环境不崩）。
 *
 *  🔴 E6#81：**id 全集单独回传，不经 `assembleInstalled` 的「无版本条目丢弃」过滤**——销账判据是
 *  「这个插件还在不在盘上」，不是「它有没有可比较的版本」。拿过滤后的快照当判据 ⇒ 一个版本字段缺失的
 *  插件会被误判成「已卸载」而清掉它的记账。
 *
 *  🔴 `available` 是**销账的安全闸**：读盘失败也返回空数组，若调用方拿空数组当「什么都没装」⇒
 *  一次瞬时 IPC 故障就把全机的 pin / 已提醒记账**清光**。故必须区分「真的一台没装」与「没读到」。 */
export async function readInstalledSnapshot(): Promise<{
  snapshot: InstalledSnapshot[];
  installedIds: string[];
  available: boolean;
}> {
  if (!pm()?.list || !pm()?.getDisabled) return { snapshot: [], installedIds: [], available: false };
  try {
    const [enabled, disabled] = await Promise.all([pm()!.list(), pm()!.getDisabled()]);
    return {
      snapshot: assembleInstalled(enabled, disabled),
      installedIds: [...enabled.map((p) => p.pluginId), ...disabled.map((p) => p.pluginId)],
      available: true,
    };
  } catch {
    return { snapshot: [], installedIds: [], available: false };
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
  const { snapshot: installed, installedIds, available } = await readInstalledSnapshot();
  const meta = await readUpdateMetaMap();

  // 🔴 E6#81：**销账先于一切**，包括下面两个「无事可发现」的早退。理由有二：
  //   ① 销账判的是「盘上还在不在」，与「有没有目录可比」无关——用户把插件全卸光时 `installed.length === 0`
  //      若直接 return，残留记账**永远没有机会被清**（发现循环是唯一的销账机会）。
  //   ② `available === false`（IPC 不可用/读失败）绝不销账——空数组此时不代表「什么都没装」，
  //      拿它当判据 = 一次瞬时故障清光全机记账（见 readInstalledSnapshot 头注）。
  if (available) {
    const evictions = selectMetaEvictions(meta, installedIds);
    await Promise.all(
      evictions.map((id) => patchUpdateMeta(id, { pinnedVersion: undefined, lastNotifiedVersion: undefined })),
    );
  }

  if (installed.length === 0) return null; // 无已装 / IPC 不可用 → 无事可发现
  const catalog = await loadCatalog(force);
  if (catalog.entries.length === 0) return null; // 空目录（ok 空/offline/corrupt 一律）→ 无条目可发现，静默不铃
  const plan = planDiscovery(catalog.entries, installed, meta);

  // 自愈清提醒（幂等——无变化不写盘，installedUpdateMeta 内部保证）
  await Promise.all(plan.toClearNotified.map((id) => clearNotifiedVersion(id)));

  // #33d auto 候选（autoUpdate on + 未钉版本）——这些插件由下方执行环**代劳**，故不推「有新版本」铃铛
  //  （同一件事说两遍）；改由代劳后的结果通知告知（见 notifyAutoResult）。见文件头 E6#79。
  const autoEligible = selectAutoCandidates(plan.candidates, meta);
  const autoIds = new Set(autoEligible.map((c) => c.pluginId));
  const toNotify = plan.toNotify.filter((c) => !autoIds.has(c.pluginId));

  // 铃铛推一条 + 记版本（每版本一次）。推失败 → 不记（下趟补推，宁重勿漏）。
  // E6#73j（G7）：**整批一条汇总，不是逐插件 N 条**。此前 10 个待更新 = 10 条 info 挤满通知面板；
  //  而 info 级不触发 autoOpen（18 档 §五 B）⇒ 该看的时候没弹出来，只是静静堆了一屏——
  //  「该通知时不弹、该收敛时刷屏」两头错。汇总后：一条说清几件事，面板看得到，铃铛也不淹。
  //  记账仍**逐条做**（幂等键是 per-plugin per-version，不是 per-批次）——整批一次推送成功即整批记账。
  const show = window.linkdesk?.notifications?.show;
  if (toNotify.length > 0) {
    let pushed = false;
    if (show) {
      try {
        // E6#73g（S5）：版本提醒归市场来源桶（组标题解析成市场显示名，不显示内部 id）
        await show(updateBellMessage(toNotify), { type: "info", source: "marketplace" });
        pushed = true;
      } catch {
        pushed = false; // 推送失败 → 不记账（下次发现重推）
      }
    } else {
      pushed = true; // 无铃铛能力（预览/非池）——仍记账防循环重试；发现编排本已池门控，此为兜底
    }
    if (pushed) {
      for (const c of toNotify) await noteNotifiedVersion(c.pluginId, c.remoteLatest);
    }
  }

  // #33d auto 执行（串行——引擎 update 单通道，多插件串行最稳；单败不阻断其余）。G6：插件标签页开着照常
  //  stage + 替换 + 重启生效（引擎 needRestart 恒 true——原子替换开着也能成，§二·七）。成功者从常驻 store
  //  驱逐（徽标消、不重复更新）；**失败者保留作手动候选**（「可更新」徽标仍在，下次发现 / 手动重试）。
  const autoDone: UpdateCandidate[] = [];
  const autoFailed: UpdateCandidate[] = [];
  for (const c of autoEligible) {
    (await applyEngineAutoUpdate(c) ? autoDone : autoFailed).push(c);
  }
  notifyAutoResult(autoDone, autoFailed);

  const doneIds = new Set(autoDone.map((c) => c.pluginId));
  commitStore(plan.candidates.filter((c) => !doneIds.has(c.pluginId)));
  return plan;
}

/** #33d 勾选即跑（DetailView 勾上 autoUpdate → 立即调）——**候选就地现算，不读 store**。
 *
 *  🔴 E6#81（2026-09-11）：此前的判据是「store 里有没有这个插件的候选」，而 store **只由 `doRunDiscovery`
 *  落**——它每会话最多跑一趟，且是市场池首载后 ~10s（DISCOVERY_DELAY_MS）；目录为空（离线 / 未配源 / 坏
 *  parse）时更是在 `commitStore` 之前就早退。⇒ 用户打开详情页勾上开关的那一刻 store 往往是空的，函数在
 *  `!c` 处**静默 `return false`**——**勾了等于没勾**，界面上一个字不说。这与 1.0.20 changelog 的承诺
 *  （「勾上开关那一刻如果正好有可更新的版本，立刻装，不用等下一轮检查」）直接冲突，也说明「把判定挂在
 *  别人的一次性产物上」是这次 bug 的形状。
 *
 *  修法 = 不赌「发现跑过了」，勾选那一下**自己现算**：读盘上现状 + 拉目录（5min fresh 缓存命中则零网络
 *  开销）→ 复用**同一个** `planDiscovery` 判定（不另写第二份「这算不算有更新」的逻辑）→ auto 门 → 跑引擎。
 *  该不该自动更新（autoUpdate on + 未钉版本，§二·九）仍由 `selectAutoCandidates` 判——用户没表达过该
 *  意图就不替他动文件。
 *  成功 → 驱逐 store 候选（发现跑过则撤徽标；没跑过是 no-op）**并告知**；失败 → 候选保留（手动可重试）
 *  **也告知**。返回是否成功自动更新。
 *  幂等守卫：发现编排在跑 → 先等收束（编排已含 auto 处理本趟候选，防双跑引擎 update）。 */
export async function runAutoUpdateIfDue(pluginId: string): Promise<boolean> {
  if (_running) await _running;
  const meta = await readUpdateMetaMap();
  const { snapshot, available } = await readInstalledSnapshot();
  if (!available) return false; // 读不到盘上现状（IPC 不可用/失败）→ 判不了，不动文件
  const inst = snapshot.find((x) => x.pluginId === pluginId);
  if (!inst) return false; // 没装 / 盘上没有它 → 无事可做（下趟发现照常处理）
  const catalog = await loadCatalog(false);
  if (catalog.entries.length === 0) return false; // 无目录数据 → 判不出有没有新版，不猜
  // 复用发现编排的**同一份**判定（stable-only + semver.gt + updatable 闸 + 下架跳过）——单插件喂进去取首位。
  const c = planDiscovery(catalog.entries, [inst], meta).candidates[0];
  if (!c) return false; // 没有比本地新的稳定版 → 无候选可跑
  // 复用纯选择函数判定「这个插件本来该被自动更新吗」（autoUpdate on + 未钉版本）——不是 → 用户没表达过
  //  该意图，不该替他动文件。
  if (selectAutoCandidates([c], meta).length === 0) return false;
  const ok = await applyEngineAutoUpdate(c);
  notifyAutoResult(ok ? [c] : [], ok ? [] : [c]);
  if (ok) removeDiscoveredCandidate(pluginId);
  return ok;
}

/** 汇总里最多点几个名字——多了只留条数（面板一行读得完；完整名单在各列表页的可更新徽标上） */
const BELL_NAME_LIMIT = 3;

/** 铃铛文案（i18n key = 中文原文；en.json 映射英文，zh 回落 key 中文）。
 *  E6#73j（G7）：一批一条——单个时才点名到版本（原逐插件文案原样保留，信息量最足）；多个时给条数 +
 *  头几个名字。⚠️ 不用 i18next 的 `count` 复数变量——那会去找 `key_one`/`key_other` 变体，
 *  而本项目词典是「中文原文 → 译文」平表，没有复数形态。 */
function updateBellMessage(cs: UpdateCandidate[]): string {
  if (cs.length === 1) {
    return i18n.t("「{{name}}」有新版本 {{version}}", { name: cs[0].name, version: cs[0].remoteLatest });
  }
  const heads = cs.slice(0, BELL_NAME_LIMIT).map((c) => c.name).join("、");
  const names = cs.length > BELL_NAME_LIMIT ? i18n.t("{{names}} 等", { names: heads }) : heads;
  return i18n.t("{{num}} 个插件有新版本：{{names}}", { num: cs.length, names });
}

/** 自动更新**成功**文案（E6#79）——结构同 updateBellMessage：单个点名到版本，多个给条数 + 头几个名字 */
function autoUpdatedMessage(cs: UpdateCandidate[]): string {
  if (cs.length === 1) {
    return i18n.t("「{{name}}」已自动更新到 {{version}}", { name: cs[0].name, version: cs[0].remoteLatest });
  }
  const heads = cs.slice(0, BELL_NAME_LIMIT).map((c) => c.name).join("、");
  const names = cs.length > BELL_NAME_LIMIT ? i18n.t("{{names}} 等", { names: heads }) : heads;
  return i18n.t("{{num}} 个插件已自动更新：{{names}}", { num: cs.length, names });
}

/** 自动更新**失败**文案（E6#79）——同上结构；结尾统一指向手动重试口（详情页「更新」）。
 *  失败没有「已自动重试 N 次」这类自动兜底：候选保留，下次发现会再试一次，也再告知一次。 */
function autoFailedMessage(cs: UpdateCandidate[]): string {
  if (cs.length === 1) {
    return i18n.t("「{{name}}」自动更新失败——可在插件详情点「更新」重试。", { name: cs[0].name });
  }
  const heads = cs.slice(0, BELL_NAME_LIMIT).map((c) => c.name).join("、");
  const names = cs.length > BELL_NAME_LIMIT ? i18n.t("{{names}} 等", { names: heads }) : heads;
  return i18n.t("{{num}} 个插件自动更新失败：{{names}}——可在插件详情点「更新」重试。", { num: cs.length, names });
}

/** 自动更新结果告知（E6#79 用户拍板「装完发一条通知告诉我」）——成功 / 失败各一条**汇总**（多个插件不逐条
 *  刷屏，同 updateBellMessage 整批一条的做法）。静默装完会让用户回来发现「版本变了、但不知道谁动的手」。
 *  直调 notifications（不经 marketplaceShared——那是本模块的**下游**，import 会成环）。壳进程无
 *  notifications.show → 静默 no-op（同本模块既有池门控）。两边都空 → 一条不发（无结果不打扰）。 */
function notifyAutoResult(updated: UpdateCandidate[], failed: UpdateCandidate[]): void {
  const show = window.linkdesk?.notifications?.show;
  if (!show) return;
  // E6#73g（S5）：市场自报身份（只给 source，不 import marketplaceShared——那是本模块下游，会成环）
  if (updated.length > 0) {
    void show(autoUpdatedMessage(updated), { type: "info", source: "marketplace" });
  }
  if (failed.length > 0) {
    void show(autoFailedMessage(failed), { type: "warning", source: "marketplace" });
  }
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
