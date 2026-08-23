/**
 * 主题选择器——两段式 QuickPick（E5.8#50.24）：①选配方 → ②多配色配方选配色变体。
 * ↑↓ 即时预览 / Enter 应用 / Esc 回退。多配色配方 Enter 进阶段 2，单配色直接提交。
 * 命令 theme.pick（settingsCommands）经动态 import 调起。
 *
 * 对标 VS Code `Preferences: Color Theme`（Ctrl+K Ctrl+T）升级版——配方→配色两段
 * （09-命令面 §1 theme.pick：配方→配色两段 / theme.pickColorway 先并入 pick）。
 */

import i18n from "../../../i18n"; // E5.7#15：serialize 在非 React 上下文解析显示文本（显示文本铁律）
import {
  applyRecipe,
  applyTheme,
  applyAccentColor,
  getActiveRecipe,
  getCurrentTheme,
  getEffectiveAccentColor,
  loadTheme,
} from "../../../core/services/ui/ThemeEngine";
import { ThemeRegistry } from "../../../core/registry/appearance/ThemeRegistry"; // E3.5 #CP23
import { setConfigurationValue } from "../../../core/services/configuration/ConfigurationService";
import { QuickPickService } from "../../../core/services/ui/QuickPickService"; // E5.5#7-p15
import type { ThemeRecipe, ThemeColorway } from "../../../core/types/theme"; // 05 schema 配方数据模型

/**
 * E5.5#7-p15：命令式调起主题选择器——不再走 CustomEvent → App.tsx useState。
 * @param pluginId 可选——仅显示指定插件的配方（齿轮入口）
 */
export function showThemePicker(pluginId?: string): void {
  const recipes = pluginId
    ? ThemeRegistry.getRecipesByPlugin(pluginId)
        .map((id) => ThemeRegistry.getRecipe(id))
        .filter((r): r is ThemeRecipe => Boolean(r))
    : ThemeRegistry.getRecipes();
  // 打开前的活动配方/flat 主题——Esc 回退目标
  const originalActive = getActiveRecipe();
  const originalThemeName = getCurrentTheme()?.name ?? null;
  let committed = false;
  let transitioned = false;

  // Esc 回退——回到打开前配方（活动配方优先，flat 主题兜底），并还原强调色
  const revertToOriginal = (): void => {
    if (originalActive) {
      const orig = ThemeRegistry.getRecipe(originalActive.recipeId);
      if (orig) {
        applyRecipe(orig, originalActive.colorwayId || undefined);
        applyAccentColor(getEffectiveAccentColor());
        return;
      }
    }
    if (originalThemeName) {
      loadTheme(originalThemeName)
        .then((theme) => {
          applyTheme(theme);
          applyAccentColor(getEffectiveAccentColor());
        })
        .catch(() => {});
    }
  };

  // 提交——配色变体先写 mode/custom + themeColor（app.theme onApply 同步读取 mode+custom），再写配方 id 触发应用
  const commitTheme = async (recipe: ThemeRecipe, colorwayId?: string): Promise<void> => {
    committed = true;
    try {
      if (colorwayId) {
        await setConfigurationValue("app.themeColorMode", "custom", "user");
        await setConfigurationValue("app.themeColor", colorwayId, "user");
      }
      await setConfigurationValue("app.theme", recipe.id, "user");
    } catch (e) {
      console.error("[ThemeBrowser] 切换主题失败:", e);
    }
  };

  // 阶段 2——多配色配方：选配色变体（Enter 提交 / Esc 回退）
  const showColorwayStage = (recipe: ThemeRecipe): void => {
    transitioned = true;
    QuickPickService.show<ThemeColorway>({
      mode: "theme",
      items: recipe.colorways,
      placeholder: i18n.t("选择配色变体…"),
      getSearchText: (cw) => cw.name,
      getKey: (cw) => cw.id,
      onSelect: (cw) => { void commitTheme(recipe, cw.id); },
      onHighlight: (cw) => {
        applyRecipe(recipe, cw.id);
        applyAccentColor(getEffectiveAccentColor());
      },
      // E5.7#15：聪慧→哑——池 DTO 序列化（显示文本铁律：壳侧 t() 解析后推送，池原样渲染）
      serialize: (cw) => ({
        key: cw.id,
        searchText: cw.name,
        label: cw.name,
        category: recipe.name, // 配色归属配方——列表语境不丢
        checked: originalActive?.recipeId === recipe.id && originalActive.colorwayId === cw.id,
      }),
      onClose: () => {
        if (!committed) revertToOriginal();
        QuickPickService.hide();
      },
    });
  };

  // 阶段 1——选配方（多配色配方 Enter 进阶段 2）
  QuickPickService.show<ThemeRecipe>({
    mode: "theme",
    items: recipes,
    placeholder: i18n.t("选择主题配方…"),
    getSearchText: (r) => r.name,
    getKey: (r) => r.id,
    onSelect: (recipe) => {
      if (recipe.colorways.length > 1) {
        showColorwayStage(recipe);
      } else {
        void commitTheme(recipe);
      }
    },
    onHighlight: (recipe) => {
      applyRecipe(recipe);
      applyAccentColor(getEffectiveAccentColor());
    },
    serialize: (r) => ({
      key: r.id,
      searchText: r.name,
      label: r.name,
      checked: originalActive?.recipeId === r.id,
      detail:
        r.colorways.length > 1
          ? `${typeLabelOf(r.type)} · ${i18n.t("{{count}} 配色", { count: r.colorways.length })}`
          : typeLabelOf(r.type),
    }),
    onClose: () => {
      // 阶段 2 已接管——桥 select 动作 onSelect→onClose 同步连发，防误关（stage-1 onClose 提前 return）
      if (transitioned) return;
      if (!committed) revertToOriginal();
      QuickPickService.hide();
    },
  });
}

/** 配方类型 → 显示文本（浅色/暗色主题；查表绕开 no-restricted-syntax lowercase 字面量比较误报） */
function typeLabelOf(type: "light" | "dark"): string {
  const labels: Record<string, string> = {
    light: i18n.t("浅色主题"),
    dark: i18n.t("暗色主题"),
  };
  return labels[type] ?? i18n.t("浅色主题");
}
