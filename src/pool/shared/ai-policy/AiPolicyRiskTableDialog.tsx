/**
 * 操作清单弹窗（池 · hostView = `aiPolicy.riskTable`）。
 *
 * 返工 v4：表格四列（操作 / 说明 / 风险 / 当前），24px 内边距，标准实心按钮；
 * 文案键由本视图翻译（语言切换即时重绘）；判定与数据全部来自壳。
 */

import { useTranslation } from "react-i18next";
import AiPolicyDialogShell, { AiPolicyDialogFallback } from "./AiPolicyDialogShell";
import AiPolicyRiskTable from "../../../components/shared/ai-policy-risk-table/AiPolicyRiskTable";
import type { AiPolicyRiskRowDto } from "../../../core/types/ipc/aiPolicy";

export interface AiPolicyOpsPayload {
  rows: AiPolicyRiskRowDto[];
}

function asPayload(payload: unknown): AiPolicyOpsPayload | null {
  const p = payload as AiPolicyOpsPayload | null;
  return p && Array.isArray(p.rows) ? p : null;
}

export default function AiPolicyOpsDialog({ payload }: { payload?: unknown }) {
  const { t } = useTranslation();
  const data = asPayload(payload);
  if (!data) return <AiPolicyDialogFallback />;

  return (
    <AiPolicyDialogShell
      title={t("操作清单")}
      note={t("风险等级由软件统一登记；插件声明的命令按同一标准归类。")}
      legend
    >
      <AiPolicyRiskTable
        ariaLabel={t("操作清单")}
        rows={data.rows.map((row) => ({
          id: row.id,
          what: row.what,
          why: row.why,
          risk: row.risk,
          riskLabel: row.id === "(user-only)" ? "受保护" : undefined,
          decision: row.decision,
        }))}
      />
    </AiPolicyDialogShell>
  );
}
