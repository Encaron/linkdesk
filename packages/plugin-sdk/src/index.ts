/**
 * @linkdesk/plugin-sdk 公共出口（barrel）。
 *
 * 运行面：`defineLinkdeskPluginConfig()`（构建）+ validate 家族（plugin.json / 主题数据 / 图标主题数据；
 * E6#60 起主题/图标作者也走 npm 通道——validateThemeJson / validateIconThemeJson）；
 * 类型面经 types.js 全量转发 @linkdesk/contracts（window.linkdesk.* 全局声明随契约进 program，E6#2b）。
 * validate 的内部 helper（collectI18nDecls/derivePluginId/SAFE_PLUGIN_ID 等）供 vite-config/packager
 * 跨模块复用，但**不进 barrel**——公共 API 面保持最小（对标 @types/vscode 只给类型+工具）。
 */
export { defineLinkdeskPluginConfig } from "./vite-config.js";
export type { LinkdeskPluginOptions } from "./vite-config.js";
export { validatePluginJson } from "./validate.js";
export { validateThemeJson, validateIconThemeJson } from "./validate.js";
export type { ValidationResult } from "./validate.js";
export type * from "./types.js";
