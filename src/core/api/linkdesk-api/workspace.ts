/**
 * linkdesk-api workspace/files domain — split out of linkdesk-api.ts (E5.8#0d.10-9c).
 * The workspace/filesystem/path/env/search/encoding six namespace surfaces verbatim.
 * Dependency direction: workspace → ./types (EnvInfo) + types/fileEntry + FileService + WorkspaceService; cross-composed by the aggregator.
 */

import type { EnvInfo } from "./types";
import type { FileEntry } from "../../types/fileEntry";
import type { FileChangeEvent } from "../../services/files/FileService";
import type { WorkspaceFolder } from "../../services/layout/WorkspaceService";
import type { SearchWireOptions, SearchWireResult } from "../../types/ipc/search";

/** Workspace / filesystem / path / environment / search / encoding namespace surfaces — modeled after VS Code vscode.workspace + env + ExtensionContext */
export interface WorkspaceAPI {
  /** Workspace — injected by the pool preload (the shell side uses WorkspaceService directly). Pool-authoritative namespace — a must-use plugin surface (file-tree), required */
  workspace: {
    getFolders(): Promise<WorkspaceFolder[]>;
    getActive(): Promise<string | undefined>;
    setActive(uri: string): Promise<void>;
    openFolder(): Promise<void>;
    addFolder(path: string): Promise<void>;
    removeFolder(path: string): Promise<void>;
    onDidChangeFolders(cb: () => void): () => void;
    onDidChangeActiveWorkspace(cb: (uri: string | null) => void): () => void;
  };

  /** Filesystem — plugin read/write (path validation is performed by the main process) */
  filesystem: {
    readTextFile(p: string): Promise<string>;
    writeTextFile(p: string, d: string): Promise<void>;
    exists(p: string): Promise<boolean>;
    createDir(p: string): Promise<void>;
    copy(src: string, dest: string): Promise<void>;
    /** E5.8#25.2: rename/move a file or directory (atomic fs.rename in the main process; modeled after POSIX rename / VS Code fs.rename) */
    rename(src: string, dest: string): Promise<void>;
    remove(p: string): Promise<void>;
    listDir(p: string): Promise<FileEntry[]>;
    readBinaryFile(p: string): Promise<Uint8Array>;
    writeBinaryFile(p: string, d: Uint8Array): Promise<void>;
    /** Watch a directory for changes — returns unsubscribe (internally uses the filesystem:changed:<watcherId> channel) */
    watch(dirPath: string, onEvent: (e: FileChangeEvent) => void): Promise<() => void>;
    /** List entry names — shell preload only (the pool side should use listDir) */
    readdir?(p: string): Promise<string[]>;
  };

  /** Path utilities — injected on both shell/pool ends (in-pool plugins such as editor/file-tree consume normalize/join etc.); appDataDir is identical on both ends (E5.8#0d.5: added on the pool side — settings plugins resolve userData paths in the pool) */
  path: {
    appDataDir?(): Promise<string>;
    normalize(p: string): string;
    join(...parts: string[]): string;
    basename(p: string): string;
    dirname(p: string): string;
    extname(p: string): string;
  };

  /** Environment info — modeled after VS Code ExtensionContext */
  env: {
    get(pluginId?: string): Promise<EnvInfo>;
  };

  /** E5.6#11.5a: file search — full-text search/replace (executed via IPC in the shell/main process) */
  search: {
    // E5.8#1c: the wire contract's canonical home is src/core/types/ipc/search.ts — same origin on both ends with preload-pool buildSearch
    searchFiles(opts: SearchWireOptions): Promise<SearchWireResult>;
  };

  /** E5.6#11.5a: encoding detection/conversion (main-process EncodingService) */
  encoding: {
    detect(buffer: Uint8Array): Promise<string>;
    decode(buffer: Uint8Array, encoding: string): Promise<string>;
    encode(text: string, encoding: string): Promise<Uint8Array>;
    /** T1 binary guard: purely heuristic determination (the shell owns the decision — one source of truth; older shells lack this method ⇒ plugins must feature-detect and degrade) */
    isBinary(buffer: Uint8Array): Promise<boolean>;
  };
}
