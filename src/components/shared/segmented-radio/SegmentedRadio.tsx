/**
 * SegmentedRadio——分段单选（ghost 单选按钮组）。E5.8#99 归一化：fontTone（#91）+ accentSource（#98）
 * 两处重复的分段控件收敛为壳共享控件（对标 Slider #50.9 先例——多消费方控件进 shared/）。
 *
 * 按钮双轨制（E5.8#99 声明化，#2）：选择/分组 = 低调 ghost 分段（本组件）；动作/提交 = 实心 accent
 * （壳 Button 组件——原 .settings-action-btn 收编）——对标 VS Code：radio group 低调、动作按钮显眼。
 *
 * 形态：transparent 底 + 1px separator 边框 + var(--radius-sm) 圆角；hover = border-muted + hover-overlay；
 * 选中 = accent 描边 + color-mix accent 12% 微着色（Navigation/Active State——选中档一目了然）。
 * 无线电语义：role radiogroup/radio + aria-checked + roving tabindex（←→↑↓ 换档，对标 #91）。
 * preview：可选段内预览（fontTone 双字系方块 / accentSource 色块）——内容与几何消费方自持。
 */

import "./SegmentedRadio.css";
import { useRef } from "react";

export interface SegmentedRadioOption {
  value: string;
  /** 段显示标签（消费方已截短，如 enumDescription "—" 前段） */
  label: string;
  /** tooltip（完整解释，缺省 = label） */
  title?: string;
  /** 可选段内预览（swatch/图标）——内容消费方自持 */
  preview?: React.ReactNode;
}

interface SegmentedRadioProps {
  options: SegmentedRadioOption[];
  value: string;
  onChange: (v: string) => void;
  /** 无障碍 radiogroup 标签（读屏） */
  ariaLabel?: string;
}

function SegmentedRadio({ options, value, onChange, ariaLabel }: SegmentedRadioProps) {
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const next = (index + dir + options.length) % options.length;
    optionRefs.current[next]?.focus();
    onChange(options[next].value);
  };
  return (
    <div className="ldk-segmented-radio" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt, i) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            ref={(el) => { optionRefs.current[i] = el; }}
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={`ldk-segmented-radio__option${selected ? " is-selected" : ""}`}
            title={opt.title ?? opt.label}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, i)}
          >
            {opt.preview}
            <span className="ldk-segmented-radio__label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedRadio;
