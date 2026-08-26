/**
 * 强调色独立轴（#98）——applyAccentColor 写 :root --accent 三键 + 广播 accent:changed；getEffectiveAccentColor 归一读取。
 * 会话态（_lastAppliedAccent）在 state.ts；门面 getAppliedAccent 直接 re-export state。
 * 依赖：state（getCurrentTheme / setAppliedAccent）+ ConfigurationService。
 */

import { getConfigurationValue } from "../../configuration/ConfigurationService";
import { ACCENT_TOKEN_KEYS } from "./constants";
import { getCurrentTheme, setAppliedAccent } from "./state";

/**
 * 应用用户自定义强调色——覆盖主题自带的 accent。
 * 预览主题时调用：先 applyTheme（含主题的 accent）再 applyAccentColor（用户的 accent 盖回去）。
 * E5.8 Phase 11.15 归一化：三键写 :root + 广播载荷共用 ACCENT_TOKEN_KEYS 单一清单（无手抄字面量）。
 */
export function applyAccentColor(hexColor: string): void {
  setAppliedAccent(hexColor);
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const accentValues: Record<(typeof ACCENT_TOKEN_KEYS)[number], string> = {
    accent: hexColor,
    "accent-hover": `rgb(${Math.min(255, r + 30)},${Math.min(255, g + 30)},${Math.min(255, b + 30)})`,
    "accent-light": `rgba(${r},${g},${b},0.15)`,
  };
  for (const key of ACCENT_TOKEN_KEYS) {
    document.documentElement.style.setProperty(`--${key}`, accentValues[key]);
  }

  // E5.5#7-fix：广播强调色到所有插件 WebView——对标 applyTheme 的 broadcast（同一键清单单一权威）
  const accentVars: Record<string, string> = {};
  for (const key of ACCENT_TOKEN_KEYS) accentVars[`--${key}`] = accentValues[key];
  const linkdesk = window.linkdesk;
  if (linkdesk?.bridge?.broadcast) {
    linkdesk.bridge.broadcast("accent:changed", {
      themeId: getCurrentTheme()?.name ?? "",
      variables: accentVars,
    });
  }
}

/**
 * 获取有效强调色——三种路径归一化：
 *   accentSource=followTheme + 主题有 accent → 主题色
 *   accentSource=followTheme + 主题无 accent → 自定义兜底
 *   accentSource=custom → 自定义色
 *
 * 所有需要强调色的地方（onApply app.theme / ThemeBrowser 预览）都走此函数——
 * 不要各自手写 if/else 判断。
 * E5.8#98：强调色独立轴——app.accentSource（跟随主题/自定义）从外观主开关解耦（14-档案 §十二）。
 *   #90 曾并入 appearanceMode（单一外观轴），2026-08-26 用户拍板强调色可独立于外观主开关单独调——
 *   appearanceMode=followTheme 也能只把强调色换成自定义（常显来源开关）。applyTheme 路径调本函数，
 *   accentSource=followTheme 时新主题 accent 自动生效（无孤儿路径）。
 * ⚠️ 陷阱：getConfigurationValue 对未注册键（_validateEnum 直通）返回原始值，且缺省回退
 * getSystemFallback（仅 app.theme/language 硬编码）→ 未写键返回 undefined。若沿用旧
 * `?? "custom"`（旧 accentMode 默认）→ 永远 custom → 跟随主题被打破。须 `?? "followTheme"`。
 */
export function getEffectiveAccentColor(): string {
  const source = (getConfigurationValue("app.accentSource") as string) ?? "followTheme";
  // E5.8#99：#5 清除语义——accentColor 清除（空串）→ 跟随主题强调色（对标 backgroundImage/fontFamily 清除 = 回主题）。
  //   缺省（未写）仍读 schema 默认 #0078d4（startup.ts 同源）；显式清空才走主题兜底。
  const customColor = (getConfigurationValue("app.accentColor") as string) ?? "";
  const theme = getCurrentTheme();
  const themeAccent = theme?.colors?.accent;
  if (source === "followTheme") {
    if (themeAccent) return themeAccent;
  }
  if (customColor) return customColor;
  // custom + 清除 → 回主题强调色（14-档案 #99 清除语义统一）；主题无 accent → 最终兜底数据默认
  if (themeAccent) return themeAccent;
  // E5.8#6.6 hex 豁免：配置读取兜底默认值数据（与 startup.ts 默认值同源）
  // eslint-disable-next-line linkdesk/no-hardcoded-hex
  return "#0078d4";
}
