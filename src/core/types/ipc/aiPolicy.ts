/**
 * AI 权限档位——**IPC 数据形状**（`app:getAiPolicy` 的返回面；只出数据与 i18n key，不出终稿文字）。
 *
 * 规格：`docs/04-软件更新/已落地/AI安全-权限档位与提权/01-设计/03-UI与交互规格.md` §2
 *
 * 🔴 文字纪律（硬约束 2）：`label` / `description` / `what` / `why` 一律是 **i18n key（中文原文）**，
 *    渲染方过 `t()`；主进程不产出终稿文案（它没有 i18n 运行时）。
 * 🔴 分层：档位值 / 风险级 / 判定**只在主进程**算（`policy/decide.ts`），本形状只搬运；
 *    `protectedCommands` 由**壳命令**补（命令面归壳）。
 */

/** 敏感能力弹窗的宿主内容视图 id（壳命令 → DialogHost 内容模式；注册处 = 池 HostDialogView 注册表） */
export const AI_POLICY_SENSITIVE_VIEW = "aiPolicy.sensitiveManager";

/** 风险表弹窗的宿主内容视图 id（壳命令 → DialogHost 内容模式；注册处 = 池 HostDialogView 注册表） */
export const AI_POLICY_RISK_TABLE_HOST_VIEW = "aiPolicy.riskTable";

/** 档位配置键——**壳侧唯一常量源**（声明、命令、渲染方都从这里取；主进程读取侧同值，见 policy/policyState.ts 注）。 */
export const AI_POLICY_MODE_KEY = "ai.policy.mode";

/** 四档 id（与主进程 `PolicyMode` 同值；跨进程边界用字符串） */
export type AiPolicyModeDto = "read" | "ask" | "auto" | "full";

/** 风险级（与主进程 `Risk` 同值） */
export type AiPolicyRiskDto = "R0" | "R1" | "R2" | "R3";

/** 判定（与主进程 `Decision` 同值） */
export type AiPolicyDecisionDto = "allow" | "ask" | "deny";

/** 四档 × 四级的全矩阵（四段控件给每段算摘要用——⛔ 渲染方不自己判，只格式化） */
export type AiPolicyMatrixDto = Record<AiPolicyModeDto, Record<AiPolicyRiskDto, AiPolicyDecisionDto>>;

/** 一段可选项（四段控件每段 = 一条） */
interface AiPolicyOptionDto {
  value: AiPolicyModeDto;
  /** 段标题（i18n key） */
  label: string;
  /** 一句人话（i18n key）——与设置声明 enumDescriptions 同文 */
  description: string;
}

/** 档位块下方的能力摘要（名称 + 当前判定；名称是 i18n key；随档位变） */
export interface AiPolicyCapabilityDto {
  label: string;
  decision: AiPolicyDecisionDto;
}

/** 风险表一行（`decision` = **当前档位下**的判定，随档变化） */
export interface AiPolicyRiskRowDto {
  id: string;
  kind: "op" | "command";
  risk: AiPolicyRiskDto;
  decision: AiPolicyDecisionDto;
  /** 是什么动作（i18n key；缺省 = 只有 id） */
  what?: string;
  /** 为什么这样判（i18n key） */
  why?: string;
}

/** 敏感能力一行（规则是固定语义；`decision` 仍按当前档位给） */
export interface AiPolicySensitiveRowDto {
  id: string;
  /** 能力名（i18n key） */
  label: string;
  /** 规则说明（i18n key） */
  rule: string;
  decision: AiPolicyDecisionDto;
}

export interface AiPolicyStateDto {
  mode: AiPolicyModeDto;
  /** true = 配置损坏/值非法，已按 fail-closed 档（ask）处理 */
  degraded: boolean;
  /** 读数时刻（ms） */
  effectiveAt: number;
  /** AI 通道是否开着（`ai.mcp.enabled` / `ai.cli.enabled` 任一 true）——徽标据此显示/隐藏 */
  channelsEnabled: boolean;
  /** 四档 × 四级判定（唯一来源 = 主进程 `decide`，⛔ 不二次实现） */
  matrix: AiPolicyMatrixDto;
  options: AiPolicyOptionDto[];
  /** 档位块下方的摘要（4 条；随档位变） */
  capabilities: AiPolicyCapabilityDto[];
  /** 操作清单（表格行） */
  riskTable: AiPolicyRiskRowDto[];
  /** 敏感能力（表格行） */
  sensitive: AiPolicySensitiveRowDto[];
  /** `userOnly` 命令 id（AI 永远不可调）——由壳命令补，主进程返回空数组 */
  protectedCommands: string[];
}
