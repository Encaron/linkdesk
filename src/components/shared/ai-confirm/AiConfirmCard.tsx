/**
 * AI 确认卡（池 · hostView = `ai-confirm` · 2026-11-25 归一 v5）。
 *
 * 敏感动作 / 提权 / 完全访问二次确认**共用这一张卡**：组件只读载荷、只发
 * `dialogHost.confirm()/cancel()`；⛔ 不判风险、不读配置、不自己拼固定文案（全部 `*Key` 由 `t()` 翻译）。
 *
 * 版式来源：`mockups/04-弹窗族-权限与确认.html`（浅/深主题都走 token）：
 *   HEADER（动作名 + 一句后果）/ TARGET（对象或档位变化）/ DETAIL（可选表格）/
 *   AI NOTE（仅 AI 发起；3 行折叠、可展开）/ FOOT NOTE（责任说明，按钮左侧）/ ACTIONS。
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "../button/Button";
import type { AiConfirmCardPayload } from "./types";
import "./ai-confirm.css";

export type { AiConfirmCardPayload, AiConfirmKind, AiConfirmRow, AiConfirmTarget } from "./types";

function asPayload(payload: unknown): AiConfirmCardPayload | null {
  const p = payload as AiConfirmCardPayload | null;
  return p && typeof p === "object" && typeof p.titleKey === "string" && p.target ? p : null;
}

export interface AiConfirmCardProps {
  payload?: unknown;
  /** 确认（= 用户在卡上点了主操作）——由宿主适配层接到 dialogHost.confirm */
  onConfirm: () => void;
  /** 取消/关闭——由宿主适配层接到 dialogHost.cancel */
  onCancel: () => void;
}

export default function AiConfirmCard({ payload, onConfirm, onCancel }: AiConfirmCardProps) {
  const { t } = useTranslation();
  const data = asPayload(payload);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const noteRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = noteRef.current;
    setClamped(!!el && el.scrollHeight > el.clientHeight + 1);
  }, [data?.aiReason]);

  if (!data) {
    // 载荷缺失/不可解析：只给取消（⛔ 不能替用户点头）
    return (
      <div className="ldk-ai-confirm">
        <div className="ldk-ai-confirm-body">
          <p className="ldk-ai-confirm-fallback">{t("这张确认卡不可用，请取消后重试")}</p>
        </div>
        <footer className="ldk-ai-confirm-foot">
          <div />
          <div className="ldk-ai-confirm-actions">
            <Button onClick={() => onCancel()}>{t("取消")}</Button>
          </div>
        </footer>
      </div>
    );
  }

  const targetTitle = data.target.titleKey ? t(data.target.titleKey) : (data.target.titleText ?? "");
  const targetMeta = data.target.metaKey ? t(data.target.metaKey) : (data.target.metaText ?? "");

  return (
    <div className={`ldk-ai-confirm${data.danger ? " ldk-ai-confirm--danger" : ""}`}>
      {data.danger && (
        <div className="ldk-ai-confirm-strip">
          <span className="ldk-ai-confirm-strip-dot" aria-hidden="true" />
          {t("高风险 · 常驻生效")}
        </div>
      )}

      <header className="ldk-ai-confirm-head">
        <div className="ldk-ai-confirm-kicker">
          <span className="ldk-ai-confirm-kicker-dot" aria-hidden="true" />
          {t(
            data.kind === "full" ? "第二步确认" : data.kind === "elevation" ? "需要确认" : "AI 操作确认",
          )}
        </div>
        <h2 className="ldk-ai-confirm-title">{t(data.titleKey)}</h2>
        {data.subtitleKey && <p className="ldk-ai-confirm-sub">{t(data.subtitleKey)}</p>}
      </header>

      <div className="ldk-ai-confirm-body">
        <div className="ldk-ai-confirm-target">
          <div className="ldk-ai-confirm-target-icon" aria-hidden="true">{data.target.icon}</div>
          <div className="ldk-ai-confirm-target-main">
            {data.target.fromKey && data.target.toKey ? (
              <div className="ldk-ai-confirm-target-title">
                {t(data.target.fromKey)}
                <span className="ldk-ai-confirm-arrow" aria-hidden="true">→</span>
                <span className="ldk-ai-confirm-target-to">{t(data.target.toKey)}</span>
              </div>
            ) : (
              <div className="ldk-ai-confirm-target-title">{targetTitle}</div>
            )}
            {targetMeta && <div className="ldk-ai-confirm-target-meta">{targetMeta}</div>}
          </div>
          {data.target.chipKey && <span className="ldk-ai-confirm-chip">{t(data.target.chipKey)}</span>}
        </div>

        {data.rows && data.rows.length > 0 && (
          <table className="ldk-ai-confirm-table">
            <thead>
              <tr>
                <th scope="col">{t("能力")}</th>
                <th scope="col">{t("现在")}</th>
                <th scope="col">{t("之后")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.labelKey}>
                  <td>{t(row.labelKey)}</td>
                  <td className="ldk-ai-confirm-from">{row.fromKey ? t(row.fromKey) : (row.fromText ?? "")}</td>
                  <td className={`ldk-ai-confirm-to${row.tone ? ` ldk-ai-confirm-to--${row.tone}` : ""}`}>
                    {row.toKey ? t(row.toKey) : (row.toText ?? "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {data.consequences && data.consequences.length > 0 && (
          <ul className="ldk-ai-confirm-consequences">
            {data.consequences.map((key) => (
              <li key={key}>
                <span className="ldk-ai-confirm-mark" aria-hidden="true">!</span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        )}

        {data.aiReason && (
          <div className="ldk-ai-confirm-ai">
            <div className="ldk-ai-confirm-ai-head">
              {t("AI 说明")}
              <em>{t("由发起请求的 AI 提供")}</em>
            </div>
            <p ref={noteRef} className={`ldk-ai-confirm-ai-text${expanded ? " is-expanded" : ""}`}>{data.aiReason}</p>
            {(clamped || expanded) && (
              <button
                type="button"
                className="ldk-ai-confirm-ai-toggle"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? t("收起") : t("展开全文")}
              </button>
            )}
          </div>
        )}

        {data.effectKey && (
          <div className="ldk-ai-confirm-effect">
            <b>{t("后果")}</b>
            <span>{t(data.effectKey)}</span>
          </div>
        )}
      </div>

      <footer className="ldk-ai-confirm-foot">
        <div className="ldk-ai-confirm-note">{t(data.responsibilityKey)}</div>
        <div className="ldk-ai-confirm-actions">
          <Button onClick={() => onCancel()}>{t(data.cancelKey)}</Button>
          <Button variant={data.danger ? "danger" : undefined} onClick={() => onConfirm()}>
            {t(data.confirmKey)}
          </Button>
        </div>
      </footer>
    </div>
  );
}
