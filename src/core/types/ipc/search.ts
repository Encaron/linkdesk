/**
 * 文件搜索 wire 契约——E5.7#97 同款：跨堆协议值归口。
 * 曾三份声明（FileSearcher.SearchOptions / linkdesk-api/workspace.search / preload-pool buildSearch）——
 * signal 是渲染侧专属（IPC 不传，调用方拿到结果后检查 AbortSignal.aborted 自行丢弃），wire 版裁剪。
 * E5.8#1c 归口本文件——linkdesk-api/workspace + preload-pool 双端 import type。
 */

/** IPC search:searchFiles 载荷——FileSearcher.SearchOptions 的 wire 子集（无 signal） */
export interface SearchWireOptions {
  roots: string[];
  query: string;
  include?: string;
  exclude?: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  maxResults?: number;
}

/** 单个匹配——1-based lineNumber；matchStart/matchEnd 为该行内 0-based 列区间（不含 end） */
export interface SearchWireMatch {
  filePath: string;
  lineNumber: number;
  lineText: string;
  matchStart: number;
  matchEnd: number;
}

/** IPC search:searchFiles 返回——FileSearchResult 的 wire 形状 */
export type SearchWireResult = Array<{ filePath: string; matches: SearchWireMatch[] }>;
