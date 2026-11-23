/**
 * AI 敏感能力一览弹窗（池 · hostView = `aiPolicy.sensitiveManager`）。
 *
 * 规格：`01-设计/03-UI与交互规格.md` §2.5 的**状态面**——按当前真实规则列出 AI 能做/不能做哪类事。
 *
 * 🔴 本版**不画开关**：逐能力开关需要一套「能力 → 命令/操作」的分类法（插件侧尚无声明字段），
 *   凭空造开关等于第二套策略。这里只如实呈现：固定规则 + 受保护命令 + 其余由档位决定。
 *   ⇒ 不写「以后再做」类文案；按钮只有「关闭」（壳只回传动作类型）。
 */

import { useTranslation } from "react-i18next";

interface AiSensitiveRow {
  label: string;
  value: string;
  /** 语义色调：fixed = 固定规则（不可调）；tier = 随档位；protected = 只有用户 */
  tone: "fixed" | "tier" | "protected";
}

export interface AiSensitiveManagerPayload {
  note?: string;
  rows: AiSensitiveRow[];
}

const host = () => window.linkdesk?.dialogHost;

function asPayload(payload: unknown): AiSensitiveManagerPayload | null {
  const p = payload as AiSensitiveManagerPayload | null;
  return p && Array.isArray(p.rows) ? p : null;
}

export default function AiSensitiveManager({ payload }: { payload?: unknown }) {
  const { t } = useTranslation();
  const data = asPayload(payload);

  if (!data) {
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
      <h2 className="ldk-ai-risk-dialog-title">{t("细分管理")}</h2>
      <ul className="ldk-ai-sensitive-list">
        {data.rows.map((row) => (
          <li key={row.label} className="ldk-ai-sensitive-row" data-tone={row.tone}>
            <span className="ldk-ai-sensitive-label">{t(row.label)}</span>
            <span className="ldk-ai-sensitive-value">{t(row.value)}</span>
          </li>
        ))}
      </ul>
      <p className="ldk-ai-risk-dialog-note">
        {t(data.note ?? "这些规则由权限档位统一决定；它们不会绕过上面的权限档位。")}
      </p>
      <footer className="ldk-ai-risk-dialog-foot">
        <button type="button" className="ldk-ai-risk-dialog-btn" onClick={() => host()?.cancel()}>
          {t("关闭")}
        </button>
      </footer>
    </div>
  );
}
