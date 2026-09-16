/**
 * 🔴 **生成式文件——别手改。** 生成器 = `scripts/gen-host-reserved.mjs`（`npm run audit:plugin-scope:regen`）。
 *
 * 是什么：宿主保留面的**运行时副本**——壳运行时用它判四件事：
 *   · `HOST_RESERVED_CONFIG_KEYS`——插件不得占用的宿主配置键（保护区；撞了 ⇒ 拒绝注册 ＋ console.error）
 *   · `HOST_PSEUDO_PLUGIN_IDS`——宿主自己的注册身份（`app` = 壳通用 / `appearance` = 外观 / `update` = 更新）
 *   · `HOST_RESERVED_APPEARANCE_IDS`——宿主兜底外观 id，**按空间分栏**（recipe / colorway / iconTheme /
 *     sentinel）；两个空间不许合栏（配方 id 与配色 id 是两个名字空间，合栏 ⇒ 官方主题仓假红）
 *   · `HOST_RESERVED_APPEARANCE_GRANTS`——外观 id 的**证照**（id → 宿主之外的正当持有者）。🔴 **不是白名单**：
 *     按 id 记持有者，不记「哪些仓被宽恕」⇒ 新插件永远不在表里、永远判红
 *
 * 为什么运行时需要一份**静态**副本（而不是「看谁先注册」）：
 *   宿主真键里有**从未被注册**的（`app.schemaVersion`——settings.json 的内部标志键），
 *   靠「宿主注册在先」这条顺序事实判不出来。**正确性不许押在注册顺序上**（1.33 §11.1 裁决）。
 *
 * 三份同源：壳账 `scripts/host-reserved.json` · SDK 副本 `packages/plugin-sdk/schemas/host-reserved.json`
 *   · 本文件。漂移由 `node scripts/gen-host-reserved.mjs --check` 拦（四向对账）。
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

export const HOST_RESERVED_APPEARANCE_IDS: Readonly<Record<string, readonly string[]>> = {
  recipe: ["dark", "light"],
  colorway: ["dark-fallback", "light"],
  iconTheme: ["default"],
  sentinel: ["followTheme"],
};
export const HOST_RESERVED_APPEARANCE_GRANTS: Readonly<Record<string, readonly string[]>> = {
  "light": ["theme-defaults"],
};
