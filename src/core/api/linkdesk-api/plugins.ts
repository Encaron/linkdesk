/**
 * linkdesk-api plugin management domain — split out of linkdesk-api.ts (E5.8#0d.10-9d).
 * The plugins + pluginManager two namespace surfaces verbatim.
 * Dependency direction: plugins → ./types (PluginListEntry/PluginInstallResult/PluginInfoEntry); cross-composed by the aggregator.
 */

import type {
  PluginListEntry,
  PluginInstallResult,
  PluginInstallRequestOpts,
  PluginInstallJobRef,
  PluginUpdateResult,
  PluginUpdateCheckResult,
  PluginInfoEntry,
  PluginDiscoveryEntry,
  PluginEntryInfo,
  PluginCompatibilityRequest,
  PluginCompatibilityReading,
} from "./types";
import type { PluginManifest } from "../types";

/** Plugin discovery/management namespace surfaces — bridges IpcBridgeHandler → loader functions */
export interface PluginsAPI {
  /** Plugin discovery — injected on both ends: resolvePath exists identically on both; the read surface (listDirs/listAll/readAllManifests/listDisabledDirs/readManifest) is shell preload only (the loader runs only in the shell) */
  plugins: {
    resolvePath(id: string): Promise<string>;
    /** E6#7 (1.2-4): sibling of resolvePath (discovery family) — returns { root, entry, bundle } (the bundle entry is always index.bundle.js).
     *  Optional — keeps the state.ts guard and both preload surfaces (shell/pool) compiling; callers check for existence before calling. */
    resolveEntry?(id: string): Promise<PluginEntryInfo>;
    /** E6#117: compatibility reading (read-only) — "does this plugin match the current version" is computed at a single point by the shell
     *  (state algorithm `src/core/compat/compatibility.ts`; the mapping table between the five user-facing words and the readings lives in that file's header comment).
     *  Optional — same precedent as resolveEntry (keeps the mock and the existing implementation surface compiling; callers check for existence first). */
    getCompatibility?(req: PluginCompatibilityRequest): Promise<PluginCompatibilityReading>;
    listDirs?(): Promise<string[]>;
    /** E6#9a: full discovery — [{ pluginId, entry, manifest }] (replaces import.meta.glob; packaged plugins live outside the source tree, so reading disk in the main process is the only source of truth) */
    listAll?(): Promise<PluginDiscoveryEntry[]>;
    listDisabledDirs?(): Promise<string[]>;
    /** Returns the raw plugin.json JSON text — consumers JSON.parse it themselves */
    readManifest?(id: string): Promise<string>;
    /** E6#9c: all manifests — Record<pluginId, PluginManifest> (the IPC replacement for the pluginManifests eager glob) */
    readAllManifests?(): Promise<Record<string, PluginManifest>>;
    /** E6#11/#13 (1.2-5): the main-process real download stage — fetches the .linkdesk-plugin package → {userData}/tmp/<original package name> (shell preload only; called by the loader's install flow packageOps).
     *  E6#73c: may carry a job identity — progress events from the main-process stage backfill jobId/pluginId accordingly (absent = events carry no identity; with N=1 attributed to the active session) */
    packageDownload?(url: string, job?: PluginInstallJobRef): Promise<{ zipPath: string; sizeBytes?: number }>;
    /** E6#11/#13 (1.2-5): the main-process real extract stage — shared bundle-zip semantics → {userData}/plugins/<id>/ (2026-09-05 flattened single root; shell preload only; rejects if the target already exists).
     *  E6#73c: job same as packageDownload — extract-stage progress events backfill the identity */
    packageExtract?(zipPath: string, expectedPluginId?: string, job?: PluginInstallJobRef): Promise<{ pluginId: string; version: string; targetDir: string }>;
    /** E6#73d: abort an in-flight download by jobId — the single landing point for the panel's "Cancel install".
     *  An AbortSignal cannot cross IPC (structured clone rejects it), so only this **targeted message** can be sent; the main process only keeps
     *  a jobId → AbortController registry and does not interpret semantics. Returns false = that job currently has no in-flight download
     *  (already finished / not started / not in the download stage) — callers should read this as "cancel accepted, wait for the terminal state", not as a failure. */
    packageCancel?(jobId: string): Promise<boolean>;
    /** E6#13b (stage B): the main-process real network stage — fetches marketplace.json → version comparison (does not touch the ledger — current is passed in by the shell). Prereleases are ignored by default. */
    packageUpdateCheck?(pluginId: string, catalogUrl: string, currentVersion?: string): Promise<PluginUpdateCheckResult>;
    /** E6#13b/c (stage B): the main-process real download+extract stage — downloads to tmp → extracts to {userData}/tmp/.stage-<id> (id consistency + version direction validation; the old directory is untouched).
     *  E6#33c (anchor ①): allowOlder explicitly true admits a downgrade where "package version < current" (version dropdown picks an older version + passed after F2 confirm); the default still rejects <=; the same version is always rejected.
     *  E6#73j (G1): job same as packageDownload — update download-stage progress is attributed by jobId, and can be truly aborted by jobId. */
    packageStageUpdate?(pluginId: string, source: string, currentVersion?: string, allowOlder?: boolean, job?: PluginInstallJobRef): Promise<{ pluginId: string; newVersion: string; stagedDir: string }>;
    /** E6#13c (stage B): the main-process atomic replacement stage — same-volume rename: target→.bak→staged→target→rm .bak (restores the old version on failure).
     *  0.2.48: `deferred: true` = the old directory is occupied (dev-track Vite handles being the main scenario; disk untouched, staging kept as-is) —
     *  the caller shows "will be replaced automatically after restart", and `commitPendingStagedUpdates` commits it on startup; version = the staged new version number. */
    packageCommitUpdate?(pluginId: string, stagedDir: string): Promise<{ pluginId: string; version: string; deferred?: boolean }>;
  };

  /** Plugin management — bridges IpcBridgeHandler → loader functions. Pool-authoritative (consumed by marketplace plugins), required */
  pluginManager: {
    list(): Promise<PluginListEntry[]>;
    enable(id: string): Promise<unknown>;
    disable(id: string): Promise<unknown>;
    uninstall(id: string): Promise<unknown>;
    /** E6#73q: opts carries the requester-side identity (pluginId/displayName/origin) — job table dedup + job row display name */
    install(path: string, opts?: PluginInstallRequestOpts): Promise<PluginInstallResult>;
    /** E6#13 (1.2-5): the explicit name for the url/.linkdesk-plugin package install flow (installPlugin routing alias; identical on both the shell and pool preloads — the pool proxies via plugins:call). Progress goes through the plugin:installProgress channel */
    installWithProgress?(path: string, opts?: PluginInstallRequestOpts): Promise<PluginInstallResult>;
    reinstall(id: string): Promise<unknown>;
    getDisabled(): Promise<PluginInfoEntry[]>;
    getUninstalled(): Promise<PluginInfoEntry[]>;
    isDisabled(id: string): Promise<boolean>;
    /** E6#11c (stage B): safe update (#11c atomic + unload mechanical path) — opts: { catalogUrl? (check picks the latest) | url? (update package given directly) }.
     *  E6#33c (anchor ①): allowOlder explicitly true admits a downgrade (version dropdown picks an older version + passed after F2 confirm); the default rejects <=. */
    update?(pluginId: string, opts?: { catalogUrl?: string; url?: string; allowOlder?: boolean }): Promise<PluginUpdateResult>;
    /** E6#13b (stage B): read-only update check — returns downloadUrl when a new version exists (data source for the UI badge; the update action goes through update) */
    checkUpdates?(pluginId: string, catalogUrl: string): Promise<PluginUpdateCheckResult>;
    /** E5.7#48: install/uninstall/reinstall success → notify the main process to fully rescan the three tables */
    notifyManifestChanged?(): void;
  };
}
