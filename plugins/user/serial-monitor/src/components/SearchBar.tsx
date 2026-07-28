import { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  visible: boolean;
  /** 当前搜索文本 */
  text: string;
  caseSensitive: boolean;
  matchCount: number;
  matchIndex: number;
  onTextChange: (text: string) => void;
  onCaseToggle: (cs: boolean) => void;
  onNavigate: (delta: 1 | -1) => void;
  onClose: () => void;
  onOpen: () => void;
}

function SearchBar({
  visible, text, caseSensitive, matchCount, matchIndex,
  onTextChange, onCaseToggle, onNavigate, onClose, onOpen,
}: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        if (visible) {
          inputRef.current?.focus();
          inputRef.current?.select();
        } else {
          onOpen();
        }
      }
      if (e.key === "Escape" && visible) onClose();
      if (e.key === "Enter" && visible && matchCount > 0) {
        e.preventDefault();
        onNavigate(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, matchCount, onClose, onOpen, onNavigate]);

  if (!visible) return null;

  return (
    <div className="search-bar">
      <span className="codicon codicon-search search-icon" />
      <input
        ref={inputRef}
        className="search-input"
        type="text"
        placeholder={t("搜索...")}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) onNavigate(-1);
            else onNavigate(1);
          }
          if (e.key === "Escape") onClose();
        }}
      />
      {matchCount > 0 && (
        <span className="search-count">{matchIndex}/{matchCount}</span>
      )}
      <button
        className={`search-opt${caseSensitive ? " active" : ""}`}
        onClick={() => onCaseToggle(!caseSensitive)}
        title={t("大小写敏感")}
      >
        Aa
      </button>
      <button className="search-nav" onClick={() => onNavigate(-1)} title={t("上一个")}><span className="codicon codicon-arrow-up" /></button>
      <button className="search-nav" onClick={() => onNavigate(1)} title={t("下一个")}><span className="codicon codicon-arrow-down" /></button>
      <button className="search-close" onClick={onClose} title={t("关闭搜索")}><span className="codicon codicon-close" /></button>
    </div>
  );
}

export default SearchBar;
