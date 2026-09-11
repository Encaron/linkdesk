/**
 * useSearch——搜索框状态 + 搜索执行 + 结果状态（E6#87a 从 SearchView.tsx 拆出，逐字搬运）。
 * 消费 FileSearcher（src/core/）——纯视图层，不碰搜索逻辑。
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
// E5.8#20-c：契约化——搜索走 lk.search.searchFiles，返回面 = 契约 wire 形状（FileSearcher 语义型是壳内泄漏）
import type { SearchWireResult } from "@linkdesk/contracts";
import { useSearchHistory } from "./useSearchHistory";

const lk = window.linkdesk;

/* ── 状态 ── */

export type SearchState = "idle" | "searching" | "hasResults" | "noResults" | "error";

export function useSearch() {
  /* ── 输入 ── */
  const [query, setQuery] = useState("");
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
  const { searchHistory, showHistory, setShowHistory, saveHistory } = useSearchHistory();

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
      await saveHistory(q);
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
  }, [include, exclude, caseSensitive, wholeWord, useRegex, saveHistory]);

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

  /* ── 折叠展开 ── */

  const toggleFile = useCallback((filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }, []);

  return {
    /* 输入 */
    query, setQuery,
    include, setInclude,
    exclude, setExclude,
    caseSensitive, setCaseSensitive,
    wholeWord, setWholeWord,
    useRegex, setUseRegex,
    /* 结果 */
    state, results, totalFiles, totalMatches, errorMsg,
    expandedFiles, setExpandedFiles, navIndex, setNavIndex,
    searchHistory, showHistory, setShowHistory,
    flatMatches,
    /* 动作 */
    doSearch, toggleFile, inputRef,
  };
}

export type SearchApi = ReturnType<typeof useSearch>;
