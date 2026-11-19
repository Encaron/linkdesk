/** 安装 job 面板段 DTO——自 poolLayout.ts 拆出（文件体积门禁 800 行拆分件，2026-11-20）。 */

/** E6#73d: install job sections — the container of the first two of the panel's three fixed sections (order never re-sorted, §5 I.4) */
export interface NotifSection {
  /** "running" | "queued" — section identity (the pool does not discriminate; used only as a key) */
  key: string;
  /** Section title (shell t(), e.g. "3 in progress", "4 more waiting to install") */
  label: string;
  items: NotifJobRow[];
  /** Explanation for entries folded for exceeding "5 per section" (shell t()) — absent = nothing folded */
  foldedLabel?: string;
}

export interface NotifJobRow {
  /** Row key — jobId (**not** the display name: same-named plugins must stay distinguishable, dossier 18 §7 73d row). */
  id: string;
  pluginId: string;
  /** Display name (resolved shell-side: brought in by the caller, or backfilled from the package manifest after extraction) */
  name: string;
  /** Status glyph codicon class string (⟳ in progress / ○ waiting) */
  iconClass: string;
  /** Status phrase at the right end (already resolved by shell t(), e.g. "Downloading 62%", "Waiting to install") — rendered dumbly by the pool */
  statusLabel: string;
  /** Present only when the download section has a real value → the pool draws a 3px determinate progress bar; absent, nothing drawn (same semantics as NotifItem.percent). */
  percent?: number;
  /** Whether this row can be cancelled — when true the pool renders a [Cancel install] button */
  cancellable?: boolean;
  /** [Cancel install] button copy (shell t()) */
  cancelLabel?: string;
}
