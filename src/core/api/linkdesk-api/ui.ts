/**
 * linkdesk-api UI domain — split out of linkdesk-api.ts (E5.8#0d.10-9c).
 * The eight namespace surfaces notifications/menu/contextKey/dialog/quickPick/quickPickHost/dialogHost/floatingPanelHost verbatim.
 * Dependency direction: ui → ./types (MenuItemDescriptor/NotificationHandle) + types/ipc|pool + MenuRegistry; cross-assembled by the aggregator.
 */

import type { MenuItemDescriptor, NotificationHandle, PluginToastAction } from "./types";
import type { DialogOpenOptions, DialogContentOpenOptions } from "../../types/ipc/dialogs"; // E6#71c rich-content confirm parameters
import type { ManifestMenuItem } from "../../registry/commands/MenuRegistry";
import type { PoolQuickPickData, PluginQuickPickOptions, PluginQuickPickRequest } from "../../types/pool/poolQuickPick";
import type { PoolDialogData, PoolPendingDialog } from "../../types/pool/poolDialog";
import type { PoolFloatingPanelData, FloatingPanelBoundsHostRequest, PoolFloatingPanelGeometry } from "../../types/pool/poolFloatingPanel";
import type { NotifLayout } from "../../types/pool/poolLayout"; // M1 AI#1: the read surface returns the panel DTO itself

/** UI overlays/menu/notification namespace surface — Modeled after VS Code vscode.window + ContextKey + the in-pool QuickPick/Dialog/FloatingPanel host bridges */
export interface UiAPI {
  /** Notifications — plugins raise notifications (E6#72: the only notification surface is the bell-wide notification panel; the bottom-right narrow-card path was removed wholesale), Modeled after VS Code vscode.window.showInformationMessage */
  notifications: {
    /** Raises a notification, **always returns a handle** (with update/finish/cancel) — E6#73f (S6) handle isolation:
     *  previously a handle was returned only when progress:true ⇒ a persistent failure notification (with [Retry]) could not be dismissed,
     *  and after the user's manual retry succeeded, that "install failed" entry kept living on, the panel turning into a wall of failures (archive 18 A3/E4).
     *  ⇒ A notification can only be updated/removed by **the handle that created it**, whether or not it is a progress bar.
     *  E6#13.5: options.actions carries primary action buttons — clicking runs the shell's executeCommand(action.command, action.args),
     *  the command handler registered by the plugin itself. No actions → no buttons (status quo). Error kinds auto-stay 8s.
     *  E6#71j: options.persistent=true long-lived notification — does not auto-dismiss, waits for the user to click × (for error diagnostics);
     *  the long-lived cap is **bucketed by source**, 5 each (E6#73f S3); over the cap, evict the oldest of the same source and show a summary notice */
    show(message: string, options?: {
      type?: "info" | "warning" | "error";
      /** true → progress notification: update can carry a 0-100 percent to drive a real progress bar (E6#71i) */
      progress?: boolean;
      /** true → long-lived notification: does not auto-dismiss (E6#71j); for error-diagnosis / needs-user-decision scenarios */
      persistent?: boolean;
      actions?: PluginToastAction[];
      /** E6#73g (S5) producer identity id — **a machine-read attribution key with no human copy** (the human-readable name is resolved by the shell).
       *  The panel **groups by source** and each group's 5-entry long-lived quota keys off this; omitted → all fall into the "Other" group.
       *  Plugins pass their own plugin id; the shell's own domains use `app.<domain>` (e.g. `app.update`).
       *  ⚠️ **Auto-injection is impossible** — the pool is a single shared-realm process where all plugins share the same `window.linkdesk`,
       *  and the preload cannot know "which plugin's tree issued this show()" ⇒ **only the author can declare it explicitly**.
       *  ⚠️ Old plugins that omit it still all fall into the "Other" group: this is a **new contract** and takes effect only after authors re-release. */
      source?: string;
    }): Promise<NotificationHandle>;

    /**
     * M1 `AI#1`: **read-only listing** — what the panel currently holds (counts / unread / each entry's content and buttons / wake and liveness criteria).
     *
     * 🔴 Why it must be exactly this shape: what is returned is the **bell-wide panel's DTO itself** (`NotifLayout`, the same `buildNotif(t)` output as
     * `pool.onLayout`'s `statusBar.notif`) — **not** a separately computed summary. Two rulers would inevitably clash: if the grouping/unread/copy the AI reads
     * differed from what is drawn on screen, the read surface would become a source of false information.
     * The design text (M1 route B) also concedes that the layout snapshot **is already pushing** this data and just "hadn't opened the door"; this method is that door,
     * and behind the door it is still the same implementation (⛔ do not fork a second ruler).
     *
     * ⚠️ **Escaped windows get it too**: this method asks the **shell** via `plugins:call` (the shell holds the full state) and does not read this window's layout subset
     * — an escaped window's `statusBar` is cut off by the policy table, so going through layout would answer "no notifications".
     *
     * ⚠️ Copy-type fields (`bellTitle`/`panelTitle`/group labels/`timeLabel`…) are **already resolved by the shell's `t()` in the current language**;
     * callers display them verbatim (display-text iron rule).
     */
    list(): Promise<NotifLayout>;

    /**
     * M1 `AI#1`: **change subscription** — calls back whenever the notification surface changes (added/updated/dismissed/acknowledged/panel open-close).
     *
     * 🔴 **The signal carries no payload**: the callback does **not** include a snapshot — including one would push the "data" through a second path,
     * and someone on the pool side would then use the signal's data instead of asking the authority (`list()`), growing a second ruler again. This subscription only answers
     * "**it changed just now**"; for answers call `list()` (consistent with the "status push + pull on demand"
     * division of `watchFile`/`events.on`).
     *
     * Transport = the shell's `events.emit("notif:changed")` → main-process broadcast → the pool's `events.on` (**no new IPC channel**;
     * the namespace matrix §3 channel count unchanged). ⚠️ The broadcast stores its payload by default for new pools to replay ⇒ a newly started pool may receive
     * a "stale change signal" — this subscription has idempotent re-fetch semantics (on receipt, call `list()`), so it is harmless.
     *
     * @returns unsubscribe function
     */
    subscribe(cb: () => void): () => void;
  };

  /** E5#69: Menus — declarative read/write for plugins */
  menu: {
    registerItems(menuId: string, pluginId: string, items: ManifestMenuItem[]): Promise<void>;
    getItems(menuId: string, context?: Record<string, unknown>): Promise<MenuItemDescriptor[]>;
  };

  /** E5#70: ContextKey — plugins SET state for the shell's when clauses to read */
  contextKey: {
    set(key: string, value: unknown): Promise<void>;
    _getValue?(key: string): unknown;
  };

  /** E5#67: Dialogs — confirm/alert/file selection */
  dialog: {
    confirm(message: string): Promise<boolean>;
    alert(message: string): Promise<void>;
    /** File/directory picker — Modeled after Tauri dialog.open (E5.7#73: openFile is the canonical plugin-side name; this method is kept for existing consumers) */
    open(opts?: DialogOpenOptions): Promise<string | null>;
    /** Opens the file picker — returns the user-selected path; cancel → null. Security is controlled by the main process */
    openFile(opts?: DialogOpenOptions): Promise<string | null>;
    /** E6#71c: rich-content confirm — the dialog's content = a plugin self-drawn view (content view declarative addressing + opaque payload).
     *  Dialog mechanics match confirm (centered/mask/Esc/focus lock/click-mask-to-cancel); content layout and buttons are drawn by the plugin view
     *  (Modeled after VS Code's "the dialog is the shell's, the content is the plugin's"). title/message as fallback — if the content view fails to resolve,
     *  the shell falls back to a plain-text confirm (the dialog still appears, no silent death). Returns true = confirmed, false = cancelled/closed. */
    confirmContent(options: DialogContentOpenOptions): Promise<boolean>;
  };

  /** E5.7#63: plugin quickPick picker — local bridge inside the pool (zero IPC, rendered by QuickPickHost). A settle of null → undefined */
  quickPick: {
    show(opts: PluginQuickPickOptions): Promise<unknown>;
  };

  /** E5.7#63: QuickPick host rendering bridge — consumed by the pool's QuickPickHost (the shell preload has no such surface) */
  quickPickHost: {
    registerHost(fn: (req: PluginQuickPickRequest, settle: (key: string | null) => void) => void): () => void;
    onShow(cb: (data: PoolQuickPickData) => void): () => void;
    select(key: string): void;
    highlight(key: string): void;
    close(): void;
    itemAction(key: string, actionId: string): void;
  };

  /** E5.7#17: Dialog dumb-render subscription — consumed by the pool's DialogHost (the shell preload has no such surface). Named dialogHost —
   * the dialog namespace is already the plugin-side confirm/alert/open API */
  dialogHost: {
    onShow(cb: (data: PoolDialogData) => void): () => void;
    /** E6#71c: data of the currently open dialog — after the rich-content view mounts, read via dialogHost.current()?.content?.payload
     *  (readable in content mode only; none open / already closed → null). The shell preload has no such surface (a local read inside the pool). */
    current(): PoolDialogData | null;
    /**
     * M1 `AI#5`: **the in-flight dialog list** — "is a confirm/alert currently up, and what is it waiting for".
     *
     * Division of labor with `current()`: `current()` reads **the dumb-render data received by this process** (`open:false` means closed;
     * content already given in full in the form the pool will draw); `pending()` reads **the shell-side DialogService's in-flight requests**
     * (the raw `options` + `kind` + button copy) — the two surfaces ask different facets of the same thing,
     * hence **both are kept**: `pending()` additionally gives "who asked / the rich-content view's pluginId+viewId / how many buttons".
     *
     * 🔴 **The single slot is an honest description of the status quo, not a design goal**: the shell→pool dialog path (`pending` in `src/App/bridges.ts`)
     * carries only one entry at a time; a second `confirm` overwrites the previous settle closure (that Promise never settles —
     * a **pre-existing defect**). M1 only makes it "readable", **without changing Promise semantics** ⇒ this method truthfully reports "the last one opened".
     * An empty array = no dialog up right now.
     *
     * ⚠️ In rich-content confirm mode (E6#71c) **the buttons are drawn by the plugin view** and the shell does not know how many there are ⇒
     * `buttons` is an empty array and `content` gives the view identity — ⛔ do not guess "OK/Cancel" (fabricating data).
     *
     * ⚠️ `buttons`' **order = declaration order** (`resolveDialogButtons` always yields `[confirm, cancel]`), **not the left/right positions on screen**
     * — proven by CDP on 2026-09-28: on screen the secondary button is drawn left and the primary right, while this array always has confirm first.
     * To act, call `confirm()` / `cancel()` by index; ⛔ do not map by visual position.
     */
    pending(): Promise<PoolPendingDialog[]>;
    confirm(): void;
    cancel(): void;
  };

  /** E5.8#37 (Phase 8 type B): floating panel dumb-render subscription — consumed by the pool's FloatingPanelHost (the shell preload has no such surface).
   * Named floatingPanelHost — the panel request API (panel.revealFloating) belongs to PanelAPI; the host rendering bridge belongs to this surface */
  floatingPanelHost: {
    onShow(cb: (data: PoolFloatingPanelData) => void): () => void;
    /** Action return — open-in (open in the main window) / close; settled on the shell side (business semantics re-resolved on the shell side) */
    action(actionId: string): void;
    /**
     * M2 `AI#20`: register the geometry host (called when the pool's FloatingPanelHost mounts). The main-world function is proxied via contextBridge
     * into isolated-world storage, per the `quickPickHost.registerHost` precedent. Returns unsubscribe.
     * ⚠️ The panel renders in the pool ⇒ **the geometry source of truth is in the pool**: dragging / resizing / the `panel.setFloatingBounds` API path
     * all ultimately land on this host (the shell stores no geometry and does no geometry math).
     */
    registerBoundsHost(fn: (req: FloatingPanelBoundsHostRequest) => boolean | PoolFloatingPanelGeometry | null): () => void;
    /**
     * M2 `AI#20`: read the current floating panel geometry (**synchronous** — answered directly in the pool with zero IPC, per the `dialogHost.current()` precedent).
     * Returns the **actually effective** geometry (the real result after clamping / maximizing, not the caller's intended value); **no panel** → `null`.
     *
     * Criterion usage: after `panel.setFloatingBounds({ top: 100, left: 80 })`, call this function to reconcile — `top/left` should equal
     * 100/80 (equal to the clamped values when out of bounds). ⚠️ The shell-side / CLI read outlet is not this function (that is an in-pool surface) but the pool-reported
     * shell mirror: the command `workbench.action.getFloatingPanelBounds`.
     */
    getBounds(): PoolFloatingPanelGeometry | null;
  };
}
