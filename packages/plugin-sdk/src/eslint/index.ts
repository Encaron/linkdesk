/**
 * @linkdesk/plugin-sdk/eslint 子路径出口（E6#54d）——作者零配置门禁。
 *
 * 用法（脚手架模板）：
 *   "lint": "linkdesk-plugin-sdk lint"          // 两条腿全跑 + 打印报告（bin）
 *   // 或编程：linkdeskPluginLintConfig() 展开进作者自配 eslint.config.js
 *
 * 全量门禁 = eslint 规则腿 + **七条** check 扫描腿（lint.ts 编排）。规则 id 与 disable 注释格式
 * 见 src/eslint/rules.ts 头注（双源注记）。除下面这组**审计入口**外不暴露内部 check 函数——
 * bin lint 已聚合。（审计入口逐个带「不是第二条判据路径」的注记——腿用的就是同一个函数。）
 *
 * 🔴 E6#109h-b①：`runPluginPrefixCheck` 是**唯一一个对内 check 的具名导出**，专供壳仓只读审计工具
 *    `scripts/plugin-css-prefix-audit.mjs`（改名轮 ③–⑦ 生成「旧名 → 新名」映射、⑧ 全量复核）。
 *    **它不是第二条判据路径**：`lint.ts` 的腿用的是**同一个函数**——工具与腿同源，改一处两边一起变。
 *
 * 🔴 E6#109n-b（1.24）：同一纪律再加一个 —— `runTokenScopeCheck`（token 作用域判据；审计工具用它出
 *    18 仓的 token 段读数）。**同样不是第二条判据路径**（腿用的就是它）。
 *
 * 🔴 E6#109o-b（1.26）：再加一个 —— `runSelectorFormCheck`（选择器形态判据 S2/S3；审计工具用它出
 *    18 仓的「无锚 ／ 跨方命中」两段读数）。**同样不是第二条判据路径**（腿用的就是它）。
 */
export { linkdeskPluginLintConfig } from "./preset.js";
export type { PluginLintOptions } from "./preset.js";
export { runPluginLint, renderPluginLintReport } from "./lint.js";
export type { PluginLintReport, LintLeg } from "./lint.js";
export { runPluginPrefixCheck, resolvePluginIdForCss } from "./checks/plugin-prefix.js";
export type { PluginPrefixReport, PrefixSite, PluginIdResolution, PluginIdSource } from "./checks/plugin-prefix.js";
export { runTokenScopeCheck, judgePluginTokenScope } from "./checks/token-scope.js";
export type { TokenScopeReport, TokenScopeSite, TokenScopeCode } from "./checks/token-scope.js";
export { runSelectorFormCheck, judgeSelectorForm, SELECTOR_FORM_WHY } from "./checks/selector-form.js";
export type { SelectorFormReport, SelectorFormSite, SelectorFormCode } from "./checks/selector-form.js";

/**
 * 🔴 E6#111b（1.32）：同一纪律再加一个 —— `runCommandOwnershipCheck`（命令/协议 id 归属判据）。
 *    壳仓只读探针 `scripts/audit-nonnaming.mjs` 用它出「声明面 ／ 运行时面 ／ 协议面」三面读数，
 *    **同样不是第二条判据路径**（`lint.ts` 的第五条腿用的就是它——同一份实现，改一处两边一起变）。
 *    ⚠️ 本格（1.32）该判据**只判黄**（`bin lint` 退出码只看 eslint severity 2），1.49 收紧为红。
 */
export { runCommandOwnershipCheck, judgeCommandId, loadHostReserved } from "./checks/command-ownership.js";
export type {
  CommandOwnershipReport,
  CommandIdSite,
  CommandIdCode,
  CommandIdFace,
  HostReservedNames,
} from "./checks/command-ownership.js";

/**
 * 🔴 E6#111d（1.34）：同一纪律再加一个 —— `runConfigOwnershipCheck`（配置键归属判据）。壳仓只读探针
 *    用它与 `runCommandOwnershipCheck` 拼出「设置面」读数；**同样不是第二条判据路径**
 *    （`lint.ts` 的第六条腿用的就是它——同一份实现，改一处两边一起变）。
 *    分级：判据① 占宿主保留键 = 红（进腿报点）；判据② 新键不带本仓前缀 = 黄（`configAdvisories`，只打印）。
 *    `loadHostReserved` 沿用上面命令腿那一个（**同一个 loader**——⛔ 不许在配置腿上再写一份）。
 */
export { runConfigOwnershipCheck, judgeConfigKey, judgeRegisterIdentity, manifestKeyLine } from "./checks/config-ownership.js";
export type { ConfigOwnershipReport, ConfigKeySite, ConfigKeyCode, ConfigKeyFace } from "./checks/config-ownership.js";

/**
 * 🔴 E6#111f（1.36）：同一纪律再加一个 —— `runAppearanceOwnershipCheck`（外观族 id 归属判据）。
 *    壳仓只读探针 `scripts/audit-nonnaming.mjs` 用它出外观族读数；**同样不是第二条判据路径**
 *    （`lint.ts` 的第七条腿用的就是它——同一份实现，改一处两边一起变）。
 *    分级与配置腿同形：判据② 占宿主兜底外观 id = 红（进腿报点）；判据① 新 id 不带本仓前缀 = 黄
 *    （`appearanceAdvisories`，只打印）——★回退条件 ＋ 排序纪律，见该文件头。
 *    ⚠️ 五空间的**空间参数**是判据的一部分（`recipe` / `colorway` / `iconTheme` / `sharedIcon` / `sentinel`）：
 *    跨空间比 = 假红（配方 `light` vs 配色 `light`），判据一律**按空间**取账栏，见 `reservedIdsForSpace`。
 */
export {
  runAppearanceOwnershipCheck,
  judgeAppearanceId,
  reservedIdsForSpace,
  grantHoldersFor,
  readThemeJson,
  themeIdLine,
} from "./checks/appearance-ownership.js";
export type {
  AppearanceOwnershipReport,
  AppearanceIdSite,
  AppearanceIdCode,
  AppearanceIdSpace,
  AppearanceIdFace,
} from "./checks/appearance-ownership.js";

/**
 * 🔴 E6#111h（1.38）：同一纪律再加一个 —— `runContextOwnershipCheck`（上下文旗子归属判据）。
 *    壳仓只读探针 `scripts/audit-nonnaming.mjs` 用它出旗子面读数；**同样不是第二条判据路径**
 *    （`lint.ts` 的第八条腿用的就是它——同一份实现，改一处两边一起变）。
 *    分级与配置腿/外观腿同形：判据① 占**宿主专用**旗子 = 红（进腿报点）；判据③ 新旗子不带本仓前缀 = 黄
 *    （`contextAdvisories`，只打印，1.49 才收紧为红）。
 *    🟠 **宿主公开约定面**（`contextKeysPublic`）**不判**——第三方设它合法（`MenuId` 是开放字符串），
 *    只登记在报告的 `publicFace` 里让"谁在设约定面"可见。
 *    🔴 **两段不许合并**（合成一栏 ⇒ 官方 `settings` 的 4 个约定面旗子被当成"占用宿主旗子"= 假红）。
 */
export { runContextOwnershipCheck, judgeContextKey, RE_CONTEXT_KEY_SET } from "./checks/context-ownership.js";
export type { ContextOwnershipReport, ContextKeySite, ContextKeyCode } from "./checks/context-ownership.js";
