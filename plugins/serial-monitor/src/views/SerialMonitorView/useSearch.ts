/**
 * 接收区搜索——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。
 *
 * 搜索装饰经 setSearchDecos / clearSearchDecos 写入接收区 CM6（cmView 由 useReceiveEditor 传入）。
 */

import { useState, useRef, useCallback } from "react";
import { EditorView } from "@codemirror/view";
import { RegExpCursor } from "@codemirror/search";
import { setSearchDecos, clearSearchDecos } from "../../cm6/search";

export interface SearchOptions {
  cmView: React.MutableRefObject<EditorView | null>;
}

export function useSearch({ cmView }: SearchOptions) {
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchCase, setSearchCase] = useState(false);
  const [searchCount, setSearchCount] = useState(0);
  const [searchIdx, setSearchIdx] = useState(0);
  const searchMatchesRef = useRef<{ from: number; to: number }[]>([]);

  const runSearch = useCallback((query: string, caseSensitive: boolean) => {
    const view = cmView.current;
    if (!view) return;
    if (!query) {
      view.dispatch({ effects: clearSearchDecos.of(undefined) });
      setSearchCount(0);
      setSearchIdx(0);
      searchMatchesRef.current = [];
      return;
    }
    const matches: { from: number; to: number }[] = [];
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const cursor = new RegExpCursor(view.state.doc, escaped, { ignoreCase: !caseSensitive });
    while (!cursor.next().done) {
      matches.push({ from: cursor.value.from, to: cursor.value.to });
    }
    searchMatchesRef.current = matches;
    const idx = matches.length > 0 ? 1 : 0;
    setSearchCount(matches.length);
    setSearchIdx(idx);
    view.dispatch({ effects: setSearchDecos.of({ matches, current: idx }) });
    if (matches.length > 0) {
      view.dispatch({
        selection: { anchor: matches[0].from, head: matches[0].to },
        effects: EditorView.scrollIntoView(matches[0].from, { y: "center" }),
      });
    }
  }, [cmView]);

  const navigateSearch = useCallback((delta: 1 | -1) => {
    const view = cmView.current;
    if (!view) return;
    const matches = searchMatchesRef.current;
    if (matches.length === 0) return;
    let newIdx = searchIdx + delta;
    if (newIdx < 1) newIdx = matches.length;
    if (newIdx > matches.length) newIdx = 1;
    setSearchIdx(newIdx);
    const m = matches[newIdx - 1];
    view.dispatch({ effects: setSearchDecos.of({ matches, current: newIdx }) });
    view.dispatch({
      selection: { anchor: m.from, head: m.to },
      effects: EditorView.scrollIntoView(m.from, { y: "center" }),
    });
  }, [searchIdx, cmView]);

  const openSearch = useCallback(() => setSearchVisible(true), []);
  const closeSearch = useCallback(() => {
    setSearchVisible(false);
    setSearchText("");
    cmView.current?.dispatch({ effects: clearSearchDecos.of(undefined) });
    setSearchCount(0);
    setSearchIdx(0);
    searchMatchesRef.current = [];
  }, [cmView]);

  return {
    searchVisible, searchText, setSearchText, searchCase, setSearchCase,
    searchCount, searchIdx, runSearch, navigateSearch, openSearch, closeSearch,
  };
}
