/**
 * FallbackFace —— 降级脸家族（2026-11-24，方案源 = 错误态与降级脸-UI化/00-提案）。
 *
 * 一张脸管三类兜底态（三变体）与三档容器（三尺度）：
 *   variant：crash（视图崩溃·图标点 --error）/ missing（插件缺失·中性）/ empty（空态·中性）
 *   scale  ：full（主区/底部面板）/ panel（侧栏 section）/ micro（状态栏/工具槽）
 *
 * 纪律：全 token（色 var(--x) / 字号 var(--font-size-*) / 尺寸 calc(*var(--ui-scale))）；
 *      ⛔ 不引第二套视觉语言——形状照验收范式（ldk-rn-empty 同族）。
 * AI 友好：detail 是「结构化状态」的 GUI 渲染，同一份数据由命令面直取（reloadView / 后续 getViewFallbackData）。
 */
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import "./fallback.css";

export type FallbackVariant = "crash" | "missing" | "empty";
export type FallbackScale = "full" | "panel" | "micro";

export interface FallbackDetailRow {
  label: string;
  value: string;
}

export interface FallbackFaceProps {
  variant: FallbackVariant;
  scale?: FallbackScale;
  title: string;
  /** 一句下一步建议（panel 收敛、micro 不渲染） */
  description?: string;
  /** 主按钮（通常是重试） */
  onRetry?: () => void;
  retryLabel?: string;
  /** 次级动作（可无） */
  secondary?: { label: string; onClick: () => void };
  /** 诊断详情（仅 full 尺度渲染；panel/micro 靠命令面读） */
  detail?: FallbackDetailRow[];
}

const ICON: Record<FallbackVariant, string> = {
  crash: "codicon-error",
  missing: "codicon-puzzle",
  empty: "codicon-files",
};

export default function FallbackFace({
  variant,
  scale = "full",
  title,
  description,
  onRetry,
  retryLabel,
  secondary,
  detail,
}: FallbackFaceProps) {
  const { t } = useTranslation();
  const hasActions = Boolean(onRetry || secondary);
  const showDetail = scale === "full" && detail != null && detail.length > 0;
  return (
    <div
      className={`ldk-fallback ldk-fallback--${variant} ldk-fallback--${scale}`}
      role={variant === "crash" ? "alert" : "status"}
    >
      <span className={`codicon ${ICON[variant]} ldk-fallback-icon`} aria-hidden="true" />
      <div className="ldk-fallback-title">{title}</div>
      {description != null && scale !== "micro" ? (
        <p className="ldk-fallback-desc">{description}</p>
      ) : null}
      {hasActions ? (
        <div className="ldk-fallback-actions">
          {onRetry ? (
            <button
              type="button"
              className="ldk-fallback-btn ldk-fallback-btn--primary"
              onClick={onRetry}
            >
              {retryLabel ?? t("重试")}
            </button>
          ) : null}
          {secondary ? (
            <button type="button" className="ldk-fallback-btn" onClick={secondary.onClick}>
              {secondary.label}
            </button>
          ) : null}
        </div>
      ) : null}
      {showDetail ? (
        <details className="ldk-fallback-detail">
          <summary>
            <span className="codicon codicon-chevron-right" aria-hidden="true" />
            {t("诊断信息")}
          </summary>
          <dl className="ldk-fallback-kv">
            {detail!.map((row) => (
              <Fragment key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </Fragment>
            ))}
          </dl>
        </details>
      ) : null}
    </div>
  );
}
