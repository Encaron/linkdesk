/**
 * PoolLayout type definitions — E5.6#8a + E5.7#1 (version 2 full-snapshot single layout).
 *
 * Layout protocol shared by the shell and the pool. E5.7 minimal pool: the single Pool receives
 * full layout snapshots, and PoolZoneShell renders conditionally by zone field (Phase 1 was a placeholder skeleton).
 *
 * 🔴 The version: 1 / poolId from the E5.6 design draft was never implemented in code —
 *   verified by the 2026-08-13 audit: zero poolId across the repo, and this file has no version field.
 *   Hence E5.7#1 was "add version: 2 + zone fields"; there is no "remove poolId" to execute.
 *
 * Compatibility: pools ignore fields they do not recognize; the shell can add fields without breaking old pools.
 *
 * 🔥 E5.8#5 two protocol iron laws for pushLayout (the only shell→pool layout channel; violating them tears cross-process state):
 *   1. whole-value checkpoint — every push must carry a complete post-change layout snapshot; bare deltas are forbidden.
 *      Pools must not cache old values for incremental merging (a misaligned merge = the layout forks from the source of truth, unrecoverable).
 *   2. deltas (if incremental needs truly arise in the future) must carry stable ids + ascending-replay determinism — they must not rely on
 *      live-only memory; after a pool crash and rebuild it only gets the last snapshot replayed by the main process, and live-only deltas silently lose updates.
 */

import type { SplitNode } from "../../../core/utils/splitTree";
import type { TitleActionWidget } from "../../api/types"; // E5.8#36.5: titleActions DTO — passed straight through on the declared surface (JSON-serializable)

// ── E5.6#11a ──

/** Sidebar view metadata — serialized from ViewContainerService and pushed to SidebarPool via PoolLayout */
export interface SidebarViewMeta {
  id: string;                             // view ID ("folders" / "search" / "installed")
  title: string;                          // display title
  pluginId: string;                       // _pluginId — PluginComponent uses it to locate the plugin root (resolvePath IPC)
  renderPath: string;                     // normalized URL of _renderPath (dev /@fs | prod linkdesk://) — the pool dynamic-imports it directly (E6#62b)
  role?: "toolbar" | "section";           // defaults to "section"
  order?: number;
  collapsed?: boolean;                    // initial collapsed state declared by the plugin (collapsed: true)
  badge?: string | number;
  titleDescription?: string;
  titleTooltip?: string;
  singleViewPaneContainerTitle?: string;  // replaces containerTitle when mergeHeaderWhenSingle
  minHeight?: number;                     // declared minimum height — PaneSash effectiveMinHeight
  /** E5.8#36.6: view action-area declaration passed through — right side of the sidebar section header (same declaration as #36.5, consumed in two places) */
  titleActions?: TitleActionWidget[];
}

/** E5.7#84: pool render data for a single sidebar container — element of SidebarLayout.containers[] (keep-alive container list) */
interface SidebarContainerLayout {
  containerId: string;
  containerTitle: string;
  mergeHeaderWhenSingle?: boolean;
  views: SidebarViewMeta[];
}

/** Sidebar layout — received only by SidebarPool */
export interface SidebarLayout {
  visible: boolean;
  width: number;
  /** 🆕 E5.8#36.8: which edge the sidebar sits on — consumer of #37.6 dockTo("sidebar", ...) (swap rule: it and rightSidebar always occupy opposite edges).
   *  The pool grid (#37.5) decides from this whether the sidebar lands in the left or right slot. Defaults to "left". */
  edge?: "left" | "right";
  // ── E5.6#11a: container metadata ──
  containerId: string | null;              // "file-explorer" / "marketplace" / "serial-monitor"
  containerTitle: string;                  // "Explorer" / "Plugin Marketplace" / "Serial Monitor"
  mergeHeaderWhenSingle?: boolean;
  views: SidebarViewMeta[];
  /** E5.7#84: keep-alive container list — all sidebar containers (not just the active one) are serialized.
   *  The pool mounts them persistently by containerId and toggles display:none — switching containers never unloads views, so plugin component state is preserved.
   *  A container disappears from the list when its plugin unloads → the pool unloads it naturally (source of truth lives in the shell; the pool caches nothing). Old layouts without this field fall back to single-container rendering. */
  containers?: SidebarContainerLayout[];
  collapsedViews?: string[];              // set of persistently collapsed view IDs — shell loadCollapsedState()
  /** E5.6#11-fix7: shell tells the pool whether the sidebar is collapsed — collapsed = truly gone (#147/#159: no slim strip/▶, grid auto column 0 width) */
  collapsed?: boolean;
  // ── E5.7#10: sidebar UI text pushed with shell-side t() (display-text iron law — the pool renders zero self-produced text) ──
  emptyText?: string;      // empty-state primary text — "No registered views in this container"
  emptyHint?: string;      // empty-state hint — "Install a plugin to add views"
  // ── E5.7#13: drag clamp bounds — shell LayoutEngine dock declarations pushed (the pool clamps locally to match the shell's resizeZone, zero hardcoding) ──
  minWidth?: number;       // drag minimum width — shell dock.minWidth (170)
  maxWidth?: number;       // drag maximum width — shell dock.maxWidth (600)
  // ── backward compatibility ──
  /** @deprecated superseded by views[] — kept for unmigrated code */
  viewId?: string | null;
}

/** 🆕 E5.8#36.8: right sidebar layout — a real zone for the right sidebar (decision 6, consumer of E5.8#36.7 addZone("rightSidebar")).
 *  Mirrors SidebarLayout (same set of consumed fields) but carries **no edge of its own** — the swap rule guarantees sidebar ↔ rightSidebar
 *  always occupy opposite edges, so rightSidebar's edge = the opposite of the sidebar's (derived by the pool grid #37.5, avoiding duplicated literals).
 *  E5.8#37.5 RightSidebarZone real rendering: copy pushed with shell t() (display-text iron law). #159: no ◀/▶ collapse buttons — same as the left sidebar. */
export interface RightSidebarLayout {
  visible: boolean;
  width: number;
  // ── container metadata (same semantics as SidebarLayout) ──
  containerId: string | null;
  containerTitle: string;
  mergeHeaderWhenSingle?: boolean;
  views: SidebarViewMeta[];
  containers?: SidebarContainerLayout[];
  collapsedViews?: string[];
  /** 🆕 E5.8#36.8 + #37.5 + #159: right sidebar collapsed state — derived from width ≤48 (pool); collapsed = the whole zone disappears (same origin as the left sidebar's #147,
   *  no slim strip/▶ — collapse/expand only via the icon bar toggle + the visibility checkbox menu) */
  collapsed?: boolean;
  // ── drag clamp bounds + empty-state copy (same semantics as SidebarLayout) ──
  minWidth?: number;
  maxWidth?: number;
  emptyText?: string;
  emptyHint?: string;
}

/** A tab's representation in the pool — serialized when the shell pushes layout */
export interface PoolTab {
  id: string;
  pluginId: string;
  title: string;
  sourceId?: string;
  /** Tab tooltip copy — **for humans only** (used when present; when absent the pool falls back to `title` + a "double-click to pin" suffix).
   *  🔴 2026-09-27: ⛔ never use `sourceId` as copy — it is the **functional key** for cross-group moves / event addressing / plugin-bound data
   *  (the plugin API `tabs.closeBySourceId` matches on it), and on plugin tabs it is often an internal id like `settings-2` or `serial-monitor-49`;
   *  when HintTip was consolidated it was once printed verbatim into the tooltip. The shell's serializeGroups resolves it on the spot:
   *  file tabs → full path (the original intent of E5#53); everything else → `undefined`. */
  hint?: string;
  dirty?: boolean;
  // 🆕 E5.6#16.5: metadata required for TabBar rendering
  /** Tab icon — IconBarIcon discriminated union (E6#69f/#69g: view tabs = Type-2 identity img; file tabs = file-type icon
   *  codicon/img. The shell's serializeGroups resolves it on the spot; the pool renders dumbly — previously only emoji/img strings existed, so codicon/lucide tabs fell through) */
  icon?: IconBarIcon;
  /** Pinned tab (Modeled after VS Code pinned tabs) */
  pinned?: boolean;
  /** Tab close behavior — from plugin.json tabBehavior.closeBehavior */
  closeBehavior?: "normal" | "confirm" | "blocked";
  /** Singleton plugins (settings/marketplace etc.) — TabBar shows no [×] close button */
  singleton?: boolean;
  /** Shell-internal views (welcome/plugin details/release notes/about/AI manual) — MainPool content area does not render PluginComponent */
  shellRendered?: boolean;
  /** Shell-internal view type — "welcome" | "plugin-detail"; the pool routes to the corresponding component */
  shellType?: string;
  /** Target plugin ID of the plugin-detail view (whose detail page it is) */
  detailPluginId?: string;
  /** E6#30.10b: host plugin ID contributing views to the plugin-detail main area (the active marketplace plugin in factorySlots — it is the one
   *  contributing the render surface, ≠ detailPluginId). The shell's serializeGroups resolves and stamps it on the spot; consumed by the pool host to load contributed modules (resolvePath
   *  needs the contributing plugin's root); no active marketplace plugin → undefined = no contribution. */
  detailContributorId?: string;
  /** E6#30.10b: renderPath of the view contributed to the plugin-detail main area — the _renderPath declared by the active marketplace plugin's contributes.views.main[]
   *  "plugin-detail" entry. Resolved and stamped on the spot by the shell's serializeGroups; consumed by the pool's ShellViewRenderer:
   *  present → dynamic import of the marketplace DetailView; missing/failed to load → the shell's PluginDetailPoolView is the fallback. */
  detailViewRenderPath?: string;
  /** E6#57.13: shell→pool data for the release-notes tab (**the shell thinks, the pool draws** — the shell fetches, attaches here and pushes down; the pool only draws).
   *  ⚠️ Same shape as `detailPluginId`/`detailViewRenderPath` (per-tab payload for shell views) — **not a new paradigm**.
   *  Only the one tab with `shellType === "release-notes"` carries it (at most one per window). */
  releaseNotes?: PoolReleaseNotesData;
  /** E6#57.14: shell→pool data for the about tab — the **second instance of the same rule** as `releaseNotes`
   *  (per-tab payload for shell views, **not a new paradigm**). Only the tab with `shellType === "about"` carries it. */
  about?: PoolAboutData;
  /** M3 AI#16: shell→pool data for the AI operation-manual tab — the **third instance** of the same rule
   *  (per-tab payload for shell views). Only the tab with `shellType === "ai-manual"` carries it (at most one per window). */
  aiManual?: PoolAiManualData;
}

// ── E6#57.13: shell→pool payload for the release-notes tab ──

/** One entry of the left slim-column version history — **display text already formatted by the shell** (display-text iron law: the pool renders exactly what it receives) */
export interface PoolReleaseNotesHistoryItem {
  /** Version number (no v prefix; the "v" shown at display time is formatting, not copy — added by the pool) */
  version: string;
  /** Short date `MM-DD` (sliced from ISO by the shell, **no locale involved** — mockup 03 renders it exactly this way; switching languages must not change it) */
  dateLabel: string;
}

/**
 * Shell→pool data for the release-notes tab — **three-state discriminated union** (05 §2.4: the state is uniquely decided by the fetch result; there is no fourth).
 *
 * 🔴 **The pool makes no decisions of its own**: whatever `state` says, it renders that branch. Not even "loading or ready" may the pool judge by itself
 * (that conclusion belongs to the shell) — the context key push in `#57.11` is another landing point of the same rule.
 *
 * 🔴 **Cache hits never pass through the loading state** (05 §2.4): the shell holds an in-memory cache in the renderer (the module singleton of `useReleaseNotes`),
 * so both "opening it a second time in this session" and "switching to a historical version" land **directly on `content`** and the pool's first frame already has content — no
 * skeleton flash. The skeleton only appears on a **genuinely cold fetch** (first time in this session, and the main-process cache missed too).
 *
 * ⚠️ **Three-frame correspondence** = Frame 3 (loading) / Frame 1 (content) / Frame 2 (empty) of
 * `06-main-software-updates/mockups/03-release-notes-tab.html`.
 */
export type PoolReleaseNotesData =
  | { state: "loading" }
  | {
      state: "content";
      /** Selected version (no v prefix) — if it differs from the requested value, it means "the requested version is not in the list; fell back to the closest one" */
      version: string;
      /** Header subtitle (finished by the shell's `t()`) — e.g. "August 30, 2026 · Stable channel" */
      subtitle: string;
      /** Channel badge text (finished by the shell's `t()`) — "Stable".
       *  ⚠️ The data source is `/releases/latest`, which by GitHub's definition excludes pre-releases ⇒ always the stable channel;
       *  if a preview channel is ever truly added (endpoint change) **this must change with it**, otherwise the badge starts lying. */
      channelLabel: string;
      /** Release body (raw GFM) — the pool renders it through `MarkdownView` (same path as the plugin detail page) */
      body: string;
      /**
       * Target of "View all on GitHub" / "All versions" — the **releases list page** (`github.com/O/R/releases`),
       * not the page of this particular release.
       *
       * 🔴 Why not `htmlUrl` (the main process's `ReleaseNotes.htmlUrl` is the single-release page): all **three** links in mockup 03
       * (Frame 1 header `.rn-actions` "View all on GitHub →", `.rn-all` "All versions → GitHub ↗",
       * Frame 2 `.rn-empty-link` "View on GitHub →") **point to the list page** — the single-release URL is useless for any of them.
       * So the shell pushes the list page derived from `product.updateUrl` (the `listPageUrl` of `useReleaseNotes.ts`)
       * instead of pushing `htmlUrl` down.
       *
       * **Optional**: when `updateUrl` is unavailable (dev has no `product.json`) ⇒ the field is absent ⇒ the pool **does not render** these links
       * (an empty link is worse than no link).
       */
      listUrl?: string;
      /** Left slim-column history (descending, including the selected version) */
      historical: PoolReleaseNotesHistoryItem[];
      /**
       * "Refreshing" phase (04 "release-notes refresh button") — pushed down by the shell; **the pool does not judge it itself** (same rule as `state`):
       * `true` = a refresh is in flight ⇒ the header button spins + is disabled + `aria-busy`, and **the body keeps the old content** (no return to the skeleton).
       * `undefined` = not refreshing.
       */
      refreshing?: boolean;
      /**
       * Refresh-result note (a complete sentence finished by the shell's `t()`; data-bearing text belongs to the shell) — `undefined` = not rendered.
       * Three variants: "Already up to date" / "Found a new version {{version}}…" / "Refresh failed · Showing local cache".
       * Assembled only on the forced pass ⇒ ordinary fetches (version switches/retries) leave no residue.
       */
      refreshNote?: string;
      /**
       * The **full sentence** for the first-launch auto banner (finished by the shell's `t()`, version number included) — `undefined` = no banner.
       *
       * Why a "single sentence" instead of `banner: boolean` + the pool doing its own `t("New version {{version}} detected…")`:
       * the pool's self-produced-text line is **not drawn** here for shell views (modeled after the welcome page — `WelcomePoolView` uses `t()` only
       * for its own few hardcoded labels). A banner sentence containing a version number = data-bearing, and data-bearing text belongs to the shell (same as `subtitle` /
       * `channelLabel`). Incidentally: only the shell knows whether this sentence should appear at all ("the one automatic first-launch show" is the shell's account).
       */
      banner?: string;
    }
  | {
      state: "empty";
      /**
       * 🔴 **This state has exactly one field** — not an omission; the **empty state has nothing to convey**.
       *
       * Every word on mockup 03 Frame 2 (the subtitle "Cannot connect to GitHub", the left slim-column placeholder "No local cache /
       * fetched automatically once online", the body "Failed to load release notes" plus its description, "Retry") is **pure static copy** —
       * it contains no data and varies with nothing beyond version/date/language, so under hard constraint 2 "all UI text goes through `t()`"
       * it belongs to **the pool's own `t()`** (the pool has its own i18n context, same as `WelcomePoolView`).
       * Pushing a static string down from the shell would turn "where translation happens — shell or pool" into a two-place decision.
       *
       * ⚠️ Why not even the "reason": `ReleaseNotes` failure has **only one channel** — the main process converts the error into
       * an `Error(message)` and rethrows; `UpdateLegError.detail.code` (`network` / `rate-limited` /
       * `not-found`) **cannot cross IPC** (`invoke-log.ts`'s `loggedHandle` rethrows as-is; Electron only
       * serializes `message`). So telling "network down" from "GitHub rate-limited" would first require making errors **structured across IPC**,
       * which is main-process/contract-side work, **not something the renderer can patch in**. This field keeps the single generic copy from the mockup.
       * (A related note: no "offline" badge is rendered either — see the 🔴 paragraph at the end of this file.)
       */
      listUrl?: string;
    };

/**
 * 🔴 **One thing abandoned in this entry, recorded here so nobody comes to "fix" it later** (empirically established at E6#57.13):
 * `ReleaseNotes.source` (`'network' | 'cache'`, added at `#57.8e`) **cannot distinguish** the "offline fallback" case from
 * a "normal hit within 24h" — both paths report `cache`. So an "offline data" badge **must not** be rendered from it: that would mislabel the **most common**
 * case (a second open within 24h) as offline. To really build that badge, the main process would have to return an extra "did we go online this time"
 * field (adding a dimension to `ReleaseNotes`), which is **not something the renderer can derive**. The three-state table in 05 §2.4 never had this state anyway.
 */

// ── E6#57.14: shell→pool payload for the about tab ──

/**
 * One row of the about-page field table.
 *
 * 🔴 **`label` also goes through the shell's `t()`** — the only structural difference between this entry and `PoolReleaseNotesData`, and the reason is not "consistency for looks":
 * of the eight labels on the about page (version/commit/date/Electron/Chromium/Node.js/V8/OS), **not one is framework text independent of data**
 * — every row is "the name of this piece of data", the same kind as `channelLabel` ("Stable" = the name of the channel the data came from).
 * The pool's boundary is **"data-bearing text is pushed by the shell; pure framework text is written by the pool"** (header note of `ReleaseNotesPoolView`):
 * what the pool produces itself should be chrome like `t("Copy")` / `t("Check for updates…")` that **contains no field names**.
 *
 * Side benefit (this is where the "fields are extensible = zero architecture change" promised by 06 §4.2 comes true): adding a field = adding one item to the shell-side array,
 * and **the pool side needs not change a single word** — the pool only knows "render as many rows as you are given" and neither knows nor needs to know what "version" means.
 * Conversely, if the pool kept its own label table, adding a field would require synchronized changes in both shell and pool, and the order of the two could drift at any time.
 */
export interface PoolAboutField {
  /** Field name (finished by the shell's `t()`) — e.g. "Commit", "Electron", "Email" */
  label: string;
  /** Field value — displayed as-is, unprocessed by the shell (the **pure** version number from `app.getVersion()`, without a VS Code-style `(user setup)` suffix) */
  value: string;
  /**
   * Presence = the value is a **link** (04 "about page redesign" principle ② "identity/contact/provenance are always clickable"):
   * `mailto:` → the pool renders `<a href>` (the global external-link route `EXTERNAL_PROTOCOLS` includes mailto → openEmail);
   * `https` → external link (`target="_blank"`, the same route hands off to the system browser; the app itself does not navigate away).
   * `undefined` = plain text (machine-produced values like commit hashes / version strings — not clickable, and should not be).
   */
  href?: string;
  /**
   * true = the value is rendered one shade dimmer (`--text-secondary`) — used by the author card's **secondary email** row (04 design §3②: the primary
   * uses link color, the secondary drops a shade; hierarchy expressed by both order and color; same as the mockup's `.mail--secondary`). `undefined` = normal shade.
   */
  secondary?: boolean;
}

/** One card in the about-page card area (04 design §4.1 ③: this version / runtime / author — equal width within the 640 content column) */
export interface PoolAboutCard {
  /** Card title (finished by the shell's `t()`) — e.g. "This version", "Runtime", "Author" */
  title: string;
  /** Rows in the card — text in the card is **left-aligned** (04 decision ①: centered content column ≠ centered rows; key: value pairs must align vertically) */
  rows: PoolAboutField[];
}

/**
 * Shell→pool data for the about tab — **two-state discriminated union** (the 06 §4.2 layout has no third state).
 *
 * 🔴 **The pool makes no decisions of its own** (same as `PoolReleaseNotesData`): whatever `state` says, it renders that branch.
 *
 * ⚠️ **Why there is no `empty`/`error` state**: the about page's data comes from the **local main process** (`app:getProductInfo` reads
 * `product.json` + `process.versions`), not the network — `electron/product.ts`'s `loadProduct()` falls back on missing values and **never throws**
 * (commit/date fall back to `—`, 06 §4.4). So the "fetch failed" state is already absorbed on the main-process side into
 * a content state whose values are `—`; the renderer needs no second degradation surface. The shell only falls back to a same-shaped `content` when
 * `getShellExposed()` is unavailable (non-Electron environment, where the pool view would not be rendered anyway), so the pool is never left on a skeleton.
 *
 * ⚠️ **Two-frame correspondence** = Frame 6 (content) of `06-main-software-updates/mockups/02-update-notification-and-about.html`;
 * `loading` has no mockup frame — it is a **single-frame transition** (data comes from local IPC, not the network); the skeleton is drawn in the content shape
 * to avoid layout jumps (same trade-off as `ReleaseNotesPoolView.LoadingFrame`).
 */
export type PoolAboutData =
  | { state: "loading" }
  | {
      state: "content";
      /** Brand name — `product.nameLong` (the single source of truth is `electron/product.json`; not hardcoded in the view) */
      name: string;
      /**
       * Brand logo URL — resolved by the shell's `getAssetPath("assets/logo.svg")` and pushed down (**the same asset and the same rule as `titleBar.logoUrl`**:
       * the pool does not import core; asset paths are always resolved by the shell).
       *
       * 🔴 **This field is a documented deviation made while "implementing from the acceptance image"**: mockup Frame 6's `.about-logo` hand-drew a
       * rounded blue square + white square (pure placeholder). The real asset `public/assets/logo.svg` is a rounded blue square + "LD",
       * and that file's own header comment says "**replace this file to change the logo — no code changes needed**" —
       * hand-drawing a square here would make that comment a lie for this page, and the same app would end up with two contradictory "LinkDesk logos"
       * (one in the title bar, one on the about page). So the real asset is used: **one file, one rule for the brand logo across the whole repo**.
       */
      logoUrl: string;
      /** HERO version pill (04 design §4.1: the version was moved from the field table next to the name — why this page was opened should be visible at a glance) */
      version: string;
      /** HERO tagline (a complete sentence finished by the shell's `t()` — decision ⑤ copy "one container for all the ways you work"; it is a label and must be translatable) */
      tagline: string;
      /**
       * Card area (04 design §4.1 ③: three equal-width cards inside the 640 content column) — assembled by the shell; the pool only `map`s.
       * The author card being **entirely absent** = `product.author` has an invalid shape (fallback: skip the whole card, not render a screen of `—`) ⇒ 2 or 3 cards.
       */
      cards: PoolAboutCard[];
      /**
       * Footer copyright line (a complete sentence assembled on the shell side — `© ${year} ${product.author.copyrightHolder} · MIT License`).
       * `undefined` = not rendered (author block absent ⇒ the copyright line has no named holder; it lives and dies with the author card).
       */
      footerCopyright?: string;
      /**
       * Target of the footer's "View source on GitHub" — derived from `updateUrl` (owner/repo segments → `github.com/O/R`,
       * **never hardcoding the repo URL**; same derivation as `useReleaseNotes.listPageUrl()`); `undefined` = not rendered (same "an empty link is worse than no link").
       */
      repoUrl?: string;
    };

// ── M3 AI#16: shell→pool payload for the AI operation-manual tab ──

/** One manual chapter — **fields mirror `AiManualChapter` in `src/core/types/ipc/aiManual.ts`**.
 *  ⚠️ Why not import that type directly: the pool view lives at **render time**, while `types/ipc/aiManual.ts` is a
 *  **cross-context wire contract** (imported by both the main process ↔ shell preload ends). Between the pool and it there is also one handoff by the shell
 *  (`useAiManual` assembles the DTO) — following the existing practice of `PoolReleaseNotesHistoryItem` toward `ReleaseNotes`:
 *  the shell **copies the wire shape as-is** into a pool shape; two banks, each evolving independently (not duplicate definitions but each bank's own type surface). */
export interface PoolAiManualChapter {
  /** Chapter id — filename minus `.md` (`03-by-task`). **Stable identifier**: navigation selection state and keys use it; ⛔ never use the title as the id
   *  (titles change, and selection state would be lost). */
  id: string;
  /** Chapter title — the shell parses it from the first `# ` in the body (falls back to the id when parsing fails). **Data, not copy**: the manual body exists only in Chinese,
   *  ⛔ never passed through `t()` (switching languages must not change the manual's content — the manual is a document, shipped as-is with the package). */
  title: string;
  /** Chapter body markdown (GFM) — handed to the **sole md renderer** `MarkdownView`; the pool does not parse it itself. */
  markdown: string;
}

/**
 * Shell→pool data for the AI operation-manual tab — **three-state discriminated union** (same shape as `PoolReleaseNotesData`).
 *
 * 🔴 **The pool makes no decisions of its own** (family iron law): whatever `state` says, it renders that branch.
 *
 * ⚠️ **`empty` covers two origins, deliberately**: "this build ships without the manual" (`chapters: []`; the main-process side
 * `ai-manual.ts` does not throw) and "unavailable outside the shell" (vitest / pure preview ⇒ `getShellExposed()` is undefined).
 * To the reader they are the same thing: **there is nothing to read here**, and the line below gives the directory where the manual **should** live for self-inspection.
 * The only difference is `dir`: the main process's reply carries the real path; when unavailable it is an empty string ⇒ the view skips that line (not rendering an empty path).
 */
export type PoolAiManualData =
  | { state: "loading" }
  | {
      state: "content";
      /**
       * `app.getVersion()` — **the sole proof that "this manual belongs to this version"** (`AI#16` criterion ②: in the installed build the manual is reachable
       * **and its content matches the current version**). The shell renders it explicitly next to the title so users/maintainers can verify.
       * 🔴 It comes from **the main process's `app.getVersion()`**, not the version number inside the manual body — the body's is human-readable narrative and lags behind.
       */
      version: string;
      /** All chapters, **sorted ascending by filename** (`00-`/`01-` prefixes are the reading order; the main process has already sorted them; the pool does not re-sort) */
      chapters: PoolAiManualChapter[];
    }
  | {
      state: "empty";
      /** Absolute path where the manual **should** live (main-process resolution) — used to point the way in the empty state; empty string = even the path is unknown ⇒ skip that line */
      dir: string;
    };

/** Split group — each group occupies one flex area containing N keep-alive tabs */
export interface PoolGroup {
  id: string;
  flex: number;
  activeTabId: string;
  tabs: PoolTab[];
}

/** View types creatable via [+] — computed by the shell from getTabCreatableViews() at pushLayout; W1: icon/iconSource = pre-resolved by the shell's pickIdentityArt() (same source as the tab bar/marketplace); undefined ⇒ the pool falls back to emoji */
export interface CreatableViewMeta {
  pluginId: string;
  label: string;
  icon?: string; iconSource?: "codicon" | "svg" | "url" | "lucide"; // union identical to plugin.schema.json iconSource (contract generation source)
}

// ── E5.7#1: layout zone fields ──

/** Menu item — already resolved on the shell side (display-text iron law: label already t()'d; the pool renders dumbly). Shared by the titlebar dropdown and the ☰ hamburger. */
export interface PoolMenuItem {
  /** Display label — shell t(label ?? command.title ?? command) */
  label: string;
  /** Command ID executed on click — "" for parent items without a command (the hamburger does not flatten parent items; clicking is a no-op) */
  command: string;
  /**
   * E6#57.10: secondary group name within the menu — the render layer cuts separators by it (ContextMenu semantics: a line between adjacent items of different groups).
   * Only serialized when present (no grouping = a single fallback `__default` group, no lines). Display-text iron law: the pool only compares strings, never interprets semantics.
   * ⚠️ A group on a submenu's children is replaced by the parent item's group by ContextMenu (mapChildren semantics) — grouping only takes effect on **top-level menu items**.
   */
  group?: string;
  /** Shortcut text (after formatKeyLabel) — shown by **both** the top bar and the hamburger (2026-10-04 restored top-bar keycaps); absent when unbound */
  shortcut?: string;
  /** E5.8#148: checked state of the current item (√ in visibility menus) — the shell's buildTitleBarMenuGroups/hamburger serialize via resolveVisibilityChecked
   *  (zone visible = ✓). Display-text iron law: the pool renders the raw value dumbly; the shell only pushes a boolean. */
  checked?: boolean;
  /** Submenu — titlebar: only parent items with command+children carry it; hamburger: group label containers are kept as parent items with members folded in (2026-10-04) */
  children?: PoolMenuItem[];
}

/** Menu group — titlebar: each group = one top-bar button (e.g. "File", "View"); hamburger: a grouped section */
export interface PoolMenuGroup {
  /** Group name — sorting/addressing key */
  group: string;
  /** Group display label — shell t(first item's label ?? group) */
  label: string;
  items: PoolMenuItem[];
}

/** Title bar slot button — declared by plugin contributes.titleBar (when-clauses already filtered by the shell) */
export interface TitleBarSlotButton {
  command: string;
  /** codicon class name or image path — **mutually exclusive with `label`**: when a label is present the pool renders a text button and this field is ignored */
  icon?: string;
  /** Tooltip — already t()'d on the shell side (the command reports its own title, falling back to the command id) */
  title: string;
  /**
   * E6#57.11: button text — **the final string already resolved on the shell side** (`$` context key references have been substituted,
   * static literals have been through `t()`). The pool is a dumb renderer: it renders what it gets — no evaluation, no translation, no `$` recognition.
   * Present ⇒ render a full-text button; absent ⇒ take the icon branch.
   */
  label?: string;
}

/** Title bar layout — consumed by Phase 2 #5 TitleBarZone */
export interface TitleBarLayout {
  title: string;
  /** Logo asset URL — resolved by the shell's getAssetPath (Path B: the pool does not import core) */
  logoUrl: string;
  menuBarVisible: boolean;
  /** Menu bar data — pushed after the shell groups/flattens/translates */
  menuGroups: PoolMenuGroup[];
  /** Plugin-contributed slot buttons (left/right) */
  slots: { left: TitleBarSlotButton[]; right: TitleBarSlotButton[] };
  /** Window control tooltips — display-text iron law: pushed after shell t() resolution (E5.8#46.18: pin/unpin sticky two states) */
  windowControls: { minimize: string; maximize: string; restore: string; close: string; pin: string; unpin: string };
}

/** Pool-side icon — serialized by the shell (the pool does not import pluginLoader; Lucide names are mapped to components by the pool); shared by the icon bar and the tab bar */
export type IconBarIcon =
  | { kind: "lucide"; name: string }              // E5#100 Lucide first
  | { kind: "codicon"; name: string; color?: string } // codicon CSS class (optional per-icon color, E6#69g)
  | { kind: "img"; src: string }                  // linkdesk:// protocol URL / data URI
  | { kind: "emoji"; text: string };              // fallback emoji

/** Icon bar entry — serialized from the shell's viewRegistry (pluginId + icon + name + location) */
export interface IconBarItem {
  pluginId: string;
  icon: IconBarIcon;
  /** tooltip / aria-label — shell t(manifest.name) */
  label: string;
  location: "top" | "bottom"; // main column / bottom fixed group — purely geometric; ⛔ has nothing to do with "is it the gear" (see owned for the gear)
}

/** Shell-owned buttons — belong to the shell, from no plugin (today only the gear). */
export interface IconBarOwnedButton {
  id: string; // stable identity — the pool renders it as data-owned-id (⛔ not data-plugin-id, which would be treated as a drop target)
  icon: IconBarIcon; // shell-owned asset (pushed down after shell getAssetPath resolution)
  label: string; // tooltip / aria-label — resolved by shell t()
  location: "bottom";
  menuId: string; // id of the menu slot to pop up on click (the pool renders dumbly; menu items are still pushed by the shell's MenuRegistry)
}

/** Icon bar layout — consumed by Phase 2 #6 IconBarZone */
export interface IconBarLayout {
  icons: IconBarItem[];
  /** Shell-owned buttons — rendered by the pool at the end of the bottom group, always visible/undraggable/excluded from iconOrder. ⛔ never stuff them into `icons` (that whole array is on the drag and persistence paths; sub-folder 01-design §4); required: omitting it fails tsc */
  owned: IconBarOwnedButton[];
  /** Active icon — the plugin owning the current sidebar container (not lit when the sidebar is collapsed/has no container; same double guard as the shell's isActive) */
  activePluginId?: string;
  /** E3f #52h: ☰ hamburger visible — menuStyle hamburger/both */
  hamburgerVisible: boolean;
  /** Navigation aria-label — shell t("Navigate") (display-text iron law) */
  navLabel: string;
  /** ☰ dropdown — shell MenuRenderer showGroups+showKeybindings+checkWhen semantics: group label containers are kept as parent items with members folded in (2026-10-04); pushed only when hamburgerVisible */
  hamburger?: {
    /** ☰ tooltip — shell t("Menu") */
    title: string;
    groups: PoolMenuGroup[];
  };
}

/** Bottom panel view metadata — serialized from the panel view registry */
export interface PanelViewMeta {
  id: string;
  title: string;
  pluginId: string;
  /** E5.7#63.7: view render entry path — resolved by the loader (_renderPath); the pool's PluginComponent dynamic-imports it.
   *  Same as ShellViewMeta (sidebar contribution); panel views have zero special channel. */
  renderPath: string;
  /** E5.8#36.5: view action-area declaration passed through — rendered to the right of the PanelZone tab bar for the active view (no declaration → blank right side) */
  titleActions?: TitleActionWidget[];
}

/** E5.8#34: container switcher dropdown item — includes hidden views + visibility/active markers (mockup frame 2 decision) */
export interface PanelSwitcherItem {
  viewId: string;
  /** View name — already resolved by shell t() (display-text iron law) */
  title: string;
  /** Owning plugin ID — sub label (e.g. "demo-plugin") */
  pluginId: string;
  /** Current visibility — ✓ checked = visible */
  visible: boolean;
  /** Whether this is the active view */
  active: boolean;
}

/** E5.8#34: container switcher dropdown group — dd-group container title + dd-item list */
export interface PanelSwitcherGroup {
  containerId: string;
  /** Container title — already resolved by shell t() */
  containerTitle: string;
  items: PanelSwitcherItem[];
}

/** Bottom panel layout — consumed by Phase 5 #21 PanelZone */
export interface PanelLayout {
  visible: boolean;
  height: number;
  /** 🆕 E5.8#36.8: panel dock edge — consumer of #37.7 dockTo (panel position). Top/bottom = horizontal band (align controls column span);
   *  left/right = vertical strip between the main area and the corresponding sidebar (5-band layout). Defaults to "bottom". */
  edge?: "bottom" | "top" | "left" | "right";
  /** 🆕 E5.8#36.8: panel horizontal alignment — consumer of #37.7 setAlign. Geometry is derived by the pool grid (#37.5); the shell only pushes config.
   *  center=main-column width / left=extends under the left sidebar / right=extends under the right sidebar / justify=full width. Defaults to "center". */
  align?: "left" | "center" | "right" | "justify";
  /** 🆕 E5.8#36.8: panel width — used when edge∈{left,right} (strip width); top/bottom still use height. Defaults to 300. */
  width?: number;
  activeViewId: string;
  views: PanelViewMeta[];
  // ── E5.7#21 + #37.5: drag clamp bounds — same as #13 (shell LayoutEngine dock declarations pushed; zero hardcoding in the pool).
  //   Axis-aware: horizontal bands (edge∈{bottom,top}) use minHeight/maxHeight; vertical strips (edge∈{left,right}) use minWidth/maxWidth. ──
  minHeight?: number;
  maxHeight?: number;
  /** 🆕 E5.8#37.5: drag min/max width for vertical-strip panels (left/right) — pushed from shell dock.minWidth/maxWidth */
  minWidth?: number;
  maxWidth?: number;
  /** E5.7#63.7: [+] button tooltip — pushed as shell t("New panel view") (display-text iron law; no panel:createView listener in the shell = safe no-op) */
  createTooltip?: string;
  /** E5.8#34: container switcher dropdown DTO — lists all views per container (including hidden), mockup frame 2 */
  switcher?: PanelSwitcherGroup[];
  /** E5.8#34: empty-state primary text — pushed as shell t() when all views are hidden / none contributed */
  emptyText?: string;
  /** E5.8#34: empty-state guidance — pushed as shell t() like emptyText */
  emptyHint?: string;
  /** 🆕 E5.8#45: panel can detach (PanelZone ⤢ button visibility) — when true, render the detach button; clicking emits "panel:detach" (handled by the shell's detachPanel)
   *  — after detaching, the drift window renders this panel exclusively (main area gets an empty placeholder I9-13); built-in false for the drift window (the panel is already outside; no need to detach again) */
  detachable?: boolean;
  /** 🆕 E5.8#45: ⤢ button tooltip — pushed as shell t("Panel in its own window") (display-text iron law) */
  detachTooltip?: string;
}

/** Status bar entry — serialized from the shell StatusBar's three sources (contributed/dynamic/event) + shell fixed items (display-text iron law: already resolved by shell t()).
 *  E5.8#20-c: renamed to PoolStatusBarItem — same name as api/types.ts's StatusBarItem (manifest contribution type);
 *  flattening the contract into one file would declaration-merge them into a ghost composite type (pluginId would become required); the pool line uses the Pool prefix for disambiguation. */
export interface PoolStatusBarItem {
  id: string;
  pluginId: string;
  /** codicon icon name (no codicon- prefix — the pool adds it) */
  icon?: string;
  label: string;
  title?: string;
  align: "left" | "right";
  /** Command ID executed on click */
  onClick?: string;
  /** Custom-drawn status bar component marker — the normalized URL (E6#62d: computed as ViewPluginEntry.statusBarRenderPath at loader registration;
   *  the shell reads it and sends the marker) of plugins declaring appearsIn.statusBar → the pool dynamic-imports directly by URL (serial-monitor connection light).
   *  Present = the custom component replaces all static entries of that plugin; absent = a normal entry. */
  componentRenderPath?: string;
  /** Leading divider — shell StatusBar render semantics (every item except the first in the left zone; except the first within a group in the right zone) */
  dividerBefore?: boolean;
}

/** Notification action — serialized from the shell's ToastAction (onClick is a shell-side closure — the pool sends the click back for the shell to execute) */
interface NotifAction {
  label: string;
  isPrimary?: boolean;
  /**
   * M1 `AI#2`: the command + arguments executed on press (the shell's `executeCommand(command, ...args)`).
   *
   * Read surface — an AI reading the DTO via the contract can answer "what is in the button / which command to run / what happens after running",
   * and **actually run it by calling `commands.executeCommand` accordingly** (the same command path as a manual click).
   * ⚠️ The pool's **click path is unchanged**: the panel still sends back the positional index and the shell-side closure executes it (closures are not serializable).
   * Absent = this button has no command (clicking only closes the notification) — same origin as the optional `PluginToastAction.command` in the contract.
   */
  command?: string;
  /** Command arguments — paired with `command`; meaningless when `command` is absent */
  args?: unknown[];
}

/** Notification entry — already resolved on the shell side (icon class/time/source label/actions all done shell-side) */
interface NotifItem {
  id: string;
  /** Full codicon class string (e.g. "codicon codicon-error notif-severity-error") */
  iconClass: string;
  message: string;
  /** Shell formatTimeAgo (i18n t()) */
  timeLabel: string;
  /** Shell t("Source: {{source}}") — absent when there is no source */
  sourceLabel?: string;
  actions: NotifAction[];
  /** E6#72c: progress-type notification — the pool draws a 3px progress line from this (absent = not a progress notification, nothing drawn).
   *  progress is passed straight through the shell's toast store (the progress flag of pushToast/updateToast). */
  progress?: boolean;
  /** E6#72c: determinate percentage 0-100 — when present, draws a fixed-width fill; when absent, an indeterminate sweep (same semantics as the original E3e).
   *  The pool clamps on its own when rendering (the shell makes no guarantees — the contract is lenient; malformed values must not break the layout). */
  percent?: number;
  /**
   * M1 `AI#6`: wake flag (**read-only passthrough** of the E6#73b whitelist) — whether this notification is **allowed** to pop the panel out.
   *
   * 🔴 **Always present** (`false` also carries information: it is the answer to "this one did not pop", see the R5-4 trade-off). From it an AI answers
   * the "because of what" question of the toast six questions: `wake:true` = one of the four whitelist categories (a user-initiated install job /
   * a job terminal state / a plugin-initiated non-progress notification / a shell-produced entry that should pop), `wake:false` = explicitly silenced (progress types, etc.).
   * ⚠️ The sole criterion is the shell-side `notif.ts` `shouldWake` (`wake === true`) — this field is its readout outlet,
   * **not** a second criterion; ⛔ never regress this into an `isImportantNotif` catch-all (dossier 18, item ㉓).
   * ⚠️ "Minimized" **carries no mute authority** — the wake-back criterion has no "and not minimized" clause (adding one would make terminal states unwakeable, violating R5-5).
   */
  wake: boolean;
  /**
   * M1 `AI#6`: auto-dismiss duration (ms, `0` = never auto-dismiss). Passed straight through the shell's toast store — `pushToast` always fills it.
   * Same-source criterion as `persistent` (`ttl <= 0` ⇒ persistent, see `derivePersistent` in toast.ts).
   */
  ttl?: number;
  /** M1 `AI#6`: long-lived (never auto-dismisses; waits for a manual × click). Field present only when true — same default convention as `progress`. */
  persistent?: boolean;
}

/** Notification group — the shell NotificationCenter's buildSourceGroups (grouped by the first segment of source + unread sorting) */
interface NotifGroup {
  key: string;
  /** First segment of source, or t("Other") */
  label: string;
  unread: number;
  items: NotifItem[];
  /** E6#73f (S3/A6): explanation copy for entries folded away because this group exceeded the "5 per source" cap (already resolved by shell-side t(),
   *  rendered dumbly by the pool — same "display-text iron law" as timeLabel/sourceLabel/clearLabel).
   *  Absent = nothing was ever folded (contract leniency — behavior unchanged when old snapshots/test doubles omit this field; the line is not rendered). */
  foldedLabel?: string;
}

/**
 * E6#73d: a row for an install job — the **only** row shape of the panel's "In progress / Waiting to install" two sections (dossier 18 §5 I.4).
 *
 * **Why the results area is not here**: install terminal states (success / failure / installed but missing dependencies) are announced by the existing toasts
 * (success = the sole outlet of the lifecycle consumer; failure = the settle failure toast with [Retry], see 73h/73e);
 * the results area is still grouped by source (`NotifGroup`). Job rows appear only in the two sections "not yet resulted" —
 * one install is always visible in exactly one place, never "installed twice".
 */
interface NotifJobRow {
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

/** Notification center data — serialized on the shell side (unread count/copy/grouping all done shell-side) */
export interface NotifLayout {
  unread: number;
  /** Bell tooltip — t("{{count}} notifications") / t("Notifications") */
  bellTitle: string;
  panelTitle: string;
  /** E6#73a: header "Clear completed" button copy — clears only old messages that **have results and are read**; the panel stays open and in-progress items are untouched. */
  clearLabel: string;
  /** E6#73a: header "Minimize" button copy — the **only** action that closes the panel (semantics = collapse; nothing is lost). */
  minimizeLabel: string;
  emptyLabel: string;
  dismissTitle: string;
  /** E6#73d: header summary ("3 in progress · 4 more waiting to install") — **absent when there are no install jobs**.
   *  ⚠️ Reports only the **in progress / waiting** two numbers: never "N/M completed" — whether something got installed is not judged by a progress bar disappearing
   *  (explicitly forbidden in dossier 18 §7 73d row). */
  summaryLabel?: string;
  /** E6#73d: the two install-job sections (in progress → waiting to install), fixed-ordered before the results area. Absent = no installs in flight (these two sections are not rendered). */
  sections?: NotifSection[];
  /** E6#73d: fixed title of the third section "Results" (§5 I.4: the three sections never re-sort).
   *  Result **rows** are not here — they are the existing toasts grouped by source (see the NotifJobRow comment);
   *  this field only provides the fixed title above that area. Absent = no install activity (the title is not rendered, avoiding a spurious extra line in pure-notification scenarios). */
  resultLabel?: string;
  /** Count at the right end of the third section's title ("1 failed · 3 completed") — counts **install job terminal states**, not rows on the panel:
   *  rows get TTL-collected/folded by source; counting them would make the summary jump with unrelated actions (the sample in dossier 18 §5 I.4 is exactly this count). */
  resultSummary?: string;
  groups: NotifGroup[];
  /** E6#72d: auto-expand request — true when the shell decides "an important unread notification exists and the panel is currently closed".
   *  The pool only does a **false→true edge trigger** (opens the panel); it does not re-act while true persists;
   *  absent = no auto-expand (contract leniency — behavior unchanged when old snapshots/test doubles omit this field). */
  autoOpen?: boolean;
}

/** Status bar layout — consumed by Phase 2 #8 StatusBarZone */
export interface StatusBarLayout {
  items: PoolStatusBarItem[];
  /** Chord hint — complete string built by the shell's CHORD_CHANGED (key names are technical identifiers, not i18n) */
  chordLabel?: string;
  /** Notification center — serialized from the shell's toast store (panel open/close/clear/actions sent back for the shell to execute) */
  notif: NotifLayout;
}

/**
 * PoolLayout v2 — under E5.7 the single Pool receives full layout snapshots.
 * titleBar is always present (window chrome — the pool always renders it); iconBar/sidebar/statusBar/panel/rightSidebar are optional —
 * the main pool always pushes the full set; detached windows (E5.8#43-2 window-mode strategy table) push only the titleBar+groups subset (the pool renders conditionally by field; no empty columns/bars).
 */
/**
 * 04 "hover hint system" piece 1: command table — `commandId → { title, keybinding }`, feeding `data-hint-command`'s automatic copy and shortcut completion.
 *
 * **Must share a source with the menu**: today the menu reads "registry + formatKeyLabel" from `usePoolSync/titlebar.ts`;
 * if the hint bar pulled its own copy (the pool querying the registry again) ⇒ the same command would show different shortcuts in two places
 * (memory `two-rulers-one-caliber`: implementing the same judgment twice = false reds invalidate true reds).
 * ⇒ the shell's `usePoolSync/hints.ts` computes it once and pushes it down; the pool **renders dumbly** (display-text iron law).
 * `keybinding` is a **shell-formatted** string (`"Ctrl+K Ctrl+T"`) — the pool does not import `src/core/*` (Path B).
 */
export type PoolCommandHints = Record<string, { title: string; keybinding?: string }>;

export interface PoolLayout {
  version: 2;
  titleBar: TitleBarLayout;
  /** Icon bar — absent = the pool does not render the zone (detached-window subset; the main pool always pushes) */
  iconBar?: IconBarLayout;
  /** Sidebar — absent = the pool does not render the zone (detached-window subset; the main pool always pushes) */
  sidebar?: SidebarLayout;
  /** E5.8#36.8: right sidebar real-zone layout — RightSidebarLayout (edge derived as the opposite of the sidebar's; carries no edge of its own) */
  rightSidebar?: RightSidebarLayout;
  groups: PoolGroup[];
  /** E5.8#30.15 (P5): focused panel id — clicking panel blank space / set via tabs (the shell's reduceFocusGroup/FocusTab).
   *  Pool-side consumption: accent focus ring + isActive single-focus judgment (tab.id === activeTabId && group.id === activeGroupId). */
  activeGroupId?: string;
  /** E5.6#16.7: recursive split tree — rendered recursively by MainRenderer, replacing the flat groups.map.
   *  leaf = a single GroupPane, branch = a horizontal/vertical flex container. */
  root?: SplitNode;
  /** E5.6#16.7k-3: list of views creatable as tabs — the dynamic menu of the pool GroupTabBar [+] button.
   *  Empty array = [+] offers no creation menu (detached window I9-6); absent = the pool falls back to the welcome page */
  creatableViews?: CreatableViewMeta[];
  panel?: PanelLayout;
  /** Status bar — absent = the pool does not render the zone (detached-window subset; the main pool always pushes) */
  statusBar?: StatusBarLayout;
  /** 04 "hover hint system" piece 1: master switch for the hint bar (mirror of `app.hint.enabled`).
   *  Absent/undefined = **on** — a detached window or a missing push must not mean "no hints anywhere in the app just because this field is missing". */
  hintEnabled?: boolean;
  /** 04 "hover hint system" piece 1: command table — source of the automatic copy and shortcuts for `data-hint-command`. Window-agnostic ⇒ always pushed. */
  commands?: PoolCommandHints;
}
