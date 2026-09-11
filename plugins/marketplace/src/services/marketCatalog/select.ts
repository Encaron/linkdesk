/**
 * select — 目录条目的**选择器**：稳定版 / 可更新 / 版本下拉 / 钉记账（零 IO，vitest 直测）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketCatalog.ts` 原样搬出，零行为变更。
 *
 * 这些函数是**版本判据的单点**——视图层消费它们即与发现/铃铛同判据，杜绝判定分裂。
 */

import type { CatalogEntry, CatalogVersionChoice } from "./types";
import { compareVersions, isPrereleaseVersion, isVersionNewer } from "./semver";

/** 条目稳定版最新——versions[] 最新在前取首个非 prerelease；旧格式无 versions[] → 顶层 version（本身非 prerelease 才返回）。
 *  undefined = 条目无稳定版可提示（§二·四：全 prerelease 不提示，beta 只走手动安装 #33c 版本下拉）。 */
export function stableLatestVersion(entry: CatalogEntry): string | undefined {
  const list = entry.versions && entry.versions.length > 0 ? entry.versions.map((x) => x.version) : [entry.version];
  for (const v of list) {
    if (!isPrereleaseVersion(v)) return v;
  }
  return undefined;
}

/** 指定版本的下载地址（E6#33b/c——升级动作/版本下拉选哪版取哪版 downloadUrl，不默认顶层 beta）。
 *  versions[] 命中该版本（semver 等判，容 v 前缀）且带 downloadUrl → 用之；versions[] 无命中或该版本无
 *  downloadUrl → 仅当目标 == 顶层 version 借 entry.downloadUrl（顶层即最新）；否则 undefined（诚实——不发错包）。
 *  旧格式无 versions[] → 目标须 == 顶层 version 才返回。 */
export function versionDownloadUrl(entry: CatalogEntry, version: string): string | undefined {
  if (entry.versions && entry.versions.length > 0) {
    const hit = entry.versions.find((v) => v.downloadUrl && compareVersions(v.version, version) === 0);
    if (hit) return hit.downloadUrl;
  }
  return compareVersions(entry.version, version) === 0 ? entry.downloadUrl : undefined;
}

/** 相对本地版本判定「可更新」（E6#33b——UI 常驻徽标/升级入口 + #33d autoUpdate 消费同一判据）。
 *  语义 = planDiscovery 成员判定同源：stable-only（§二·四，beta 不提示）+ semver.gt 唯一判定（§一·三）。
 *  返回该可更新的远端稳定版；无本地版本 / 不比本地高 / 无稳定版 → undefined（不提示）。
 *  视图层消费此单函数即与发现/铃铛同判据——杜绝「探索徽标 top-beta 而详情/铃铛 stable 不提示」的判定分裂。
 *  目录条目缺失/未上架 → undefined（§二·五——下架不提示；调用方可不守卫直传 Map.get 结果）。 */
export function updateToVersion(entry: CatalogEntry | undefined, localVersion?: string): string | undefined {
  if (!entry || !localVersion) return undefined;
  const remote = stableLatestVersion(entry);
  if (remote === undefined) return undefined;
  return isVersionNewer(remote, localVersion) ? remote : undefined;
}

/** 可更新判定**全站单点**（E6#73j G6）——`updateToVersion` 再加一道住所闸。
 *
 *  为什么要有这道闸：`updateToVersion` 只问「目录里有没有更高版本」，**不问这个插件住在哪**。而引擎的
 *  更新流只接受用户安装家（`{userData}/plugins`）——其余一律抛「插件不在用户安装区」。⇒ 随包发货的官方
 *  插件（含 8 只）、目录源安装的插件，详情页都挂着一个**点下去必然失败**的「更新到 vX」。
 *
 *  `updatable === false` 才拦，`undefined`（旧上游/未上报）放行——住所是**新增**信息，缺它时保持原行为；
 *  反过来（缺它就一律不显示更新）会把「有新版」这件事整体藏掉，那是比死钮更糟的错。
 *  住所判据唯一源 = 壳 `isPluginUpdatable`（磁盘事实）；本函数只消费。 */
export function updateTargetFor(
  entry: CatalogEntry | undefined,
  localVersion?: string,
  updatable?: boolean,
): string | undefined {
  if (updatable === false) return undefined;
  return updateToVersion(entry, localVersion);
}

/* ── E6#81 版本控件的两个值（2026-09-11 用户拍板）────────────────────────────────────────────
 * 一个控件出两个值，且**必须成对正确**——「下拉显示什么」与「按钮点下去变成什么」是两件事：
 *   · `defaultVersionPick`  = **下拉显示值**（回答「我手上是哪个版本」）
 *   · `versionActionTarget` = **动作目标**（回答「点下去变成哪个版本」）
 * 抽到这里而非留在 DetailView 内联：与 `updateTargetFor` 同例（版本判据不散在 UI 里，可 vitest 直测）。
 * 🔴 教训（实机）：改前下拉默认取 `updateTarget` ⇒ 用户装着 0.1.0 而控件写着 v0.1.1，被读成「我装的是
 * 0.1.1」。两个值混用的代价就是这种「控件在说下一步、用户在读当前」。 */

/** 下拉显示值——未装 → 最新可选（choices 已倒序）；已装 → **已装版本**（不再取 updateTarget）；
 *  已装版本不在可选集（目录已删该版行）→ 最高可选（最接近现状，用户仍可降级）。空集 → undefined。 */
export function defaultVersionPick(
  choices: CatalogVersionChoice[],
  installed: boolean,
  localVersion?: string,
): string | undefined {
  if (choices.length === 0) return undefined;
  if (!installed) return choices[0].version;
  if (localVersion) {
    const hit = choices.find((c) => compareVersions(c.version, localVersion) === 0);
    if (hit) return hit.version;
  }
  return choices[0].version;
}

/** 动作目标——用户**未介入**（picked 为 undefined）→ 更新目标 `updateTarget`（#33b：更新钮首帧即现，
 *  **不因「下拉改显示已装版本」而消失**）；用户**手动选值** → 跟随所选（升/降/同级由调用方 compareVersions 判）。
 *  未装态由调用方走安装分支，不经本函数。无历史（无下拉）时恒 updateTarget（保持原单钮语义）。 */
export function versionActionTarget(args: {
  hasHistory: boolean;
  updateTarget?: string;
  picked?: string;
}): string | undefined {
  const { hasHistory, updateTarget, picked } = args;
  return hasHistory && picked !== undefined ? picked : updateTarget;
}

/** 版本下拉可选集（E6#33c——UI「装哪个版本/升到哪版」选项源，05 §四）。
 *  versions[] 全集（含 beta——§二·四 手动可选）过滤出**有可解析 downloadUrl** 的版本（无 URL 旧版诚实
 *  不出现在下拉——选了也发不了包，不发错包即 versionDownloadUrl 顶层兜底同一语义）；
 *  semver 倒序最新在前（目录乱序/旧格式也能给对默认值，平手保序）；旧格式无 versions[] → 只顶层一条
 *  （length 1 = 调用方不显示下拉）；顶层 version 不在 versions[] 时补入（顶层即最新——下拉恒含可装最新）。
 *  无条目/全无可下版本 → []。 */
export function selectableVersions(entry: CatalogEntry | undefined): CatalogVersionChoice[] {
  if (!entry) return [];
  const rows = entry.versions && entry.versions.length > 0 ? entry.versions : [];
  const out: CatalogVersionChoice[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row?.version || seen.has(row.version)) continue;
    const url = versionDownloadUrl(entry, row.version);
    if (!url) continue;
    seen.add(row.version);
    out.push({ version: row.version, downloadUrl: url, publishedAt: row.publishedAt, changelog: row.changelog });
  }
  // 顶层 version（最新）不在 versions[] 时补入——旧格式/作者漏列时下拉仍含当前可装最新
  if (entry.version && !seen.has(entry.version)) {
    const url = versionDownloadUrl(entry, entry.version);
    if (url) {
      out.push({ version: entry.version, downloadUrl: url, publishedAt: entry.publishedAt });
    }
  }
  if (out.length < 2) return out;
  return [...out].sort((a, b) => compareVersions(b.version, a.version)); // 倒序最新在前（相等保序——稳定排序）
}

/** E6#33c pinnedVersion 记账（05 §二·九——版本动作落地 appliedVersion 后应记的钉）：
 *  目录有稳定最新（stableLatestVersion 存在）且落地到它 → null（清钉——追最新，autoUpdate 恢复）；
 *  停在非稳定最新（旧版/beta/中间版）→ 记 appliedVersion（暂停 autoUpdate，#33d 消费）；
 *  目录无稳定版可比（全 beta）→ undefined（无 auto-update 目标可防，不落盘不写空钉）。 */
export function pinnedAfterApply(entry: CatalogEntry | undefined, appliedVersion: string): string | null | undefined {
  const stable = entry ? stableLatestVersion(entry) : undefined;
  if (stable === undefined) return undefined;
  return compareVersions(appliedVersion, stable) === 0 ? null : appliedVersion;
}
