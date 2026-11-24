/**
 * 敏感能力弹窗（池 · hostView = `aiPolicy.sensitiveManager`）。
 *
 * 返工 v4：表格三列（能力 / 规则 / 当前）；与操作清单分开，弹窗内不再二次切换。
 * 规则是固定语义；「当前」随档位（数据来自壳，本视图不判）。
 */

import { useTranslation } from "react-i18next";
import AiPolicyDialogShell, { AiPolicyDialogFallback } from "./AiPolicyDialogShell";
import type { AiPolicySensitiveRowDto } from "../../../core/types/ipc/aiPolicy";

export interface AiPolicySensitivePayload {
  rows: AiPolicySensitiveRowDto[];
}

function asPayload(payload: unknown): AiPolicySensitivePayload | null {
  const p = payload as AiPolicySensitivePayload | null;
  return p && Array.isArray(p.rows) ? p : null;
}

function decisionClass(d: string): string {
  return d === "allow" ? "ldk-ai-policy-state-allow" : d === "ask" ? "ldk-ai-policy-state-ask" : "ldk-ai-policy-state-deny";
}

export default function AiSensitiveManager({ payload }: { payload?: unknown }) {
  const { t } = useTranslation();
  const data = asPayload(payload);
  if (!data) return <AiPolicyDialogFallback />;

  return (
    <AiPolicyDialogShell title={t("敏感能力")} note={t("这些规则由权限档位统一决定，不会绕过档位。")} legend>
      <table className="ldk-ai-policy-table" aria-label={t("敏感能力")}>
        <thead>
          <tr>
            <th scope="col">{t("能力")}</th>
            <th scope="col">{t("规则")}</th>
            <th scope="col">{t("当前")}</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.id}>
              <td>{t(row.label)}</td>
              <td className="ldk-ai-policy-desc">{t(row.rule)}</td>
              <td className={decisionClass(row.decision)}>
                {t(row.decision === "allow" ? "允许" : row.decision === "ask" ? "询问" : "不允许")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AiPolicyDialogShell>
  );
}
