/**
 * AI 权限对话框外壳（池 · 两个内容视图共用的部分）。
 *
 * 为什么单列：风险表与细分管理共用「标题 / 内容 / 脚注 / 关闭」与「载荷缺失兜底」两块——
 * 留在两个文件里就是同一段 UI 抄两遍（`npm run duplication` 实测 10 处克隆里的两处）。
 *
 * 🔴 只画、只发 `cancel`：判定与数据都在壳侧；⛔ 这里不读配置、不判风险。
 */

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

const host = () => window.linkdesk?.dialogHost;

/** 载荷缺失/未知视图的兜底——只给「关闭」（⛔ 不替用户做决定） */
export function AiPolicyDialogFallback() {
  const { t } = useTranslation();
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

export interface AiPolicyDialogShellProps {
  title: string;
  note?: string;
  children: ReactNode;
}

/** 正常内容外壳：标题 → 内容 → 脚注 → 关闭 */
export default function AiPolicyDialogShell({ title, note, children }: AiPolicyDialogShellProps) {
  const { t } = useTranslation();
  return (
    <div className="ldk-ai-risk-dialog">
      <h2 className="ldk-ai-risk-dialog-title">{title}</h2>
      {children}
      {note && <p className="ldk-ai-risk-dialog-note">{note}</p>}
      <footer className="ldk-ai-risk-dialog-foot">
        <button type="button" className="ldk-ai-risk-dialog-btn" onClick={() => host()?.cancel()}>
          {t("关闭")}
        </button>
      </footer>
    </div>
  );
}
