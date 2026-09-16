/**
 * 主题注册表——插件主题登记/注销/查询 + 壳内置兜底配方 + Theme 数据模型。
 * 会话态（currentTheme 等）在 state.ts——本模块不持有渲染态。
 */

import { trackRegistration } from "../../../registry/registrationTracker"; // E5.8#10：register 返 disposer——卸载自动逆序回滚
// E6#111f／1.36：外观 id 归属仲裁（flat 本键 = 显示名 ⇒ reservedFace:false，只判"覆盖宿主兜底要出声"）
import { judgeAppearanceId, logAppearanceIdRejection, NOOP_DISPOSE } from "../../../registry/appearance/appearanceOwnership";
// E5.8#50.15：质感类型下沉 core/types/theme.ts（05 schema 配方数据模型）——此处重导出兼容既有消费方
//  ThemeColors 不入门面（零消费方——knip 门禁留死导出，api/types.ts 走 types/theme 直取）
import type { ThemeColors, ThemeSurface, ThemeBackground } from "../../../types/theme";
export type { ThemeSurface, ThemeBackground } from "../../../types/theme";
import { ThemeRegistry } from "../../../registry/appearance/ThemeRegistry";

export interface Theme {
  name: string;
  type: "dark" | "light";
  colors: ThemeColors;
  /** 玻璃/悬浮质感（缺省 = 无玻璃无悬浮，现有主题零变化） */
  surface?: ThemeSurface;
  /** 图片背景（缺省 = 无图，现有主题零变化） */
  background?: ThemeBackground;
  /** 提供方插件 ID——单真源：ThemeRegistry.get() fallback 通过此字段找到归属 */
  pluginId?: string;
}

/** 插件注册的主题——name → Theme */
const pluginThemes = new Map<string, Theme>();

/** 插件 → 主题名列表——卸载时批量清理 */
const _pluginThemeNames = new Map<string, string[]>();

/**
 * Phase 4：注册插件提供的主题。
 * 插件加载器扫描到 type: "theme" 插件后调用此函数。
 * 注册后的主题和内置主题在同一个列表中，不区分来源。
 *
 * 🔴 **E6#111f／1.36 起改为归属仲裁**：原先「覆盖 fallback 主题（无 pluginId）不告警」是**明写的预期**
 *   ——本格**废除**（判据⑥：覆盖宿主兜底要**出声**）。三条分支照 §二.3：
 *   · 同 pluginId 重注册 ⇒ 不变（装配路径多阶段，不出声不拒 —— 反向负控）
 *   · 宿主兜底条目被插件覆盖 ⇒ 不在证照内 = **拒 ＋ `console.error`**
 *   · 异插件同 key ⇒ **先者保留 ＋ 拒后者** ＋ 点名双方
 *   ⚠️ 本册的键是**显示名**（`theme.name`，非 id）⇒ `reservedFace: false`：**不判"这个名字是不是宿主保留面"**
 *   （§二.2 ⑧ 显示名冲突不判），只判上面那条"覆盖宿主兜底要出声"。往上报 `theme.name` 就是名字空间本身。
 */
export function registerTheme(theme: Theme, pluginId?: string): () => void {
  const prev = pluginThemes.get(theme.name);
  const verdict = judgeAppearanceId({
    space: "recipe",
    id: theme.name,
    pluginId,
    prevOwner: prev?.pluginId,
    occupied: pluginThemes.has(theme.name),
    reservedFace: false,
  });
  if (!verdict.accept) {
    logAppearanceIdRejection("[ThemeEngine]", verdict);
    return NOOP_DISPOSE;
  }
  // 单真源：存储 pluginId 到 Theme 对象——ThemeRegistry.get() fallback 通过此字段找到归属
  if (pluginId) {
    theme.pluginId = pluginId;
  }
  pluginThemes.set(theme.name, theme);
  if (pluginId) {
    const names = _pluginThemeNames.get(pluginId) ?? [];
    if (!names.includes(theme.name)) {
      names.push(theme.name);
    }
    _pluginThemeNames.set(pluginId, names);
  }

  // E5.8#10：disposer = 删"这一条"——仅当仍是当前占位者（防删后注册者的覆盖）；
  // 无 pluginId（fallback 主题——非插件域）→ 不追踪，返裸 disposer。
  const dispose = (): void => {
    if (pluginThemes.get(theme.name) === theme) {
      pluginThemes.delete(theme.name);
    }
    if (pluginId) {
      const names = _pluginThemeNames.get(pluginId);
      if (names) {
        const kept = names.filter((n) => n !== theme.name);
        if (kept.length !== names.length) {
          if (kept.length === 0) _pluginThemeNames.delete(pluginId);
          else _pluginThemeNames.set(pluginId, kept);
        }
      }
    }
  };
  return pluginId ? trackRegistration(pluginId, dispose) : dispose;
}

/** E2c #19h A3：注销单个主题 */
export function unregisterTheme(name: string): void {
  pluginThemes.delete(name);
}

/** 获取所有已注册主题的名称（仅插件提供——主题全走 contributes.themes） */
export function getAvailableThemes(): string[] {
  return Array.from(pluginThemes.keys());
}

/** 获取指定插件注册的主题名称——插件卡片齿轮用（VS Code 同款过滤） */
export function getThemesByPlugin(pluginId: string): string[] {
  return _pluginThemeNames.get(pluginId) ?? [];
}

/** 从插件注册表加载主题——三层退路：ThemeRegistry → 找不到抛错（调用方回退到 index.css :root） */
export async function loadTheme(themeName: string): Promise<Theme> {
  const pluginTheme = pluginThemes.get(themeName);
  if (pluginTheme) return pluginTheme;
  throw new Error(`Theme "${themeName}" not found——主题未注册或已被卸载`);
}

/** 同步查找主题——ThemeRegistry.get() 单真源 fallback（旧格式主题未在 ThemeRegistry 登记时走此路） */
export function findTheme(themeName: string): Theme | undefined {
  return pluginThemes.get(themeName);
}

/**
 * 内置兜底配方——在插件加载前注册，确保卸载全部主题插件后设置下拉框仍有 dark/light 配方。
 * 空 colorways（colors: {}）——应用时清空插件变量，index.css :root 硬兜底接管。
 * 插件主题（theme-defaults）后注册同名配方（id "light"）→ 覆盖亮兜底；"dark" 兜底保持空配方
 *   → :root 硬兜底接管（历史 dark.json 调色板）。registerRecipe 无归属不告警。
 * E5.8#50.21：壳兜底从 flat Theme 迁为 Recipe（决策 F 迁移表「壳内置配方 id」），不再进 flat 登记本。
 *
 * 🔥 #59c fix：防重入——React StrictMode 双重 effect 导致本函数在插件加载后再次执行。
 */
let _fallbacksRegistered = false;
export function registerFallbackThemes(): void {
  if (_fallbacksRegistered) return;
  _fallbacksRegistered = true;
  ThemeRegistry.registerRecipe(
    // E5.8 主题过老修正：配色变体 id 须全局唯一（theme.ts L92 契约）——兜底 dark 配方配色 id 若仍为 "dark"
    //   与 theme-defaults "light" 配方的 "dark" 配色冲突 → 自定义模式配色下拉 React key 碰撞。
    //   改名 dark-fallback 不破坏遗留 app.themeColor="dark" 解析：resolveColorway 未命中回落 colorways[0]（空配色同渲染）。
    { id: "dark", name: "Dark", type: "dark", colorways: [{ id: "dark-fallback", name: "Dark", colors: {} }] },
    undefined
  );
  ThemeRegistry.registerRecipe(
    { id: "light", name: "Light", type: "light", colorways: [{ id: "light", name: "Light", colors: {} }] },
    undefined
  );
}
