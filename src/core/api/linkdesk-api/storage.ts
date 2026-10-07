/**
 * linkdesk-api storage domain — the "open cache directory" settings row (04-software-updates/shipped/settings-page-open-cache-directory 3.3).
 * 🔴 **Shell-side only** (the pool preload does not inject it — consumers are the handlers of the settings page's action/status
 * commands, which run in the shell process)
 *   ⇒ the namespace surface must be optional with `?` (the same single-side-only convention as `bridge?` / `hotExit?` —
 *   making it required would falsely claim the pool injects it too, and pool-side code would be written against a nonexistent surface).
 * Dependency direction: cross-composed by the aggregator; implementation = electron/preload-shell.ts (storage namespace).
 */

/** Storage namespace surface — the read port and open port for the currently effective cache directory (the single resolution point is in the main process storage-handlers) */
export interface StorageAPI {
  storage?: {
    /** Open the cache directory (a file explorer window, non-modal) — the main process resolves the currently effective path and
     *  **creates the directory before opening**
     *  (a missing directory is created too — there is something to open even right after install, never a "not found" popup); an openPath failure throws fail-loud */
    revealCache(): Promise<void>;
    /** The absolute path of the currently effective cache directory — settings.json's `app.storage.cacheDir` (empty/missing = the userData default location);
     *  🔴 the single resolution entry (placement contract iron rule 3: no second copy of the path is stored anywhere — take it, never copy it) */
    cacheDir(): Promise<string>;
  };
}
