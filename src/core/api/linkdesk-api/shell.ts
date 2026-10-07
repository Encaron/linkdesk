/**
 * linkdesk-api shell-side/pool control domain — split out of linkdesk-api.ts (E5.8#0d.10-9d).
 * The bridge/pool/window/shell/hotExit/getFilePath six namespace surfaces verbatim (E5.8#22 review N1 fix:
 * both-end-injected surfaces = required; only the true-shell-only bridge and the pool-side-only hotExit keep `?` optional).
 * Dependency direction: shell → types/ipc (bridge/poolActions) + types/pool (poolLayout); cross-composed by the aggregator.
 */

import type { BridgeRequestPayload } from "../../types/ipc/bridge";
import type { PoolLayout, PoolTab } from "../../types/pool/poolLayout";
import type { PluginDiskLocation, PluginFolderKind } from "./types";
import type { PoolTabAction, ShellTabAction } from "../../types/ipc/tabActions";
import type { SidebarAction } from "../../types/ipc/sidebarActions";
import type { PoolQuickPickAction, PoolDialogAction, PoolFloatingPanelAction, MemoryPressureData, CreatePoolWindowRequest, PoolWindowBoundsPayload, TabBarRectsPayload, TabBarViewportRect, TabDragPositionPayload, ShellTabDragPosition, AdsorbHintPayload, AdsorbIndexPayload } from "../../types/ipc/poolActions";

/** Shell↔plugin relay / pool control / window / shell-level commands / hot-exit staging namespace surfaces — injected on both ends (bridge is true-shell-only / hotExit is pool-side-only) */
export interface ShellAPI {
  /** Shell↔plugin communication relay — shell preload only */
  bridge?: {
    onRequest(cb: (req: BridgeRequestPayload) => void): () => void;
    respond(requestId: string, result?: unknown, error?: string): void;
    broadcast(channel: string, payload: unknown): void;
    notifyConfigChanged(key: string, value: unknown): void;
  };

  /** Pool control — shell preload: pushes layout + registers pool→shell action callbacks; pool preload: receives layout + sends actions. Each end implements its own half (method-level subset surface, surfaces.ts) */
  pool: {
    // ── Shell side (absent from the pool preload) ──
    /** E5.8#43-2: optional targeted push by windowId (defaults to 'main') — the shell traverses its window registry to push each window's layout by id */
    pushLayout(layout: PoolLayout, windowId?: string): void;
    /** E5.8#43-1 A3: the callback receives windowId (main pool='main', detached pool=shell-generated id) — the shell pushes that window's layout targeted by id */
    onReady(cb: (windowId: string) => void): () => void;
    toggleDevTools(): void;
    onSidebarAction(cb: (action: SidebarAction) => void): () => void;
    // E5.8#44-B: the shell side receives action = ShellTabAction (the main process injects sourceWindowId by sender — #43-4 authoritative window identity)
    onTabAction(cb: (action: ShellTabAction) => void): () => void;
    // E5.8#44-B: pool→shell TabBar viewport rects report (data source for dock/detach-merge hit testing) — windowId injected by the main process
    onTabBarRects(cb: (payload: TabBarRectsPayload) => void): () => void;
    // E5.8#44-C: pool→shell drag position report (mousemove throughout while picked up) — sourceWindowId injected by the main process (the shell excludes the source window from hit testing)
    onDragPosition(cb: (pos: ShellTabDragPosition) => void): () => void;
    // E5.8#44-C: shell→pool dock hint (target window TabBar insert indicator/clear) — windowId pushed targeted after the shell resolves the hit (#46.10 payload carries viewport coordinates)
    pushAdsorbHint(hint: AdsorbHintPayload, windowId: string): void;
    // E5.8#46.10: pool→shell dock insertion gap report (shell side — windowId injected by the main process; the shell keeps a docking registry for precise placement on detach-merge)
    onAdsorbIndex(cb: (payload: AdsorbIndexPayload) => void): () => void;
    pushQuickPick(data: unknown): void;
    onQuickPickAction(cb: (action: PoolQuickPickAction) => void): () => void;
    pushDialog(data: unknown): void;
    onDialogAction(cb: (action: PoolDialogAction) => void): () => void;
    // E5.8#37 (Phase 8 type B): in-shell floating panel — pushPanel dumb render data + action callbacks back
    pushFloatingPanel(data: unknown): void;
    onFloatingPanelAction(cb: (action: PoolFloatingPanelAction) => void): () => void;
    onMemoryPressure(cb: (data: MemoryPressureData) => void): () => void;
    // ── E5.8#43-1 (A4): multi-window foundation — shell-driven create/close of pool windows + listening for OS window close (the main process owns the window lifecycle) ──
    createWindow(opts: CreatePoolWindowRequest): void;
    closeWindow(windowId: string): void;
    onWindowClosed(cb: (windowId: string) => void): () => void;
    // ── E5.8#43-3: main→shell pool window bounds changes (moved/resized reports) — shell registry update + persisting floating window positions (I9-14) ──
    onWindowBoundsChanged(cb: (payload: PoolWindowBoundsPayload) => void): () => void;
    // ── Pool side (absent from the shell preload) ──
    /**
     * M1 `AI#4`: **read the current layout on demand** — the full layout snapshot most recently received
     * by this window (tree `root` + groups `groups`).
     *
     * 🔴 The **same yardstick** as `onLayout`: what is returned is the very body of the most recent `onLayout` payload.
     * The pool renders whole-value snapshot frames and **does not cache old values for merging** (the two iron rules in the
     * `poolLayout.ts` header) — this method only leaves a read port for "not waiting for the next frame" and **does not participate in rendering**.
     *
     * ⚠️ No push has been received yet (pool just started, shell has not pushed / window not ready) → `null` (**no empty layout is fabricated**).
     * ⚠️ **A detached window receives a policy subset** (`WINDOW_MODE_STRATEGIES`: detached = `titleBar`+`groups`;
     * drift = `titleBar`+`panel`) ⇒ in those windows `statusBar`/`sidebar`/`iconBar` **do not exist** —
     * this is a normal consequence of the window mode, not data loss. Use `tabs.list()` (ask the shell) to see the full picture across windows.
     * ⚠️ Split-tree depth cap `MAX_TREE_DEPTH = 4` (`src/core/utils/splitTree.ts`) — deeper levels never appear in the tree;
     * readers need not guard for infinite depth, but **do not assume 4 levels is always reachable** (users may not split that deep).
     */
    getLayout(): PoolLayout | null;
    onLayout(cb: (layout: PoolLayout) => void): () => void;
    ready(): void;
    sidebarAction(action: SidebarAction): void;
    tabAction(action: PoolTabAction): void;
    // E5.8#44-B: pool→shell TabBar viewport rects report (pool side — MainZone useTabDrag reports getBoundingClientRect)
    tabBarRects(rects: TabBarViewportRect[]): void;
    // E5.8#44-C: pool→shell drag position report (pool side — useDragReorder reports mousemove after pickup, shell does dock hit testing)
    dragPosition(pos: TabDragPositionPayload): void;
    // E5.8#44-C: shell→pool dock hint subscription (pool side — MainZone subscribes for the target window's TabBar insert indicator/clear)
    onAdsorbHint(cb: (hint: AdsorbHintPayload) => void): () => void;
    // E5.8#46.10: pool→shell dock insertion gap report (pool side — the target pool computes the vertical-line drop point and reports; the shell places precisely on detach-merge)
    adsorbIndex(payload: { groupId: string; insertIndex: number }): void;
    // ── E5.8#30.16 (P8): generic "cancelable beforeClose" channel (pool side) ──
    // Plugins register a handler (their own logic: show a confirmation / clean up resources / return a boolean deciding whether closing the tab is allowed);
    // the GroupTabBar close path `await beforeClose` — if the handler returns false (or Promise<false>), the close is canceled.
    registerBeforeClose(pluginId: string, handler: (tab: PoolTab) => boolean | Promise<boolean>): void;
    unregisterBeforeClose(pluginId: string): void;
    beforeClose(pluginId: string, tab: PoolTab): Promise<boolean>;
  };

  /** Window control — TitleBar button mapping, injected on both ends (11 methods on one channel, shared module electron/window-namespace.ts) */
  window: {
    minimize(): void;
    maximize(): void;
    unmaximize(): void;
    close(): void;
    /** E5.7#79: zoom factor → main process setZoomFactor (pool WCV) */
    setZoom(factor: number): void;
    toggleDevTools(): Promise<void>;
    isMaximized(): Promise<boolean>;
    onMaximizeChange(cb: (maximized: boolean) => void): () => void;
    /** E5.8#46.18: OS-level always-on-top (covers other apps) — true pins / false unpins; routed to the host window by sender */
    setAlwaysOnTop(pinned: boolean): void;
    isAlwaysOnTop(): Promise<boolean>;
    onAlwaysOnTopChange(cb: (pinned: boolean) => void): () => void;
  };

  /** Shell-level commands — revealInOS / openInTerminal / startDrag / relaunch, injected on both ends */
  shell: {
    showItemInFolder(p: string): Promise<void>;
    openInTerminal(dirPath: string, terminalExe?: string, customCommand?: string): Promise<void>;
    /** E6#78: disk location of an installed plugin — the **criterion** data source for "open containing folder / data location"
     *  on the marketplace detail page (whether a data directory exists decides whether that row is drawn).
     *  Resolved by the main process (the pool has zero knowledge of install paths); plugin not found on disk → null.
     *  ⚠️ Division of labor with `shell.showItemInFolder(p)`: **that one takes a path, this one takes an identity** —
     *  the caller (marketplace) cannot and should not assemble absolute paths. */
    pluginLocation(pluginId: string): Promise<PluginDiskLocation | null>;
    /** E6#78: open the plugin's install directory / data directory in the file explorer — the main process resolves the path then `shell.openPath`.
     *  Opens the directory **contents** (same feel as E5.8#153 `appearance.revealStorage` "open storage location"),
     *  **not** `showItemInFolder`'s "parent folder with it selected". When the directory does not exist: `install` throws
     *  (plugin not on disk — never pretend the open succeeded); `data` creates an empty directory first, then opens (same as revealStorage —
     *  opening reveals the storage location; an empty directory is equally legitimate). */
    openPluginFolder(pluginId: string, kind: PluginFolderKind): Promise<void>;
    startDrag(filePath: string, iconPath?: string): void;
    /** E6#73j (G4): **truly restart the app** (quit and start the process again).
     *  The difference from `window.location.reload()` is whether the pool survives — the pool is an independent WebContentsView,
     *  a shell reload does not rebuild it, so after updating view-type plugins the pool still runs the old bundle
     *  (the UI looks completely unchanged).
     *  Honest boundary: the whole app quits and starts again — unsaved editor content is handled by hot exit, and the workspace
     *  layout goes through persisted restore.
     *  Shell preload only (the pool has no need to restart its own host); once called, this process terminates soon after — do not rely on its return. */
    relaunch?(): Promise<void>;
    /**
     * T4 (2026-10-05, the "file open-with and contribution points" case): **controlled openExternal** — asks the host to hand the URL
     * to the system default handler (browser / mail client / handler registered for the protocol, e.g. VS Code).
     *
     * 🔴 **The whitelist is not advice, it is a gate**: only `http:` / `https:` / `mailto:` and protocols registered in the host
     * constant (today including `vscode:`) pass; **everything else is rejected** (`file:` / `javascript:` / `data:` are explicitly
     * rejected — plugin file access goes through `workspace` / `filesystem`, not the OS shell; and executing external input as a
     * script is not something the host should do on anyone's behalf).
     * Rejected = this Promise **rejects** (no silent failure); the caller should catch it and give the user an explanation.
     *
     * ⚠️ Honest boundary of "handing off to the system": the host **cannot sense** whether the target program is installed —
     * `vscode://` brings up the OS's answer; when it is not installed, Windows itself pops "How do you want to open this?".
     * The host only guarantees "the protocol is whitelisted and the URL is well-formed".
     * The whitelist list belongs to the host-reserved surface ledger (family `externalProtocols`); changing it = one public-surface decision.
     */
    openExternal(url: string): Promise<void>;
  };

  /** Hot exit staging — persists unsaved editor content to disk (E5.7#53). `?`: pool-side only (the shell preload does not inject it) */
  hotExit?: {
    save(filePath: string, content: string): Promise<void>;
    load(filePath: string): Promise<string | null>;
    clear(filePath: string): Promise<void>;
  };

  /** Get the paths of files dragged in from the OS — injected on both ends */
  getFilePath: (file: File) => string;
}
