/**
 * AI 风险表弹窗内容视图（池 · 宿主内置 hostView = `aiPolicy.riskTable`）。
 *
 * 壳命令 `aiPolicy.openRiskTable` 用 `DialogService.confirmContent({ content: { hostView, payload } })`
 * 打开；本视图只画表 + 关掉自己（⛔ 不判风险、不改档位——判定是壳给的数据）。
 *
 * 壳只回传动作类型（confirm/cancel），settle 在壳侧——既有机制，本视图只发 `cancel` 关框。
 */

import { useTranslation } from "react-i18next";
import AiPolicyRiskTable, {
  AiPolicyRiskLegend,
  type AiPolicyRiskTableRow,
} from "../../../components/shared/ai-policy-risk-table/AiPolicyRiskTable";

export interface AiPolicyRiskTablePayload {
  title?: string;
  rows: AiPolicyRiskTableRow[];
  /** 底部一句图例说明（i18n key；缺省不画） */
  note?: string;
}

const host = () => window.linkdesk?.dialogHost;

function asPayload(payload: unknown): AiPolicyRiskTablePayload | null {
  const p = payload as AiPolicyRiskTablePayload | null;
  return p && Array.isArray(p.rows) ? p : null;
}

export default function AiPolicyRiskTableDialog({ payload }: { payload?: unknown }) {
  const { t } = useTranslation();
  const data = asPayload(payload);

  if (!data) {
    // 载荷缺失 = 不替用户做决定：只给「关闭」
    return (
      <div className="ldk-ai-risk-dialog">
        <p className="ldk-ai-risk-dialog-note">{t("这张表暂时不可用，请关掉后重试")}</p>
        <footer className="ldk-ai-risk-dialog-foot">
          <button type="button" className="ldk-ai-risk-dialog-btn" onClick={() => host()?.cancel()}>
            {t("关闭")}
          </button>
        </footer>
      </div>
    );
  }

  return (
    <div className="ldk-ai-risk-dialog">
      <h2 className="ldk-ai-risk-dialog-title">{t(data.title ?? "完整风险表")}</h2>
      <AiPolicyRiskTable rows={data.rows} ariaLabel={t("完整风险表")} />
      <AiPolicyRiskLegend />
      <p className="ldk-ai-risk-dialog-note">
        {t(data.note ?? "风险由软件统一登记；插件自己的命令也要声明。")}
      </p>
      <footer className="ldk-ai-risk-dialog-foot">
        <button type="button" className="ldk-ai-risk-dialog-btn" onClick={() => host()?.cancel()}>
          {t("关闭")}
        </button>
      </footer>
    </div>
  );
}
