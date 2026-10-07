/**
 * linkdesk-api commands/configuration domain — split out of linkdesk-api.ts (E5.8#0d.10-9b).
 * The commands + configuration + config alias three namespace surfaces verbatim.
 * Dependency direction: commands → ./types (LinkDeskCommand); cross-composed by the aggregator.
 */

import type { LinkDeskCommand, LinkDeskCommandParam, LinkDeskConfigSchema, LinkDeskConfigurationContribution } from "./types";

/** Commands + configuration namespace surfaces — modeled after VS Code vscode.commands + workspace.getConfiguration */
export interface CommandsAPI {
  /** Commands — modeled after VS Code vscode.commands */
  commands: {
    /** @deprecated E3j #75 — backward-compatibility alias; use executeCommand in new code */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- command argument types are decided by the plugin command caller, modeled after VS Code executeCommand's ...args: any[]
    execute<T = void>(commandId: string, ...args: any[]): Promise<T>;
    /** Execute a shell-side command */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- command argument types are decided by the plugin command caller, modeled after VS Code executeCommand's ...args: any[]
    executeCommand<T = void>(commandId: string, ...args: any[]): Promise<T>;
    /**
     * Register a pool-resident command — the handler exists only in the pool renderer (registered when the view mounts).
     * meta is synced to the shell registry: title display name (command palette / context menu; re-registering updates it
     * dynamically — a toggle command's title flips with state), category command-palette grouping, when context key filtering
     * (pass "false" = a purely programmatic command, not shown in the command palette, only callable via the plugin API).
     * Commands not declared in plugin.json contributes.commands become visible/executable once registered via meta.
     * Source-of-truth division: the shell CommandRegistry = display source of truth (title/category/when are the only authority),
     * the pool = execution source of truth (the handler is the only authority and never crosses processes) — meta syncs only the display surface.
     * 🔴 **E6#111b: `meta.pluginId` = the true identity explicitly declared by the registrant** (optional, additive only).
     *   Command ownership resolution priority = ① the plugin.json declaration → ② this field → ③ inferred from the first segment of the name.
     *   Declared commands **need not fill it** (① is already authoritative); only commands that are "absent from the declaration
     *   and whose name does not carry their own prefix" need it — otherwise the command gets attributed to the owner of the
     *   name's first segment (borrowing someone else's prefix ⇒ wrong ownership, and cross-ownership takeover cannot be blocked).
     *   Following the `notifications.source` precedent (`ui.ts:26-32`): the pool is a single-process shared realm,
     *   all plugins share the same `window.linkdesk` ⇒ **there is no way to inject it automatically; the author must declare it**.
     * M1 `AI#7`: `meta.description` / `meta.params` = command description and parameter structure (optional, additive only) —
     *   synced the same way as `title`/`category` into the shell registry, and surfaced in the contract via `getCommands()`
     *   (`LinkDeskCommand.description` / `LinkDeskCommand.params`).
     *   `params[i]` corresponds **positionally** to handler arguments (`name` follows the handler argument name).
     */
    registerCommand(
      commandId: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- command handler argument types are decided by the plugin caller, modeled after VS Code registerCommand's (...args: any[]) => any
      handler: (...args: any[]) => Promise<unknown> | unknown,
      meta?: { title?: string; category?: string; when?: string; pluginId?: string; description?: string; params?: LinkDeskCommandParam[] },
    ): void;
    /** Unregister a plugin's pool-resident commands (convention: command ID format "pluginId.commandName") — called on view unmount */
    unregisterCommands(pluginId: string): void;
    /** Get the list of all registered commands */
    getCommands(): Promise<LinkDeskCommand[]>;
    /** Shell-side plugin entry module-level registration (the shell-side half, executed across both processes) — shell preload only */
    _executeShellLocal?(id: string, ...args: unknown[]): Promise<unknown>;
    /** E6#62e: pool-preload-only internal hook — the pool renderer registers the on-command activation callback (command miss → import the owning plugin entry).
     *  Underscore internal surface (modeled after _executeShellLocal), not a plugin-author API — the wiring point for on-demand activation of pure command plugins. */
    _setCommandMissHandler?(handler: (pluginId: string) => Promise<boolean>): void;
  };

  /** Configuration — the new name — modeled after VS Code vscode.workspace.getConfiguration */
  configuration: {
    /** Read a configuration value — a runtime dynamic value; defaults to unknown without a type parameter; callers narrow via explicit get<number>("k") or their own narrowing */
    get<T = unknown>(key: string): Promise<T>;
    /** Write a configuration value */
    set(key: string, value: unknown): Promise<void>;
    /** Get the configuration schema */
    getSchema(key?: string): Promise<LinkDeskConfigSchema>;
    /** Subscribe to configuration changes — returns an unsubscribe function. The value is dynamic at runtime; T is inferred from the subscriber's cb (same generic as events.on, to avoid contravariance errors) */
    onChange<T = unknown>(key: string, cb: (value: T) => void): () => void;
    // ══ E5.7#76: the following 9 methods are settings-page only (SettingsView rendering / live refresh / navigation).
    // Injected by the pool preload (SettingsView renders in the pool) — required; the shell preload has no such surface.
    // General plugins should use get/set/getSchema/onChange above. ══
    getConfigurationContributions(): Promise<LinkDeskConfigurationContribution[]>;
    inspectConfiguration(key: string): Promise<unknown>;
    getUserSettings(): Promise<Record<string, unknown>>;
    onDidChangeConfiguration(cb: (key: string, value: unknown) => void): () => void;
    onPluginLifecycleChange(cb: () => void): () => void;
    consumeSettingsGroup(): Promise<string | null>;
    onRequestSettingsGroup(cb: (pluginId: string) => void): () => void;
    consumeScrollToSetting(): Promise<string | null>;
    onRequestScrollToSetting(cb: (key: string) => void): () => void;
    /** E5.8#41.14 🔴 fix: switch to the keybindings tab — the same dual channel as M1 (replaces the mismatched window-event dead route).
     *  On mount, consumes the pending request (the "open keybindings settings" command issued while not open); returns null when there is no request */
    consumeOpenKeybindings(): Promise<{ query?: string } | null>;
    /** E5.8#41.14: live subscription — when the settings page is already open, the "open keybindings settings" command switches the tab immediately */
    onRequestOpenKeybindings(cb: (payload: { query?: string }) => void): () => void;
  };

  /** @deprecated E3j #75 — backward-compatibility alias; use configuration in new code */
  config: CommandsAPI["configuration"];
}
