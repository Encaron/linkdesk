/**
 * `@linkdesk/plugin-sdk/runtime`——插件**运行时代码**的唯一入口（零重依赖）。
 *
 * 为什么单独开子路径：包主入口 re-export `vite-config.js`（静态 import `vite` /
 * `@vitejs/plugin-react`）。插件源码若从主入口取值，整条构建链会被打进插件 zip
 * （实测 Windows 上直接红，见 `src/index.ts` 头注）。运行面与构建面从此分开：
 *   · `@linkdesk/plugin-sdk`          → 构建期工具（vite 配置 / 校验 / 打包）
 *   · `@linkdesk/plugin-sdk/runtime`  → 插件 handler 里调的原语
 *   · `@linkdesk/plugin-sdk/shell-commands` → 宿主命令常量与 helper
 *
 * 本入口只出原语，⛔ 业务策略（如串口「自动」档的回退顺序——那是插件的事）。
 */

export { SERIAL_CODINGS, decodeBytes } from "./serial-coding.js";
export type { SerialCoding, DecodeBytesOptions } from "./serial-coding.js";
export { pluginError } from "./plugin-error.js";
export type { PluginErrorInit, LinkDeskPluginError } from "./plugin-error.js";
export type { AsyncCommandMeta } from "./async-command.js";
