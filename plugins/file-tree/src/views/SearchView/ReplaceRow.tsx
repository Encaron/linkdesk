/**
 * ReplaceRow——替换输入框 + 全部替换按钮（E6#87a 从 SearchView.tsx 拆出，逐字搬运）。
 */

import type { TFunction } from "i18next";
import type { SearchState } from "./useSearch";

export interface ReplaceRowProps {
  replaceText: string;
  setReplaceText: (v: string) => void;
  handleReplaceAll: () => void;
  state: SearchState;
  replacing: { done: number; total: number } | null;
  t: TFunction;
}

export function ReplaceRow({
  replaceText,
  setReplaceText,
  handleReplaceAll,
  state,
  replacing,
  t,
}: ReplaceRowProps) {
  return (
    <div className="search-input-row">
      <input
        className="search-input"
        type="text"
        placeholder={t("替换")}
        value={replaceText}
        onChange={(e) => setReplaceText(e.target.value)}
      />
      <button className="search-replace-btn" onClick={handleReplaceAll}
        disabled={state !== "hasResults" || !replaceText || replacing !== null}>
        {replacing
          ? t("替换中… {{done}}/{{total}}", { done: replacing.done, total: replacing.total })
          : t("全部替换")}
      </button>
    </div>
  );
}
