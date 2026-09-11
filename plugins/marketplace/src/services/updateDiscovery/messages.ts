/**
 * messages — 发现域的铃铛/汇总文案与推送（纯文案 + notifications.show）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `updateDiscovery.ts` 原样搬出，零行为变更。
 *
 * 依赖方向：types → 本文件。本文件**不 import marketplaceShared**——那是本模块的**下游**，import 会成环；
 * 故 `source: "marketplace"` 用字面量（与 `marketplaceShared/notifications.ts` 的 MARKET_SOURCE 同值，
 * 见那边「一处定义、全部市场通知引用」注——环路被迫两处写字面量，改动时两边都要改）。
 */

import i18n from "i18next";
import type { UpdateCandidate } from "./types";

/** 汇总里最多点几个名字——多了只留条数（面板一行读得完；完整名单在各列表页的可更新徽标上） */
const BELL_NAME_LIMIT = 3;

/** 铃铛文案（i18n key = 中文原文；en.json 映射英文，zh 回落 key 中文）。
 *  E6#73j（G7）：一批一条——单个时才点名到版本（原逐插件文案原样保留，信息量最足）；多个时给条数 +
 *  头几个名字。⚠️ 不用 i18next 的 `count` 复数变量——那会去找 `key_one`/`key_other` 变体，
 *  而本项目词典是「中文原文 → 译文」平表，没有复数形态。 */
export function updateBellMessage(cs: UpdateCandidate[]): string {
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
export function notifyAutoResult(updated: UpdateCandidate[], failed: UpdateCandidate[]): void {
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
