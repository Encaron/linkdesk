/**
 * @linkdesk/plugin-sdk/eslint 子路径出口（E6#54d）——作者零配置门禁。
 *
 * 用法（脚手架模板）：
 *   "lint": "linkdesk-plugin-sdk lint"          // 两条腿全跑 + 打印报告（bin）
 *   // 或编程：linkdeskPluginLintConfig() 展开进作者自配 eslint.config.js
 *
 * 全量门禁 = eslint 规则腿 + 四条 check 扫描腿（lint.ts 编排）。规则 id 与 disable 注释格式
 * 见 src/eslint/rules.ts 头注（双源注记）。除下面这一条**审计入口**外不暴露内部 check 函数——
 * bin lint 已聚合。
 *
 * 🔴 E6#109h-b①：`runPluginPrefixCheck` 是**唯一一个对内 check 的具名导出**，专供壳仓只读审计工具
 *    `scripts/plugin-css-prefix-audit.mjs`（改名轮 ③–⑦ 生成「旧名 → 新名」映射、⑧ 全量复核）。
 *    **它不是第二条判据路径**：`lint.ts` 的腿用的是**同一个函数**——工具与腿同源，改一处两边一起变。
 */
export { linkdeskPluginLintConfig } from "./preset.js";
export type { PluginLintOptions } from "./preset.js";
export { runPluginLint, renderPluginLintReport } from "./lint.js";
export type { PluginLintReport, LintLeg } from "./lint.js";
export { runPluginPrefixCheck, resolvePluginIdForCss } from "./checks/plugin-prefix.js";
export type { PluginPrefixReport, PrefixSite, PluginIdResolution, PluginIdSource } from "./checks/plugin-prefix.js";
