/**
 * Pool QuickPick dumb-render data — E5.7#15 (floating-layer-normalization-design.md §5).
 *
 * Smart→dumb data flow: serialized by the shell's QuickPickService (display-text iron law — everything pushed after shell-side t() resolution);
 * the pool's QuickPickHost is pure rendering + local fuzzy filtering — no @src/core imports (Path B).
 * Actions (select/highlight/close/itemAction) are sent back by key; the shell re-resolves the original item and executes the callback.
 */

/** Inline action button — rendered dumbly by the pool; clicks send back actionId */
interface PoolQuickPickButton {
  /** Action ID — the shell executes onItemAction(item, actionId) */
  actionId: string;
  /** codicon icon name (without the "codicon-" prefix) */
  icon: string;
  tooltip?: string;
}

export interface PoolQuickPickItem {
  /** getKey(item) — the sole key for the shell's action re-resolution */
  key: string;
  /** getSearchText(item) — the pool's local fuzzy matching */
  searchText: string;
  /** Checked marker — ✓ to the left of the label. undefined = no checkmark (generic QuickPicks unaffected); true/false = render a fixed placeholder to keep alignment.
   *  E5.8#32 original meaning = the activated item; from normalization dossier batch 02 N2 onward **both semantics coexist explicitly** (each answers its own question; ⛔ never add a third use):
   *   ① "currently effective item" — theme/language pickers, the panel [+] view picker (✓ = this is what you are using now);
   *   ② "toggle state" — the panel tab's right-click view list (✓ = shown in the tab bar), the sidebar visibility menu (✓ = expanded/visible). */
  checked?: boolean;
  /** Left of the first row — already t()-resolved */
  label: string;
  /** Right of the first row — already t()-resolved. Reserved for **ownership/category/annotation** (plugin · container / category / owning recipe);
   *  🔴 normalization dossier batch 02 N2: **status must not borrow this slot** ("current", "hidden", "activated" go to detail) —
   *  borrowing it would squeeze out the ownership entirely, and since the pool is a dumb renderer the lost information cannot be recovered. */
  category?: string;
  /** Left of the second row — already t()-resolved */
  detail?: string;
  /** Display string — after the shell's formatKeyLabel (e.g. "Ctrl+K Ctrl+T"); ⛔ not the raw registry string — the pool renders a keycap pill (dumb splitting) */
  keybinding?: string;
  /** Inline action buttons */
  buttons?: PoolQuickPickButton[];
}

export interface PoolQuickPickData {
  open: boolean;
  placeholder: string;
  prefix?: string;
  items: PoolQuickPickItem[];
}

/* ── E5.7#63: plugin quickPick API — linkdesk.quickPick.show(opts) → Promise<item | undefined> ── */

/** Plugin-side entry — three fields modeled after the VS Code QuickPickItem (label left of row 1 / description right of row 1 / detail left of row 2) */
export interface PluginQuickPickItem {
  label: string;
  /** Right of the first row */
  description?: string;
  /** Left of the second row */
  detail?: string;
}

/** Plugin-side show() options — minimal v1 surface: items + input placeholder/prefix (buttons/onHighlight deferred until consumers appear) */
export interface PluginQuickPickOptions {
  items: PluginQuickPickItem[];
  placeholder?: string;
  prefix?: string;
}

/**
 * Plugin quickPick request — the shape bridged from preload's show() to the pool's QuickPickHost via a contextBridge function proxy.
 * Local bridge inside the pool (zero IPC): the Promise resolves to the very object from opts.items (identity preserved, not a serialized copy).
 */
export interface PluginQuickPickRequest {
  opts: PluginQuickPickOptions;
}
