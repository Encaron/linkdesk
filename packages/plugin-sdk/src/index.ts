/**
 * @linkdesk/plugin-sdk 公共出口（barrel）——**构建面**（vite.config.ts / 校验脚本用）。
 *
 * 运行面：`defineLinkdeskPluginConfig()`（构建）+ validate 家族（plugin.json / 主题数据 / 图标主题数据；
 * E6#60 起主题/图标作者也走 npm 通道——validateThemeJson / validateIconThemeJson）；
 * 类型面经 types.js 全量转发 @linkdesk/contracts（window.linkdesk.* 全局声明随契约进 program，E6#2b）。
 * validate 的内部 helper（collectI18nDecls/derivePluginId/SAFE_PLUGIN_ID 等）供 vite-config/packager
 * 跨模块复用，但**不进 barrel**——公共 API 面保持最小（对标 @types/vscode 只给类型+工具）。
 *
 * 🔴 **插件运行时代码（src/**）不许 import 本入口**——宿主命令面在子路径 `shell-commands.ts`
 *   （`import { SHELL_COMMANDS, openWith } from "@linkdesk/plugin-sdk/shell-commands"`）。
 *   为什么：本入口 re-export `vite-config.js`，它静态 import `vite` / `@vitejs/plugin-react`——
 *   插件源码一旦从本入口取值，整条构建链会被**打进插件 zip**（实测：rollup 的 node-entry 要解析
 *   仅 macOS 有的 `fsevents` ⇒ Windows 上 build 直接红，且即使侥幸过了也是几 MB 的死代码）。
 *   子路径只出「一个常量对象 ＋ 一个 helper」，零重依赖。
 */
export { defineLinkdeskPluginConfig } from "./vite-config.js";
export type { LinkdeskPluginOptions } from "./vite-config.js";
export { validatePluginJson } from "./validate.js";
export { validateThemeJson, validateIconThemeJson } from "./validate.js";
export type { ValidationResult } from "./validate.js";
export { packPluginData } from "./pack.js";
export type { PackResult } from "./pack.js";
// ⛔ 不在此 re-export `shell-commands`（理由见头注红字段）——运行面消费者走子路径。
export type * from "./types.js";
