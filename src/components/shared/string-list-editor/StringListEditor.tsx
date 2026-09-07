/**
 * StringListEditor — 通用字符串数组编辑器（行列表 + 行内直添）。
 * E6#30c 新建（壳共享 @linkdesk/ui 零件，03-添加市场源-mockup.html ① 行内形态的实现基座）：
 *   - 编辑 `string[]` 配置值（marketplaceSources 作者源列表；未来任意 string[] 配置复用）
 *   - `locked`（固定项）渲染为 pinned 不可删行（marketplace 官方源——「内置」徽标 + 锁）
 *   - 行内添加：输入框 + 按钮 + Enter；空 / 重复 / urlOnly 格式错 → 就近红字
 * 语义：locked 恒显且不入 onChange 值——主叫方（settings renderControl）把配置项的
 * `default` 数组当作 locked 传入，官方源永不落盘（getSourceUrls 读时恒前置去重）。
 *
 * 样式随组件（E6#54b）。文本全走 props（Button/Toggle 风格——控件零 useTranslation，
 * 主叫方本地化；硬约束 2 UI 文字经 t()）。颜色全走 CSS 变量（硬约束 1）。
 */

import { useState } from "react";
import type { ReactNode } from "react";
import "./StringListEditor.css";

interface StringListEditorProps {
  /** 可编辑条目（写入 onChange 值） */
  value: string[];
  onChange: (next: string[]) => void;
  /** 固定不可删条目——pinned 行恒显、不属 value、不加进 onChange（marketplace 官方源） */
  locked?: string[];
  /** locked 行徽标文案（如「内置」）——主叫方本地化后传入 */
  lockedBadge?: string;
  /** 添加输入框占位 */
  placeholder?: string;
  /** 「添加」按钮文案（必填——主叫方本地化） */
  addLabel: string;
  /** 删除行按钮 title（必填——主叫方本地化） */
  removeTitle: string;
  /** url 语义：行内 mono 显示 + 输入校验需 http(s):// 前缀 */
  urlOnly?: boolean;
  /** 空输入错误文案（本地化）；缺省空输入静默忽略不报 */
  emptyMessage?: string;
  /** urlOnly 下非 http(s):// 错误文案 */
  badUrlMessage?: string;
  /** 重复错误文案（与 value/locked 已有重复） */
  duplicateMessage?: string;
  /** 底部说明（可 ReactNode） */
  hint?: ReactNode;
}

export default function StringListEditor({
  value,
  onChange,
  locked = [],
  lockedBadge,
  placeholder,
  addLabel,
  removeTitle,
  urlOnly,
  emptyMessage,
  badUrlMessage,
  duplicateMessage,
  hint,
}: StringListEditorProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);

  const add = () => {
    const raw = draft.trim();
    if (!raw) {
      if (emptyMessage) setError(emptyMessage);
      return;
    }
    if (urlOnly && !/^https?:\/\/.+/.test(raw)) {
      if (badUrlMessage) setError(badUrlMessage);
      return;
    }
    if (locked.includes(raw) || value.includes(raw)) {
      if (duplicateMessage) setError(duplicateMessage);
      return;
    }
    onChange([...value, raw]);
    setDraft("");
    clearError();
  };

  return (
    <div className="sle">
      {/* locked（固定内置）行——pinned，恒显，不可删 */}
      {locked.map((url) => (
        <div className="sle-row sle-row--locked" key={url} title={url}>
          {urlOnly && <span className="codicon codicon-link sle-glyph" aria-hidden="true" />}
          <span className="sle-url">{url}</span>
          {lockedBadge && <span className="sle-badge">{lockedBadge}</span>}
          <span className="codicon codicon-lock sle-lock" aria-hidden="true" />
        </div>
      ))}

      {/* 可编辑条目行——可删 */}
      {value.map((item) => (
        <div className="sle-row" key={item} title={item}>
          {urlOnly && <span className="codicon codicon-link sle-glyph" aria-hidden="true" />}
          <span className="sle-url">{item}</span>
          <button
            className="sle-del"
            title={removeTitle}
            aria-label={removeTitle}
            onClick={() => onChange(value.filter((v) => v !== item))}
          >
            <span className="codicon codicon-trash" aria-hidden="true" />
          </button>
        </div>
      ))}

      {/* 行内直添——输入 + 添加；Enter 即加；input 改动清错误 */}
      <div className="sle-add-row">
        <input
          className="sle-input"
          type="text"
          value={draft}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value);
            clearError();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <button className="sle-add-btn" type="button" onClick={add}>
          {addLabel}
        </button>
      </div>

      {error && <span className="sle-msg sle-msg--error">{error}</span>}
      {!error && hint && <div className="sle-msg sle-msg--hint">{hint}</div>}
    </div>
  );
}
