/**
 * Pool→shell tab action wire contract—E5.7#96 (plan §3.2 class 1: cross-stack protocol values consolidated).
 *
 * Pool component calls window.linkdesk.pool.tabAction(action) → IPC pool.tabAction →
 * shell preload → usePoolSync.onTabAction → App.handleTabAction switch.
 * Previously both ends wrote bare literals on their own (action strings + field names) with `any` payloads all the way down—
 * renaming on one side silently broke the other (the multi-WebView seam). This module defines the union literal type in one place,
 * and shell and pool both import type—field name/enum value changes make tsc fail on both ends at once.
 *
 * Location: src/core/types/ipc/ (#45.5 deleted shared/, not revived; the electron side with rootDir ".."
 * can import type, and the pool side's Path B allowTypeImports permits type imports—decision point 1 settled).
 *
 * Note: TabContext context-menu commands (core.splitRight etc.) go through the shell command system calling useTabManager directly,
 * not through this channel—splitTab.direction only has the two values horizontal/vertical normalized by the pool's drag handling.
 */

import type { DropZone } from "../../../pool/hooks/tabDragTypes";

/** Split direction—pool-side onDropSplit has already normalized it from the drop zone (MainZone:382) */
type TabSplitDirection = "horizontal" | "vertical";

/** Pool→shell tab actions—the union literal is the wire enum */
export type PoolTabAction =
  | { action: "focusTab"; tabId: string }
  // E5.8#30.15 (P5): clicking a panel's blank area focuses that panel—changes activeGroupId only, not activeTabId
  // (activeTabId is already that group's active tab; focus = which panel the user is looking at; command routing/focus ring depend on it)
  | { action: "focusGroup"; groupId: string }
  | { action: "closeTab"; tabId: string }
  // closeOtherTabs/closeTabsToRight/closeAllTabs/duplicateTab have zero in-tree senders—
  // but tabAction is a plugin-visible API (third-party plugins can send it), so the shell switch keeps them as a contract surface
  | { action: "closeOtherTabs"; groupId: string; tabId: string }
  | { action: "closeTabsToRight"; groupId: string; tabId: string }
  | { action: "closeAllTabs"; groupId: string }
  | { action: "reorderTab"; groupId: string; tabId: string; newIndex: number; oldIndex: number }
  // E5.8#51: newIndex = the insert gap within the target group (cross-group drag landing = the gap at the vertical bar; omitted appends to the end)
  | { action: "moveTab"; tabId: string; targetGroupId: string; newIndex?: number }
  | { action: "splitTab"; tabId: string; direction: TabSplitDirection; zone?: DropZone; targetGroupId?: string }
  | { action: "duplicateTab"; tabId: string }
  | { action: "pinTab"; tabId: string }
  | { action: "createTab"; pluginId?: string; workspaceName?: string }
  | { action: "updateSplitSizes"; anchorGroupId: string; sizes: [number, number]; branchIndex?: number }
  // E5.8#44-B: tab released after being dragged out of the window—screenX/Y = release point screen coordinates (shell-side hit testing: TabBar→merge into window / blank→new window)
  | { action: "releaseOutsideWindow"; tabId: string; screenX: number; screenY: number };

/**
 * Same as E5.8#43-4 ①: tab actions received by the shell—the main process resolves and injects sourceWindowId by sender (#44-B authoritative window identity).
 * The pool never knows its own windowId; the shell reads sourceWindowId to determine the source window (detach source / no merge within the same window).
 */
export type ShellTabAction = PoolTabAction & { sourceWindowId: string };
