/**
 * SearchView——文件搜索侧栏面板。
 * E4V#37c：对标 VS Code search viewlet。
 *
 * 消费 FileSearcher（src/core/）——纯视图层，不碰搜索逻辑。
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
// E5.8#20-c：契约化——搜索走 lk.search.searchFiles，返回面 = 契约 wire 形状（FileSearcher 语义型是壳内泄漏）
import type { SearchWireResult, SearchWireMatch } from "@linkdesk/contracts";
import { extension } from "../utils/pathUtils";
import "../styles/SearchView.css";

const lk = window.linkdesk;

/* ── 状态 ── */

type SearchState = "idle" | "searching" | "hasResults" | "noResults" | "error";

/* ── 组件 ── */

const SearchView: React.FC = () => {
  const { t } = useTranslation();
  const tabs = window.linkdesk?.tabs;

  /* ── 输入 ── */
  const [query, setQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [include, setInclude] = useState("");
  const [exclude, setExclude] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);

  /* ── 结果 ── */
  const [state, setState] = useState<SearchState>("idle");
  const [results, setResults] = useState<SearchWireResult>([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  /** E4V#39b: F4/Shift+F4 导航——当前匹配索引 */
  const [navIndex, setNavIndex] = useState(-1);
  /** E4V#39b: 搜索历史——最近 10 条 */
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  useEffect(() => {
    window.linkdesk?.pluginState?.get("file-tree", "searchHistory").then((v: unknown) => {
      if (Array.isArray(v)) setSearchHistory(v as string[]);
    });
  }, []);
  const [showHistory, setShowHistory] = useState(false);

  // 展平所有匹配——F4 导航用
  const flatMatches = useMemo(() => results.flatMap((f) => f.matches), [results]);

  /* ── 搜索逻辑 ── */
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setState("idle");
      setResults([]);
      setTotalFiles(0);
      setTotalMatches(0);
      return;
    }

    // 取消旧搜索
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const roots = (await lk.workspace.getFolders()).map((f) => f.uri);
    if (roots.length === 0) {
      setState("idle");
      return;
    }

    setState("searching");
    setErrorMsg("");

    try {
      const found = await lk.search.searchFiles({
        roots,
        query: q,
        include: include || undefined,
        exclude: exclude || undefined,
        caseSensitive,
        wholeWord,
        useRegex,
      });

      if (controller.signal.aborted) return;

      const files = found.length;
      const matches = found.reduce((sum, f) => sum + f.matches.length, 0);
      setResults(found);
      setTotalFiles(files);
      setTotalMatches(matches);
      setNavIndex(0);
      // 保存搜索历史
      const prev = (await window.linkdesk?.pluginState?.get("file-tree", "searchHistory") ?? []) as string[];
      const next = [q, ...prev.filter((h: string) => h !== q)].slice(0, 10);
      window.linkdesk?.pluginState?.set("file-tree", "searchHistory", next).catch((e: unknown) => { console.error("[file-tree] 保存搜索历史失败:", e); });
      setSearchHistory(next);
      // 自动展开第一个文件
      if (found.length > 0) {
        setExpandedFiles(new Set([found[0].filePath]));
      }
      setState(files > 0 ? "hasResults" : "noResults");
    } catch (err) {
      if (controller.signal.aborted) return;
      setState("error");
      setErrorMsg(String(err));
    }
  }, [include, exclude, caseSensitive, wholeWord, useRegex]);

  // 300ms debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  // cleanup on unmount
  useEffect(() => () => {
    if (abortRef.current) abortRef.current.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  /* ── 打开文件 ── */

  const handleOpenMatch = useCallback(async (match: SearchWireMatch) => {
    const ext = extension(match.filePath);
    if (!ext) return;
    const pluginId = await lk.fileAssociation.getPluginFor(ext);
    if (!pluginId) return;
    tabs?.create(pluginId, {
      filePath: match.filePath,
      label: match.filePath.split("/").pop() ?? match.filePath,
      pinned: true,
    });
  }, [tabs]);

  /* ── 折叠展开 ── */

  const toggleFile = useCallback((filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }, []);

  /* ── 替换全部 ── */

  const handleReplaceAll = useCallback(async () => {
    if (!replaceText || results.length === 0) return;
    const ok = await window.linkdesk?.dialog?.confirm?.(t(`确定替换所有 ${totalMatches} 处？此操作不可撤销。`));
    if (!ok) return;

    let replaced = 0;
    let failed = 0;

    for (const file of results) {
      try {
        const buffer = await lk.filesystem.readBinaryFile(file.filePath);
        const encoding = await lk.encoding.detect(buffer);
        let content = await lk.encoding.decode(buffer, encoding);
        for (const m of [...file.matches].reverse()) {
          const lineStart = content.split("\n").slice(0, m.lineNumber - 1).join("\n").length;
          const absStart = lineStart + (m.lineNumber === 1 ? 0 : 1) + m.matchStart;
          content = content.slice(0, absStart) + replaceText + content.slice(absStart + (m.matchEnd - m.matchStart));
          replaced++;
        }
        await lk.filesystem.writeTextFile(file.filePath, content);
      } catch (err) {
        failed++;
        console.error(`[search] 替换失败: ${file.filePath}`, err);
      }
    }

    if (failed > 0) {
      console.warn(`[search] ${replaced} 处已替换，${failed} 个文件失败（权限不足或文件占用）`);
    }

    // 重新搜索
    doSearch(query);
  }, [replaceText, results, totalMatches, query, doSearch, t]);

  /* ── 统计文案 ── */

  const statsText = state === "searching"
    ? t("搜索中…")
    : state === "noResults"
      ? t("未找到结果")
      : state === "hasResults"
        ? `${totalFiles} ${t("个文件")}, ${totalMatches} ${t("个匹配")}`
        : "";

  /* ── 键盘：Escape 清空 / F4 导航 ── */

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setQuery("");
      inputRef.current?.blur();
      return;
    }
    if (e.key === "F4" && flatMatches.length > 0) {
      e.preventDefault();
      const next = e.shiftKey
        ? (navIndex <= 0 ? flatMatches.length - 1 : navIndex - 1)
        : (navIndex >= flatMatches.length - 1 ? 0 : navIndex + 1);
      setNavIndex(next);
      handleOpenMatch(flatMatches[next]);
    }
  }, [flatMatches, navIndex, handleOpenMatch]);

  return (
    <div className="search-view" onKeyDown={handleKeyDown} tabIndex={-1}>
      {/* 搜索框 */}
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

      {/* 替换框 */}
      {showReplace && (
        <div className="search-input-row">
          <input
            className="search-input"
            type="text"
            placeholder={t("替换")}
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
          />
          <button className="search-replace-btn" onClick={handleReplaceAll}
            disabled={state !== "hasResults" || !replaceText}>
            {t("全部替换")}
          </button>
        </div>
      )}

      {/* 过滤输入 */}
      <div className="search-filter-row">
        <input
          className="search-filter-input"
          type="text"
          placeholder={t("要包含的文件")}
          value={include}
          onChange={(e) => setInclude(e.target.value)}
        />
        <input
          className="search-filter-input"
          type="text"
          placeholder={t("要排除的文件")}
          value={exclude}
          onChange={(e) => setExclude(e.target.value)}
        />
      </div>

      {/* 工具栏：替换开关 + 折叠全部 */}
      <div className="search-toolbar">
        <span className="search-stats">{statsText}</span>
        <div className="search-toolbar-actions">
          <button className="search-option-btn" title={t("替换")}
            onClick={() => setShowReplace((v) => !v)}>{t("替换")}</button>
          {state === "hasResults" && (
            <button className="search-option-btn" title={t("折叠全部")}
              onClick={() => setExpandedFiles(new Set())}>{t("折叠全部")}</button>
          )}
        </div>
      </div>

      {/* 错误 */}
      {state === "error" && (
        <div className="search-error">{errorMsg}</div>
      )}

      {/* 结果列表 */}
      {state === "hasResults" && (
        <div className="search-results">
          {results.map((file) => (
            <div key={file.filePath} className="search-file">
              <div className="search-file-header" onClick={() => toggleFile(file.filePath)}>
                <span className={`codicon ${expandedFiles.has(file.filePath) ? "codicon-chevron-down" : "codicon-chevron-right"} search-file-chevron`} />
                <span className="codicon codicon-file search-file-icon" />
                <span className="search-file-name">{file.filePath.split("/").pop()}</span>
                <span className="search-file-path">{file.filePath}</span>
                <span className="search-file-count">{file.matches.length}</span>
              </div>
              {expandedFiles.has(file.filePath) && (
                <div className="search-matches">
                  {file.matches.map((m, i) => (
                    <div key={i} className="search-match" onDoubleClick={() => handleOpenMatch(m)}>
                      <span className="search-match-line">{m.lineNumber}</span>
                      <span className="search-match-text">{m.lineText}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 空结果 */}
      {state === "noResults" && (
        <div className="search-empty">{t("未找到结果")}</div>
      )}
    </div>
  );
};

export default SearchView;
