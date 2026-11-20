/**
 * 图标点击直开标签判定——R4-1.1（I14/#18·正典 03 §一·3 方案 B）。
 * 纯函数独立模块（消费方 = tabActions.ts 的 icon:selected 订阅；不挂任何运行时依赖，可单测）。
 *
 *   - tabOnly 插件（tabBar 有、sidePanel 无）＝既有行为恒直开（E5#5b，零变更）；
 *   - 非 tabOnly 插件＝默认只切侧栏（03 §一·1「图标 ≠ 直接跳主区」要保住的现状）；仅当插件在自己
 *     contributes.configuration 声明了全键 `{pluginId}.openTabOnIcon` 且值为 true 时也直开标签。
 * 配置未声明/关 = 零行为差异（getConfigurationValue 对未知键返回 undefined ≠ true）。
 */

export function resolveIconTabOpen(
  manifest: { appearsIn?: { tabBar?: boolean; sidePanel?: boolean } } | undefined,
  openTabOnIcon: unknown,
): boolean {
  if (!manifest) return false;
  const { tabBar, sidePanel } = manifest.appearsIn ?? {};
  if (tabBar && !sidePanel) return true;
  return openTabOnIcon === true;
}
