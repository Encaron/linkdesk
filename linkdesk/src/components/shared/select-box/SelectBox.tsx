/**
 * SelectBox——归一化下拉组件，替代所有原生 <select>。
 *
 * 对标 VS Code SelectBox（src/vs/base/browser/ui/selectBox/）。
 * 原生 <select> 在 Electron 里走独立 OS 渲染通道——跟 Chromium 合成器不同步，
 * 异步 onApply 时态时序错乱。自定义组件走 React 状态，完全可控。
 *
 * 归一化：全局一个 SelectBox——不同页面/插件传不同的 options/value/onChange。
 * 新插件用下拉 → import SelectBox from "@src/components/shared/select-box/SelectBox"。
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import OverlayPortal from "../overlay-portal/OverlayPortal";
import "./SelectBox.css";

interface SelectBoxOption {
  value: string;
  label: string;
}

interface SelectBoxProps {
  value: string;
  options: string[] | SelectBoxOption[];
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
  className?: string;
  /** 下拉面板打开时回调——用于刷新动态选项列表（如串口热插拔） */
  onOpen?: () => void;
}

function isOption(o: string | SelectBoxOption): o is SelectBoxOption {
  return typeof o === "object" && "value" in o && "label" in o;
}

function SelectBox({ value, options, onChange, disabled, placeholder, title, className, onOpen }: SelectBoxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focusIdx, setFocusIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // 归一化 options
  const normalized = useMemo(() =>
    options.map((o) => (isOption(o) ? o : { value: o, label: o })),
  [options]);

  // 过滤
  const filtered = useMemo(() => {
    if (!search) return normalized;
    const s = search.toLowerCase();
    return normalized.filter((o) => o.label.toLowerCase().includes(s));
  }, [normalized, search]);

  // 当前选中项的 label
  const currentLabel = useMemo(() => {
    const found = normalized.find((o) => o.value === value);
    return found?.label ?? placeholder ?? value;
  }, [normalized, value, placeholder]);

  // focus index clamp
  useEffect(() => {
    if (focusIdx >= filtered.length) setFocusIdx(Math.max(0, filtered.length - 1));
  }, [filtered.length, focusIdx]);

  // 打开时聚焦搜索或列表
  useEffect(() => {
    if (!open) {
      setSearch("");
      setFocusIdx(-1);
      return;
    }
    onOpen?.();
    const idx = filtered.findIndex((o) => o.value === value);
    setFocusIdx(idx >= 0 ? idx : 0);
    if (normalized.length > 8) {
      searchRef.current?.focus();
    } else {
      listRef.current?.focus();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // E5#96m: 外部点击检测+Escape → OverlayPortal onClose 统一处理

  const select = useCallback(
    (v: string) => {
      onChange(v);
      setOpen(false);
    },
    [onChange],
  );

  // 键盘
  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusIdx((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusIdx((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filtered[focusIdx]) select(filtered[focusIdx].value);
          break;
        // E5#96m: Escape → OverlayPortal onClose
      }
    },
    [filtered, focusIdx, select],
  );

  // 滚动 focusIdx 到可见区域
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[focusIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [focusIdx, open]);

  const showSearch = normalized.length > 8;

  return (
    <div
      className={`selectbox ${open ? "selectbox-open" : ""} ${disabled ? "selectbox-disabled" : ""} ${className ?? ""}`}
      ref={containerRef}
    >
      {/* 触发器 */}
      <button
        type="button"
        className="selectbox-trigger"
        disabled={disabled}
        title={title}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="selectbox-label">{currentLabel}</span>
        <span className={`codicon codicon-chevron-down selectbox-arrow ${open ? "selectbox-arrow-up" : ""}`} />
      </button>

      {/* 下拉面板——E5#96f: Portal 到 body，脱离 zone 层叠上下文 */}
      {open && (
        <OverlayPortal onClose={() => setOpen(false)} triggerRef={containerRef as React.RefObject<HTMLElement>}>
        <div className="selectbox-dropdown" onKeyDown={handleKey}
          style={{
            position: "fixed",
            left: containerRef.current?.getBoundingClientRect().left ?? 0,
            top: (containerRef.current?.getBoundingClientRect().bottom ?? 0) + 2,
            minWidth: containerRef.current?.getBoundingClientRect().width,
            // 动态 maxWidth——面板不超过窗口右边缘 - 24px 呼吸，不硬编码固定值
            maxWidth: window.innerWidth - (containerRef.current?.getBoundingClientRect().left ?? 0) - 24,
          }}
        >
          {showSearch && (
            <div className="selectbox-search">
              <input
                ref={searchRef}
                type="text"
                className="selectbox-search-input"
                placeholder={t("筛选...")}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setFocusIdx(0); }}
              />
            </div>
          )}
          <ul ref={listRef} className="selectbox-list" tabIndex={-1}>
            {filtered.length === 0 ? (
              <li className="selectbox-empty">{t("无匹配项")}</li>
            ) : (
              filtered.map((o, i) => (
                <li
                  key={o.value}
                  className={`selectbox-item ${i === focusIdx ? "selectbox-item-focus" : ""} ${o.value === value ? "selectbox-item-selected" : ""}`}
                  onClick={() => select(o.value)}
                  onMouseEnter={() => setFocusIdx(i)}
                >
                  {o.label}
                </li>
              ))
            )}
          </ul>
        </div>
        </OverlayPortal>
      )}
    </div>
  );
}

export default SelectBox;
