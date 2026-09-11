/**
 * plan — 发现计划（纯函数区，主测区）：目录 × 本地快照 × 更新记账 → 该做什么。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `updateDiscovery.ts` 原样搬出，零行为变更。
 *
 * 零 IO、零 window——vitest 直测。**判断「算不算有更新」的唯一一份逻辑就在这里**，
 * 发现编排与「勾选即跑」都复用它（不许另写第二份）。
 */

import type { CatalogEntry } from "../marketCatalog";
import { compareVersions, isVersionNewer, stableLatestVersion } from "../marketCatalog";
import type { InstalledUpdateMetaMap } from "../installedUpdateMeta";
import type { DiscoveryPlan, InstalledSnapshot, UpdateCandidate } from "./types";

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
