/**
 * Pool Dialog dumb-render data — E5.7#17 (floating-layer-normalization-design.md §7).
 *
 * Smart→dumb data flow: the shell's DialogService bridge (registered by the renderer) serializes options into a DTO and pushes it
 * (display-text iron law — button copy already resolved by shell-side t(); the pool renders as-is).
 * The Promise's resolve closure stays in the shell — the pool only sends back the action type (confirm/cancel); the shell settles.
 */

export type PoolDialogData =
  | { open: false }
  | {
      open: true;
      title: string;
      message: string;
      /** Already t()-resolved on the shell side — the pool renders as-is */
      confirmLabel?: string;
      cancelLabel?: string;
      /** Alert mode — only the OK button; no cancel/Escape/backdrop close */
      isAlert: boolean;
      /** E6#71c rich content slot — replaces title/message/default-button rendering when present (the dialog mechanics are unchanged:
       *  centering/overlay/Esc/trap/click-overlay-cancel are still provided by DialogHost). Content = a plugin view —
       *  the shell holds no renderer; the pool mounts it via PluginComponent (modeled after the FloatingPanel DTO). payload is opaque —
       *  the shell does not interpret it and the pool holds it as-is; the content view reads it via window.linkdesk.dialogHost.current(). */
      content?: {
        pluginId: string;
        /** Pool view registry addressing key — attached at loader runtime (ViewContainerService._renderPath) */
        renderPath: string;
        /** Opaque serialized payload — travels with the open parameters through shell→back to pool (structured clone); used by the content view to fetch data */
        payload?: unknown;
      };
    };

/**
 * M1 `AI#5`: a readable projection of **pending dialogs** — "is a confirm/alert up, and what is it waiting for".
 *
 * 🔴 Relationship to `PoolDialogData`: that one is the **dumb-render payload** (the pool draws from it); this one is the **answer to "what is being waited on now"**
 * (reads the pending options registered in `DialogService`). Their shapes are deliberately same-origin but they are **not the same channel**:
 * that one goes over the `pool:dialog` direct push; this one is pulled on demand via `plugins:call("getPendingDialogs")`.
 *
 * Consumption surface = `window.linkdesk.dialogHost.pending()`.
 */
export interface PoolPendingDialog {
  /** `"confirm"` = cancellable (Escape/overlay click); `"alert"` = OK only (same source as `PoolDialogData.isAlert`) */
  kind: "confirm" | "alert";
  title: string;
  message: string;
  /**
   * Button copy — **already resolved by the shell per the display-text iron law** (explicit `confirmLabel`/`cancelLabel` take priority, otherwise i18n defaults;
   * the **same implementation** as the push-side `bridges.ts`, see `DialogService.resolveDialogButtons`).
   * `kind:"confirm"` → 2 entries (OK, Cancel); `kind:"alert"` → 1 entry (OK).
   * ⚠️ In rich-content mode (`content` present) the buttons are drawn by the plugin view itself ⇒ **empty array** (⛔ never guess OK/Cancel).
   */
  buttons: string[];
  /** E6#71c rich-content confirmation — content = a plugin's self-drawn view. Gives the **identity** (not renderPath: that is the pool-internal addressing key,
   *  whereas this surface asks "what is the shell waiting for" from inside the pool); ⛔ no payload (the opaque payload can be large and is useless for reading "what is being waited on"). */
  content?: { pluginId: string; viewId: string };
}
