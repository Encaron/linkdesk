/**
 * src/core/index.ts —— 核心 API 索引入口。
 * E5#42-9：新 AI 进场 30 秒看清核心全部能力。
 */

// ── 事件 ──
export { shellEvents } from "./react/ShellEvents";
export type { ShellEvents, StatusBarEntry } from "./react/ShellEvents";
export { CoreEvents, Emitter } from "./react/CoreEvents";

// ── 注册表 ──
export * from "./registry/RegistryBase";
export * from "./registry/CommandRegistry";
export * from "./registry/ConfigurationRegistry";
export * from "./registry/ContextKeyService";
export * from "./registry/FileDecorationRegistry";
export * from "./registry/IconRegistry";
export * from "./registry/KeybindingRegistry";
export * from "./registry/LangDefRegistry";
export * from "./registry/LanguageRegistry";
export * from "./registry/MenuRegistry";
export * from "./registry/ProtocolRegistry";
export * from "./registry/StatusBarService";
export * from "./registry/ThemeRegistry";
export * from "./registry/ClipboardProviderRegistry";

// ── 基础设施 ──
export { reportError } from "./services/ErrorService";
export { PLUGINS_DIR, PLUGIN_SUBDIRS, PLUGIN_ENTRY_FILES } from "./pluginPaths";

// ── 服务 ──
export * from "./services/ConfigurationApplier";
export * from "./services/DialogService";
export * from "./services/FileAssociationService";
export * from "./services/FileSearcher";
export * from "./services/LayoutEngine";
export * from "./services/LayoutService";
export * from "./services/NotificationService";
export * from "./services/PluginStateService";
export * from "./services/ProfileService";
export * from "./services/StorageService";
export * from "./services/WorkspaceService";
export * from "./utils/pathUtils";
export * from "./utils/assetPath";
export * from "./services/IpcBridgeHandler";
export * from "./services/EncodingService";
export * from "./services/ThemeEngine";
export * from "./services/ViewContainerService";

// ── React ──
export * from "./react/useConfiguration";
export * from "./react/usePluginIpcEvent";
export * from "./react/useSendData";
export * from "./react/TabActionsContext";

// ── 数据管道 ──
export * from "./pipeline/DataConverter";
export * from "./pipeline/RingBuffer";
export * from "./pipeline/ProtocolParser";
// ── 工具 ──
export * from "./utils/CancellationToken";
// ── 服务 ──
export * from "./services/FactorySlots";
export * from "./services/LogChannel";
// CardRegistry 不在 barrel——标签页系统隔离（硬约束 #3）

// ── API 类型 ──
export type * from "./api/linkdesk-api";
export type * from "./api/types";

// ── 内置 ──
export * from "./commands/coreCommands";
// E5.7#53：registerBuiltinProtocols 不再从桶导出——ensureBuiltinProtocols 唯一写入方已收敛
// 主进程（plugin-manifest-loader 直连 import）。桶导出会诱惑壳侧 import → 壳进程空实例回潮。
