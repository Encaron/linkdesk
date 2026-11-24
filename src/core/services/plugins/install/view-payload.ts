/**
 * view-payload——确认卡的**唯一构造器**（文案 ＋ 载荷）。
 *
 * 为什么要单独成文件（2026-11-25，D8′ 市场自绘）：
 *   · 壳默认卡（`renderer.ts` 推给 DialogHost）与 `prepareInstall/prepareUpdateBatch` 回给市场的
 *     `view` 必须是**同一份**——分两处构造迟早漂移（一处加了行、另一处没有）；
 *   · `renderer.ts` 已经 import `confirm-service`（注册渲染器），本文件若住在 renderer 里就会成环。
 *   ⇒ 这里是叶子：只依赖 i18n ＋ 契约类型，谁都能 import。
 */

import i18n from "../../../../i18n";
import type {
  PluginConfirmPlan,
  PluginConfirmViewPayload,
  PluginInstallConfirmLabels,
} from "../../../api/linkdesk-api/types";
import { getUpdatePolicy } from "./trust";
import type { ConfirmPresentInfo } from "./types";

/**
 * 文案包——**壳侧唯一出处**（`t()` 在这里解析一次）。
 * 键的中文原文即 i18n key；英文译名住 lang-defaults（`audit-i18n --strict` 会盯）。
 */
export function buildLabels(): PluginInstallConfirmLabels {
  const t = (key: string) => i18n.t(key);
  return {
    installTitle: t("安装 {{name}}"),
    subFirst: t("首次安装 · 壳托管确认"),
    subSourceChanged: t("来源已变更 · 按新装处理"),
    subDowngrade: t("降级安装 · 壳托管确认"),
    subOfficial: t("官方更新 · 壳托管确认"),
    subUpdate: t("更新 · 壳托管确认"),
    noteFirst: t("首次安装始终确认。请核对来源、发布者与版本；安装后插件可调用壳的公开 API。"),
    noteSourceChanged: t("下载来源与上次安装时不同。来源或发布者变化意味着代码提供方变了——确认后才会执行。"),
    noteDowngrade: t("这是旧版本。除非你在排查问题，通常不需要降级。"),
    kvPlugin: t("插件"),
    kvPublisher: t("发布者"),
    kvSource: t("来源"),
    kvVersion: t("版本"),
    kvSize: t("大小"),
    kvIntegrity: t("完整性"),
    kvOldSource: t("旧来源"),
    kvNewSource: t("新来源"),
    integrityToVerify: t("sha256 {{hash}} · 下载后校验"),
    integrityMissing: t("未提供校验值（过渡期不阻断）"),
    warnSourceChanged: t("壳会把它当新装：确认后才签发一次性令牌；不确认就什么都不做。"),
    rememberSource: t("以后此来源的更新不再询问（首装仍会确认）"),
    actionInstall: t("确认安装"),
    actionUpdate: t("确认更新"),
    actionUpdateAnyway: t("仍要更新"),
    actionCancel: t("取消"),
    unknownPublisher: t("未知发布者"),
    unknownSize: t("未知大小"),
    batchTitle: t("更新插件"),
    batchSub: t("壳托管确认 · 只列需要确认的项"),
    statTotal: t("本批总数"),
    statAsk: t("需要确认"),
    statSilent: t("按设置免问"),
    groupAsk: t("{{n}} 个需要确认"),
    groupSilent: t("{{n}} 个免问"),
    groupSilentSummary: t("{{label}} {{n}} 个"),
    badgeOfficial: t("官方"),
    badgeThird: t("第三方"),
    silentLine: t("{{summary}}按设置免问，将随本批一起执行。"),
    silentAction: t("改为逐个确认"),
    rememberOfficial: t("以后官方源更新不再询问"),
    batchEmpty: t("没有需要确认的项。按当前设置，这批更新将直接执行。"),
    batchNote: t("取消 = 整批取消；免问项也随本批一起执行。"),
    actionConfirmBatch: t("确认更新 {{n}} 个"),
    actionRunBatch: t("直接更新 {{n}} 个"),
    actionCancelBatch: t("取消"),
    originLabel: t("发起方"),
    originAI: t("AI"),
    aiNoteTitle: t("AI 说明"),
    aiNoteHint: t("由发起请求的 AI 提供"),
    aiNoteMore: t("展开"),
    aiNoteLess: t("收起"),
  };
}


/**
 * 确认卡载荷构造——壳默认卡与市场自绘卡**共用这一份**。
 * `kind` 决定单项/批量；批量额外带 `reqs`（就地重算要全量）。
 */
export function buildConfirmPayload(
  plan: PluginConfirmPlan,
  kind: "install" | "batch",
  info?: ConfirmPresentInfo,
): PluginConfirmViewPayload {
  return {
    kind,
    labels: buildLabels(),
    plan,
    fromVersion: info?.fromVersion ?? null,
    policy: getUpdatePolicy(),
    ...(kind === "batch" ? { reqs: info?.reqs ?? [] } : {}),
  };
}
