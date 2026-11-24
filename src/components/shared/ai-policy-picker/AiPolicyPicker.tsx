/**
 * AiPolicyPicker——AI 权限四段选择器（`@linkdesk/ui` 共享件 · 2026-11-24 · 返工 v4）。
 *
 * 规格：`01-设计/03-UI与交互规格.md` §2.2（v4 更新：文案走 key + 能力摘要；无 emoji）
 *
 * 🔴 三条纪律：
 *   ① **受控、零桥**：不 import `@/core`、不调 `window.linkdesk`；`onChange` 只上报；
 *   ② **文案不缓存**：`label` / `description` / `note` / `resetLabel` 都是 **i18n key**，
 *      由调用方传入的 `translate`（通常来自 `useTranslation`）翻译——语言切换即时重绘；
 *   ③ **零 hex / 零裸 px**：颜色与圆角全吃 token；类名 `ldk-` 前缀。
 *
 * 无障碍：`role="radiogroup"` + 每段 `role="radio"`；←/→/Home/End 移动并选中；聚焦环走 token。
 * 判定色只作辅助，结论一律用文字（允许 / 询问 / 不允许），不使用 emoji。
 */

import { useCallback, useId, useRef } from "react";
import "./AiPolicyPicker.css";

type AiPolicyValue = "read" | "ask" | "auto" | "full";
export type AiPolicyDecision = "allow" | "ask" | "deny";

export interface AiPolicyOption {
  value: AiPolicyValue;
  /** 段标题（i18n key） */
  label: string;
  /** 一句人话（i18n key，可选） */
  description?: string;
}

/** 档位下方的能力摘要（label 是 i18n key；decision 来自宿主） */
export interface AiPolicyCapability {
  label: string;
  decision: AiPolicyDecision;
}

export interface AiPolicyPickerProps {
  value: AiPolicyValue;
  options: AiPolicyOption[];
  /** 档位块下方的能力摘要（可选） */
  capabilities?: AiPolicyCapability[];
  disabled?: boolean;
  /** 只上报，不写配置 */
  onChange(value: AiPolicyValue): void;
  /** key → 文案（缺省恒等；调用方传 react-i18next 的 t 即获得语言响应式） */
  translate?: (key: string) => string;
  /** 选中 `full` 时的常驻提示（i18n key；缺省不显示） */
  note?: string;
  /** 「恢复默认」动作（只为 `full` 提供；缺省不画） */
  onReset?: () => void;
  resetLabel?: string;
  /** 无障碍组名（i18n key） */
  ariaLabel?: string;
}

const identity = (key: string) => key;

export default function AiPolicyPicker({
  value,
  options,
  capabilities,
  disabled = false,
  onChange,
  translate = identity,
  note,
  onReset,
  resetLabel,
  ariaLabel,
}: AiPolicyPickerProps) {
  const groupId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  const select = useCallback(
    (next: number) => {
      const target = options[next];
      if (!target || disabled || target.value === value) return;
      onChange(target.value);
      refs.current[next]?.focus();
    },
    [disabled, onChange, options, value],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const last = options.length - 1;
    let next = index;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = index >= last ? 0 : index + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = index <= 0 ? last : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return;
    e.preventDefault();
    select(next);
  };

  const current = options.find((o) => o.value === value);
  const showNote = value === "full" && !!note;

  const decisionClass = (d: AiPolicyDecision) =>
    d === "allow" ? "ldk-ai-policy-allow" : d === "ask" ? "ldk-ai-policy-ask" : "ldk-ai-policy-deny";

  return (
    <div className="ldk-ai-policy-picker">
      <div
        className="ldk-ai-policy-seg"
        role="radiogroup"
        aria-label={ariaLabel ? translate(ariaLabel) : undefined}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
      >
        {options.map((o, i) => {
          const checked = o.value === value;
          return (
            <button
              key={o.value}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-describedby={checked ? `${groupId}-desc` : undefined}
              tabIndex={checked ? 0 : -1}
              className="ldk-ai-policy-segbtn"
              disabled={disabled}
              onClick={() => select(i)}
            >
              {translate(o.label)}
            </button>
          );
        })}
      </div>

      {current?.description && !showNote && (
        <p className="ldk-ai-policy-current" id={`${groupId}-desc`}>
          {translate(current.description)}
        </p>
      )}

      {!!capabilities?.length && (
        <p className="ldk-ai-policy-caps">
          {capabilities.map((c, i) => (
            <span key={`${c.label}-${i}`} className="ldk-ai-policy-cap">
              <b>{translate(c.label)}</b>
              <span className={decisionClass(c.decision)}>
                {translate(c.decision === "allow" ? "允许" : c.decision === "ask" ? "询问" : "不允许")}
              </span>
            </span>
          ))}
        </p>
      )}

      {showNote && (
        <div className="ldk-ai-policy-alert" role="status">
          <span>{translate(note)}</span>
          {onReset && resetLabel && (
            <button type="button" className="ldk-ai-policy-alert-reset" onClick={onReset} disabled={disabled}>
              {translate(resetLabel)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
