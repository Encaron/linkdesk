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
// FileDecorationRegistry 桶行已随 E5.7#60 整删——注册表池内化（provider 是 JS 函数不可跨进程，
// 真源与消费方同在池；壳侧恒空实例 = 死重。文件连同桶导出一起 git rm）
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
// 卡片注册表不在 barrel——卡片工作台是插件（硬约束 #3）。CardRegistry 骨架已随 E5.7#45.7 整删

// ── API 类型 ──
export type * from "./api/linkdesk-api";
export type * from "./api/types";

// ── 内置 ──
export * from "./commands/coreCommands";
// E5.7#53：registerBuiltinProtocols 不再从桶导出——ensureBuiltinProtocols 唯一写入方已收敛
// 主进程（plugin-manifest-loader 直连 import）。桶导出会诱惑壳侧 import → 壳进程空实例回潮。
