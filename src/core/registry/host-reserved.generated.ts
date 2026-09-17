/**
 * 🔴 **生成式文件——别手改。** 生成器 = `scripts/gen-host-reserved.mjs`（`npm run audit:plugin-scope:regen`）。
 *
 * 是什么：宿主保留面的**运行时副本**——壳运行时用它判五件事：
 *   · `HOST_RESERVED_CONFIG_KEYS`——插件不得占用的宿主配置键（保护区；撞了 ⇒ 拒绝注册 ＋ console.error）
 *   · `HOST_PSEUDO_PLUGIN_IDS`——宿主自己的注册身份（`app` = 壳通用 / `appearance` = 外观 / `update` = 更新）
 *   · `HOST_RESERVED_APPEARANCE_IDS`——宿主兜底外观 id，**按空间分栏**（recipe / colorway / iconTheme /
 *     sentinel）；两个空间不许合栏（配方 id 与配色 id 是两个名字空间，合栏 ⇒ 官方主题仓假红）
 *   · `HOST_RESERVED_APPEARANCE_GRANTS`——外观 id 的**证照**（id → 宿主之外的正当持有者）。🔴 **不是白名单**：
 *     按 id 记持有者，不记「哪些仓被宽恕」⇒ 新插件永远不在表里、永远判红
 *   · `HOST_RESERVED_CONTEXT_KEYS_HOST_ONLY`——**宿主专用的 context key**（E6#111h／1.38）。
 *     🔴 运行时对它**只出声、不放行以外的动作**：经 IPC 写入宿主专用名 ⇒ `console.error` 点名 ＋
 *     **值照写**。理由 = 旗子是**状态写**不是注册（`setValue` 无归属参数、IPC 通道不带身份）⇒
 *     运行时**拿不到「谁是先者」**，「先者保留」在这里**结构上不可实现**（1.37 §12.1/§12.2）。
 *     ⚠️ **保护主力在静态腿**（SDK `context-ownership`）——运行时是**第二道网**，只覆盖
 *     「插件在运行时设了宿主专用名」这一形态。
 *
 * 为什么运行时需要一份**静态**副本（而不是「看谁先注册」）：
 *   宿主真键里有**从未被注册**的（`app.schemaVersion`——settings.json 的内部标志键），
 *   靠「宿主注册在先」这条顺序事实判不出来。**正确性不许押在注册顺序上**（1.33 §11.1 裁决）。
 *
 * 三份同源：壳账 `scripts/host-reserved.json` · SDK 副本 `packages/plugin-sdk/schemas/host-reserved.json`
 *   · 本文件。漂移由 `node scripts/gen-host-reserved.mjs --check` 拦（四向对账）。
 *
 * ⚠️ **账里的 `contextKeysPublic`（宿主公开约定面）刻意不进本模块**：约定面 = 「插件可设」⇒
 *   运行时对它没有可执行的判断。
 */
export const HOST_RESERVED_CONFIG_KEYS: readonly string[] = [
  "app.accentColor",
  "app.accentMode",
  "app.accentSource",
  "app.appearanceMode",
  "app.backgroundImage",
  "app.backgroundMask",
  "app.backgroundOpacity",
  "app.fontFamily",
  "app.fontFamilyMono",
  "app.fontTone",
  "app.glassBlur",
  "app.glassOpacity",
  "app.glassSaturate",
  "app.glassTint",
  "app.iconTheme",
  "app.language",
  "app.menuStyle",
  "app.mixBackground",
  "app.mixFont",
  "app.mixMode",
  "app.mixReset",
  "app.osIntegration.dirMenu",
  "app.osIntegration.fileAssoc",
  "app.osIntegration.fileMenu",
  "app.schemaVersion",
  "app.surfaceRadius",
  "app.theme",
  "app.themeColor",
  "app.themeColorMode",
  "app.uiFontScale",
  "app.update.mode",
  "app.update.showReleaseNotes",
  "app.zoneBackgroundImage",
  "app.zoneRadius",
  "app.zoneRadiusScale",
];

export const HOST_PSEUDO_PLUGIN_IDS: readonly string[] = [
  "app",
  "appearance",
  "update",
];

export const HOST_RESERVED_CONTEXT_KEYS_HOST_ONLY: readonly string[] = [
  "activeEditor",
  "editorCount",
  "editorHasSelection",
  "inputFocus",
  "sidebarPosition",
  "updateActionable",
  "updateButtonLabel",
];

export const HOST_RESERVED_APPEARANCE_IDS: Readonly<Record<string, readonly string[]>> = {
  recipe: ["dark", "light"],
  colorway: ["dark-fallback", "light"],
  iconTheme: ["default"],
  sentinel: ["followTheme"],
};
export const HOST_RESERVED_APPEARANCE_GRANTS: Readonly<Record<string, readonly string[]>> = {
  "light": ["theme-defaults"],
};
