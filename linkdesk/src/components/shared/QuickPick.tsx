/**
 * QuickPick——归一化浮动选择面板。
 * E3b #36a：从 CommandPalette 提取公共壳——portal + overlay + input + fuzzy + ↑↓EnterEsc。
 *
 * 对标 VS Code QuickPick——CommandPalette / ThemeBrowser / LanguagePicker 共用一个组件。
 * 每个场景只需提供 items + onSelect + getSearchText，~40 行。
 *
 * 设计依据：docs/02-Electron架构/E3_多WebView与壳收尾_暂定/08-执行清单.md #36a
 * VS Code 对标：src/vs/base/parts/quickinput/browser/quickInput.ts
 */

import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import { createPortal } from "react-dom";

/* ── 模糊搜索（E2c #18）── */

/**
 * 对标 VS Code fuzzyScore——首字母连续匹配→高分，中间连续匹配→中分，跳跃匹配→低分。
 * 返回值 = 0 表示不匹配。
 */
function fuzzyScore(query: string, target: string): number {
  query = query.toLowerCase();
  target = target.toLowerCase();
  let score = 0;
  let qi = 0;
  let consecutive = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) {
      qi++;
      consecutive++;
      // 首字母 / 空格后 / 点后 → 权重高
      if (ti === 0 || target[ti - 1] === " " || target[ti - 1] === ".") score += 10;
      if (consecutive > 1) score += 5;
      else score += 1;
    } else {
      consecutive = 0;
    }
  }
  return qi === query.length ? score : 0;
}

/* ── 类型 ── */

export interface QuickPickProps<T> {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调——调用方 setState(false) */
  onClose: () => void;
  /** 可选列表 */
  items: T[];
  /** 输入框占位文本 */
  placeholder: string;
  /** 提交选择——Enter 或点击时调用。QuickPick 自动关面板。 */
  onSelect: (item: T) => void;
  /** 高亮预览——↑↓ 或 hover 时调用。主题预览用（即时 apply），可选。 */
  onHighlight?: (item: T) => void;
  /** 提取搜索文本——用于模糊匹配和默认渲染 */
  getSearchText: (item: T) => string;
  /** 提取唯一 React key */
  getKey: (item: T) => string;
  /** 自定义渲染——默认显示 getSearchText(item) */
  renderItem?: (item: T, isSelected: boolean) => ReactNode;
}

/* ── 组件 ── */

export default function QuickPick<T>({
  open,
  onClose,
  items,
  placeholder,
  onSelect,
  onHighlight,
  getSearchText,
  getKey,
  renderItem,
}: QuickPickProps<T>) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 打开时重置——聚焦输入框，清空搜索和选中
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // 窗口失焦关闭——对标 ContextMenu
  useEffect(() => {
    if (!open) return;
    const onBlur = () => onClose();
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [open, onClose]);

  // 模糊搜索 + 排序——匹配度高的排前面
  const filtered = useMemo(() => {
    if (!query) return items;
    const scored = items
      .map((item) => ({ item, score: fuzzyScore(query, getSearchText(item)) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.map((s) => s.item);
  }, [query, items, getSearchText]);

  // 输入变化时重置选中到第一项
  const onQueryChange = (value: string) => {
    setQuery(value);
    setSelected(0);
  };

  // 选中项自动滚入可视区
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selected] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  // onHighlight 回调——选中项变化时触发（主题预览）
  useEffect(() => {
    if (onHighlight && filtered.length > 0) {
      const idx = Math.min(selected, filtered.length - 1);
      onHighlight(filtered[idx]);
    }
  }, [selected, filtered, onHighlight]);

  if (!open) return null;

  const handleSelect = (item: T) => {
    onSelect(item);
    onClose();
  };

  return createPortal(
    <>
      <div className="ctx-overlay" onClick={onClose} />
      <div className="palette">
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onClose();
              return;
            }
            if (e.key === "Enter" && filtered.length > 0) {
              const idx = Math.min(selected, filtered.length - 1);
              handleSelect(filtered[idx]);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((s) => Math.min(s + 1, filtered.length - 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((s) => Math.max(s - 1, 0));
              return;
            }
          }}
        />
        <div className="palette-list" ref={listRef}>
          {filtered.map((item, i) => (
            <div
              key={getKey(item)}
              className={`palette-item${i === selected ? " selected" : ""}`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelected(i)}
            >
              {renderItem ? renderItem(item, i === selected) : getSearchText(item)}
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
}
