/**
 * 分类封闭名单——kit 侧唯一数据文件（正典 = Marketplace-Store/04-分类体系.md §5.1，2026-11-20 二次拍板）。
 *
 * 🔴 同源纪律（详案 R4-4.2 判据）：本表与市场插件 parse 白名单（`marketCatalog/categories.ts`）
 *   是同一份正典（04 §5.1）的两次照抄——对账腿＝插件仓 `catalogV2Reconcile.test.ts`（对**已安装
 *   kit 的本表**对账，版本感知，接手棒落）＋ 本包 kitReconcile.test.ts（类型 ↔ schema ↔ 本表自洽）。
 *   ⛔ 两边各自扩名单 = 三方漂移；名单扩充只走 04 §5.3 SOP（用户明示），改完两处同笔。
 *
 * 本文件同时是 validate 报错的「可用清单」数据源：作者写了名单外值时，错误信息直接列出全表
 * （08 作者知晓面——作者面对报错不需要翻任何文档就知道能写什么）。
 */

/** 现役 7 桶（04 §5.1；⛔ 扩桶 = 用户明示走 04 §5.3 SOP） */
export const PRIMARY_CATEGORY_SLUGS = [
  "development",
  "documents",
  "hardware",
  "network",
  "productivity",
  "themes",
  "entertainment",
] as const;

/** 主分类 zh 显示名（04 §5.1；显示名走市场值表，这里只是报错清单的标注） */
export const PRIMARY_CATEGORY_ZH: Readonly<Record<string, string>> = {
  development: "开发",
  documents: "文档",
  hardware: "硬件",
  network: "网络",
  productivity: "效率",
  themes: "主题",
  entertainment: "娱乐",
};

/** 小分类封闭名单（04 §5.1 逐格照抄；slug 全英文） */
export const SUBCATEGORY_SLUGS: Readonly<Record<string, readonly string[]>> = {
  development: ["code-editing", "terminal", "vcs", "runtime", "i18n", "debug", "snippets"],
  documents: ["viewer", "convert", "markdown", "files", "office-doc", "notebook"],
  hardware: ["serial", "flash", "probe", "smart-control", "home-automation", "sensor", "iot", "can-bus"],
  network: ["browser", "chat", "cloud", "download", "packet-capture", "proxy", "remote"],
  productivity: ["clipboard", "notes", "ai", "color", "todo", "timer", "launcher", "calculator"],
  themes: ["color-scheme", "icon-pack", "font-pack", "wallpaper", "cursor-set", "sound-pack"],
  entertainment: ["player", "game", "music", "comic", "novel", "stream"],
};

const PRIMARY_SET = new Set<string>(PRIMARY_CATEGORY_SLUGS);
const SUBCATEGORY_SET = new Set<string>(Object.values(SUBCATEGORY_SLUGS).flat());

/** 主分类 slug 在册？（7 桶之一；`other` 不是声明值，是兜底桶） */
export function isKnownPrimaryCategory(slug: string): boolean {
  return PRIMARY_SET.has(slug);
}

/** 小分类 slug 在册？（跨桶并集——schema 不编码父子关系，校验只判「是不是名单里的人」） */
export function isKnownSubcategory(slug: string): boolean {
  return SUBCATEGORY_SET.has(slug);
}

/** 可用清单全表（04 §5.1）——直接拼进报错信息，作者不用翻文档 */
export function formatCategoryWhitelist(): string {
  return PRIMARY_CATEGORY_SLUGS.map((slug) => {
    const subs = SUBCATEGORY_SLUGS[slug]?.join(", ") ?? "";
    return `  ${slug}(${PRIMARY_CATEGORY_ZH[slug]}): ${subs}`;
  }).join("\n");
}

/** 主分类清单（rail 校验用的一行版） */
export function formatPrimaryCategories(): string {
  return PRIMARY_CATEGORY_SLUGS.map((s) => `${s}(${PRIMARY_CATEGORY_ZH[s]})`).join(", ");
}
