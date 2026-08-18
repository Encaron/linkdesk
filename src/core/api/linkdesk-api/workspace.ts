/**
 * linkdesk-api 工作区/文件域——自 linkdesk-api.ts 拆出（E5.8#0d.10-9c）。
 * workspace/filesystem/path/env/search/encoding 六命名空间面 verbatim。
 * 依赖方向：workspace → ./types（EnvInfo）+ types/fileEntry + FileService + WorkspaceService；被聚合器交叉组装。
 */

import type { EnvInfo } from "./types";
import type { FileEntry } from "../../types/fileEntry";
import type { FileChangeEvent } from "../../services/files/FileService";
import type { WorkspaceFolder } from "../../services/layout/WorkspaceService";

/** 工作区/文件系统/路径/环境/搜索/编码命名空间面——对标 VS Code vscode.workspace + env + ExtensionContext */
export interface WorkspaceAPI {
  /** 工作区——池 preload 注入（壳侧经 WorkspaceService 直用）。池权威命名空间——插件必用面（file-tree），必选 */
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

  /** 文件系统——插件读写（路径校验由主进程执行） */
  filesystem: {
    readTextFile(p: string): Promise<string>;
    writeTextFile(p: string, d: string): Promise<void>;
    exists(p: string): Promise<boolean>;
    createDir(p: string): Promise<void>;
    copy(src: string, dest: string): Promise<void>;
    remove(p: string): Promise<void>;
    listDir(p: string): Promise<FileEntry[]>;
    readBinaryFile(p: string): Promise<Uint8Array>;
    writeBinaryFile(p: string, d: Uint8Array): Promise<void>;
    /** 监听目录变更——返回 unsubscribe（内部走 filesystem:changed:<watcherId> 通道） */
    watch(dirPath: string, onEvent: (e: FileChangeEvent) => void): Promise<() => void>;
    /** 列出条目名——壳 preload 独有（池侧请用 listDir） */
    readdir?(p: string): Promise<string[]>;
  };

  /** 路径工具——壳/池双端注入（editor/file-tree 池插件消费 normalize/join 等）；appDataDir 双端同款（E5.8#0d.5：池侧补上——settings 插件池内解析 userData 路径） */
  path: {
    appDataDir?(): Promise<string>;
    normalize(p: string): string;
    join(...parts: string[]): string;
    basename(p: string): string;
    dirname(p: string): string;
    extname(p: string): string;
  };

  /** 环境信息——对标 VS Code ExtensionContext */
  env: {
    get(pluginId?: string): Promise<EnvInfo>;
  };

  /** E5.6#11.5a：文件搜索——全文搜索/替换（IPC 到壳/主进程执行） */
  search: {
    searchFiles(opts: {
      roots: string[];
      query: string;
      include?: string;
      exclude?: string;
      caseSensitive?: boolean;
      wholeWord?: boolean;
      useRegex?: boolean;
      maxResults?: number;
    }): Promise<Array<{
      filePath: string;
      matches: Array<{ filePath: string; lineNumber: number; lineText: string; matchStart: number; matchEnd: number }>;
    }>>;
  };

  /** E5.6#11.5a：编码检测/转换（主进程 EncodingService） */
  encoding: {
    detect(buffer: Uint8Array): Promise<string>;
    decode(buffer: Uint8Array, encoding: string): Promise<string>;
    encode(text: string, encoding: string): Promise<Uint8Array>;
  };
}
