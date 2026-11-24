/**
 * AI 权限对话框外壳（池 · 两个内容视图共用的部分）。
 *
 * 为什么单列：操作清单与敏感能力共用「标题 / 内容 / 图例 / 关闭」与「载荷缺失兜底」——
 * 留在两个文件里就是同一段 UI 抄两遍（`npm run duplication` 会抓）。
 *
 * 🔴 只画、只发 `cancel`：判定与数据都在壳侧；⛔ 这里不读配置、不判风险。
 * 版式（v4 返工）：24px 内边距、表格、标准实心按钮（共享 `Button`）。
 */

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Button from "../../../components/shared/button/Button";
import { AiPolicyRiskLegend } from "../../../components/shared/ai-policy-risk-table/AiPolicyRiskTable";

const host = () => window.linkdesk?.dialogHost;

/** 载荷缺失/未知视图的兜底——只给「关闭」（⛔ 不替用户做决定） */
export function AiPolicyDialogFallback() {
  const { t } = useTranslation();
  return (
    <div className="ldk-ai-policy-dialog">
      <p className="ldk-ai-policy-dialog-note">{t("这张表暂时不可用，请关掉后重试")}</p>
      <footer className="ldk-ai-policy-dialog-foot">
        <Button onClick={() => host()?.cancel()}>{t("关闭")}</Button>
      </footer>
    </div>
  );
}

export interface AiPolicyDialogShellProps {
  title: string;
  note?: string;
  /** 是否显示底部判定图例（表格类弹窗用） */
  legend?: boolean;
  children: ReactNode;
}

/** 正常内容外壳：标题 → 内容 → 说明 → 图例 → 关闭 */
export default function AiPolicyDialogShell({ title, note, legend = false, children }: AiPolicyDialogShellProps) {
  const { t } = useTranslation();
  return (
    <div className="ldk-ai-policy-dialog">
      <h2 className="ldk-ai-policy-dialog-title">{title}</h2>
      <div className="ldk-ai-policy-dialog-body">{children}</div>
      {note && <p className="ldk-ai-policy-dialog-note">{note}</p>}
      <footer className="ldk-ai-policy-dialog-foot">
        {legend ? <AiPolicyRiskLegend /> : <span />}
        <Button onClick={() => host()?.cancel()}>{t("关闭")}</Button>
      </footer>
    </div>
  );
}
