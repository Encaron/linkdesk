/**
 * File search wire contract—same as E5.7#97: cross-stack protocol values consolidated.
 * Once declared three times (FileSearcher.SearchOptions / linkdesk-api/workspace.search / preload-pool buildSearch)—
 * signal is renderer-only (not passed over IPC; the caller checks AbortSignal.aborted after getting results and discards them itself), trimmed in the wire version.
 * E5.8#1c consolidated into this file—linkdesk-api/workspace and preload-pool both import type.
 */

/** IPC search:searchFiles payload—the wire subset of FileSearcher.SearchOptions (no signal) */
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

/** A single match—lineNumber is 1-based; matchStart/matchEnd are 0-based column ranges within the line (end exclusive) */
interface SearchWireMatch {
  filePath: string;
  lineNumber: number;
  lineText: string;
  matchStart: number;
  matchEnd: number;
}

/** IPC search:searchFiles return—the wire shape of FileSearchResult */
export type SearchWireResult = Array<{ filePath: string; matches: SearchWireMatch[] }>;
