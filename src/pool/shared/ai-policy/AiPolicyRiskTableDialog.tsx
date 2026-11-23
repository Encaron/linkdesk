/**
 * AI 风险表弹窗内容视图（池 · 宿主内置 hostView = `aiPolicy.riskTable`）。
 *
 * 壳命令 `aiPolicy.openRiskTable` 用 `DialogService.confirmContent({ content: { hostView, payload } })`
 * 打开；本视图只画表（外壳/兜底共用 `AiPolicyDialogShell`），关框只发 `cancel`。
 */

import { useTranslation } from "react-i18next";
import AiPolicyRiskTable, {
  type AiPolicyRiskTableRow,
} from "../../../components/shared/ai-policy-risk-table/AiPolicyRiskTable";
import { AiPolicyRiskLegend } from "../../../components/shared/ai-policy-risk-table/AiPolicyRiskTable";
import AiPolicyDialogShell, { AiPolicyDialogFallback } from "./AiPolicyDialogShell";

export interface AiPolicyRiskTablePayload {
  title?: string;
  rows: AiPolicyRiskTableRow[];
  /** 底部一句图例说明（i18n key；缺省用共享默认句） */
  note?: string;
}

function asPayload(payload: unknown): AiPolicyRiskTablePayload | null {
  const p = payload as AiPolicyRiskTablePayload | null;
  return p && Array.isArray(p.rows) ? p : null;
}

export default function AiPolicyRiskTableDialog({ payload }: { payload?: unknown }) {
  const { t } = useTranslation();
  const data = asPayload(payload);
  if (!data) return <AiPolicyDialogFallback />;

  return (
    <AiPolicyDialogShell
      title={t(data.title ?? "完整风险表")}
      note={t(data.note ?? "风险由软件统一登记；插件自己的命令也要声明。")}
    >
      <AiPolicyRiskTable rows={data.rows} ariaLabel={t("完整风险表")} />
      <AiPolicyRiskLegend />
    </AiPolicyDialogShell>
  );
}
