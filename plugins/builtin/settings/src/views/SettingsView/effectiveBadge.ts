/**
 * effectiveBadge——「跟随主题生效值徽标」纯函数集（E5.8#155）。
 * 播种改空后（#154）设置行在「跟随主题」态只显示空值——徽标补回可见性：行尾显示行实际生效值
 * （对标 VS Code Settings「从默认值继承」：行尾显示当前生效值而非只写「跟随主题」）。
 * E5.8#155 归一化：token 映射声明进配置 schema（ConfigurationProperty.effectiveToken，对齐 sourceKey 先例）——
 * 本文件零映射表，只收「生效 token 声明 + 生效 token 集」解析；展示形态按值驱动（色值带色块，
 * 字体栈截首族），不认任何 token 键名——设置插件对 token 语义零知识（插件独立铁律）。
 * 纯函数解耦——settings 插件无组件测试基建，徽标逻辑单测友好（deriveSourceBadge 同款惯例）。
 */

/**
 * 跟随主题判定——未存用户偏离量（无覆盖 / 清除空 / 播种=基准）＝ deriveSourceBadge 用户条件取反：
 *   user-modified ⟺ userValue 非空且 ≠ baseline（含 __none__ 显式无）。
 * 不能只用「值空」判（glassTint 播种物质化非空 rgba、fontFamily 播种恒空 "" 双形态）——
 * 播种值=基准即「未修改」，值空与值=基准都算跟随主题。与来源徽标同源语义，杜绝两套判定漂移。
 */
export function isFollowingThemeValue(userValue: unknown, baseline: unknown): boolean {
  return !(userValue !== undefined && String(userValue) !== "" && userValue !== baseline);
}

/**
 * 解析生效徽标——键声明 effectiveToken + 跟随主题 + 生效 token 存在 → { tokenKey, value }；缺一不显。
 * effectiveToken 由配置 schema 声明传入（appearance.ts 三键；第三方键声明即得同能力，零壳改动）。
 */
export function resolveEffectiveBadge(
  effectiveToken: string | undefined,
  tokens: Record<string, string>,
  userValue: unknown,
  baseline: unknown,
): { tokenKey: string; value: string } | null {
  if (!effectiveToken) return null;
  if (!isFollowingThemeValue(userValue, baseline)) return null;
  const value = tokens[effectiveToken];
  if (value == null || value === "") return null;
  // 透明哨兵（玻璃无 tint 时引擎写 transparent）= 无实际生效值可显（token 无关通用判定）
  if (value === "transparent") return null;
  return { tokenKey: effectiveToken, value };
}

/** 色值形态判定——rgba()/rgb()/hsl()/#hex（字体族名不可能以此开头，值驱动零 token 键知识） */
const COLOR_VALUE_RE = /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|rgba?\(|hsla?\()/i;

/** 生效值展示形态——色值带色块；字体栈截断逗号显首族（栈过长徽标只显主族名） */
export function formatEffectiveValue(value: string): { label: string; color?: string } {
  if (COLOR_VALUE_RE.test(value)) return { label: value, color: value };
  const first = value.split(",")[0].trim().replace(/^["']|["']$/g, "");
  return { label: first };
}
