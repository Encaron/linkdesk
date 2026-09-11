/**
 * SearchView——文件搜索侧栏面板（门面）。
 * E4V#37c：对标 VS Code search viewlet。
 *
 * 消费 FileSearcher（src/core/）——纯视图层，不碰搜索逻辑。
 *
 * 原 359 行单文件按件拆出（E6#87a）：`SearchView/useSearch.ts`（搜索状态 + 执行）/
 * `SearchView/useReplaceAll.ts`（全部替换）/ `SearchView/useSearchKeyboard.ts`（Escape + F4）/
 * `SearchView/SearchInputRow.tsx` / `SearchView/ReplaceRow.tsx` / `SearchView/SearchToolbar.tsx` /
 * `SearchView/SearchResults.tsx`。
 * ⚠️ 文件名（= 视图 render basename）保持 `SearchView` 不变——SDK bundle key 约束。
 */

import { useTranslation } from "react-i18next";
import { useSearch } from "./SearchView/useSearch";
import { useReplaceAll } from "./SearchView/useReplaceAll";
import { useSearchKeyboard } from "./SearchView/useSearchKeyboard";
import { openMatch } from "./SearchView/openMatch";
import { SearchInputRow } from "./SearchView/SearchInputRow";
import { ReplaceRow } from "./SearchView/ReplaceRow";
import { SearchToolbar } from "./SearchView/SearchToolbar";
import { SearchResults } from "./SearchView/SearchResults";
import "../styles/SearchView.css";

/* ── 组件 ── */

const SearchView: React.FC = () => {
  const { t } = useTranslation();

  const search = useSearch();
  const replace = useReplaceAll({
    results: search.results,
    totalMatches: search.totalMatches,
    query: search.query,
    doSearch: search.doSearch,
    t,
  });

  /* ── 键盘：Escape 清空 / F4 导航 ── */

  const handleKeyDown = useSearchKeyboard({
    flatMatches: search.flatMatches,
    navIndex: search.navIndex,
    setNavIndex: search.setNavIndex,
    setQuery: search.setQuery,
    inputRef: search.inputRef,
    handleOpenMatch: openMatch,
  });

  /* ── 统计文案 ── */

  const statsText = search.state === "searching"
    ? t("搜索中…")
    : search.state === "noResults"
      ? t("未找到结果")
      : search.state === "hasResults"
        ? `${search.totalFiles} ${t("个文件")}, ${search.totalMatches} ${t("个匹配")}`
        : "";

  return (
    <div className="search-view" onKeyDown={handleKeyDown} tabIndex={-1}>
      {/* 搜索框 */}
      <SearchInputRow
        inputRef={search.inputRef}
        query={search.query}
        setQuery={search.setQuery}
        searchHistory={search.searchHistory}
        showHistory={search.showHistory}
        setShowHistory={search.setShowHistory}
        caseSensitive={search.caseSensitive}
        setCaseSensitive={search.setCaseSensitive}
        wholeWord={search.wholeWord}
        setWholeWord={search.setWholeWord}
        useRegex={search.useRegex}
        setUseRegex={search.setUseRegex}
        handleKeyDown={handleKeyDown}
        t={t}
      />

      {/* 替换框 */}
      {replace.showReplace && (
        <ReplaceRow
          replaceText={replace.replaceText}
          setReplaceText={replace.setReplaceText}
          handleReplaceAll={replace.handleReplaceAll}
          state={search.state}
          replacing={replace.replacing}
          t={t}
        />
      )}

      {/* 过滤输入 + 工具栏 */}
      <SearchToolbar
        include={search.include}
        setInclude={search.setInclude}
        exclude={search.exclude}
        setExclude={search.setExclude}
        statsText={statsText}
        setShowReplace={replace.setShowReplace}
        state={search.state}
        setExpandedFiles={search.setExpandedFiles}
        t={t}
      />

      {/* 错误 */}
      {search.state === "error" && (
        <div className="search-error">{search.errorMsg}</div>
      )}

      {/* 结果列表 */}
      {search.state === "hasResults" && (
        <SearchResults
          results={search.results}
          expandedFiles={search.expandedFiles}
          toggleFile={search.toggleFile}
          handleOpenMatch={openMatch}
        />
      )}

      {/* 空结果 */}
      {search.state === "noResults" && (
        <div className="search-empty">{t("未找到结果")}</div>
      )}
    </div>
  );
};

export default SearchView;
