/**
 * Pool floating panel dumb-render data — E5.8#37 (Phase 8 floating panel inside the shell, type B).
 *
 * Smart→dumb data flow (same as DialogService — normalize, don't recreate): the shell's FloatingPanelService bridge serializes panel requests
 * into DTOs and pushes them (display-text iron law — title/action copy already resolved by shell-side t(); the pool renders as-is, zero useTranslation).
 * Content = a plugin view — the DTO carries pluginId/renderPath, and the pool addresses the view registry via PluginComponent to render
 * (the shell holds no renderer — #37 acceptance).
 *
 * State closed loop: the shell pushes {open:false} to drive closing — the pool does not close locally (dumb, I8-11).
 * Exception: maximize (same-button toggle, I8-9) is a purely visual state (CSS 100vw) — the pool toggles locally, zero shell roundtrip;
 * copy/icons for both states are carried by the DTO (zero pool-produced text).
 * Promise settle closures stay in the shell — the pool only sends back the action type (action/actionId); the shell re-resolves business semantics (#38 wiring).
 */

/** Title bar action buttons — rendered by the pool + sent back for the shell to re-resolve business semantics (zero pool semantics, except UI mechanical knowledge).
 *  E5.8#20-c: renamed PoolFloatingPanelButton — same name as poolActions.ts's PoolFloatingPanelAction (IPC round-trip action);
 *  flattening the contract into one file would declaration-merge them into a ghost composite type; the button descriptor uses the Button suffix for disambiguation (contract-family naming convention). */
export interface PoolFloatingPanelButton {
  /** Action id — open-in (open in the main window) / maximize / close; re-resolved by the shell */
  id: string;
  /** Action name already resolved by shell t() — mockup: hover tooltip (open-in expands the full text) */
  label: string;
  /** Built-in icon id — the pool picks the SVG by id (open-in/maximize/restore/close) */
  icon: string;
  /** Local-toggle only (I8-9 maximize→restore on the same button) — icon for the toggled state; absent = not a toggle action (sent back to the shell) */
  toggledIcon?: string;
  /** Copy for the local toggle's switched state (e.g. "Restore") — zero pool-produced text; both states' copy comes from shell t() */
  toggledLabel?: string;
  /** open-in style — icon-only by default, expands to full text on hover (mockup .fp-act.open-in) */
  expandOnHover?: boolean;
}

/** Explicit panel geometry (px) — after I8-5/I8-7 drag/resize, replaces the default centered large-card layout.
 *  M2 `AI#20`: the same shape set through the API path (non-mouse path) via `panel.setFloatingBounds`. */
export interface FloatingPanelBounds {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Readout of `floatingPanelHost.getBounds()` — the **actual** geometry of the pool-side render box + panel identity + maximized state.
 *  "No panel" is not part of this type — the return type is `PoolFloatingPanelGeometry | null`. */
export interface PoolFloatingPanelGeometry extends FloatingPanelBounds {
  viewId: string;
  pluginId: string;
  /** I8-9 maximized (purely visual state, filling the window) — when true the geometry = the full-window box (reported faithfully; ⛔ never report the stale pre-maximize values) */
  maximized: boolean;
}

export type PoolFloatingPanelData =
  | { open: false }
  | {
      open: true;
      /** Panel identity — the shell's FloatingPanelService single-instance semantics adjudicates by viewId (I8-10: same viewId focuses / different viewId replaces) */
      viewId: string;
      /** Title — already resolved by shell t(); the pool renders as-is */
      title: string;
      /** Content plugin — the pool renders via PluginComponent(pluginId, renderPath) (the shell holds no renderer) */
      pluginId: string;
      /** Content view renderPath — addressed via the pool's view registry */
      renderPath: string;
      /** Title bar action buttons (order = render order: open-in / maximize / close) */
      actions: PoolFloatingPanelButton[];
      /** Language-switch copy re-push marker (refreshPanelText) — the pool only re-renders title/actions and skips focus acquisition (I8-8: only the first open takes focus) */
      refresh?: boolean;
      /** M2 `AI#20`: **API path** explicit geometry (pushed via `panel.setFloatingBounds`, one-shot — ⛔ the shell must not store it into
       *  refreshPanelText's draft, otherwise a language-switch re-push would snap the user-dragged panel back to its old spot).
       *  Three-way semantics: **absent** = leave geometry untouched (local state after drag/resize preserved as-is) | **partial fields** = set precisely
       *  (unspecified fields keep current values, same I8-5/I8-7 clamping) | **null** = back to the default centered large card (the pre-drag state). */
      bounds?: Partial<FloatingPanelBounds> | null;
    };

/** M2 `AI#20`: geometry host request — preload forwards the API path to the pool's FloatingPanelHost (the pool is the source of truth for geometry:
 *  the panel renders in the pool, and only the pool knows where it truly is at this moment; the shell stores no geometry ⇒ cannot become a second ruler).
 *  `set` while maximized first exits maximization, then applies ("a set must take effect" — geometry and full-window state are mutually exclusive). */
export type FloatingPanelBoundsHostRequest =
  | { op: "set"; bounds: Partial<FloatingPanelBounds> | null }
  | { op: "get" };

/** M2 `AI#20`: pool-side geometry host implementation — `set` returns "a panel exists and was applied", `get` returns the current render geometry (no panel = null).
 *  Shape modeled after `quickPickHost.registerHost(fn)` (a main-world function proxied through contextBridge into the isolated world for storage). */
export type FloatingPanelBoundsHostFn = (
  req: FloatingPanelBoundsHostRequest,
) => boolean | PoolFloatingPanelGeometry | null;
