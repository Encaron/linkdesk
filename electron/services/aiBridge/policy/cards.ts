/**
 * AI 确认卡的三类载荷构造（2026-11-25 · 弹窗族归一 v5）。
 *
 * 🔴 只产出**呈现载荷**：判定/放行/令牌都不在这里；所有固定文案给 i18n key，AI 理由给原文。
 * 🔴 三类卡共用同一骨架（`AiConfirmCard`），差异只在槽位内容与 danger 配色。
 */

import type { AiConfirmCardPayload } from '../../../../src/core/types/ipc/aiConfirm';
import type { AiConfirmRow } from '../../../../src/components/shared/ai-confirm/types';
import { decide } from './decide.js';
import { POLICY_MODE_LABEL, type PolicyMode } from './modes.js';
import type { Risk } from './risk.js';

/** 决策 → 人读文案 key（与风险表/能力摘要同一套词） */
function decisionKey(decision: 'allow' | 'ask' | 'deny'): string {
  return decision === 'allow' ? '允许' : decision === 'ask' ? '询问' : '不允许';
}

/** 风险级 → 用户可读徽标（⛔ 不显示 R0–R3 代号） */
function riskChipKey(risk: Risk): string {
  switch (risk) {
    case 'R0':
      return '只读';
    case 'R1':
      return '可撤销';
    case 'R2':
      return '会留下改动';
    case 'R3':
      return '不可撤销';
    default:
      return '可撤销';
  }
}

/**
 * 普通敏感动作卡。
 *
 * @param what  动作名（i18n key；取自 COMMAND_RISK 或命令标题）
 * @param why   一句后果（i18n key；可空）
 * @param risk  风险级（决定徽标）
 * @param target 作用对象（标签页标题等，**用户数据**；空则退回动作名）
 */
export function buildActionCard(
  what: string,
  why: string | undefined,
  risk: Risk,
  target?: { title?: string; metaKey?: string; icon?: string },
): AiConfirmCardPayload {
  return {
    kind: 'action',
    titleKey: what,
    subtitleKey: 'AI 请求执行一项界面操作。',
    target: {
      icon: target?.icon ?? '▤',
      ...(target?.title ? { titleText: target.title } : { titleKey: what }),
      ...(target?.metaKey ? { metaKey: target.metaKey } : {}),
      chipKey: riskChipKey(risk),
    },
    effectKey: why,
    responsibilityKey: '点击「允许此次」即代表你确认本次操作；AI 不能代替你确认。',
    confirmKey: '允许此次',
    cancelKey: '拒绝',
  };
}

/** 提权卡：当前档 → 目标档 + 能力变化表 + AI 理由 */
export function buildElevationCard(
  current: PolicyMode,
  target: PolicyMode,
  reason: string,
): AiConfirmCardPayload {
  const capability = (risk: Risk): AiConfirmRow => ({
    labelKey: risk === 'R1' ? '日常修改（写文件 / 改设置）' : '安装 / 更新 / 卸载插件',
    fromKey: decisionKey(decide(current, risk)),
    toKey: decisionKey(decide(target, risk)),
    tone:
      decide(target, risk) === 'allow'
        ? 'allow'
        : decide(target, risk) === 'ask'
          ? 'ask'
          : 'deny',
  });
  return {
    kind: 'elevation',
    titleKey: '提高 AI 权限',
    subtitleKey: '批准后，AI 的日常修改将不再逐次询问。你随时可以在设置中恢复。',
    target: {
      icon: '⇧',
      fromKey: POLICY_MODE_LABEL[current],
      toKey: POLICY_MODE_LABEL[target],
      metaKey: '仅提高本次请求所需的范围；不会跳到完全访问',
      chipKey: '需你批准',
    },
    rows: [
      capability('R1'),
      capability('R3'),
      {
        labelKey: '修改权限设置本身',
        fromKey: '仅限你本人操作',
        toKey: '仅限你本人操作',
        tone: 'plain',
      },
    ],
    aiReason: reason,
    effectKey: '该设置将持续生效，直至你在设置中恢复。AI 不能自行降档或再次提权。',
    responsibilityKey: '点击「允许提高」即代表你确认本次授权，并对授权范围内的 AI 操作负责。',
    confirmKey: '允许提高',
    cancelKey: '暂不提高',
  };
}

/** 完全访问卡与手动切换共用共享件构造器（单一定义）。 */
export { buildFullAccessCard } from "../../../../src/components/shared/ai-confirm/fullAccessCard";
