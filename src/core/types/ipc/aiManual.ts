/**
 * AI operation manual wire contract—the return body of `app:getAiManual` (AI friendliness M3 · `AI#16`).
 *
 * ## Why the types live here
 *
 * Same rationale as `product.ts` / `update.ts` (those two files' header comments say the same thing):
 * **cross-stack protocol types are consolidated into this directory, and `electron/` and `src/` both import the same copy**—renaming a field makes tsc fail on both ends,
 * instead of each side writing its own copy. Consumption chain = main-process `ai-manual.ts` (produces) → `preload-shell` (forwards) →
 * shell `useAiManual` (assembles the DTO) → pool views (render only).
 *
 * ⚠️ **This type does not enter the plugin contract**: the manual is **data fetching for a shell-internal view** (third example of a shell-private extension; the first two =
 * `app.getProductInfo` / `update.getReleaseNotes*`) ⇒ pool preload does not inject it, `contracts/linkdesk.d.ts`
 * is untouched, and the namespace matrix counts stay unchanged. Rationale in the `buildShellApp()` header comment of `preload-shell.ts`.
 *
 * 🔴 **The `version` field is the reconciliation surface for the "content matches the current version" criterion**: it comes from the main process's `app.getVersion()`
 * (a runtime value—whichever version is installed is the one you get) and is displayed in the view header—an old installer carrying an old manual is exposed on the spot.
 * ⛔ Do not change it to "the version written in the manual": that would turn the very thing being verified into an assumption.
 */

/** One chapter = one `.md` file. `id` is the file name (pool-side chapter switching only recognizes it, no regex parsing) */
export interface AiManualChapter {
  /** File name minus `.md` (e.g. a Chinese-named stem like `03-operate-by-task`)—stable identifier; ⛔ do not use the title as the id (titles change) */
  id: string;
  /** Chapter title: the first `# ` level-1 heading in the body; falls back to the file name if absent */
  title: string;
  /** The chapter's raw markdown (GFM, handed to the pool-side sole md renderer `MarkdownView`) */
  markdown: string;
}

/**
 * Full return body.
 *
 * ⚠️ **No `error` state**: failing to read the manual is **not an exception**; it means "this release shipped without a manual"—
 * expressed as `chapters: []` (same rationale as `PoolAboutData` having no `error` state: a local fs read can only fail
 * because "the file is absent", and "the file is absent" has a definite meaning). The shell renders an empty state and points to the install directory accordingly; ⛔ no throwing, no blank screen.
 */
export interface AiManualPayload {
  /** Current app version (`app.getVersion()`)—the sole proof that "the manual belongs to this version" */
  version: string;
  /** Chapter list, **sorted ascending by file name** (the `00-`/`01-`… file name prefixes are the reading order; no separate sort field) */
  chapters: AiManualChapter[];
  /** Absolute path of the manual root read this time—gives the user a one-line pointer in the empty state (dev and installed paths differ, hence provided by the main process) */
  dir: string;
}
