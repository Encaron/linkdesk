/**
 * formatEffectiveValue——生效值展示形态（纯函数，零 React 零宿主耦合）。
 * E6#87d 自设置仓 `SettingsView/effectiveBadge.ts` 平移（判据 C：呈现格式化随数据显示，
 * ⛔ 各家插件自算）。判定（哪把 token、跟随主题与否）住宿主；格式化（截首族/配色块）住此处
 * ——设置插件、第三方面板、命令面板谁渲染都是同一个答案。
 *
 * 展示形态按值驱动（色值带色块，字体栈截首族），不认任何 token 键名——调用方对 token 语义零知识。
 */

/** 色值形态判定——rgba()/rgb()/hsl()/#hex（字体族名不可能以此开头，值驱动零 token 键知识） */
const COLOR_VALUE_RE = /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|rgba?\(|hsla?\()/i;

/** 生效值展示形态——色值带色块；字体栈截断逗号显首族（栈过长徽标只显主族名） */
export function formatEffectiveValue(value: string): { label: string; color?: string } {
  if (COLOR_VALUE_RE.test(value)) return { label: value, color: value };
  const first = value.split(",")[0].trim().replace(/^["']|["']$/g, "");
  return { label: first };
}
