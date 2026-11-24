/**
 * AiPolicyRiskTable——AI 操作清单表格（`@linkdesk/ui` 共享件 · 2026-11-24 · 返工 v4）。
 *
 * 规格：`01-设计/03-UI与交互规格.md` §2.4（四列：操作 / 说明 / 风险 / 当前）
 *
 * 🔴 只是画：行数据由宿主给出（`aiPolicy.getState().riskTable`，每行 `decision` 已是**当前档位**下
 *   的判定）——组件不判风险、不读配置；文案走 `useTranslation()`（语言切换即时重绘）。
 * 🔴 零 hex / 零裸 px；类名 `ldk-` 前缀。判定一律文字（允许 / 询问 / 不允许），不用 emoji。
 */

import { useTranslation } from "react-i18next";
import "./AiPolicyRiskTable.css";

type AiPolicyRiskTableDecision = "allow" | "ask" | "deny";
type AiPolicyRiskTableRisk = "R0" | "R1" | "R2" | "R3";

interface AiPolicyRiskTableRow {
  id: string;
  /** 操作名（i18n key） */
  what?: string;
  /** 说明（i18n key） */
  why?: string;
  risk: AiPolicyRiskTableRisk;
  /** 风险列文案覆盖（i18n key；例如受保护命令写「受保护」） */
  riskLabel?: string;
  /** 当前档位下的判定（数据来自宿主，⛔ 组件不自己算） */
  decision: AiPolicyRiskTableDecision;
}

export interface AiPolicyRiskTableProps {
  rows: AiPolicyRiskTableRow[];
  /** 表格 aria 名（**已翻译**：组件是哑渲染，不再二次翻译） */
  ariaLabel?: string;
}

/** 风险级的人读名（i18n key） */
const RISK_LABEL: Record<AiPolicyRiskTableRisk, string> = {
  R0: "只读",
  R1: "可撤销",
  R2: "会留下改动",
  R3: "不可撤销",
};

export default function AiPolicyRiskTable({ rows, ariaLabel }: AiPolicyRiskTableProps) {
  const { t } = useTranslation();
  return (
    <table className="ldk-ai-risk-table" aria-label={ariaLabel}>
      <thead>
        <tr>
          <th scope="col">{t("操作")}</th>
          <th scope="col">{t("说明")}</th>
          <th scope="col">{t("风险")}</th>
          <th scope="col">{t("当前")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td className="ldk-ai-risk-what">{row.what ? t(row.what) : row.id}</td>
            <td className="ldk-ai-risk-desc">{row.why ? t(row.why) : ""}</td>
            <td className="ldk-ai-risk-level">{t(row.riskLabel ?? RISK_LABEL[row.risk])}</td>
            <td className="ldk-ai-risk-decision">
              <span className={`ldk-ai-risk-chip ldk-ai-risk-decision-${row.decision}`}>
                {t(row.decision === "allow" ? "允许" : row.decision === "ask" ? "询问" : "不允许")}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 判定图例（文字 + 语义色，无 emoji） */
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
