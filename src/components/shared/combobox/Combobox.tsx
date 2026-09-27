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
 * 壳内部引用 @src 源码；插件作者（含内置插件 E6#54c）→ `import { Combobox } from "@linkdesk/ui"`。
 * 下拉面板视觉复用 SelectBox（.ldk-selectbox-dropdown/list/item/empty 类）——一个视觉语言
 * 一处写，jscpd 0 克隆门禁：Combobox.css 只定义 field/input/arrow，下拉视觉零重写。
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import SelectBoxDropdown from "../select-box/SelectBoxDropdown"; // E5.8#30.17：共用下拉骨架（定位 + Portal + 列表）
import { HINT_ATTR } from "../hint-tip/hintAttrs";
import "./Combobox.css";
// 下拉视觉复用 SelectBox 类（ldk-selectbox-dropdown/list/item/empty）——不重写，规避 CSS 克隆
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
  const inputRef = useRef<HTMLInputElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
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

  /**
   * 🔴 点击面归一——field 整块可点（2026-09-27 用户实机挑出「点击很受限、很难用」）。
   *
   * 改前**只有 `<input>` 自己的像素管用**，`<span>` 箭头与 field 的内边距/间隙全是死区：
   * span 不可聚焦、field 也没有点击处理 ⇒ 点它们既不聚焦输入框、也不开下拉；更别扭的是
   * **开着时点箭头会让输入框失焦**（原生：点不可聚焦元素 ⇒ 当前焦点元素 blur）⇒
   * `onBlur → commit → setOpen(false)` ⇒ 「箭头只能关、不能开」——最像开关的东西反而打不开。
   * 根因 = 当年复用了 SelectBox 的**视觉**（field + chevron + 共用下拉面板），却没搬它的
   * **单一可点面**（SelectBox 的触发器整块是一个 `<button onClick={toggle}>`）。
   *
   * 改后：箭头 = 开关（**复用既有聚焦/失焦两条链**，不新增第二套开关状态）；其余死区 = 聚焦输入框。
   * 失焦提交语义（防误触发重开端口）原样不动——关那条走的仍是 `blur → commit`。
   */
  const handleFieldMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const input = inputRef.current;
      if (!input) return;

      // ① 箭头 = 开关。preventDefault 阻断原生的「失焦」默认动作，改由本分支显式驱动
      //    （否则会先失焦提交、再聚焦，一开一关打架）。
      if (arrowRef.current?.contains(e.target as Node)) {
        e.preventDefault();
        if (open) {
          setOpen(false);
          // 失焦链顺带提交已输入文本（与「点外面」同语义），并让下次点击能重新聚焦
          input.blur();
        } else {
          input.focus(); // 未聚焦 → onFocus 开下拉
          setOpen(true); // Escape 后「已聚焦但已关」态下 onFocus 不再触发 ⇒ 补一次（幂等）
        }
        return;
      }

      // ② 输入框本身——走原生路径（拖动选字 / 点击定位光标不打断）
      if (e.target === input) return;

      // ③ field 的内边距 / 间隙（原死区）→ 聚焦输入框
      e.preventDefault();
      input.focus(); // 未聚焦 → onFocus 开下拉
      setOpen(true); // 已聚焦但已被 Escape 关掉时 onFocus 不再触发 ⇒ 补一次（幂等）
    },
    [open],
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
      className={`ldk-combobox ${open ? "ldk-selectbox-open" : ""} ${disabled ? "ldk-selectbox-disabled" : ""} ${className ?? ""}`}
      ref={containerRef}
    >
      <div className="ldk-combobox-field" onMouseDown={handleFieldMouseDown}>
        <input
          type="text"
          ref={inputRef}
          inputMode={inputMode}
          className="ldk-combobox-input"
          value={text}
          {...(title ? { [HINT_ATTR]: title } : null)}
          aria-label={title}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => { focusedRef.current = true; setOpen(true); }}
          onBlur={() => { focusedRef.current = false; commit(text); }}
          onChange={(e) => { setText(e.target.value); setOpen(true); setFocusIdx(-1); }}
          onKeyDown={handleKey}
        />
        {/* 纯装饰字形——键盘用户的开关是 ↑/↓/Enter/Escape（见 handleKey），故不进可访问树；
            鼠标用户的开关 = 本 span（handleFieldMouseDown ①），光标见 Combobox.css */}
        <span
          ref={arrowRef}
          aria-hidden="true"
          className={`codicon codicon-chevron-down ldk-selectbox-arrow ${open ? "ldk-selectbox-arrow-up" : ""}`}
        />
      </div>

      {/* 下拉面板——骨架共用 SelectBoxDropdown（定位 + Portal + 列表，E5.8#30.17 归一）；视觉复用 SelectBox 类 */}
      {open && (
        <SelectBoxDropdown
          containerRef={containerRef as React.RefObject<HTMLElement>}
          onClose={() => setOpen(false)}
          listRef={listRef}
        >
          {filtered.length === 0 ? (
            <li className="ldk-selectbox-empty">{t("无匹配项")}</li>
          ) : (
            filtered.map((o, i) => (
              <li
                key={o}
                className={`ldk-selectbox-item ${i === focusIdx ? "ldk-selectbox-item-focus" : ""} ${o === value ? "ldk-selectbox-item-selected" : ""}`}
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
