/**
 * linkdesk-api storage domain — the "open cache directory" settings row (04-software-updates/shipped/settings-page-open-cache-directory 3.3).
 * 🔴 **Split namespace** (method-level subset — same convention as commands/tabs/pool):
 *   · `revealCache` / `cacheDir` = shell-side only (the settings page's action/status command handlers run in the shell process);
 *   · `getFilePath` = both ends (2026-11-24 semantic ownership: a pool UI plugin asks the host for the on-disk path of a storage key
 *     instead of assembling `appDataDir + "settings.json"` itself — `SettingsView.tsx` V6).
 *   The namespace itself stays optional with `?`; `PoolExposed` picks the pool half explicitly, `ShellExposed` picks the whole namespace.
 * Dependency direction: cross-composed by the aggregator; implementation = electron/preload-shell.ts + electron/preload-pool/namespaces-plugin.ts.
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
    /** 🆕 2026-11-24: on-disk path of a host storage key (e.g. `"settings"` → `<userData>/settings.json`).
     *  🔴 The filename map lives in the host only (`storageFilename` — shared by the renderer StorageService and the main process);
     *  a UI plugin must call this instead of joining `appDataDir` with a filename literal (V6 / K10). */
    getFilePath(key: string): Promise<string>;
  };
}
