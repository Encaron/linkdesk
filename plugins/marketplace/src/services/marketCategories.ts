/**
 * marketCategories — 目录条目标的分显示域（纯函数，vitest 直测，零 window/IO/i18n 依赖）。
 * E6#32b（2026-09-08 用户拍板 B：英文 slug 作分类值，VS Code 式）——
 *   catalog `category`（legacy 单值）/`categories[]`（多值）= 英文 slug（`serial`/`tool`），
 *   翻译走 i18n `category.*` 键 → en.json（→English）+ zh.json（→中文）双值表；
 *   无对应键的 slug → 显示原文（尊重第三方自定义分类，不硬编码白名单）。
 *   🔥 英文 slug 作身份 = 需 zh 值表的例外（schema「不需要 zh.json」只对中文 key 成立）——
 *   plugin.json contributes.i18n 增 zh 即为此落地。全仓首批英文身份 + 双语值表试点。
 *
 * 本模块只做「分类列表 → 显示文本」纯变换：并集去重 / 逐 slug 翻译（t 注入）/ 连接。
 * 消费者 = DetailView 元数据「分类」行（当前唯一显示点）；未来主区商店「分类 rail」复用。
 */

/** catalog 条目分类 → 显示列表——legacy category 在前，categories[] 续后，去重保序。
 *  entry 两形态并存（category="serial" + categories=["serial","tool"]）→ 归并 ["serial","tool"]。 */
export function categoryListFromEntry(category?: string, categories?: string[]): string[] {
  const out: string[] = [];
  const push = (c: string) => {
    const slug = c?.trim();
    if (slug && !out.includes(slug)) out.push(slug);
  };
  push(category ?? "");
  for (const c of categories ?? []) push(c);
  return out;
}

/** 单分类翻译——`t("category." + slug)`；译文 ≠ key（未命中）→ 回退原始 slug。
 *  i18next parseMissingKeyHandler 返回 key 本身 → 以「返回值 === 传入 key」判未命中。 */
export function localizeCategory(t: (key: string) => string, slug: string): string {
  const key = `category.${slug}`;
  const translated = t(key);
  return translated === key ? slug : translated;
}

/** 「分类」行显示文本——全部 slug 逐项翻译后「 · 」连接（mockup 01 定稿多值样式）；空 → undefined（行隐藏） */
export function categoryText(
  t: (key: string) => string,
  category?: string,
  categories?: string[],
): string | undefined {
  const list = categoryListFromEntry(category, categories);
  if (list.length === 0) return undefined;
  return list.map((slug) => localizeCategory(t, slug)).join(" · ");
}
