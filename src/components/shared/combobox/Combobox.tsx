/**
 * Combobox——可输入 + 下拉的归一化组件（SelectBox 超集）。E5.8#30.17（审视 ④）。
 *
 * 对标 VS Code ComboBox——文本可编辑 + 候选下拉；SelectBox 只读不可输入。
 * SelectBox 场景（必须从候选选）仍用 SelectBox；Combobox 场景（允许非标自定义值
 * + 快捷候选，如波特率 115200 快捷 + 手输 250000）用本组件。
 *
 * 🔥 提交语义（防误触发重副作用——波特率变更会关旧重开端口）：
 *   选择下拉项 / Enter / 失焦（文本有变更）→ onChange(新值)；文本无变更 → 不触发。
 *
 * 归一化：壳组件库范畴（components/shared/）——壳视图 + 插件共用。
 * 新插件用可输入下拉 → import Combobox from "@src/components/shared/combobox/Combobox"。
 * 下拉面板视觉复用 SelectBox（.selectbox-dropdown/list/item/empty 类）——一个视觉语言
 * 一处写，jscpd 0 克隆门禁：Combobox.css 只定义 field/input/arrow，下拉视觉零重写。
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import SelectBoxDropdown from "../select-box/SelectBoxDropdown"; // E5.8#30.17：共用下拉骨架（定位 + Portal + 列表）
import "./Combobox.css";
// 下拉视觉复用 SelectBox 类（selectbox-dropdown/list/item/empty）——不重写，规避 CSS 克隆
import "../select-box/SelectBox.css";

interface ComboboxProps {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
  className?: string;
  /** 下拉打开时回调——刷新动态选项列表（COM 口热插拔；波特率静态可不传） */
  onOpen?: () => void;
  /** 输入法模式——波特率 numeric，默认 text */
  inputMode?: "text" | "numeric" | "decimal";
}

function Combobox({ value, options, onChange, disabled, placeholder, title, className, onOpen, inputMode = "text" }: ComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [focusIdx, setFocusIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // 编辑中（聚焦）外部值变更不覆盖编辑缓冲；失焦后缓冲跟随外部值
  const focusedRef = useRef(false);

  // 提交缓冲跟随外部值——失焦态同步，聚焦态（编辑中）不覆盖
  useEffect(() => {
    if (!focusedRef.current) setText(value);
  }, [value]);

  // 候选过滤——仅在用户编辑过文本后生效（dirty = 文本 ≠ 已提交值）。
  // 聚焦未编辑 → 显示全量候选（当前值不是过滤条件）；编辑后 → 输入过滤（不区分大小写）。
  const dirty = text !== value;
  const filtered = useMemo(() => {
    if (!dirty) return options;
    const q = text.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, text, dirty]);

  // focusIdx clamp
  useEffect(() => {
    if (focusIdx >= filtered.length) setFocusIdx(Math.max(0, filtered.length - 1));
  }, [filtered.length, focusIdx]);

  // 打开时：刷新选项 + 高亮当前值（SelectBox 同款）
  useEffect(() => {
    if (!open) return;
    onOpen?.();
    const idx = filtered.findIndex((o) => o === value);
    setFocusIdx(idx >= 0 ? idx : 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 滚动高亮项到可见区域
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[focusIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [focusIdx, open]);

  // 🔥 提交——文本无变更不触发 onChange（防误触发重副作用）
  const commit = useCallback(
    (v: string) => {
      const trimmed = v.trim();
      setOpen(false);
      if (!trimmed) return;
      setText(trimmed);
      if (trimmed !== value) onChange(trimmed);
    },
    [value, onChange],
  );

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setOpen(true);
          setFocusIdx((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setOpen(true);
          setFocusIdx((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (open && filtered[focusIdx]) commit(filtered[focusIdx]);
          else commit(text);
          break;
        case "Escape":
          e.preventDefault();
          setText(value);
          setOpen(false);
          break;
      }
    },
    [open, filtered, focusIdx, commit, text, value],
  );

  return (
    <div
      className={`combobox ${open ? "selectbox-open" : ""} ${disabled ? "selectbox-disabled" : ""} ${className ?? ""}`}
      ref={containerRef}
    >
      <div className="combobox-field">
        <input
          type="text"
          inputMode={inputMode}
          className="combobox-input"
          value={text}
          title={title}
          aria-label={title}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => { focusedRef.current = true; setOpen(true); }}
          onBlur={() => { focusedRef.current = false; commit(text); }}
          onChange={(e) => { setText(e.target.value); setOpen(true); setFocusIdx(-1); }}
          onKeyDown={handleKey}
        />
        <span className={`codicon codicon-chevron-down selectbox-arrow ${open ? "selectbox-arrow-up" : ""}`} />
      </div>

      {/* 下拉面板——骨架共用 SelectBoxDropdown（定位 + Portal + 列表，E5.8#30.17 归一）；视觉复用 SelectBox 类 */}
      {open && (
        <SelectBoxDropdown
          containerRef={containerRef as React.RefObject<HTMLElement>}
          onClose={() => setOpen(false)}
          listRef={listRef}
        >
          {filtered.length === 0 ? (
            <li className="selectbox-empty">{t("无匹配项")}</li>
          ) : (
            filtered.map((o, i) => (
              <li
                key={o}
                className={`selectbox-item ${i === focusIdx ? "selectbox-item-focus" : ""} ${o === value ? "selectbox-item-selected" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); commit(o); }}
                onMouseEnter={() => setFocusIdx(i)}
              >
                {o}
              </li>
            ))
          )}
        </SelectBoxDropdown>
      )}
    </div>
  );
}

export default Combobox;
