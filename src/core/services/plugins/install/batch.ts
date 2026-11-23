/**
 * 批量编排——把 N 条请求变成**一张确认计划**（spec §五）。纯函数，零 I/O。
 *
 * 分工：`policy.ts` 判**每一项**（ask/silent/rejected），本文件只做三件事——
 *   ① 去重（同 pluginId 第二次出现 = 坏请求，拒；⛔ 不静默丢，丢掉的项用户永远不知道）；
 *   ② 分组（按 sourceId；**需要确认的组在前、免问组在后**；组内保持目录顺序 = 请求顺序）；
 *   ③ 计数（顶栏总览与每组 ask/silent 计数）。
 *
 * 溢出（20+ 条）**不在这里截断**——spec §5.2：弹窗正文滚动、表头/底栏 sticky，
 * 超过 50 条才谈虚拟化（同一份 ConfirmPlan，不改协议）。⛔ 老实现只画 4 行掩盖问题。
 *
 * 取消语义（spec §五.4）：整批取消 = 0 个入队。本文件不执行，只出计划。
 */

import type {
  PluginConfirmGroup,
  PluginConfirmItem,
  PluginConfirmPlan,
  PluginConfirmRejected,
  PluginConfirmSummaryRow,
  PluginInstallRequest,
} from "../../../api/linkdesk-api/types";
import { decideOne, OFFICIAL_SOURCE_ID } from "./policy";
import type { PolicyContext } from "./types";

interface GroupAccumulator {
  sourceId: string;
  label: string;
  trusted: boolean;
  silentAllowed: boolean;
  askCount: number;
  silentCount: number;
  /** 首次出现序（排序依据） */
  first: number;
}

/** 该来源在同源更新下是否免问——与 policy.ts 的 ⑥⑦ 两分支**同一条判据**（改了要同笔改） */
function silentAllowedFor(sourceId: string, ctx: PolicyContext): boolean {
  if (sourceId === OFFICIAL_SOURCE_ID) return ctx.policy.silentOfficial;
  return ctx.policy.silentTrustedSources && ctx.isTrusted(sourceId);
}

/**
 * 生成确认计划。
 * @param reqs 市场提交的原始请求（顺序 = 目录顺序，⛔ 不重排组内项）
 * @param ctx  预取好的事实 + 策略
 */
export function buildConfirmPlan(reqs: readonly PluginInstallRequest[], ctx: PolicyContext): PluginConfirmPlan {
  const ask: PluginConfirmItem[] = [];
  const silent: PluginConfirmSummaryRow[] = [];
  const rejected: PluginConfirmRejected[] = [];
  const groups = new Map<string, GroupAccumulator>();
  const seen = new Set<string>();

  reqs.forEach((req, index) => {
    // ① 去重——同 pluginId 只受理第一次
    if (seen.has(req.pluginId)) {
      rejected.push({ pluginId: req.pluginId, reason: "invalid", message: "duplicate-request" });
      return;
    }
    seen.add(req.pluginId);

    const decision = decideOne(req, ctx);
    if (decision.kind === "rejected") {
      rejected.push({ pluginId: req.pluginId, reason: decision.reason, message: decision.message });
      return;
    }

    // ② 分组累计（同源）
    const sourceId = req.source.id;
    let group = groups.get(sourceId);
    if (!group) {
      group = {
        sourceId,
        label: ctx.labelOf(req.source),
        trusted: ctx.isTrusted(sourceId),
        silentAllowed: silentAllowedFor(sourceId, ctx),
        askCount: 0,
        silentCount: 0,
        first: index,
      };
      groups.set(sourceId, group);
    }

    if (decision.kind === "ask") {
      ask.push({ request: req, reason: decision.reason, previous: decision.previous });
      group.askCount += 1;
    } else if (ctx.forceAsk) {
      // 预览用「全都问一遍」——把免问项原地提升为需确认（⛔ 不改设置、不落盘；原因按来源性质给）
      ask.push({
        request: req,
        reason: sourceId === OFFICIAL_SOURCE_ID ? "official-source" : "untrusted-source",
      });
      group.askCount += 1;
    } else {
      silent.push({
        pluginId: req.pluginId,
        displayName: req.display.name,
        version: req.version,
        sourceId,
      });
      group.silentCount += 1;
    }
  });

  // ③ 组序：有 ask 的组在前（按首次出现），纯 silent 组在后（按首次出现）——spec §5.1 排序规则
  const orderedGroups: PluginConfirmGroup[] = [...groups.values()]
    .sort((a, b) => {
      const aAsk = a.askCount > 0 ? 0 : 1;
      const bAsk = b.askCount > 0 ? 0 : 1;
      return aAsk !== bAsk ? aAsk - bAsk : a.first - b.first;
    })
    .map(({ sourceId, label, trusted, silentAllowed, askCount, silentCount }) => ({
      sourceId,
      label,
      trusted,
      silentAllowed,
      askCount,
      silentCount,
    }));

  return {
    ask,
    silent,
    groups: orderedGroups,
    rejected,
    totals: { total: ask.length + silent.length, ask: ask.length, silent: silent.length },
  };
}
