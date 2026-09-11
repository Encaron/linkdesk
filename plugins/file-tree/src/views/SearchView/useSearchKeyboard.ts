/**
 * useSearchKeyboard——Escape 清空 / F4 导航（E6#87a 从 SearchView.tsx 拆出，逐字搬运）。
 */

import { useCallback } from "react";
import type { SearchWireMatch } from "@linkdesk/contracts";

export interface SearchKeyboardDeps {
  flatMatches: SearchWireMatch[];
  navIndex: number;
  setNavIndex: (updater: (prev: number) => number) => void;
  setQuery: (q: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  handleOpenMatch: (match: SearchWireMatch) => void;
}

export function useSearchKeyboard({
  flatMatches,
  navIndex,
  setNavIndex,
  setQuery,
  inputRef,
  handleOpenMatch,
}: SearchKeyboardDeps): (e: React.KeyboardEvent) => void {
  return useCallback((e: React.KeyboardEvent) => {
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
      setNavIndex(() => next);
      handleOpenMatch(flatMatches[next]);
    }
  }, [flatMatches, navIndex, handleOpenMatch, setNavIndex, setQuery, inputRef]);
}
