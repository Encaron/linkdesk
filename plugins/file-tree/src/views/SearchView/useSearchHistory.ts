/**
 * useSearchHistory——搜索历史（最近 10 条）+ 下拉显隐（E6#87a 从 SearchView.tsx 拆出，逐字搬运）。
 */

import { useState, useEffect, useCallback } from "react";

export function useSearchHistory() {
  /** E4V#39b: 搜索历史——最近 10 条 */
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  useEffect(() => {
    window.linkdesk?.pluginState?.get("file-tree", "searchHistory").then((v: unknown) => {
      if (Array.isArray(v)) setSearchHistory(v as string[]);
    });
  }, []);
  const [showHistory, setShowHistory] = useState(false);

  /** 记一条历史（去重、截断 10 条）——时机与写入顺序同原实现 */
  const saveHistory = useCallback(async (q: string) => {
    const prev = (await window.linkdesk?.pluginState?.get("file-tree", "searchHistory") ?? []) as string[];
    const next = [q, ...prev.filter((h: string) => h !== q)].slice(0, 10);
    window.linkdesk?.pluginState?.set("file-tree", "searchHistory", next).catch((e: unknown) => { console.error("[file-tree] 保存搜索历史失败:", e); });
    setSearchHistory(next);
  }, []);

  return { searchHistory, showHistory, setShowHistory, saveHistory };
}
