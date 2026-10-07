/**
 * linkdesk-api editor companion services domain — split out of linkdesk-api.ts (E5.8#0d.10-9d).
 * The decorations/fileAssociation/langDef/lsp/protocol/viewContainer six namespace surfaces verbatim.
 * Dependency direction: editor → ./types (FileDecoration/FileDecorationProvider); cross-composed by the aggregator.
 */

import type { FileDecoration, FileDecorationProvider } from "./types";

/** File decoration / association / language definition / LSP / protocol / view container namespace surfaces — editor companion services (answered directly by the main process / in-pool) */
export interface EditorAPI {
  /** E5.7#60: file decorations — a local in-pool registry (zero IPC). Shape modeled after contract §3.24 */
  decorations: {
    registerProvider(pluginId: string, provider: FileDecorationProvider): void;
    unregisterProvider(pluginId: string): void;
    getDecoration(uri: string): Promise<FileDecoration | null>;
    onDidChange(cb: (uris: string[]) => void): () => void;
  };

  /**
   * E5.7#50: file associations — extension→plugin ID (answered directly by the main-process FileAssociationService).
   * T2 (wave 3): `getPluginFor` upgraded to full override-table-aware resolution (override → declaration → role, 01 §T2.2) —
   * the three entries (FoldersView/SearchView/intake) all consume it ⇒ F3 "one place of truth"; `listHandlersFor` =
   * the read-only selector surface; `setDefault` = the override table's only write port ("Set as default" / "Restore automatic",
   * bidirectional sync E31); `setDefaultBulk` = the **bulk** form of the same port (E32/E34 aggregate write — writes N types at once,
   * aggregation logic on the manager side).
   * Fallback-chain fix (2026-10-07): an **empty extension** (extensionless / dot-starting file) is resolved like any
   * other — `getPluginFor("")` walks the same pipeline and lands on the role-fallback holder.
   * D2 (decided 2026-10-07): `listHandlersFor` also lists the **role-fallback holder** when at least one declarer
   * exists (the "open as text" path stays reachable once a reader claims the type), and `setDefault` accepts the
   * role-fallback holder as an override target — welcome stays non-assignable (E22 hint-page semantics).
   */
  fileAssociation: {
    getPluginFor(ext: string): Promise<string | undefined>;
    /**
     * List all declarers of the extension plus the current-default marker (data source for the "Open with…" picker and the
     * settings page dropdown, 01 §T2.1); no declarers ⇒ [].
     * D2 (2026-10-07): with at least one declarer, the **role-fallback holder** is appended when it is not among them —
     * the "open as text" path remains selectable after a reader claims the type. With no declarers the result stays []
     * (E13: the fallback holder is already the default then; welcome is never listed — E22).
     * `title` = the **plugin** display name (manifest.name ?? pluginId); `displayName` = the **file type** display name
     * (the displayName in the declaration, e.g. .rs → "Rust") — the two differ semantically; naming surfaces use `title`.
     */
    listHandlersFor(ext: string): Promise<Array<{
      pluginId: string;
      title: string;
      displayName: string;
      isCurrent: boolean;
    }>>;
    /** The override table's only write port — `pluginId: null` = restore automatic (deletes the override key); config:changed is broadcast immediately after writing (E31) */
    setDefault(ext: string, pluginId: string | null): Promise<void>;
    /** Same as above, **writes N types at once** (E32/E34 aggregation: `pluginId: null` = delete per type) — invalid/duplicate extensions are skipped within the write surface */
    setDefaultBulk(exts: string[], pluginId: string | null): Promise<void>;
  };

  /** E5.7#49: langDef — language definition registry (answered directly by the main process). Returns only serializable fields (monarch tokenizer functions are stripped on the main-process side) */
  langDef: {
    get(extension: string): Promise<{ id: string; lsp?: { command: string; args?: string[] } } | null>;
  };

  /** E5.6#14-lsp: LSP bridge — autocompletion/F12/diagnostics/rename */
  lsp: {
    spawn(command: string, args: string[] | undefined, pluginId: string): Promise<string>;
    write(channelId: string, data: string): void;
    dispose(channelId: string): Promise<unknown>;
    onData(cb: (channelId: string, data: string) => void): () => void;
  };

  /** E5.7#49: protocol — protocol registry (answered directly by the main process). parseLine/detect are stripped before returning (JS functions cannot cross processes) */
  protocol: {
    listProtocols(): Promise<Array<{ id: string; name: string; pluginId: string; mode: string }>>;
    getActiveProtocolId(): Promise<string>;
    setActiveProtocolId(protocolId: string): Promise<void>;
  };

  /** E5.7#58: viewContainer — real IPC query/update (asks the shell-side registry). The DTO contains only serializable public fields */
  viewContainer: {
    getViewContainer(id: string): Promise<Record<string, unknown> | undefined>;
    getViews(containerId: string): Promise<Array<Record<string, unknown>>>;
    // E5.8#41.9.2: getView compound addressing — (pluginId, viewId) precise view metadata lookup (collision surface #2 of #41.8)
    getView(pluginId: string, viewId: string): Promise<Record<string, unknown> | undefined>;
    registerView(pluginId: string, containerId: string, descriptor: Record<string, unknown>): Promise<void>;
  };
}
