/**
 * linkdesk-api system slot domain — E5.8#41.14 (Phase 8.2 plan A): the factorySlots generic enumeration surface.
 * #41.12 built the settings namespace (a settings-role-only surface: list/getActive/setActive) — this surface is slot-agnostic
 * and takes a role parameter: serial/marketplace/settings, any factoryRole with ≥2 candidates can be enumerated/switched.
 * Purpose: the settings plugin's "generic area" lists all N settings UIs (including itself) + switches the active suite (#41.13 switch button UI).
 * Placement: injected by the pool preload (the settings UI renders in the pool) — implemented on the shell side by the IpcBridgeHandler/factory-slots domain.
 * Dependency direction: factory-slots → the types base; cross-composed by the aggregator. Zero mutual dependencies among domain interfaces.
 */

/** Slot entry — one row returned by factorySlots.list(role).
 * Not exported (module-local interface) — the contract generator collects it automatically via list's transitive reference and emits the export;
 * there is no third-party consumer inside the shell, so exporting it would be reported as unused by knip (excluded domains in linkdesk-api.ts do not count as consumers). */
interface FactorySlotEntry {
  /** Plugin ID — the handle for getActive/setActive */
  pluginId: string;
  /** Plugin display name (raw manifest.name; consumers do their own i18n) */
  title: string;
  /** E5.8#41.18: this plugin's contributes.floatingPanel.viewId (undeclared = undefined) — used for switching/opening the candidate floating panel */
  viewId?: string;
}

/** factorySlots namespace surface — injected on both ends (the in-pool renderer side implements it via the IPC bridge) */
export interface FactorySlotsAPI {
  factorySlots: {
    /** Names of all filled roles (registration order) — for the settings page's "any factoryRole with ≥2 candidates → that role name group appears": enumerate roles first, then list(role) to judge the candidate count */
    listRoles(): Promise<string[]>;
    /** All candidate plugins declaring the given factoryRole [{pluginId, title}], in registration order */
    list(role: string): Promise<FactorySlotEntry[]>;
    /** The active plugin ID for the given role — reads the persisted activation (#41.12 on-disk record); falls back to the default (built-in) when there is no record or the plugin is uninstalled */
    getActive(role: string): Promise<string | undefined>;
    /** Switch the active plugin for the given role — validates the candidate, then persists (survives restart). Throws fail-loud for non-candidates */
    setActive(role: string, pluginId: string): Promise<void>;
  };
}
