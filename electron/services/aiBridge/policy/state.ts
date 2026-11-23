/**
 * 策略快照 → **IPC 数据形状**（`app:getAiPolicy` 的唯一组装点）。
 *
 * 规格：`01-设计/03-UI与交互规格.md` §2（四段控件 + 风险表 + 当前档）
 *
 * 🔴 只出数据与 i18n key：`label` / `description` / `what` / `why` 是中文原文（i18n key），
 *    终稿文字由壳命令 `aiPolicy.getState` 过 `t()` 产出（主进程没有 i18n 运行时）。
 * 🔴 四档 × 四级矩阵只在这里用 `decide` 算一次——渲染方格式化即可，⛔ 不许二次实现判定。
 */

import type {
  AiPolicyDecisionDto,
  AiPolicyMatrixDto,
  AiPolicyModeDto,
  AiPolicyRiskDto,
  AiPolicyRiskRowDto,
  AiPolicyStateDto,
} from "../../../../src/core/types/ipc/aiPolicy.js";
import { decide } from "./decide.js";
import { POLICY_MODES, type PolicyMode } from "./modes.js";
import { COMMAND_RISK, OP_RISK, RISKS, riskOfCommand, riskOfOp } from "./risk.js";
import { getChannelsEnabled, getPolicySnapshot } from "./policyState.js";

/** 段标题（i18n key）——四档人话的**唯一文案源**（设置声明的 enumDescriptions 引用同一批 key） */
const MODE_LABEL: Record<PolicyMode, string> = {
  read: "只读",
  ask: "逐次确认",
  auto: "自主",
  full: "完全访问",
};

/** 段说明（i18n key）——规格 §2.1 的四句，逐字 */
const MODE_DESCRIPTION: Record<PolicyMode, string> = {
  read: "AI 只能查看，不能修改。",
  ask: "AI 每次要修改，都会先问你。",
  auto: "日常修改 AI 自己完成；装更新、删数据这类操作仍会先问你。",
  full: "所有操作都不再询问，直到你在这里改回来。",
};

/** 风险表展示行——**有序**（用户读得懂的顺序：读 → 打开 → 改设置 → 装插件 → 装更新） */
const RISK_TABLE_ROWS: ReadonlyArray<{ id: string; kind: "op" | "command" }> = [
  { id: "describe", kind: "op" },
  { id: "openTab", kind: "op" },
  { id: "workbench.action.setConfiguration", kind: "command" },
  { id: "install", kind: "op" },
  { id: "update.openUpdateFlow", kind: "command" },
];

function riskOf(id: string, kind: "op" | "command"): AiPolicyRiskDto {
  return kind === "op" ? (riskOfOp(id, "write") as AiPolicyRiskDto) : (riskOfCommand(id) as AiPolicyRiskDto);
}

function textOf(id: string, kind: "op" | "command"): { what?: string; why?: string } {
  const entry = kind === "op" ? OP_RISK[id] : COMMAND_RISK[id];
  return { what: entry?.what, why: entry?.why };
}

/** 当前档位下的风险表（含「修改权限设置」这条用户面专有行） */
export function buildRiskTable(mode: PolicyMode): AiPolicyRiskRowDto[] {
  const rows: AiPolicyRiskRowDto[] = RISK_TABLE_ROWS.map(({ id, kind }) => {
    const risk = riskOf(id, kind);
    const { what, why } = textOf(id, kind);
    return { id, kind, risk, decision: decide(mode, risk) as AiPolicyDecisionDto, what, why };
  });
  // `userOnly` = 只有用户能改 —— 不是登记表里的动作（AI 根本够不着），故单列一行
  rows.push({
    id: "(user-only)",
    kind: "command",
    risk: "R3",
    decision: "deny",
    what: "修改权限设置",
    why: "只有你能改；AI 连请求都没有入口",
  });
  return rows;
}

/** 全矩阵（4×4）——四段控件给每段算摘要用 */
export function buildMatrix(): AiPolicyMatrixDto {
  const matrix = {} as Record<AiPolicyModeDto, Record<AiPolicyRiskDto, AiPolicyDecisionDto>>;
  for (const mode of POLICY_MODES) {
    const row = {} as Record<AiPolicyRiskDto, AiPolicyDecisionDto>;
    for (const risk of RISKS) row[risk as AiPolicyRiskDto] = decide(mode, risk) as AiPolicyDecisionDto;
    matrix[mode as AiPolicyModeDto] = row;
  }
  return matrix;
}

/** `app:getAiPolicy` 的组装（单点；`protectedCommands` 留空——命令面归壳命令补） */
export function buildAiPolicyState(): AiPolicyStateDto {
  const snapshot = getPolicySnapshot();
  return {
    mode: snapshot.mode as AiPolicyModeDto,
    degraded: snapshot.degraded,
    effectiveAt: snapshot.effectiveAt,
    channelsEnabled: getChannelsEnabled(),
    matrix: buildMatrix(),
    options: POLICY_MODES.map((mode) => ({
      value: mode as AiPolicyModeDto,
      label: MODE_LABEL[mode],
      description: MODE_DESCRIPTION[mode],
    })),
    riskTable: buildRiskTable(snapshot.mode),
    protectedCommands: [],
  };
}
