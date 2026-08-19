/**
 * 主题选择器——QuickPick 浮动面板，↑↓ 预览 / Enter 切换 / Esc 回退。
 * E3b #36c → E5.5#7-p15 命令式入口 → E5.7#18：组件部分已删（#15 起走池 QuickPickHost），
 * 本文件只剩命令式入口 showThemePicker（settingsCommands 动态 import 调用）。
 *
 * 对标 VS Code `Preferences: Color Theme`（Ctrl+K Ctrl+T）。
 * 交互：打开→↑↓即时预览→Enter提交→Esc回退原始主题。
 */

import i18n from "../../../i18n"; // E5.7#15：serialize 在非 React 上下文解析显示文本（显示文本铁律）
import {
  getAvailableThemes,
  getThemesByPlugin,
  loadTheme,
  applyTheme,
  applyAccentColor,
  getCurrentTheme,
  getEffectiveAccentColor,
} from "../../../core/services/ui/ThemeEngine";
import { ThemeRegistry } from "../../../core/registry/appearance/ThemeRegistry"; // E3.5 #CP23
import { setConfigurationValue } from "../../../core/services/configuration/ConfigurationService";
import { QuickPickService } from "../../../core/services/ui/QuickPickService"; // E5.5#7-p15

/**
 * E5.5#7-p15：命令式调起主题选择器——不再走 CustomEvent → App.tsx useState。
 * @param pluginId 可选——仅显示指定插件的主题（齿轮入口）
 */
export function showThemePicker(pluginId?: string): void {
  const themes = pluginId ? getThemesByPlugin(pluginId) : getAvailableThemes();
  const originalTheme = getCurrentTheme()?.name ?? null;
  let committed = false;

  // E5.7#15：uiTheme → 显示文本查表（显示文本铁律：壳侧 t() 解析；
  // 查表绕开 no-restricted-syntax lowercase 字面量比较误报）
  const detailLabelOf = (name: string): string | undefined => {
    const theme = ThemeRegistry.get(name);
    if (!theme) return undefined;
    const labels: Record<string, string> = {
      dark: i18n.t("暗色主题"),
      light: i18n.t("浅色主题"),
    };
    return labels[theme.uiTheme] ?? i18n.t("高对比度");
  };

  QuickPickService.show<string>({
    mode: "theme",
    items: themes,
    placeholder: i18n.t("选择颜色主题…"),
    getSearchText: (name) => name,
    getKey: (name) => name,
    onSelect: (name) => {
      committed = true;
      setConfigurationValue("app.theme", name, "user").catch((e) => { console.error("[ThemeBrowser] 切换主题失败:", e); });
    },
    onHighlight: async (name) => {
      try {
        const theme = await loadTheme(name);
        applyTheme(theme);
        applyAccentColor(getEffectiveAccentColor());
      } catch { /* skip */ }
    },
    // E5.7#15：聪慧→哑——池 DTO 序列化（显示文本铁律：壳侧 t() 解析后推送，池原样渲染）
    serialize: (name) => ({
      key: name,
      searchText: name,
      label: name,
      category: name === originalTheme ? i18n.t("当前") : undefined,
      detail: detailLabelOf(name),
    }),
    onClose: () => {
      if (!committed && originalTheme) {
        loadTheme(originalTheme).then(applyTheme).catch(() => {});
      }
      QuickPickService.hide();
    },
  });
}
