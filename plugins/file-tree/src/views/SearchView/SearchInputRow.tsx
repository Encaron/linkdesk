/**
 * SearchInputRow——搜索框 + 历史下拉 + 三个选项按钮（E6#87a 从 SearchView.tsx 拆出，逐字搬运）。
 */

import type { TFunction } from "i18next";

export interface SearchInputRowProps {
  inputRef: React.RefObject<HTMLInputElement>;
  query: string;
  setQuery: (q: string) => void;
  searchHistory: string[];
  showHistory: boolean;
  setShowHistory: (v: boolean) => void;
  caseSensitive: boolean;
  setCaseSensitive: React.Dispatch<React.SetStateAction<boolean>>;
  wholeWord: boolean;
  setWholeWord: React.Dispatch<React.SetStateAction<boolean>>;
  useRegex: boolean;
  setUseRegex: React.Dispatch<React.SetStateAction<boolean>>;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  t: TFunction;
}

export function SearchInputRow({
  inputRef,
  query,
  setQuery,
  searchHistory,
  showHistory,
  setShowHistory,
  caseSensitive,
  setCaseSensitive,
  wholeWord,
  setWholeWord,
  useRegex,
  setUseRegex,
  handleKeyDown,
  t,
}: SearchInputRowProps) {
  return (
    <div className="search-input-row">
      <input
        ref={inputRef}
        className="search-input"
        type="text"
        placeholder={t("搜索")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setShowHistory(true)}
        onBlur={() => requestAnimationFrame(() => setShowHistory(false))}
      />
      {showHistory && searchHistory.length > 0 && !query && (
        <div className="search-history">
          {searchHistory.map((h, i) => (
            <div key={i} className="search-history-item" onMouseDown={() => { setQuery(h); setShowHistory(false); }}>
              <span className="codicon codicon-history" />
              <span>{h}</span>
            </div>
          ))}
        </div>
      )}
      <div className="search-input-actions">
        <button className={`search-option-btn ${caseSensitive ? "search-option-btn--active" : ""}`}
          title={t("区分大小写")} onClick={() => setCaseSensitive((v) => !v)}>Aa</button>
        <button className={`search-option-btn ${wholeWord ? "search-option-btn--active" : ""}`}
          title={t("全词匹配")} onClick={() => setWholeWord((v) => !v)}>ab</button>
        <button className={`search-option-btn ${useRegex ? "search-option-btn--active" : ""}`}
          title={t("正则表达式")} onClick={() => setUseRegex((v) => !v)}>.*</button>
      </div>
    </div>
  );
}
