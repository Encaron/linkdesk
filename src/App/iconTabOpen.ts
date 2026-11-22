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

/**
 * 容器入口命令解析（0.2.60+ · iconCommand）——图标点击的**归一化入口**。
 *
 * 归一化判据（2026-11-23 拍板）：图标、侧栏按钮、AI 三条路必须汇到**命令面**。
 * 插件在 `contributes.viewsContainers.<id>.iconCommand` 声明一条命令 ⇒ 点图标 = 切到该容器
 * ＋执行该命令；「打开我的主页面」这件事由插件（领域内）定义，壳不再靠 tab type == pluginId
 * 的隐式约定去猜。
 *
 * 选择规则（确定性，防多容器歧义）：
 *   ① 只看**非 `main`** 容器——`main` 是主区渲染面，不是图标栏入口；
 *   ② 容器 id 与 pluginId 相同者优先，其余按声明顺序；
 *   ③ `iconCommand` 必须非空字符串（空白串视为未声明）。
 * 返回 null = 未声明 ⇒ 消费方回落到 resolveIconTabOpen 的旧行为（零行为差异）。
 */
export function resolveIconCommand(
  manifest: { contributes?: { viewsContainers?: unknown } } | undefined,
  pluginId?: string,
): string | null {
  const containers = manifest?.contributes?.viewsContainers;
  if (!containers || typeof containers !== "object" || Array.isArray(containers)) return null;
  const entries = Object.entries(containers as Record<string, unknown>)
    .map(([id, raw]) => ({ id, desc: raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null }))
    .filter((e): e is { id: string; desc: Record<string, unknown> } => e.desc !== null)
    .filter(({ desc }) => desc.location !== "main");
  const ordered = pluginId
    ? [...entries.filter((e) => e.id === pluginId), ...entries.filter((e) => e.id !== pluginId)]
    : entries;
  for (const { desc } of ordered) {
    const cmd = desc.iconCommand;
    if (typeof cmd === "string" && cmd.trim() !== "") return cmd.trim();
  }
  return null;
}
