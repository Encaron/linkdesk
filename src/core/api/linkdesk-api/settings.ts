/**
 * linkdesk-api settings suite domain — E5.8#41.12 (Phase 8.2 plan A): settings plugin enumeration/switching.
 * The settings namespace = the query/switch surface for when factoryRole:"settings" suites coexist.
 * Third-party settings plugins can list all settings suites in their own UI + switch the active suite (#41.13 switch button UI).
 * Placement: injected by the pool preload (the settings UI renders in the pool) — implemented on the shell side by the IpcBridgeHandler/settings domain.
 * #41.14 ⑤: this surface was generalized → the window.linkdesk.factorySlots.* enumeration surface (this file keeps the compatibility alias).
 * Dependency direction: settings → the types base; cross-composed by the aggregator. Zero mutual dependencies among domain interfaces.
 */

/** Settings suite entry — one row returned by settings.list().
 * Not exported (module-local interface) — the contract generator collects it automatically via SettingsAPI.list's transitive reference and emits the export;
 * there is no third-party consumer inside the shell, so exporting it would be reported as unused by knip (excluded domains in linkdesk-api.ts do not count as consumers). */
interface SettingsPluginInfo {
  /** Plugin ID — the handle for getActive/setActive */
  pluginId: string;
  /** Plugin display name (raw manifest.name; consumers do their own i18n) */
  title: string;
}

/** Settings suite namespace surface — injected on both ends (the settings UI renders in the pool; the shell-side implementation goes through the IPC bridge) */
export interface SettingsAPI {
  settings: {
    /** All settings suites declaring factoryRole:"settings" (including the default/built-in one), in registration order */
    list(): Promise<SettingsPluginInfo[]>;
    /** The current active settings suite ID — reads the persisted activation (#41.12 on-disk record); falls back to the default (built-in) when there is no record or the plugin is uninstalled */
    getActive(): Promise<string | undefined>;
    /** Switch the active settings suite — validates the candidate, then persists (survives restart). Throws fail-loud for non-candidates */
    setActive(pluginId: string): Promise<void>;
  };
}
