/**
 * 主题/语言回退——插件被禁用或卸载时，若当前主题/语言来自它，自动换到替代项。
 * E6#84（第 3.6 层文件整理）feature-folder 拆分：自 `lifecycle-ops.ts` 原样搬出，零行为变更。
 *
 * 🔴 **三个函数必须与 `unloadPlugin` 保持既有时序**（调用点在 `state-toggles.ts`）：
 *   revert 必须在 onWillUninstall **之前**（卸载钩子注销主题/语言后，revert 就找不到归属了）；
 *   而 `reapplyThemeAfterUnload` 必须在 unload **之后**（源配方摘除后才轮到缺域回退，见该函数注释）。
 *   搬家只动位置，不动顺序。
 */

import { getConfigurationValue, setConfigurationValue } from "../../../core/services/configuration/ConfigurationService";
import { getAvailableThemes, normalizeThemeValue, isMixSourceOwner } from "../../../core/services/ui/ThemeEngine";
import { ThemeRegistry } from "../../../core/registry/appearance/ThemeRegistry";
import { LanguageRegistry } from "../../../core/registry/languages/LanguageRegistry";

/** 当前语言是否来自此插件——卸载/禁用当前语言时自动回退（对标 revertThemeIfCurrent） */
export async function revertLanguageIfCurrent(pluginId: string): Promise<void> {
  try {
    const currentLang = getConfigurationValue<string>("app.language") ?? "zh";
    const lang = LanguageRegistry.get(currentLang);
    if (!lang || lang.pluginId !== pluginId) return;

    // 当前语言来自被卸载/禁用的插件 → 找替代
    const languages = LanguageRegistry.getAll();
    const fallback = languages.length > 0
      ? (languages.find(l => l.id === "zh")?.id ?? languages[0].id)
      : "zh";
    await setConfigurationValue("app.language", fallback, "user");
  } catch { /* 非关键路径 */ }
}

/**
 * 当前主题是否来自此插件——卸载/禁用当前主题时自动回退。
 * E5.8#61 审计#1：返回 true = 本插件是混搭来源（app.mix* 引用其配方/配色）——
 * 调用方必须在 unloadPlugin 之后调 reapplyThemeAfterUnload 重合并（回退时机见该函数注释）。
 */
export async function revertThemeIfCurrent(pluginId: string): Promise<boolean> {
  try {
    // E5.8#50.21：读时归一化——legacy "Dark"/"Light" 匹配不到（无 flat 登记）会漏判，先转配方 id
    const currentTheme = normalizeThemeValue(getConfigurationValue<string>("app.theme"));
    const theme = ThemeRegistry.get(currentTheme ?? "");

    // 活动主题来自本插件 → 换替代主题（配方优先，flat 退路；值归一化落配置）
    if (theme?.pluginId === pluginId) {
      const available = [...ThemeRegistry.getRecipes().map((r) => r.id), ...getAvailableThemes()];
      if (available.length > 0) {
        await setConfigurationValue("app.theme", normalizeThemeValue(available[0]) ?? available[0], "user");
      }
      // 无可用主题 → 保持当前 CSS（index.css :root 为兜底），设定下次启动的默认值
    }

    // 混搭来源判定必须在 unloadPlugin 之前（此刻配方仍注册，isMixSourceOwner 才能解析到归属）；
    // 真重应用推迟到 unload 之后（见 reapplyThemeAfterUnload）。
    return isMixSourceOwner(pluginId);
  } catch {
    return false;
  }
}

/**
 * E5.8#61 审计#1：混搭来源插件卸载/禁用后的主题重应用——必须在 unloadPlugin 之后调用。
 * 时机：unload 前源配方仍注册，此刻重合并 resolveDomainSource 能找到来源 → 域不会回退；
 * 配方摘除后再合并，来源缺失走 #58 缺域回退回主题基线——:root 残留颜色/字体才真正清掉。
 * 同值重写 app.theme 触发 applier → applyThemeIfReady 重合并（仅当 revertThemeIfCurrent 返回 true 才调用）。
 */
export async function reapplyThemeAfterUnload(): Promise<void> {
  try {
    const cur = normalizeThemeValue(getConfigurationValue<string>("app.theme"));
    if (cur) await setConfigurationValue("app.theme", cur, "user");
  } catch { /* 非关键路径 */ }
}
