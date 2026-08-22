/**
 * 主题登记本——所有可用主题的唯一真相源。
 *
 * 三层退路（对标 VS Code）：
 *   第 1 层：settings.json → app.theme（用户选择的首选主题 ID）
 *   第 2 层：插件 contributes.themes 注册到本登记本
 *   第 3 层：index.css :root 硬兜底——本登记本找不到 → 回退到 CSS 默认值
 *
 * ThemeRegistry 只管登记和查询。加载 JSON、写 CSS 变量是 ThemeEngine 的事。
 * 架构：圆形大厅的"主题本"——插件往本子上登记自己提供的主题，谁都可以翻。
 */

import type { ThemeContribution } from "../../api/types";
import { findTheme } from "../../services/ui/ThemeEngine";
import { trackRegistration } from "../registrationTracker"; // E5.8#10：register 返 disposer——卸载自动逆序回滚

interface RegisteredTheme extends ThemeContribution {
  pluginId: string;
}

const themes = new Map<string, RegisteredTheme>();
const pluginThemeIds = new Map<string, string[]>();

export const ThemeRegistry = {
  /** 注册插件贡献的主题。同名 ID 后注册者覆盖（warn）。
   *  E5.8#10 返 disposer：删"这一条"——仅当仍是当前占位者（防删后注册者的覆盖）；
   *  同步从插件 id 列表摘除自身。 */
  register(contribution: ThemeContribution, pluginId: string): () => void {
    const theme: RegisteredTheme = { ...contribution, pluginId };
    if (themes.has(theme.id)) {
      console.warn(
        `[ThemeRegistry] 主题 "${theme.id}" 重复注册——后注册者 "${pluginId}" 覆盖`
      );
    }
    themes.set(theme.id, theme);
    const ids = pluginThemeIds.get(pluginId) ?? [];
    ids.push(theme.id);
    pluginThemeIds.set(pluginId, ids);

    return trackRegistration(pluginId, () => {
      if (themes.get(theme.id) === theme) {
        themes.delete(theme.id);
      }
      const owned = pluginThemeIds.get(pluginId);
      if (owned) {
        const kept = owned.filter((id) => id !== theme.id);
        if (kept.length !== owned.length) {
          if (kept.length === 0) pluginThemeIds.delete(pluginId);
          else pluginThemeIds.set(pluginId, kept);
        }
      }
    });
  },

  /** 注销单个主题 */
  unregister(themeId: string): void {
    themes.delete(themeId);
  },

  /**
   * 三层退路查找。
   * 找到 → 返回 RegisteredTheme（第 1/2 层命中）
   * undefined → 调用方应回退到第 3 层 index.css :root 硬兜底
   *
   * 单真源：ThemeRegistry 自己的登记本未命中 → fallback 到 ThemeEngine（旧格式主题）。
   * 消除双写——不再要求旧格式 manifest.themes/manifest.file 也调 ThemeRegistry.register()。
   */
  get(themeId: string): RegisteredTheme | undefined {
    const registered = themes.get(themeId);
    if (registered) return registered;
    // Fallback：旧格式主题只在 ThemeEngine 中有登记
    const theme = findTheme(themeId);
    if (theme?.pluginId) {
      return {
        id: theme.name,
        label: theme.name,
        uiTheme: theme.type,
        path: "",
        pluginId: theme.pluginId,
      };
    }
    return undefined;
  },

  /** 所有已注册主题 */
  getAll(): RegisteredTheme[] {
    return Array.from(themes.values());
  },

  /** 是否有此主题 */
  has(themeId: string): boolean {
    return themes.has(themeId);
  },
};
