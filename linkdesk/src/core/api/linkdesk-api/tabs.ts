/**
 * linkdesk-api 标签页域——自 linkdesk-api.ts 拆出（E5.8#0d.10-9b）。
 * tabs 命名空间面 verbatim。零外部类型依赖；被聚合器交叉组装。
 */

/** 标签页命名空间面——对标 VS Code vscode.window.createTerminal() */
export interface TabsAPI {
  tabs: {
    create(type: string, opts?: Record<string, unknown>): Promise<unknown>;
    openOrFocus(type: string, opts?: Record<string, unknown>): Promise<unknown>;
    focus(tabId: string): Promise<void>;
    close(tabId: string): Promise<void>;
    focusBySourceId(sourceId: string): Promise<void>;
    updateLabelBySourceId(sourceId: string, label: string): Promise<void>;
    closeBySourceId(sourceId: string): Promise<void>;
    /** E5.6#11.5g3：标签页激活订阅——文件树 autoReveal 消费（preload-pool 实有面，#98 补录契约） */
    onDidChangeActiveTab(cb: (data: { tabId: string; pluginId?: string; filePath?: string }) => void): () => void;
  };
}
