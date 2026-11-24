/**
 * 策略快照 → **IPC 数据形状**（`app:getAiPolicy` 的唯一组装点）。
 *
 * 规格：`01-设计/03-UI与交互规格.md` §2（四段控件 + 两个清单）
 * 返工（2026-11-24 v4）：拆「操作清单 / 敏感能力」；档位块只留一条能力摘要；文案全部书面语。
 *
 * 🔴 只出数据与 i18n key：`label` / `description` / `what` / `why` / `rule` 是中文原文（i18n key），
 *    渲染方用 `useTranslation()` 翻译——语言切换即时重绘（⛔ 不缓存已翻译字符串）。
 * 🔴 四档 × 四级矩阵只在这里用 `decide` 算一次——渲染方格式化即可，⛔ 不许二次实现判定。
 */

import type {
  AiPolicyCapabilityDto,
  AiPolicyDecisionDto,
  AiPolicyMatrixDto,
  AiPolicyModeDto,
  AiPolicyRiskDto,
  AiPolicyRiskRowDto,
  AiPolicySensitiveRowDto,
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

/** 段说明（i18n key）——书面语，逐字引用 v4 原型 */
const MODE_DESCRIPTION: Record<PolicyMode, string> = {
  read: "AI 只能查看，不能修改。",
  ask: "AI 每次修改前都会询问你。",
  auto: "日常修改由 AI 完成；安装、更新等不可撤销操作仍会询问。",
  full: "所有操作都不再询问，直到你手动改回。",
};

/** 档位块下方的能力摘要（顺序 = 用户读得懂的因果：看 → 切 → 改 → 装） */
const CAPABILITY_AXIS: ReadonlyArray<{ risk: AiPolicyRiskDto; label: string }> = [
  { risk: "R0", label: "查看" },
  { risk: "R1", label: "打开标签" },
  { risk: "R2", label: "写入文件" },
  { risk: "R3", label: "安装与更新" },
];

/**
 * 操作清单行——**有序**：读 → 打开 → 改文件 → 装插件 → 装更新 → 权限设置。
 * 说明（why）是给用户看的；命令 ID / 内部编号不进这里。
 */
const RISK_TABLE_ROWS: ReadonlyArray<{ id: string; kind: "op" | "command" | "synthetic"; risk?: AiPolicyRiskDto }> = [
  { id: "describe", kind: "op", risk: "R0" },
  { id: "openTab", kind: "op", risk: "R1" },
  { id: "(workspace-write)", kind: "synthetic", risk: "R2" },
  { id: "install", kind: "op", risk: "R3" },
  { id: "update.openUpdateFlow", kind: "command", risk: "R3" },
];

/** 合成行的文案（不在风险登记表里，因为没有对应的 AI 操作 id） */
const SYNTHETIC_ROWS: Record<string, { what: string; why: string }> = {
  "(workspace-write)": { what: "修改工作区文件", why: "修改你项目中的文件" },
};

function riskOf(row: (typeof RISK_TABLE_ROWS)[number]): AiPolicyRiskDto {
  if (row.risk) return row.risk;
  return row.kind === "op" ? (riskOfOp(row.id, "write") as AiPolicyRiskDto) : (riskOfCommand(row.id) as AiPolicyRiskDto);
}

function textOf(id: string, kind: "op" | "command" | "synthetic"): { what?: string; why?: string } {
  if (kind === "synthetic") return SYNTHETIC_ROWS[id] ?? {};
  const entry = kind === "op" ? OP_RISK[id] : COMMAND_RISK[id];
  return { what: entry?.what, why: entry?.why };
}

/** 当前档位下的操作清单（含「修改权限设置」这条用户面专有行） */
export function buildRiskTable(mode: PolicyMode): AiPolicyRiskRowDto[] {
  const rows: AiPolicyRiskRowDto[] = RISK_TABLE_ROWS.map((row) => {
    const risk = riskOf(row);
    const { what, why } = textOf(row.id, row.kind);
    return {
      id: row.id,
      kind: row.kind === "synthetic" ? "command" : row.kind,
      risk,
      decision: decide(mode, risk) as AiPolicyDecisionDto,
      what,
      why,
    };
  });
  // `userOnly` = 只有用户能操作 —— 不是登记表里的动作（AI 根本够不着），故单列一行
  rows.push({
    id: "(user-only)",
    kind: "command",
    risk: "R3",
    decision: "deny",
    what: "修改权限设置",
    why: "仅限你本人操作",
  });
  return rows;
}

/** 敏感能力（4 条固定语义；判定随档位） */
export function buildSensitive(mode: PolicyMode): AiPolicySensitiveRowDto[] {
  return [
    {
      id: "install",
      label: "安装与更新",
      rule: "始终需要你确认",
      decision: decide(mode, "R3") as AiPolicyDecisionDto,
    },
    { id: "(user-only)", label: "权限设置", rule: "仅限你本人操作", decision: "deny" },
    { id: "(debug)", label: "调试端口", rule: "不在 AI 可调用范围内", decision: "deny" },
    {
      id: "(rest)",
      label: "其他操作",
      rule: "由当前档位决定",
      decision: decide(mode, "R2") as AiPolicyDecisionDto,
    },
  ];
}

/** 档位块下方的摘要（4 条） */
export function buildCapabilities(mode: PolicyMode): AiPolicyCapabilityDto[] {
  return CAPABILITY_AXIS.map(({ risk, label }) => ({
    label,
    decision: decide(mode, risk) as AiPolicyDecisionDto,
  }));
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
    capabilities: buildCapabilities(snapshot.mode),
    riskTable: buildRiskTable(snapshot.mode),
    sensitive: buildSensitive(snapshot.mode),
    protectedCommands: [],
  };
}
