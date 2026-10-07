/**
 * Dual-side exposure checklist — E5.8#20.
 *
 * Supporting checklist (not the signature source of truth): the typed form of the coverage matrix's §2 — "which namespaces each side must expose".
 * preload-pool.ts's expose object `satisfies PoolExposed` / preload-shell.ts `satisfies ShellExposed` —
 * pure tsc as the gate: if the contract gains a method and one side misses the exposure → compile red; adding a surface on either side must be synced into this checklist (two-way mechanical enforcement).
 *
 * Surface types = Pick with fully explicit listing — adding a surface must list it, and listing it means it must be implemented. Bridge surfaces (pool/shell/window etc.) changed from
 * the contract's `?` shell-only semantics to required on both sides (matrix N1 correction: the only true shell-only = bridge).
 *
 * 🔥 E5.8#20 satisfies empirics (design §3.2 boundary): the commands/tabs/pool three namespace contracts declare the pool-side (plugin runtime) full method set,
 * but pool/shell each implement their own half — namespace-level Pick structurally fails on these "split namespaces"
 * (neither side can satisfy the other's half). Fix = these three surfaces become method-level subset surfaces (Pick/Omit per method);
 * other namespaces keep namespace-level Pick. The only true shell-only = bridge; the pool's four pool-side methods (onLayout/ready/
 * sidebarAction/tabAction) are the only pool-only ones.
 *
 * Design source: the repo-internal contract-generation design dossier (Chinese docs tree), §3.2
 * Coverage matrix: the repo-internal contract-generation namespace-matrix dossier (Chinese docs tree), §2
 */
import type { LinkDeskAPI } from "../linkdesk-api";
import type { DownloadProgress, ReleaseNotes, UpdateState } from "../../types/ipc/update";
import type { ProductInfo } from "../../types/ipc/product";
import type { AiManualPayload } from "../../types/ipc/aiManual";
import type { AiBridgeInfo, AiBridgeInfoRequest } from "../../types/ipc/aiBridge";

/** The pool preload's required exposure surface (45 = 44 unique + the config alias; the only omission is bridge; E6#72 removed the toast host bridge surface) — E5.8#34.5 added panel (the pool-side channel for plugins calling reveal); E5.8#37 added floatingPanelHost (the dumb-render bridge of the in-shell floating panel); E5.8#41.12 added settings (settings suite enum/switching, the settings UI renders inside the pool); E5.8#41.14 added factorySlots (candidate enum/switching for any role, the data source of the settings UI's general section); E5.8#50.11 added appearance (appearance assets — selected images copied into the store); E6#57.2a added app (read-only product identity — consumed by the marketplace's minAppVersion E6#30.8c) */
export type PoolExposed = Pick<LinkDeskAPI,
  | "commands" | "configuration" | "config" | "theme" | "language" | "app" | "appearance"
  | "tabs" | "keybindings" | "notifications" | "menu" | "contextKey"
  | "dialog" | "quickPick" | "quickPickHost" | "dialogHost" | "floatingPanelHost"
  | "serial" | "clipboard" | "p2p" | "events" | "pluginState"
  | "workspace" | "filesystem" | "path" | "env" | "search" | "encoding"
  | "decorations" | "fileAssociation" | "langDef" | "lsp" | "protocol"
  | "viewContainer" | "plugins" | "pluginManager" | "window"
  | "shell" | "hotExit" | "getFilePath" | "panel" | "settings" | "factorySlots" | "update"> & {
  /** pool namespace — split-surface method-level subset: pool side = receive layout + send actions + the beforeClose channel (the shell-side pushLayout/onReady/… 12 methods are the shell→pool push surface and do not exist in the pool).
   *  pool in the contract is required (after E5.8#22 review, N1 correction) — direct Pick, no NonNullable needed
   *  E5.8#30.16 (P8): the three beforeClose methods are pool-only (the plugin registers the handler / GroupTabBar's close path awaits)
   *  E5.8#44-B: tabBarRects is pool-only (MainZone reports TabBar rects — the shell side has no send surface)
   *  E5.8#44-C: dragPosition/onAdsorbHint are pool-only (the pool reports drag position + subscribes to shell adsorb hints — the shell side has no send/subscribe surface)
   *  E5.8#46.10: adsorbIndex is pool-only (the pool returns the insertion gap — the shell side has no send surface)
   *  M1 AI#4: getLayout is pool-only (reads this window's most recent snapshot — the shell is the pusher and has no need to "read back what it just pushed") */
  pool: Pick<LinkDeskAPI["pool"], "getLayout" | "onLayout" | "ready" | "sidebarAction" | "tabAction" | "tabBarRects" | "dragPosition" | "onAdsorbHint" | "adsorbIndex" | "registerBeforeClose" | "unregisterBeforeClose" | "beforeClose">;
};

/** The shell preload's required exposure surface (26; bridge is truly shell-only; storage is shell-side-only — the pool does not inject it, and the surface itself is `?` optional). Method-level subsets of the commands/tabs/pool/appearance namespaces:
 *  commands shell = the registration surface (execute/executeCommand/unregisterCommands/getCommands are the pool-side execution surface; the shell does not implement them)
 *  tabs shell lacks onDidChangeActiveTab (a pool-side subscription surface — the shell is the tab authority itself and has no subscription need)
 *    + M1 AI#3's list (a read surface — the shell already holds this very state and does not loop over IPC to ask itself)
 *  pool shell = the push surface (onLayout/ready/sidebarAction/tabAction are the pool-side send surface; the shell does not implement them)
 *    + M1 AI#4's getLayout (a pool-side read surface — same as above)
 *  storage shell = both methods (a shell-side-only surface — the settings page's action/status command handlers run in the shell process;
 *    the pool does not inject it, hence the namespace is `?` optional in LinkDeskAPI and picked in here)
 *  appearance shell = only revealStorage (E5.8#153: the gear command handler runs in the shell process and needs the shell side to trigger the main process's openPath;
 *    importImage is pool-only — image selection and copy-into-store happen only in the pool's settings UI)
 *  update shell = the getState contract surface + three write commands and the in-shell private onStateChanged extension (E6#57.9c/d — see the update section below)
 *  app shell = the getVersion contract surface (E6#57.2b exposed in sync by both preloads) + the in-shell private getProductInfo extension (the About page's
 *    E6#57.14 data source, not in the contract). ⚠️ Excess-exposure implementation note: satisfies's excess-property check reaches every level of the literal;
 *    the inlined getProductInfo once failed to compile with "no such name in the contextual type" — preload-shell bypassed it with the buildShellApp()
 *    factory construction (the return value goes through structural compatibility). **Since E6#57.13 this is no longer required**: the `app:` section below has written
 *    getProductInfo into the checklist (the type now has the name) and the factory construction is kept (an established pattern whose comment explains the history;
 *    changing it for "we could skip the detour now" would be pointless churn); the pool-side buildApp() exposes only the contract surface getVersion */
export type ShellExposed = Pick<LinkDeskAPI,
  | "getFilePath" | "serial" | "filesystem" | "path" | "plugins"
  | "fileAssociation" | "pluginManager" | "dialog" | "pluginState" | "menu"
  | "contextKey" | "keybindings" | "p2p"
  | "clipboard" | "app" | "env" | "events" | "bridge" | "window" | "update" | "storage"> & {
  /**
   * In-shell private extension of dialog (04 "workspace import/export — layout restore disconnection") — following the update section's precedent (contract surface &
   * shell private extensions interleaved). File selection must go through the main process's showOpenDialog: the file dialog of the shell tree's input.click()
   * requires a user gesture, but the gesture of a menu click lives in the pool tree (WebContents isolation) ⇒ Chromium silently rejects.
   */
  dialog: LinkDeskAPI["dialog"] & {
    /** Pick a .linkdesk-workspace and read back its text; null = the user cancelled / the file could not be read (feedback on the renderer side) */
    openWorkspaceImport?: () => Promise<{ path: string; content: string } | null>;
  };
  commands: Pick<LinkDeskAPI["commands"], "registerCommand" | "_executeShellLocal">;
  tabs: Omit<LinkDeskAPI["tabs"], "onDidChangeActiveTab" | "list">;
  pool: Omit<LinkDeskAPI["pool"], "getLayout" | "onLayout" | "ready" | "sidebarAction" | "tabAction" | "tabBarRects" | "dragPosition" | "onAdsorbHint" | "adsorbIndex" | "registerBeforeClose" | "unregisterBeforeClose" | "beforeClose">;
  appearance: Pick<LinkDeskAPI["appearance"], "revealStorage">;
  /**
   * update shell = the contract's read-only surface (`getState`) **+ in-shell private extensions** (E6#57.9c/d, update dossier 06).
   *
   * 🔴 Why the extension is declared here: the contract's update surface having **only `getState`** is **by design** ("third parties read-only" lands on the
   * **type** — the pool preload injects only the contract surface ⇒ the plugin side has no entry to the write commands at all; see the
   * 🔴 section in linkdesk-api/update.ts). The shell-side half (write commands + event subscription) is **over-exposed** via a factory function, per buildShellApp()'s established precedent.
   * But "over-exposed" does not mean "untyped" — writing the shell's full surface into this checklist, `preload-shell`'s
   * `satisfies ShellExposed` brings it under the **tsc gate**: missing one method later = compile red, instead of
   * the silent drift of "absent in the type, present at runtime".
   *
   * The only consumer is the shell renderer's update hook (src/hooks/useUpdateState.ts, single point of access). The pool side **does not inject** these
   * methods — `PoolExposed`'s update still comes from the contract (getState only).
   */
  update: LinkDeskAPI["update"] & {
    /**
     * Release notes fetch (E6#57.13b) — an **in-shell private extension**, same precedent and same reason as `buildShellApp()`'s `getProductInfo`:
     * the data source of an in-shell view belongs to the shell, not to plugins. And **in-shell views share the same
     * `window.linkdesk` as third-party plugins** (shell views are not plugins and have no plugin.json), so "opening one for the pool" equals
     * "opening one for all plugins" — that is exactly what dossier 05 §2.4 explicitly excludes ("release notes are the shell's own surface; third-party plugins have no reason to read it").
     * ⇒ Go with "shell fetches, pool draws": the shell fetches and attaches it to the tab via `pushLayout`; the pool dumb-renders.
     * The only consumer = `src/hooks/useReleaseNotes.ts` (module singleton).
     *
     * @param force Bypass the 24h cache and fetch the latest now (04 "release notes refresh button") — on success the cache is still written, on failure the cache fallback is still used
     *              (the main-process iron rule unchanged); on failure with no cache it still throws.
     */
    getReleaseNotes(version?: string, force?: boolean): Promise<ReleaseNotes>;
    /** Manual (`context=true`) / background (`false`) check. **Shell-private business**: both paths originate from the shell (07 §1). */
    checkForUpdates(context: boolean): Promise<UpdateState>;
    downloadUpdate(): Promise<UpdateState>;
    /** Throwing surface: throws when there is no installer / validation fails; the shell turns it into a user-visible notice (notification panel #57.12). */
    quitAndInstall(): Promise<void>;
    /** State-transition broadcast subscription — implemented on the preload side as `events.on(IPC.update.stateChanged)`, returns an unsubscribe function. */
    onStateChanged(cb: (state: UpdateState) => void): () => void;
    /**
     * Download progress subscription (E6#57.12) — **a different channel from `onStateChanged`; both are needed**.
     *
     * 🔴 Why progress cannot be read from `onStateChanged`: `reportProgress` writes `DownloadProgress` into
     * `this.state` **in place** (the service's internal `getState()` sees it), **not emitting `stateChanged`** — that broadcast
     * by design fires only on **transitions** (#57.4c). So the `downloading` state on the renderer side stays frozen at
     * the frame of "just entered download" (0%), and the progress bar would not move until it lands on `downloaded`.
     * (The service layer's ≤500ms throttle is also on the `onProgress` path; see `PROGRESS_THROTTLE_MS`.)
     *
     * ⚠️ **Progress is an instantaneous reading, not the truth** — `storeForReplay:false` (`update-handlers.ts`), so a newly opened window
     * cannot replay "the 50% from a moment ago"; this is **intentional** (replaying a stale percentage = fake progress). To get the current value
     * consumers should read the `downloading.progress` **in the state** (available via both `getState()` / `useUpdateState()`,
     * which is refreshed in place to the latest); this channel only exists to **advance** the bar.
     */
    onProgress(cb: (progress: DownloadProgress) => void): () => void;
  };
  /**
   * app shell = the contract's `getVersion` **+ in-shell private extensions** `getProductInfo` / `getAiManual`.
   *
   * 🔴 Another instance of the same rule as the `update` section above (`preload-shell`'s `buildShellApp()` header comment
   * already says "the three slots must stay in the same shape"): the contract's app surface has only `getVersion` (E6#57.2b), while the full product identity
   * (the About page's 8 fields = the `#57.14` data source) + the AI operations manual (M3 `AI#16`) are **fetching for in-shell views**,
   * not opened to pool plugins (the pool preload injects only the contract surface ⇒ the plugin side has neither entry at all).
   *
   * ⚠️ **This section was added by `#57.13`, not a new exposure** — `getProductInfo` has existed at runtime all along
   * (the `buildShellApp()` factory construction); only the **type lacked this line**: without it, shell-side consumers would hit
   * "callable at runtime, tsc says it does not exist". Filling this gap into the checklist = bringing it under the tsc gate (missing exposure = compile red).
   * The release notes' "all versions" link was the first real consumer (`useReleaseNotes.listPageUrl()`
   * derives the page endpoint from `product.updateUrl`; see the comment on that field in `types/ipc/product.ts`).
   */
  app: LinkDeskAPI["app"] & {
    /** Full product identity (`electron/product.ts`'s `productInfo()`) — **in-shell private**, not exposed to the pool */
    getProductInfo(): Promise<ProductInfo>;
    /**
     * Full AI operations manual (M3 `AI#16`) — the **third in-shell private extension** (same as `getProductInfo`:
     * a data source of an in-shell view; belongs to the shell, not to plugins). The only consumer = `src/hooks/useAiManual.ts` (module singleton).
     *
     * 🔴 Why it is not opened to the pool: the manual is about **how this software is operated by AI** (command surface / contract surface / CLI+MCP),
     * which is host knowledge; and in-shell views share the same `window.linkdesk` as third-party plugins ⇒ opening it to the pool = opening it to all plugins
     * (same boundary argument as `update.getReleaseNotes`; see that section). Data travels via "shell fetches, pool draws".
     *
     * ⚠️ `chapters: []` is a **legitimate response** (this build ships without the manual), not an error — consumers render an empty state, do not treat it as exceptional.
     */
    getAiManual(): Promise<AiManualPayload>;
    /**
     * AI integration status (M4 `AI#38.4`) — the **fourth in-shell private extension** (same shape as `getAiManual`: answered directly by main,
     * the pool preload does not inject it ⇒ plugins cannot call it). **Data only, no wording**: the status row's display text such as "running/shut down"
     * is assembled by the shell command (t()). `{action:"regenerateToken"}` = regenerate the credential (`AI#38.9`; the old credential is invalidated immediately).
     */
    getAiBridge(action?: AiBridgeInfoRequest): Promise<AiBridgeInfo>;
  };
  /**
   * shell shell = the contract surface **+ the in-shell private extension** `onOpenPath` (E6#46b, same precedent and reason as `buildShellUpdate`):
   * the only consumer of files opened via the command line / file associations is the shell App's top-level hook (shell-level features stay out of plugins — B79),
   * and third-party plugins have no reason to "receive command-line files" ⇒ the pool preload does not inject it (not in the contract `LinkDeskAPI`).
   * Transport = `workspace:openPath` direct send (not the plugin:push distribution) + `IpcRelay` buffered replay (hard constraint 20).
   * ⚠️ Why the landing spot is the shell surface: the namespace-matrix gate only accepts namespaces already defined in the contract (a new top-level namespace turns red),
   *    and the shell side has no workspace surface (that one is the pool's) — shell is the shell's own capability surface, a natural fit.
   */
  shell: LinkDeskAPI["shell"] & {
    /**
     * Subscribe to intake file batches (the file half routed by the main process's launch-args). Payload = the array of paths arrived this time.
     * The first subscription FIFO-replays batches buffered before subscribing; thereafter real-time delivery; returns an unsubscribe function.
     */
    onOpenPath(cb: (paths: string[]) => void): () => void;
    /** E6#47f: report this window's active workspace (the main process records per window → windows-state.json → cold start restores the last active window) */
    reportActiveWorkspace(folder: string | null): void;
    /**
     * E6#45f: OS integration switches (context menus / file type associations) — **the source of truth is the registry** (the installer's `installer.nsh`
     * and the in-app writes touch the same set of keys). The consumer = the shell startup's "General" group config (onApply writes the registry +
     * at startup config values are synced from the registry), so it travels shell-side only and is not exposed to the pool (the settings UI consumes it via configuration).
     */
    getIntegrationState(): Promise<{ fileMenu: boolean; dirMenu: boolean; fileAssoc: boolean }>;
    setIntegrationEnabled(
      kind: 'fileMenu' | 'dirMenu' | 'fileAssoc',
      enabled: boolean,
    ): Promise<{ fileMenu: boolean; dirMenu: boolean; fileAssoc: boolean }>;
  };
};

/**
 * The **sole runtime casting point** of shell-side private surfaces — this file is the type checklist; the only runtime access port lives here.
 *
 * 🔴 Why it is needed: `window.linkdesk`'s static type is the **plugin contract** `LinkDeskAPI`
 * (`src/types/global.d.ts`), while the object actually running in the shell renderer is `preload-shell`'s **over-exposed body**
 * (= the `ShellExposed` above, its shape pinned down by `satisfies` via tsc). The contract surface is a **proper subset** of the shell surface;
 * the difference (`app.getProductInfo` / the update write commands and subscriptions) **does not exist at all** on the contract type ⇒
 * a shell-side consumer calling `window.linkdesk.app.getProductInfo()` directly would hit "callable at runtime, tsc says it does not exist".
 * This function narrows that difference **once**; consumers get zero `any` and zero second cast sites.
 *
 * ⚠️ **Do not write an `as` at each consumer** — that is exactly why this function exists (with many cast sites,
 * the difference between the "runtime surface" and the "declared surface" becomes impossible to see at a glance).
 *
 * In non-shell environments (vitest without preload / pure frontend preview) it returns `undefined`; each consumer decides how to degrade.
 */
export function getShellExposed(): ShellExposed | undefined {
  return window.linkdesk as unknown as ShellExposed | undefined;
}
