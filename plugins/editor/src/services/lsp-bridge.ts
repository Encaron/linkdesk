/**
 * E4V#40s2 LSP 桥——渲染进程端。通过 IPC 启动语言服务器，
 * 创建 MonacoLanguageClient 连接，对接 IEditorService.openEditor() 导航。
 *
 * 对标 VS Code Extension Host——每个语言一个 LSP 客户端。
 *
 * E6#87c：原 250 行单文件拆为同名夹，本文件 = **门面**（services/ 用夹内门面的形态，
 * 见 12 档 §一·〇）。消费方 import 路径零变更。
 */
export type { LspState } from "./lsp-bridge/registry";
export { getLspClient, getLspState, onLspStateChange } from "./lsp-bridge/registry";
export { takeBlockedNotice } from "./lsp-bridge/notice";
export { startLspClient } from "./lsp-bridge/start";
