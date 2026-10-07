/**
 * linkdesk-api bottom panel domain — created in E5.8#34.5 (build the generic API shell ahead of consumers — the new iron rule).
 * The panel namespace surface verbatim. Zero external type dependencies; cross-composed by the aggregator.
 *
 * Semantics (I7-8 reveal): a plugin focuses its bottom panel view — if the panel is hidden, it expands and switches to that view
 * (same mechanism as Ctrl+J); if shown, focus switches to that view. Declarative addressing =
 * contributes.views location:"panel"
 * (#63.7 same origin, zero new registration surface). No-op without crashing when no contributing plugin exists.
 *
 * Semantics (I8-2 revealFloating): in-shell floating panel (type B) — pops a declared view out as a floating panel (E5.8#39.5).
 * Declarative addressing = the ViewContainerService global view index (any view registered via contributes.views,
 * not limited to the panel container). Identity toggle: no panel → open / same view → close (toggle) / another panel → replace.
 * No-op without crashing when the view is undeclared.
 *
 * Semantics (M2 `AI#20` setFloatingBounds): floating panel **geometry** (position/height) can be set precisely —
 * closing the "drag only" gap, the "only mouse path" (the only self-owned feature in class A that is out of reach with no
 * alternative). Fields are set precisely; null = back to defaults; shares the same hidden bounds as dragging/resizing
 * (min height 300 / max = window height - 80 / 6px in-shell clamping) — the API cannot bypass the limits.
 */

import type { FloatingPanelBounds } from "../../types/pool/poolFloatingPanel";

/** Bottom panel namespace surface — modeled after VS Code vscode.window.createTreeView focus / view-promotion semantics */
export interface PanelAPI {
  panel: {
    /** Focus a bottom panel view — if the panel is hidden, it expands and switches to that view; if shown, focus switches. No-op when viewId is not in the panel container */
    reveal(viewId: string): Promise<void>;
    /** In-shell floating panel (type B) — pops a declared view out (I8-2 identity toggle). No-op when viewId is an undeclared view.
     *  E5.8#41.18: optional pluginId compound addressing — when two plugins share the same viewId (dual settings suites coexisting), the plugin side
     *  carries pluginId to hit the target suite precisely (the shell-side Ctrl+, / context menu path already does; a bare viewId with multiple
     *  hits fails loud as a no-op) */
    revealFloating(viewId: string, pluginId?: string): Promise<void>;
    /**
     * M2 `AI#20`: set the geometry of the current floating panel (**non-mouse path** — does not fight dragging; the two paths coexist).
     *
     * `bounds` only carries the fields to change (e.g. only `{ top, left }` moves the position, leaving `height` untouched); `null` = back to
     * the default centered large card (the state before I8-5/I8-7 dragging). No-op when the panel is **not open** (this API only changes
     * geometry; ⛔ it does not open the panel — opening belongs to `revealFloating`).
     *
     * ⚠️ Out-of-range values are clamped by **the same bounds as dragging** (not rejected): `height < 300` → 300;
     * `height > window height - 80` → clamped to the cap; `top/left` clamped into the 6px in-shell margin; `width` is capped only
     * (window width - 12). To read back the **actually effective** geometry, use `floatingPanelHost.getBounds()` (synchronous in-pool
     * answer) or the shell command `workbench.action.getFloatingPanelBounds`.
     */
    setFloatingBounds(bounds: Partial<FloatingPanelBounds> | null): Promise<void>;
  };
}
