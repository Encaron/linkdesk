/**
 * AiPolicyPicker——AI 权限四段选择器（`@linkdesk/ui` 共享件 · 2026-11-24）。
 *
 * 规格：`docs/04-软件更新/待抉择池/AI安全-权限档位与提权/01-设计/03-UI与交互规格.md` §2.2
 *
 * 🔴 三条纪律（判据 A：消费宿主声明的件住共享层）：
 *   ① **受控、零桥**：不 import `@/core`、不调 `window.linkdesk`；值/文案由调用方注入，
 *      `onChange` 只上报（⛔ 不自己写配置——写点只有壳命令 `aiPolicy.setMode`）；
 *   ② **档位词表由宿主声明传入**（`options`），组件里没有 `"auto"` 之类的业务字面量分支；
 *   ③ **零 hex / 零裸 px**：颜色与圆角全部吃 token（硬约束 1/16），类名 `ldk-` 前缀（硬约束 23）。
 *
 * 无障碍：`role="radiogroup"`＋每段 `role="radio"`＋`aria-checked`；←/→/Home/End 移动并选中，
 * 聚焦环走 token，不打断方向键在设置页的行内语义。
 */

import { useCallback, useId, useRef } from "react";
import "./AiPolicyPicker.css";

type AiPolicyValue = "read" | "ask" | "auto" | "full";

export interface AiPolicyOption {
  value: AiPolicyValue;
  /** 段标题（已 t()） */
  label: string;
  /** 该档的判定摘要（已算好、已 t()——数据来自宿主 getState，⛔ 组件不自己算） */
  summary: string;
}

export interface AiPolicyPickerProps {
  value: AiPolicyValue;
  options: AiPolicyOption[];
  disabled?: boolean;
  /** 只上报，不写配置 */
  onChange(value: AiPolicyValue): void;
  /** 当前档的一句人话（已 t()；缺省则不显示该行） */
  description?: string;
  /** 选中 `full` 时的常驻提示条（已 t()；缺省则不显示） */
  note?: string;
  /** 「改成自主」按钮——只为 `full` 提供；缺省则不画 */
  onReset?: () => void;
  resetLabel?: string;
  /** 无障碍组名（缺省「AI 权限档位」由调用方传已译文案） */
  ariaLabel?: string;
}

export default function AiPolicyPicker({
  value,
  options,
  disabled = false,
  onChange,
  description,
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

  return (
    <div className="ldk-ai-policy-picker">
      <div
        className="ldk-ai-policy-seg"
        role="radiogroup"
        aria-label={ariaLabel}
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
              title={o.summary}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {current && description && (
        <p className="ldk-ai-policy-current" id={`${groupId}-desc`}>
          {description}
        </p>
      )}

      {current && (
        <p className="ldk-ai-policy-summary">{current.summary}</p>
      )}

      {showNote && <div className="ldk-ai-policy-note" role="status">{note}</div>}

      {showNote && onReset && resetLabel && (
        <button type="button" className="ldk-ai-policy-reset" onClick={onReset} disabled={disabled}>
          {resetLabel}
        </button>
      )}
    </div>
  );
}
