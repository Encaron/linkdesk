/**
 * types — 目录域的数据形状（零实现，纯声明）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketCatalog.ts` 原样搬出，零行为变更。
 */

/** 市场目录单条目——marketplace.json plugins[] 元素（作者侧声明，sourceId 为合并时注入） */
export interface CatalogEntry {
  id: string;
  name: string;
  version: string;
  description?: string;
  /** author 兼容两种形态：文档形态 {name,url} / 旧平铺 string */
  author?: { name?: string; url?: string } | string;
  icon?: string;
  /** "lucide" | "codicon" | "url"——url 形态 = 作者自制彩色图以 img 元素直载（E6#29c/06-图标.md） */
  iconSource?: "lucide" | "codicon" | "url";
  category?: string;
  categories?: string[];
  downloadUrl?: string;
  size?: number;
  publishedAt?: string;
  minAppVersion?: string;
  /** 版本历史（最新在前）——版本下拉数据源（E6#29c） */
  versions?: Array<{ version: string; downloadUrl?: string; publishedAt?: string; changelog?: string }>;
  readmeUrl?: string;
  screenshots?: string[];
  license?: string;
  /** 合并注入：条目来源仓库名（owner/repo）——用户知道装的是谁的（E6#30c 来源标注） */
  sourceName?: string;
  /** 合并注入：该胜出条目来自官方默认源（E6#30.8f「官方发布」徽标——官方身份随条目携带，UI 零再判） */
  official?: boolean;
  /** 合并注入：该胜出条目来源的可 fetch URL——判 http 明文源用（E6#71k：http 源信任不可记忆，
   *  见 08-信任与安全 §四.2。sourceName 对 http/https 同形，判不出明文，故恒带 URL） */
  sourceUrl?: string;
  /** 作者显式声明的**插件自己的**主页（E6#77 乙）——完整 URL。非 GitHub 托管 / CDN / 自有官网的
   *  唯一出口；缺省则由 downloadUrl / readmeUrl 推（见 pluginRepoUrl），推不出 → 详情页不渲染该行 */
  repository?: string;
}

/** marketplace.json 根结构 */
export interface MarketplaceCatalog {
  version?: string;
  updatedAt?: string;
  plugins: CatalogEntry[];
}

/** parse 结果——失败给原因（#30f 目录损坏空态判断依据，不抛） */
export type ParseResult =
  | { ok: true; catalog: MarketplaceCatalog }
  | { ok: false; reason: string };

/** 版本下拉可选单条（E6#33c——05 §四：下拉每条 {version, downloadUrl, publishedAt?, changelog?}，选中哪条拉哪条） */
export interface CatalogVersionChoice {
  version: string;
  downloadUrl: string;
  publishedAt?: string;
  changelog?: string;
}
