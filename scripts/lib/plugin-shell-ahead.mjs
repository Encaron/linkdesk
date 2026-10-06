/**
 * 「插件跑到壳前面」判据（「插件最低壳版本门禁」G5 · 2026-10-06）——纯函数库，消费者共三处：
 *
 *   · scripts/check-plugin-shell-ahead.mjs —— **主腿**：扫插件源码求地板_实际（G1 账本 ＋ G2 同一算法）
 *   · scripts/sync-official-catalog.mjs —— 官方目录收录链：按目录条目声明的 `minAppVersion` 判（声明轴；
 *     收录链手里只有各仓 marketplace.json 的条目，没有源码——源码轴归主腿）
 *   · scripts/check-npm-release.mjs —— npm 轴护栏（案卷 04 §2.3）：ui 包内容不许发在壳之前
 *
 * 判据（案卷 04 §2.2 原文）：
 *   地板_实际 vs 最新已发布壳版本（git tag 里最新的 `v*`）⇒ 地板 > 最新已发布壳 ⇒ 🟡 黄灯：
 *   「这只插件要求一个还没发布的壳——用户装不上，或者装上就崩」。
 *
 * 软硬已定（案卷 00 §十 D3 · 2026-10-05 用户拍板）：**黄灯提示 ＋ 人工确认**——「插件先于壳」在
 * dev 攒批节奏里可能是**故意的**，硬红会天天误伤（同族先例：发行说明累计跳版）；但**必须让人看见，
 * ⛔ 不许静默**。
 *
 * 🔴 本库只住壳仓发布链；⛔ 不许进 SDK／作者面（案卷 00 §三：「最新已发布壳」是我们的信息，
 *    第三方作者结构上不该有——grep 取证口径见案卷 04 §四交付判据）。
 *
 * 版本比较用壳里那把唯一权威（`src/core/utils/plugin/semverUtils.ts`，`check-publish-gate.mjs` 同款）——
 * ⛔ 不另写第二套比较算法，否则本判据的「大于」和发布门禁的「大于」会各自漂移。
 */

import { compareVersions } from "../../src/core/utils/plugin/semverUtils.ts";

/** `x.y.z` 形态守卫——预发布号（`0.2.42-rc1`）不算「已发布壳」的形态，与 check-publish-gate 的取数口径一致 */
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/**
 * 从 git tag 清单取「最新已发布壳版本」（剥 `v` 前缀、只认 `x.y.z`）。
 * 无一个合形态的 tag ⇒ `null`（＝无可比对象：首次发布，本判据不判、只出声）。
 */
export function latestPublishedShell(tags) {
  const versions = (tags ?? [])
    .map((t) => String(t).replace(/^v/, "").trim())
    .filter((v) => SEMVER_RE.test(v));
  if (versions.length === 0) return null;
  return versions.reduce((a, b) => (compareVersions(b, a) > 0 ? b : a));
}

/**
 * 单只插件的判定（纯函数——输入全注入，`--self-test` 可复跑，不碰盘不碰 git）。
 *
 *   declared    插件 `plugin.json` 声明的 `minAppVersion`（未声明 ⇒ null，语义照旧）
 *   actualFloor 按账本算出的地板_实际（不消费 @linkdesk/ui / 没算出来 ⇒ null）
 *   latestShell 最新已发布壳版本（`latestPublishedShell` 的产物；null ＝无 tag）
 *
 * 判定对象 = **max(声明, 实际)**：声明低于实际的存量（本事故形态：settings 1.0.35 声明 0.2.32、
 * 实际 0.2.48）由实际顶上来；声明高于实际（作者手写了未来号）也照报——两边都是「要求未发布的壳」。
 *
 * 返回 `{ level, combined, msg }`：`"warn"`（黄灯）／`"ok"`（不报）／`"unknown"`（无可比对象或无可判地板，出声不判）。
 */
export function judgeShellAhead({ declared, actualFloor, latestShell }) {
  const valid = (v) => (typeof v === "string" && SEMVER_RE.test(v.trim()) ? v.trim() : null);
  const d = valid(declared);
  const a = valid(actualFloor);
  let combined = null;
  if (d && (!combined || compareVersions(d, combined) > 0)) combined = d;
  if (a && (!combined || compareVersions(a, combined) > 0)) combined = a;

  if (latestShell == null || !SEMVER_RE.test(latestShell)) {
    return {
      level: "unknown",
      combined,
      msg: "无本地 release tag（首次发布？）——「最新已发布壳」无可比对象，本条不判（不是通过，是没得比）",
    };
  }
  if (combined === null) {
    return { level: "ok", combined: null, msg: "没有可判的地板（未声明 minAppVersion 且未消费 @linkdesk/ui）" };
  }
  if (compareVersions(combined, latestShell) > 0) {
    const parts = [];
    if (d) parts.push(`声明 ${d}`);
    if (a) parts.push(`实际地板 ${a}`);
    return {
      level: "warn",
      combined,
      msg:
        `要求壳 ≥ ${combined}（${parts.join("，")}），但最新已发布壳是 v${latestShell}——` +
        `这只插件要求一个还没发布的壳：用户装不上，或者装上就崩。` +
        `若是有意抢先发插件（dev 攒批节奏）请知悉；否则先发壳，或等壳发版后再发插件。`,
    };
  }
  return { level: "ok", combined, msg: `地板 ${combined} ≤ 最新已发布壳 v${latestShell}` };
}

/**
 * npm 轴护栏（案卷 04 §2.3）的判定本体：账本里 **since 高于最新已发布壳** 的导出清单。
 *
 * 这份内容一旦上了 npm 货架（`@linkdesk/ui` publish ＋ mark），用它的插件就会被 G2 逼着声明
 * 一个**还不存在的壳版本**——在壳 tag 追上之前，那些插件在所有已发布壳上都装不上。判黄灯
 * （同 D3：dev 攒批可能是故意的），但必须让人看见。
 *
 * 返回 `[{ name, since }]`（since 升序 ＋ 名字稳定序，报文可复现）；latestShell 不可判 ＝ 空表。
 */
export function exportsAheadOfShell(ledger, latestShell) {
  if (!ledger || typeof ledger !== "object" || latestShell == null || !SEMVER_RE.test(latestShell)) return [];
  const ahead = Object.entries(ledger)
    .filter(([name, since]) => name && typeof since === "string" && SEMVER_RE.test(since) && compareVersions(since, latestShell) > 0)
    .map(([name, since]) => ({ name, since }));
  ahead.sort((x, y) => compareVersions(x.since, y.since) || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  return ahead;
}

/**
 * 工作区账本（`scripts/ui-surface.json`，四栏 `components/hooks/helpers/types`）→ 拍平的 `{ 名 → since }`。
 * 形态照 `@linkdesk/plugin-sdk` 的 `loadUiSurfaceLedger` 同一口径（缺栏／有条目没有合法 since ＝ 半份 ⇒ null，
 * 调用方跳过并提示——**未核验 ≠ 通过**）。只管拍平，不读盘（路径归调用方）。
 */
export function flattenLedger(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const table = {};
  for (const col of ["components", "hooks", "helpers", "types"]) {
    const entries = raw[col];
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) return null;
    for (const [name, v] of Object.entries(entries)) {
      const since = v?.since;
      if (typeof since !== "string" || !SEMVER_RE.test(since)) return null;
      table[name] = since;
    }
  }
  return Object.keys(table).length > 0 ? table : null;
}
