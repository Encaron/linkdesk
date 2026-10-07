/**
 * Main-software update wire contract — E6#57.4 (design: §3 of the repo-internal design dossier on main-software update data flow formats, Chinese docs tree).
 *
 * Produced by the main process UpdateService (`electron/services/update-service.ts`), consumed by the shell renderer `useUpdateState` —
 * a cross-stack protocol; per the serial precedent (E5.7#97) it is homed in this directory: `electron/` and `src/` import the same types,
 * a field rename turns red on both ends under tsc, instead of each side keeping its own copy.
 *
 * 🔴 **Attribution must not collapse into "unknown error"** (07 §3 / 01 §2.3-§2.4): `UpdateErrorCode` enumerates every class —
 * mis-attributing "it is merely a private repository" as `not-found`, or "asset naming drift" as `network`,
 * would leave both the user and the troubleshooter unable to find the real cause (the layer-3.5 lesson).
 */

/** Full description when an update is available — carried by every state from `UpdateState.available` onward */
export interface UpdateInfo {
  /** New version (SemVer, no v prefix) */
  version: string;
  /** Currently running version (`app.getVersion()` — 02 §2.3, the sole runtime source) */
  currentVersion: string;
  /** ISO release date (Release `published_at`) */
  publishedAt: string;
  /** Release notes page URL (GitHub release `html_url`) */
  releaseNotesUrl: string;
  /** Direct installer link (present only after `available` — the check leg can already fetch it; only the download consumes it) */
  downloadUrl?: string;
  /**
   * Installer sha256 (64-char lowercase hex, **the `sha256:` prefix already stripped**).
   * 🔴 **Source = the Release asset's `digest` field** (computed server-side by GitHub) — the API has **no** `checksum` field;
   * reading it by that name is always `undefined` ⇒ every run takes the "absent ⇒ degrade and allow" path ⇒ validation silently fails (release-pipeline dossier §1.5.1).
   */
  checksum?: string;
  /** Installer size in bytes (Release asset `size`) */
  size?: number;
}

/** Download progress — carried by `UpdateState.downloading`, throttled to ≤500ms per message (07 §4.2) */
export interface DownloadProgress {
  /** Bytes downloaded */
  transferred: number;
  /** Total bytes */
  total: number;
  /** 0-100 integer */
  percent: number;
}

/**
 * Six classes for the check leg + five for the download leg + one startup-reset class (01 §2.3 / §2.4 / §2.5).
 * The copy must be mutually distinct — "you are already on the latest version" and "the tag is not SemVer" are two different things; no half-and-half attribution.
 *
 * ⚠️ Not separately `export`ed for now: the only current consumer is this file's `UpdateError.code`, and the knip gate forbids empty exports.
 * When the shell side needs an "error code → copy" mapping (#57.12), take `UpdateError["code"]`, or promote it back to a named export then.
 */
type UpdateErrorCode =
  // —— Check leg (six classes) ——
  /** Unreachable/timeout/proxy not in effect (this leg always goes through main-fetch.ts, E6#76) */
  | 'network'
  /** GitHub 403/429 (`x-ratelimit-remaining: 0`) → "auto-retry later"; not to be reported as a network failure */
  | 'rate-limited'
  /** Repository does not exist / no Release (404) */
  | 'not-found'
  /** Malformed JSON structure / missing `tag_name`/`published_at` */
  | 'invalid-response'
  /** 🔴 Release fetched but no asset matches (naming drift) — **must not be reported as network** */
  | 'asset-missing'
  /** 🔴 `tag_name` is not valid SemVer — **report separately from "no update"**; silently ignoring it would make release incidents invisible */
  | 'version-unparsable'
  // —— Download leg (five classes) ——
  /** sha256 mismatch → delete the file + report an error */
  | 'checksum-mismatch'
  /** 🔴 Release carries no checksum → log it + degrade and allow (do not block the update, 01 §2.4) */
  | 'checksum-unavailable'
  /** Write to disk failed (disk full / no permission) */
  | 'write-error'
  /**
   * 🔴 Transfer interrupted — two sub-cases share one code: ① a download left behind by a process exiting mid-run → after restart attributed `idle + interrupted`,
   * **not reviving `downloading`** (#57.6f); ② this download **broke off halfway** (received < Content-Length, #57.6a).
   * Their user semantics and handling are identical (this attempt failed; download again); splitting into two codes would only make the shell write one identical line of copy twice.
   * ⚠️ Boundary with `network`: cannot connect / hangs until timeout during the **connection phase** = `network`; **already downloading and broke mid-way** = this code.
   */
  | 'interrupted'
  /** Cancelled by the user/system */
  | 'canceled'
  // —— Startup reset (one class, not produced by a leg) ——
  /**
   * 🔴 The last update **failed to install, and the installer is no longer on disk** (computed by the startup reset #57.7a, `update-install.ts`'s
   * `resolveStartupInstall`) — lands on `idle + this code`, `update` preserved.
   *
   * **Why not reuse `interrupted`** (codes split 2026-09-12, fixed in passing beyond this entry's scope): within a leg the two are indeed synonymous (both
   * "this attempt failed; download again"), but **the shell-side handling differs** — this code is **read back from disk at startup** with no initiator,
   * so the "whoever initiates reports" path (`checkForUpdatesAndReport`) can never reach it ⇒ if it were `interrupted`,
   * the user would get **zero notification on next startup** (#57.12 empirically: `initUpdateService` discards `resolution.outcome`,
   * and producers stay silent on `idle` across the board). The shell's transition-driven path **only reports on this code** (`useUpdateNotifications`),
   * so "the download leg's broken stream" and "an unfinished update at startup" are machine-distinguishable, no longer relying on an indirect invariant
   * like "whether `update` is present" that drifts with the implementation.
   */
  | 'install-interrupted';

/** Structured record of one failure — the in-state `lastError` (no throwing, 07 §4.1) */
export interface UpdateError {
  code: UpdateErrorCode;
  /**
   * Human-readable = **i18n key form** (= the original Chinese text, hard constraint 2).
   *
   * 🔴 **Sentences carrying runtime values must be written as lexicon entries + `{{placeholders}}`, with values going through `params`** — concatenating them directly into `message`
   * (e.g. `Download timed out — 30 seconds without data`) makes the whole sentence **forever impossible to become a lexicon entry** (not one character identical), and `t()` can only
   * emit the original Chinese text verbatim ⇒ such sentences stay Chinese in every language (fixed 2026-09-12, fixed in passing beyond this entry's scope).
   * The dividing line: **the sentence skeleton (translatable) goes into `message`; runtime values that only flow in and never out (seconds/byte counts/raw system errors) go into `params`**.
   * Interpolation syntax matches the shell's `t()` (i18next's `{{name}}`).
   */
  message: string;
  /**
   * Actual values for the lexicon entry's placeholders (`{ seconds: 30 }` corresponds to `{{seconds}}` in the entry).
   * Values themselves are **never translated** — raw system errors (`msg(e)`) and HTTP status texts are language-neutral by nature, so pass them as **opaque values**.
   * Omitted (not passed) = the entry has no placeholders; the shell still calls `t(message)` as usual.
   */
  params?: Record<string, string | number>;
}

/**
 * Whether this release-notes payload was **just fetched from the network** or **backed by the local cache** (E6#57.8e).
 *
 * Why a field instead of "the caller already knows": **the offline-fallback path is only assertable with it** —
 * without it, whether "the cache was really used when the network died" could only be guessed indirectly by counting how many times the network stub was called.
 * Incidentally: if the renderer later wants to label an "offline data" note, it now has grounds to (the three states of 05 §2.4 have no such state yet).
 */
type ReleaseNotesSource = 'network' | 'cache';

/** One entry of the left column's version history — **header only, no body** (the body is given only when that version is selected on demand; see below).
 *  ⚠️ **Not exported** (same-file precedent of `UpdateErrorCode` / `WindowBounds`): the only consumer is `ReleaseNotes`'s `historical` below —
 *  the knip gate flags "exported but never imported" red, and that red is correct (if the renderer ever needs to name it separately,
 *  use `ReleaseNotes["historical"][number]`; exporting it then is a two-word change). */
interface ReleaseNotesSummary {
  /** Version number (SemVer, no v prefix; ⚠️ if the release side pushed a non-conforming tag, given verbatim — see `update-release-notes.ts` file header ⑤) */
  version: string;
  /** ISO release date */
  publishedAt: string;
}

/**
 * The full return of one release-notes fetch — E6#57.8e (07 §3 pins the shape + `source` as above).
 *
 * 🔴 **Only the selected version's body is carried** (`body`); the history list gives headers only (`historical`): shipping 30 bodies together
 * is pure waste (GitHub bodies run to thousands of characters) while the user reads one version at a time. This does not hurt the "switch version" experience —
 * the list is already fully in hand; switching versions **does not need another network round** (the bodies were in the same response, just not sent back).
 */
export interface ReleaseNotes {
  /** Where this data came from (see `ReleaseNotesSource`) */
  source: ReleaseNotesSource;
  /** The selected version's number; ⚠️ mismatch with the requested `version` = **the requested version was not in the list and we fell back to the most recent one** */
  version: string;
  /** ISO release date */
  publishedAt: string;
  /** Release body (raw GFM) — the renderer runs it through MarkdownView + sanitize (05 §2.4, the same path as the plugin detail page) */
  body: string;
  /** "View on GitHub" link (Release `html_url`) */
  htmlUrl: string;
  /** Left column's version history (newest first; at most 30 entries, 05 §2.4) */
  historical: ReleaseNotesSummary[];
}

/**
 * Update state machine discriminated union (01 §2.1, nine states).
 *
 * ```
 * uninitialized → disabled (update source unavailable) / idle
 * idle ──check──▶ checking ──new version──▶ available (no update / error → idle)
 * available ──download──▶ downloading ──done──▶ downloaded (failure → idle + lastError)
 * downloaded ──"restart and update"──▶ updating ──quitAndInstall──▶ process exits
 * ready = downloaded's notification state (the "restart and update" toast has been shown)
 * ```
 *
 * 🔴 **`downloaded` has no edge back to idle** (E6#57.12, decided by the user 2026-09-12; the old diagram's
 * `downloaded ──"later"──▶ idle` was **wrong** and has been deleted). The notification's "later" **only dismisses that one notice**;
 * the state stays put — the installer is already on disk waiting to run, and downgrading the state to `idle` would only make the user download again.
 * Two exits: `updating` (clicking "restart and update"), or the startup reset restores it after the process exits (#57.7a).
 * From this follows #57.12g (already landed in `electron/services/update-service.ts`): these two states are **check-immune** —
 * the check leg compares `latest > current`, and a version already downloaded is necessarily still greater than the current one ⇒ every check judges `available`,
 * and the UI would regress from "restart" back to "download update".
 *
 * 🔴 **`downloaded`/`ready` carry a `warning` slot (decided by the user 2026-09-12 ⇒ option (a) "add a warning slot to the state")**:
 * degrade-and-allow cases (`checksum-unavailable` etc. "install as usual, but log it") **must land in this slot**.
 * Previously there was only one `idle.lastError` slot, and **on degrade-and-allow the state goes to `downloaded`** ⇒ implementing the old type as-is
 * would silently drop this record (the release side would never see that it omitted a checksum, zeroing out the intended effect; also an instance of
 * [[snapshot-shadows-truth-bug-class]] ④ "one chance only + failures stay silent").
 *
 * ⚠️ `warning` is not a copy of `lastError`: **`lastError` = this attempt failed** (back to `idle`, with an exit waiting for the user to retry);
 * **`warning` = it succeeded, but there is something the release side should know** (the state proceeds as usual). So it appears only on the "success path",
 * and it **propagates across states**: `downloaded.warning` → (when the shell raises the notice) → `ready.warning`.
 */
export type UpdateState =
  | { type: 'uninitialized' }
  | { type: 'disabled'; reason: string }
  | { type: 'idle'; update?: UpdateInfo; lastError?: UpdateError }
  | { type: 'checking' }
  | { type: 'available'; update: UpdateInfo }
  | { type: 'downloading'; update: UpdateInfo; progress: DownloadProgress }
  /** `warning` = the degrade-and-allow record (e.g. `checksum-unavailable`) — see the 🔴 above, not a failure */
  | { type: 'downloaded'; update: UpdateInfo; warning?: UpdateError }
  | { type: 'updating'; update: UpdateInfo }
  /** The notification state of `downloaded` — `warning` is carried over from `downloaded` (the consumer is the shell, #57.9/#57.12) */
  | { type: 'ready'; update: UpdateInfo; warning?: UpdateError };
