/**
 * 🔥 linkdesk API namespace — type-safe plugin API entry (aggregator facade)
 *
 * E3j #74: Modeled after the VS Code `vscode` namespace. Plugins get from this module:
 *   - Full TypeScript type hints (IDE autocompletion, parameter validation)
 *   - Zero IPC knowledge — no need to know channel names, action formats, or payload shapes
 *   - All methods go through ipcRenderer.invoke() internally — automatically routed through the #72 IPC message queue
 *
 * E5.7#97: this file is the complete contract surface of window.linkdesk (replacing the loose
 * Record<string, any> of E5#89) — every namespace injected by the pool preload (plugin runtime source of truth)
 * and the shell preload is declared here. Cross-stack wire payload types are imported from src/core/types/ipc/
 * (decision point 1) — a change breaks tsc on all three ends at once.
 *
 * Usage:
 *   import { linkdesk } from "@src/core/api/linkdesk-api";
 *   const themes = await linkdesk.theme.getAvailable();
 *   await linkdesk.commands.executeCommand("myCommand", arg1, arg2);
 *
 * Runtime implementation: window.linkdesk (injected via contextBridge by preload-pool.ts / preload-shell.ts).
 *
 * E5.8#0d.10-9e: after splitting out the linkdesk-api/ submodules, this file = the aggregator — 15 namespace domain interfaces cross-composed
 * into LinkDeskAPI + re-exports of standalone interfaces + DialogOpenOptions keeps its path + getLinkDesk/linkdesk runtime exports.
 * E5.8#41.12: settings domain added (12th, settings suite enumeration/switching); E5.8#41.14: factorySlots domain (13th,
 * slot-agnostic generic enumeration surface); E6#57.2a: app domain (14th, read-only main-software product identity); E6#57.8: update domain
 * (15th, read-only main-software update state — write commands stay out of the contract, see linkdesk-api/update.ts) — the header comment and
 * generate-contract.mjs share the same source; never change one alone.
 * Layered dependencies: types (standalone interface base) → 15 domain interfaces (Commands/Appearance/Tabs/Keybindings/Ui/Data/
 * Workspace/Editor/Plugins/Shell/Panel/Settings/FactorySlots/App/Update) → this aggregator cross-composes them; zero mutual dependencies among domain interfaces, unidirectional and acyclic.
 * External consumers' import paths are unchanged ("./linkdesk-api" hits this file, "./linkdesk-api/types" hits the submodule).
 */

import type { CommandsAPI } from "./linkdesk-api/commands";
import type { AppearanceAPI } from "./linkdesk-api/appearance";
import type { StorageAPI } from "./linkdesk-api/storage";
import type { TabsAPI } from "./linkdesk-api/tabs";
import type { KeybindingsAPI } from "./linkdesk-api/keybindings";
import type { UiAPI } from "./linkdesk-api/ui";
import type { DataAPI } from "./linkdesk-api/data";
import type { WorkspaceAPI } from "./linkdesk-api/workspace";
import type { EditorAPI } from "./linkdesk-api/editor";
import type { PluginsAPI } from "./linkdesk-api/plugins";
import type { ShellAPI } from "./linkdesk-api/shell";
import type { PanelAPI } from "./linkdesk-api/panel"; // E5.8#34.5: bottom panel namespace
import type { SettingsAPI } from "./linkdesk-api/settings"; // E5.8#41.12: settings suite namespace (enumeration/switching)
import type { FactorySlotsAPI } from "./linkdesk-api/factory-slots"; // E5.8#41.14: generic system-slot enumeration surface (slot-agnostic)
import type { AppAPI } from "./linkdesk-api/app"; // E6#57.2a: app domain (main-software product identity — read-only getVersion)
import type { UpdateAPI } from "./linkdesk-api/update"; // E6#57.8: update domain (read-only main-software update state — write commands stay out of the contract)

/**
 * linkdesk API — the type-safe entry point for plugin code.
 * Global namespace structure modeled after the VS Code `vscode` object.
 * The namespaces injected by the pool preload are the plugin runtime source of truth (required);
 * only bridge (true-shell-only) / hotExit (pool-side-only) are optional with `?` — the other side does not inject them (E5.8#22 review N1 fix:
 * the remaining bridge surfaces window/pool/shell/getFilePath are injected on both ends and marked required in the contract).
 * E5.8#0d.10-9e: cross-composed from 15 namespace domain interfaces (interface→type intersection;
 * index access such as LinkDeskAPI["pool"]/["configuration"] keeps the consumer contract unchanged).
 */
export type LinkDeskAPI = CommandsAPI & AppearanceAPI & StorageAPI & TabsAPI & KeybindingsAPI & UiAPI & DataAPI & WorkspaceAPI & EditorAPI & PluginsAPI & ShellAPI & PanelAPI & SettingsAPI & FactorySlotsAPI & AppAPI & UpdateAPI;

// ── Standalone type interface re-exports (types.ts base) ──

export type {
  LinkDeskCommand,
  LinkDeskTheme,
  LinkDeskLanguage,
  LinkDeskConfigSchema,
  // Canonical settings-control vocabulary (2026-10-03 settings-control case 3.1): types ship with the contract npm package,
  // runtime lists/guards live in @linkdesk/ui (this package is pure types with zero runtime — ⛔ never add const here).
  SettingsUiHint,
  SettingsRenderHint,
  PluginListEntry,
  PluginInstallResult,
  PluginInfoEntry,
  PluginListSubset,
  EnvInfo,
  FileDecoration,
  FileDecorationProvider,
  MenuItemDescriptor,
  NotificationHandle,
  PluginToastAction,
  // "Open with" command-surface types (shell command workbench.action.openWith) — reachable from both shell and plugins, hence they live in the contract
  OpenWithRequest,
  OpenWithHandler,
} from "./linkdesk-api/types";

export type { DialogOpenOptions } from "../types/ipc/dialogs"; // E5.7#97: canonical home is src/core/types/ipc/dialogs.ts — this re-export keeps the existing plugin import path

// E5.8#133.3: icon theme types made contractual — IconThemeMappings etc. for plugin consumers to import type
// (file-tree dual-form rendering takes the mapping shape from @linkdesk/contracts; the contract generator collects transitive references automatically).
export type {
  IconThemeMappings,
  IconThemeMapping,
  IconThemeGlyph,
  IconThemeImage,
} from "./types";

// E5.8#20: PluginStateChangedPayload added to exports — plugins subscribe via the wildcard channel events.on("plugin-state:changed")
// (pluginState.onChange exact key matching cannot catch wildcard key names); the payload type belongs to the contract surface and must be given to consumers.
export type { PluginStateChangedPayload } from "../types/ipc/events";

// ── Get a typed API instance ──

/**
 * Returns the type-safe linkdesk API object.
 * At runtime window.linkdesk is injected by the preload — this function only adds type annotations.
 */
export function getLinkDesk(): LinkDeskAPI {
  return (window as unknown as { linkdesk: LinkDeskAPI }).linkdesk;
}

/**
 * Convenience export: a type-safe linkdesk API instance.
 *
 * @example
 *   import { linkdesk } from "@src/core/api/linkdesk-api";
 *   const themes = await linkdesk.theme.getAvailable();
 *   await linkdesk.commands.executeCommand("editor.action.formatDocument");
 */
export const linkdesk: LinkDeskAPI = getLinkDesk();
