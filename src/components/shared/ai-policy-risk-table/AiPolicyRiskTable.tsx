/**
 * AiPolicyRiskTable——AI 操作风险表（`@linkdesk/ui` 共享件 · 2026-11-24）。
 *
 * 规格：`01-设计/03-UI与交互规格.md` §2.4（三列：操作 / 是什么 / 风险 / 现在）
 *
 * 🔴 只是画：行数据由宿主给出（`aiPolicy.getState().riskTable`，每行的 `decision` 已是**当前档位**下
 *   的判定）——组件**不判风险、不读配置**；文案键走 `t()`（与设置页同一份字典）。
 * 🔴 零 hex / 零裸 px：颜色与圆角吃 token；类名 `ldk-` 前缀。
 */

import { useTranslation } from "react-i18next";
import "./AiPolicyRiskTable.css";

export type AiPolicyRiskTableDecision = "allow" | "ask" | "deny";
export type AiPolicyRiskTableRisk = "R0" | "R1" | "R2" | "R3";

export interface AiPolicyRiskTableRow {
  id: string;
  /** 是什么动作（已 t() 或 i18n key——由调用方保证可渲染） */
  what?: string;
  risk: AiPolicyRiskTableRisk;
  /** 当前档位下的判定（数据来自宿主，⛔ 组件不自己算） */
  decision: AiPolicyRiskTableDecision;
}

export interface AiPolicyRiskTableProps {
  rows: AiPolicyRiskTableRow[];
  /** 表格 aria 名（已 t()） */
  ariaLabel?: string;
}

/** 风险级的人读名（i18n key） */
const RISK_LABEL: Record<AiPolicyRiskTableRisk, string> = {
  R0: "查看",
  R1: "可撤销",
  R2: "有改动",
  R3: "不可撤销",
};

function decisionKey(decision: AiPolicyRiskTableDecision): string {
  return decision === "allow" ? "允许" : decision === "ask" ? "询问" : "不允许";
}

export default function AiPolicyRiskTable({ rows, ariaLabel }: AiPolicyRiskTableProps) {
  const { t } = useTranslation();
  return (
    <table className="ldk-ai-risk-table" aria-label={ariaLabel}>
      <thead>
        <tr>
          <th scope="col">{t("操作")}</th>
          <th scope="col">{t("风险")}</th>
          <th scope="col">{t("现在")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} data-decision={row.decision}>
            <td className="ldk-ai-risk-what">{row.what ? t(row.what) : row.id}</td>
            <td className="ldk-ai-risk-level">{t(RISK_LABEL[row.risk])}</td>
            <td className={`ldk-ai-risk-decision ldk-ai-risk-decision-${row.decision}`}>
              {t(decisionKey(row.decision))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 图例（允许 / 询问 / 不允许）——表格下方一行，与单元格同色 */
export function AiPolicyRiskLegend() {
  const { t } = useTranslation();
  return (
    <div className="ldk-ai-risk-legend" aria-hidden="true">
      <span className="ldk-ai-risk-decision-allow">{t("允许")}</span>
      <span className="ldk-ai-risk-decision-ask">{t("询问")}</span>
      <span className="ldk-ai-risk-decision-deny">{t("不允许")}</span>
    </div>
  );
}
