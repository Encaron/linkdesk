/**
 * linkdesk-api tab domain — split out of linkdesk-api.ts (E5.8#0d.10-9b).
 * The tabs namespace surface verbatim; M1 `AI#3` adds the read surface `list()` (type dependencies = the tab/layout DTOs
 * from types/pool, so the tab list and the layout tree share **the same yardstick**). Cross-composed by the aggregator.
 */

import type { PoolGroup, PoolLayout } from "../../types/pool/poolLayout";
import type { WindowMode } from "../../types/windows";

/**
 * M1 `AI#3`: per-window tab list — produced by **the same serializer** (`serializeGroups`) as the layout tree pushed to the pool,
 * so "the label/icon/title in the list" necessarily matches "the row drawn on screen".
 */
export interface TabsSnapshotWindow {
  /** Shell-generated (main pool = `"main"`, detached windows get a shell-generated id) */
  windowId: string;
  mode: WindowMode;
  /** Whether the pool React has mounted and is ready (the shell still pushes layouts for unready windows — the preload buffers and replays, so the list still has content) */
  ready: boolean;
  /** The window's currently focused group (passed straight through from the shell's `tabState.activeGroupId` — not derived on the pool side) */
  activeGroupId: string;
  /** The window's split root tree (same type as `PoolLayout["root"]`; omitted for a single group with no nesting) */
  root?: PoolLayout["root"];
  /** Per-group tab list (including each group's `activeTabId` = the group's active tab) */
  groups: PoolGroup[];
}

/**
 * M1 `AI#3`: the return of `tabs.list()` — **all windows in one shot** (including active positions).
 *
 * 🔴 Why all windows instead of "the current window": the shell has **no** "current window" source of truth
 * (a repo-wide grep for `activeWindowId` returns zero hits; the window registry only holds per-window mode/ready/tabState) —
 * inventing a "current window" out of thin air would be fabricating data.
 * Callers (plugins/AI) filter by `windowId` for whichever window they want.
 */
export interface TabsSnapshot {
  windows: TabsSnapshotWindow[];
}

/** Tab namespace surface — modeled after VS Code vscode.window.createTerminal() */
export interface TabsAPI {
  tabs: {
    create(type: string, opts?: Record<string, unknown>): Promise<unknown>;
    openOrFocus(type: string, opts?: Record<string, unknown>): Promise<unknown>;
    focus(tabId: string): Promise<void>;
    close(tabId: string): Promise<void>;
    focusBySourceId(sourceId: string): Promise<void>;
    updateLabelBySourceId(sourceId: string, label: string): Promise<void>;
    closeBySourceId(sourceId: string): Promise<void>;
    /** E5.6#11.5g3: tab activation subscription — consumed by file-tree autoReveal (actually present on preload-pool; the contract was backfilled in #98) */
    onDidChangeActiveTab(cb: (data: { tabId: string; pluginId?: string; filePath?: string }) => void): () => void;
    /**
     * M1 `AI#3`: **read-only enumeration** — which tabs are open, which plugin each belongs to, which is active
     * (each group's `activeTabId`).
     *
     * 🔴 Why it must exist: the layout source of truth is the shell's `useTabManager` (React state), and **the shell exposes no
     * getter whatsoever** (the pool can only passively wait for the next `pool.onLayout` frame, but "what is there right now"
     * should not depend on waiting). This method = the shell-side authority exposing itself on demand.
     * 🔴 **Pool-side only**: the shell is itself the tab authority and already holds this state, so it need not round-trip IPC to
     * ask itself ⇒ `preload-shell` does not implement it (the `ShellExposed.tabs` Omit in `surfaces.ts` already removes `list` —
     * same reasoning as `onDidChangeActiveTab`).
     *
     * @returns the list for all windows (see `TabsSnapshot`; **same origin** as `AI#4`'s layout tree — the same `serializeGroups`)
     */
    list(): Promise<TabsSnapshot>;
  };
}
