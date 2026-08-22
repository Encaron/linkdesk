/**
 * linkdesk-api 编辑器配套服务域——自 linkdesk-api.ts 拆出（E5.8#0d.10-9d）。
 * decorations/fileAssociation/langDef/lsp/protocol/viewContainer 六命名空间面 verbatim。
 * 依赖方向：editor → ./types（FileDecoration/FileDecorationProvider）；被聚合器交叉组装。
 */

import type { FileDecoration, FileDecorationProvider } from "./types";

/** 文件装饰/关联/语言定义/LSP/协议/视图容器命名空间面——编辑器配套服务（主进程/池内直答） */
export interface EditorAPI {
  /** E5.7#60：文件装饰——池内本地注册表（零 IPC）。形状对标契约 §3.24 */
  decorations: {
    registerProvider(pluginId: string, provider: FileDecorationProvider): void;
    unregisterProvider(pluginId: string): void;
    getDecoration(uri: string): Promise<FileDecoration | null>;
    onDidChange(cb: (uris: string[]) => void): () => void;
  };

  /** E5.7#50：文件关联——扩展名→插件 ID（主进程 FileAssociationService 直答） */
  fileAssociation: {
    getPluginFor(ext: string): Promise<string | undefined>;
  };

  /** E5.7#49：langDef——语言定义注册表（主进程直答）。只返回可序列化字段（monarch tokenizer 函数主进程侧剥壳） */
  langDef: {
    get(extension: string): Promise<{ id: string; lsp?: { command: string; args?: string[] } } | null>;
  };

  /** E5.6#14-lsp：LSP 桥——自动补全/F12/诊断/重命名 */
  lsp: {
    spawn(command: string, args: string[] | undefined, pluginId: string): Promise<string>;
    write(channelId: string, data: string): void;
    dispose(channelId: string): Promise<unknown>;
    onData(cb: (channelId: string, data: string) => void): () => void;
  };

  /** E5.7#49：protocol——协议注册表（主进程直答）。返回前剥 parseLine/detect（JS 函数不可跨进程） */
  protocol: {
    listProtocols(): Promise<Array<{ id: string; name: string; pluginId: string; mode: string }>>;
    getActiveProtocolId(): Promise<string>;
    setActiveProtocolId(protocolId: string): Promise<void>;
  };

  /** E5.7#58：viewContainer——真 IPC 查询/更新（问壳侧注册表）。DTO 只含可序列化公开字段 */
  viewContainer: {
    getViewContainer(id: string): Promise<Record<string, unknown> | undefined>;
    getViews(containerId: string): Promise<Array<Record<string, unknown>>>;
    // E5.8#41.9.2：getView 复合寻址——(pluginId, viewId) 精确查视图元数据（#41.8 碰撞面 #2）
    getView(pluginId: string, viewId: string): Promise<Record<string, unknown> | undefined>;
    registerView(pluginId: string, containerId: string, descriptor: Record<string, unknown>): Promise<void>;
  };
}
