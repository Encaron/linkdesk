/**
 * kit TS 类型——marketplace.json / authors/<id>.json 的作者面类型（正典 11 §二）。
 *
 * 🔴 与 schema 同源：本文件每个接口的键集由 kitReconcile.test.ts 对 `schemas/marketplace.schema.json`
 *   的 $defs 做集合 diff 钉死（TS 加/删字段而 schema 没跟 = tsc 红；schema 加了而这里没跟 = 测试红）。
 *   类型本体照 `@linkdesk/plugin-sdk` publish.ts 的契约形状（⛔ kit 不依赖 SDK——那是带 vite/react
 *   的构建包，kit 是纯校验工具；两份类型的对账 = 上面对账测试，不靠运行时 import）。
 */

/** 许可密钥载荷（09 §三·补3；壳 license-verify-service.ts 头注 = 格式契约唯一真相源） */
export interface LicenseKeyPayload {
  pluginId: string;
  machine?: string;
  /** unix 秒 */
  exp?: number;
}

/** 版本历史一行（最新在前——publish upsert 保证） */
export interface CatalogVersion {
  version: string;
  downloadUrl: string;
  publishedAt: string;
  changelog?: string;
}

type LocaleText = Record<string, string | undefined>;
type Locales = Record<string, LocaleText>;

/** 目录条目（marketplace.json plugins[]，schema $defs.pluginEntry） */
export interface CatalogEntry {
  id: string;
  /** 语言槽位（name/description；base 字段兜底） */
  locales?: Locales;
  name: string;
  version: string;
  description?: string;
  /** 作者行（schema 只收对象形态；市场 parse 对 string 形态的宽容读是运行时防御，不是声明面） */
  author?: { name: string; url?: string };
  icon?: string;
  iconSource?: string;
  marketIcon?: string;
  marketIconSource?: string;
  /** 主分类（封闭名单——见 categoryWhitelist；名单外 = 市场警告＋落「其他」桶） */
  category?: string;
  /** 小分类副标签（封闭名单选填） */
  categories?: string[];
  /** 聚合键（推荐 GitHub 用户名＝身份正典） */
  authorId?: string;
  screenshots?: Array<string | { type: "video"; url: string; poster?: string }>;
  /** 目录卡封面（绝对 HTTPS URL；缺省按「视频海报 → 首张静帧 → 生成式封面」选帧） */
  cover?: string;
  license?: string;
  repository?: string;
  pricing?: {
    model: "paid";
    price?: number;
    currency?: string;
    licenseUrl: string;
    refundUrl?: string;
    trialDays?: number;
    channel?: "self" | "managed";
  };
  downloadUrl: string;
  size?: number;
  publishedAt?: string;
  minAppVersion?: string;
  readmeUrl?: string;
  readmeLocales?: Record<string, string>;
  versions: CatalogVersion[];
}

/** 官方收录源声明（官方目录仓根 sources[]——收「源」不收条目，11 §九） */
export interface SourceDecl {
  url: string;
  authorId: string;
  addedAt: string;
}

/** 合集声明（R4-4.1 起含 glow/more——市场侧板块级/合集级「两处都认」） */
export interface CollectionDecl {
  id: string;
  /** 语言槽位（title/subtitle/hint；base 字段兜底） */
  locales?: Locales;
  title: string;
  subtitle?: string;
  hint?: string;
  cover?: string;
  layout?: "banner" | "strip" | "duo" | "grid" | "mega" | "small" | "split" | "wall";
  items: string[];
  glow?: boolean;
  more?: SectionMore;
  order?: number;
}

/** 分类 rail 展示顺序声明（顺序 = 数据不是代码） */
export interface CategoryRailDecl {
  order: string[];
  icons?: Record<string, string>;
}

/** 跳转字——target 封闭集合（category:<slug> / rank / repo:<id>），⛔ 任意 URL */
export interface SectionMore {
  label: string;
  /** label 的语言槽位（与合集/板块标题同一解析器：精确语言 → base → base 字段兜底） */
  locales?: Locales;
  target: string;
}

/** hero 轮播单张（至多 5） */
export interface HeroSlide {
  plugin: string;
  tag?: string;
}

/** 作者主页板块声明——type 封闭四件（hero/collection/grid/rank）；「按分类浏览」渲染器硬保留、不可声明 */
export type SectionDecl =
  | { type: "hero"; slides: HeroSlide[]; locales?: Locales; title?: string; hint?: string; glow?: boolean; more?: SectionMore }
  | {
      type: "collection";
      collection: string;
      locales?: Locales;
      layout?: "small" | "mega" | "duo" | "split" | "wall";
      title?: string;
      hint?: string;
      glow?: boolean;
      more?: SectionMore;
    }
  | { type: "grid"; locales?: Locales; title: string; hint?: string; glow?: boolean; more?: SectionMore }
  | { type: "rank"; top?: number; scope?: "self"; locales?: Locales; title?: string; hint?: string; glow?: boolean; more?: SectionMore };

/** 作者块内单个仓段（同 authorId 跨仓聚合） */
export interface AuthorRepo {
  id: string;
  /** 语言槽位（name/intro；base 字段兜底） */
  locales?: Locales;
  name: string;
  intro?: string;
  image?: string;
  sourceUrl: string;
}

/** 作者块（authors/<authorId>.json，schema $defs.authorBlock） */
export interface AuthorFile {
  /** $schema 引用（init 写入——编辑器补全；键合法性 R4-4.3 落地时同笔进 schema） */
  $schema?: string;
  authorId: string;
  /** 语言槽位（intro/storeTitle；base 字段兜底） */
  locales?: Locales;
  name: string;
  avatar?: string;
  introImage?: string;
  intro?: string;
  storeTitle?: string;
  /** Ed25519 公钥（kit keygen 生成——裸 32 字节 base64） */
  publicKey?: string;
  repos: AuthorRepo[];
  homepage?: { locales?: Locales; sections?: SectionDecl[] };
}

/** marketplace.json 根文件（schema 根 properties） */
export interface MarketplaceFile {
  /** $schema 引用（init 写入——编辑器补全；键合法性 R4-4.3 落地时同笔进 schema） */
  $schema?: string;
  version?: string;
  updatedAt?: string;
  plugins: CatalogEntry[];
  sources?: SourceDecl[];
  /** R4-4.5 两读：对象 = inline 声明；字符串 = `collections/<id>.json` 文件夹引用（拆分写法的读取入口） */
  collections?: Array<CollectionDecl | string>;
  categoryRail?: CategoryRailDecl;
}
