/**
 * 确认策略——**谁需要确认**（纯函数，零 I/O，可单测）。
 *
 * 矩阵出处：`docs/04-软件更新/待抉择池/插件安装更新确认-壳托管与批量更新/00-提案.md` §四。
 * 判据顺序即优先级（改动须同步改原型 `view-logic` 的矩阵与单测表）：
 *   ① 首装/重装（任意来源）→ ask(first-install)            —— 第一次信任决定不能省
 *   ② 同版本 → rejected(invalid)                            —— 壳的 stage 也会拒，这里先拒 = 不弹无用卡
 *   ③ 降级（未显式 allowOlder）→ rejected(invalid)           —— 「没打算降级」就是错的请求
 *   ④ 降级（allowOlder）→ ask(downgrade)
 *   ⑤ 来源/仓库/发布者变更 → ask(source-changed)             —— 不受两条开关豁免
 *   ⑥ 同源更新 · 官方 → silentOfficial ? silent : ask(official-source)
 *   ⑦ 同源更新 · 第三方 → 信任 && silentTrustedSources ? silent : ask(untrusted-source)
 *
 * 🔴 两条开关**正交**：官方只由 `silentOfficial` 管，第三方只由 `silentTrustedSources` 管。
 *    官方在信任清单里是 fixed —— 但 `isTrusted("official")` 绝不参与第 ⑥ 步的判定，
 *    否则关掉 `silentOfficial` 也照样免问 = 开关失效。
 */

import { compareVersions } from "../../../utils/plugin/semverUtils";
import type { PluginInstallRequest, PluginSourceIdentity } from "../../../api/linkdesk-api/types";
import type { PolicyContext, PolicyDecision } from "./types";

/** 官方目录的固定 sourceId（信任清单里 fixed=true 的那一行；⛔ 不参与第 ⑥ 步判定，见文件头） */
export const OFFICIAL_SOURCE_ID = "official";

/**
 * 同源判据：sourceUrl ＋ repo ＋ publisher 全同（spec §3.4；id 只是市场的自称，不作判据）。
 *
 * 🔴 **没有记录 ≠ 来源变了**（2026-11-24 实机纠偏）：随包种子（bundled）装进来的插件、
 * 以及本功能上线前装的插件，账本里**没有来源身份**。此前把"无记录"当成"来源变更" ⇒
 * 用户点官方更新时被一张「来源已变更 · 旧来源=未知发布者」的卡拦住，连「官方更新不再询问」
 * 开关都失效（用户实机截图证物）。正确语义：**无记录 = 没有相反证据** ⇒ 不判变更，
 * 交给「首装/免问开关/信任」那几条正常规则去决定。
 */
export function sameSourceIdentity(known: PluginSourceIdentity | null, next: PluginSourceIdentity): boolean {
  if (!known) return true;
  // 🔴 URL / repo 按**大小写不敏感**比（2026-11-24 实机）：市场把 GitHub 地址归一成小写
  //   （`raw.githubusercontent.com/encaron/...`），而账本可能是别的来源写的混合大小写 ⇒ 逐字节比会
  //   把「同一个源」判成「来源变更」，用户每次更新都被红卡拦。publisher 保持大小写敏感（是人名）。
  const norm = (s?: string) => (s ?? "").trim().toLowerCase();
  // 🔴 任一方**没填**的字段不参与判定（"没有信息" ≠ "不一样"）：
  //   `repo`/`publisher` 在契约里都是可选的，第三方市场只传 url 也能走通；
  //   拿空串去比一个真实值，会把同源更新误判成来源变更（与「无账本≠来源变更」同一条道理）。
  const same = (a?: string, b?: string, ci = true): boolean => {
    const x = ci ? norm(a) : (a ?? "").trim();
    const y = ci ? norm(b) : (b ?? "").trim();
    if (!x || !y) return true; // 任一方缺 → 不判
    return x === y;
  };
  return same(known.url, next.url) && same(known.repo, next.repo) && same(known.publisher, next.publisher, false);
}

/**
 * 远程来源判定——IPC 安装门的唯一判据（D2 落地形态）。
 * `http(s)://` = 远程（必须走 requestInstall/requestUpdateBatch）；其余按本地路径放行
 * （文件夹安装 / `.linkdesk-plugin` 包 —— 2026-11-24 拍板：用户手势、无远程来源，不过令牌门）。
 */
export function isRemoteSource(path: string): boolean {
  return /^https?:\/\//i.test(path.trim());
}

/** 单项判定 */
export function decideOne(req: PluginInstallRequest, ctx: PolicyContext): PolicyDecision {
  // ⓪ 最低壳版本——**壳自己判**（spec §四：不满足直接拦、不弹卡）。
  //   市场侧也有一道（minAppVerdict），但"市场不判"是完全可以发生的（第三方市场/脚本）⇒ 壳这道是底线。
  // 🔴 dev 树 `product.json` 恒为占位 0.1.0（见 CLAUDE.md）——拿它判 minApp 会让 dev 里谁都装不上。
  const devPlaceholder = !ctx.shellVersion || ctx.shellVersion === "0.1.0";
  if (!devPlaceholder && req.minAppVersion && compareVersions(ctx.shellVersion!, req.minAppVersion) < 0) {
    return { kind: "rejected", reason: "min-app", message: `requires ${req.minAppVersion}` };
  }
  const facts = ctx.facts(req.pluginId);

  // ① 首装 / 重装 —— 任何来源必问
  if (req.mode === "install" || facts.installedVersion === null) {
    return { kind: "ask", reason: "first-install" };
  }

  const relation = compareVersions(req.version, facts.installedVersion);
  // ② 同版本 —— 装不出差别，直接拒（不弹卡）
  if (relation === 0) {
    return { kind: "rejected", reason: "invalid", message: "same-version" };
  }
  // ③ 降级未放行 —— 调用方没打算降级，这是坏请求
  if (relation < 0 && !req.allowOlder) {
    return { kind: "rejected", reason: "invalid", message: "older-not-allowed" };
  }
  // ④ 降级已放行 —— 还是问一次（spec §四「降级/选旧版 → 确认」）
  if (relation < 0) {
    return { kind: "ask", reason: "downgrade", previous: facts.knownSource ?? undefined };
  }

  // ⑤ 来源/仓库/发布者变更 —— 按新装确认，且不受两条开关豁免
  if (!sameSourceIdentity(facts.knownSource, req.source)) {
    return { kind: "ask", reason: "source-changed", previous: facts.knownSource ?? undefined };
  }

  // ⑥ 同源更新 · 官方
  if (req.source.id === OFFICIAL_SOURCE_ID) {
    return ctx.policy.silentOfficial ? { kind: "silent" } : { kind: "ask", reason: "official-source" };
  }

  // ⑦ 同源更新 · 第三方
  if (ctx.policy.silentTrustedSources && ctx.isTrusted(req.source.id)) {
    return { kind: "silent" };
  }
  return { kind: "ask", reason: "untrusted-source" };
}
