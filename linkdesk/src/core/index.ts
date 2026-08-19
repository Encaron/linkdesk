/**
 * src/core/index.ts —— 核心 API 索引入口。
 * E5#42-9：新 AI 进场 30 秒看清核心全部能力。
 */

// ── 事件 ──
export { shellEvents } from "./react/events/ShellEvents";
export type { ShellEvents, StatusBarEntry } from "./react/events/ShellEvents";
export { CoreEvents, Emitter } from "./react/events/CoreEvents";

// ── 注册表 ──
export * from "./registry/RegistryBase";
export * from "./registry/commands/CommandRegistry";
export * from "./registry/ConfigurationRegistry";
export * from "./registry/commands/ContextKeyService";
// FileDecorationRegistry 桶行已随 E5.7#60 整删——注册表池内化（provider 是 JS 函数不可跨进程，
// 真源与消费方同在池；壳侧恒空实例 = 死重。文件连同桶导出一起 git rm）
export * from "./registry/appearance/IconRegistry";
export * from "./registry/commands/KeybindingRegistry";
export * from "./registry/languages/LangDefRegistry";
export * from "./registry/languages/LanguageRegistry";
export * from "./registry/commands/MenuRegistry";
export * from "./registry/ProtocolRegistry";
export * from "./services/ui/StatusBarService";
export * from "./registry/appearance/ThemeRegistry";
export * from "./registry/ClipboardProviderRegistry";

// ── 基础设施 ──
export { reportError } from "./services/bootstrap/ErrorService";
export { PLUGINS_DIR, PLUGIN_SUBDIRS, PLUGIN_ENTRY_FILES } from "./utils/plugin/pluginPaths"; // E5.8#0d.11：自 core/ 根归位 utils/plugin/

// ── 服务 ──
export * from "./services/configuration/ConfigurationApplier";
export * from "./services/ui/DialogService";
export * from "./services/files/FileAssociationService";
export * from "./services/files/FileSearcher";
export * from "./services/layout/LayoutEngine";
export * from "./services/layout/LayoutService";
export * from "./services/ui/NotificationService";
export * from "./services/plugins/PluginStateService";
export * from "./services/plugins/ProfileService";
export * from "./services/configuration/StorageService";
export * from "./services/layout/WorkspaceService";
export * from "./utils/path/pathUtils";
export * from "./utils/path/assetPath";
export * from "./services/plugins/IpcBridgeHandler";
export * from "./services/files/EncodingService";
export * from "./services/ui/ThemeEngine";
export * from "./services/layout/ViewContainerService";

// ── React ──
export * from "./react/useConfiguration";
export * from "./react/usePluginIpcEvent";
export * from "./react/useSendData";

// ── 数据管道 ──
export * from "./pipeline/DataConverter";
export * from "./pipeline/RingBuffer";
export * from "./pipeline/ProtocolParser";
// ── 工具 ──
export * from "./utils/CancellationToken";
// ── 服务 ──
export * from "./services/bootstrap/FactorySlots";
export * from "./services/ui/LogChannel";
// 卡片注册表不在 barrel——卡片工作台是插件（硬约束 #3）。CardRegistry 骨架已随 E5.7#45.7 整删

// ── API 类型 ──
export type * from "./api/linkdesk-api";
export type * from "./api/types";

// ── 内置 ──
export * from "./commands/shell/coreCommands";
// E5.7#53：registerBuiltinProtocols 不再从桶导出——ensureBuiltinProtocols 唯一写入方已收敛
// 主进程（plugin-manifest-loader 直连 import）。桶导出会诱惑壳侧 import → 壳进程空实例回潮。
