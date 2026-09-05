/**
 * @linkdesk/plugin-sdk/eslint 子路径出口（E6#54d）——作者零配置门禁。
 *
 * 用法（脚手架模板）：
 *   "lint": "linkdesk-plugin-sdk lint"          // 两条腿全跑 + 打印报告（bin）
 *   // 或编程：linkdeskPluginLintConfig() 展开进作者自配 eslint.config.js
 *
 * 全量门禁 = eslint 规则腿 + 三 check 扫描腿（lint.ts 编排）。规则 id 与 disable 注释格式
 * 见 src/eslint/rules.ts 头注（双源注记）。这里不暴露内部 check 函数——bin lint 已聚合。
 */
export { linkdeskPluginLintConfig } from "./preset.js";
export type { PluginLintOptions } from "./preset.js";
export { runPluginLint, renderPluginLintReport } from "./lint.js";
export type { PluginLintReport, LintLeg } from "./lint.js";
