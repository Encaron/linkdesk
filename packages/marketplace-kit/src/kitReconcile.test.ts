/**
 * K2 三方对账测试（kit 侧两腿——正典 11 §五「类型 ↔ 白名单 ↔ Schema 任一方多/少字段即红」）。
 *
 *   ① kit 的 marketplace.schema.json 与 @linkdesk/plugin-sdk 的 **字节相等**——schema 唯一真源
 *      住 SDK（市场腿② catalogV2Reconcile 对已安装 SDK schema 对账），kit 是它的校验消费方；
 *      SDK 改 schema 而 kit 忘了跟 = 本测试红（R4-4.1 交办 glow/more 就是这条链上走过的）。
 *   ② kit 的 authors.schema.json 是从 SDK schema $defs **机械派生**的——这里重新派生并深比较。
 *   ③ kit TS 类型 ↔ schema $defs 集合 diff（`Record<keyof T, true>` 编译器强制逐键，漏键 = tsc 红；
 *      schema 加字段而类型没跟 = 测试红）。
 *
 * 🔴 名单对账腿（白名单 ↔ 市场 parse categories.ts）住**市场插件仓**——对已安装 kit 的
 *    categoryWhitelist 数据对账（版本感知）。启动词红线「市场插件仓本棒不碰」⇒ 该腿挂账棒 12
 *    （交接段已报备，非静默丢）。本文件管得了的两腿全在。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AuthorFile,
  CatalogEntry,
  CatalogVersion,
  CollectionDecl,
  HeroSlide,
  MarketplaceFile,
  SectionDecl,
  SectionMore,
  SourceDecl,
} from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT_SCHEMA = join(HERE, "../schemas/marketplace.schema.json");
const SDK_SCHEMA = join(HERE, "../../plugin-sdk/schemas/marketplace.schema.json");
const KIT_AUTHORS_SCHEMA = join(HERE, "../schemas/authors.schema.json");

describe("K2 对账腿①——kit schema ↔ SDK schema 字节相等", () => {
  it("marketplace.schema.json 与 plugin-sdk 侧逐字节一致（schema 唯一真源 = SDK）", () => {
    const kit = readFileSync(KIT_SCHEMA, "utf8");
    const sdk = readFileSync(SDK_SCHEMA, "utf8");
    if (kit !== sdk) {
      throw new Error(
        `kit schema 与 SDK schema 漂移（kit ${kit.length}B vs SDK ${sdk.length}B）——把 SDK 的 marketplace.schema.json 拷贝进 kit/schemas/（同笔发布两包）`,
      );
    }
    expect(kit).toBe(sdk);
  });

  it("authors.schema.json = SDK $defs(authorBlock+传递依赖) 的机械派生（深比较）", () => {
    const sdk = JSON.parse(readFileSync(SDK_SCHEMA, "utf8")) as { $defs: Record<string, object> };
    const needed = ["authorBlock", "authorRepo", "homepageSection", "heroSlide", "moreLink", "localeTexts"];
    const defs: Record<string, object> = {};
    for (const k of needed) defs[k] = sdk.$defs[k]!;
    const expected = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://unpkg.com/@linkdesk/marketplace-kit/schemas/authors.schema.json",
      title: "LinkDesk author block (authors/<authorId>.json)",
      description: expect.any(String),
      $ref: "#/$defs/authorBlock",
      $defs: defs,
    };
    expect(JSON.parse(readFileSync(KIT_AUTHORS_SCHEMA, "utf8"))).toEqual(expected);
  });
});

/* ── K2 对账腿③——TS 类型 ↔ schema 集合 diff（机械，⛔ 手工例举）────────────── */

const SCHEMA = JSON.parse(readFileSync(KIT_SCHEMA, "utf8")) as {
  properties?: Record<string, unknown>;
  required?: string[];
  $defs: Record<string, { properties?: Record<string, unknown>; required?: string[] }>;
};

const propsOf = (def: { properties?: Record<string, unknown> }): string[] => Object.keys(def.properties ?? {}).sort();

const TS_ROOT_KEYS: Record<keyof MarketplaceFile, true> = {
  "$schema": true,
  version: true,
  updatedAt: true,
  plugins: true,
  sources: true,
  collections: true,
  categoryRail: true,
};

const TS_ENTRY_KEYS: Record<keyof CatalogEntry, true> = {
  id: true,
  locales: true,
  name: true,
  version: true,
  description: true,
  author: true,
  icon: true,
  iconSource: true,
  marketIcon: true,
  marketIconSource: true,
  category: true,
  categories: true,
  authorId: true,
  screenshots: true,
  cover: true,
  license: true,
  repository: true,
  pricing: true,
  downloadUrl: true,
  size: true,
  publishedAt: true,
  minAppVersion: true,
  readmeUrl: true,
  readmeLocales: true,
  versions: true,
};

const TS_VERSION_KEYS: Record<keyof CatalogVersion, true> = { version: true, downloadUrl: true, publishedAt: true, changelog: true, sha256: true };

const TS_SOURCE_KEYS: Record<keyof SourceDecl, true> = { url: true, authorId: true, addedAt: true };

const TS_COLLECTION_KEYS: Record<keyof CollectionDecl, true> = {
  id: true,
  locales: true,
  title: true,
  subtitle: true,
  hint: true,
  cover: true,
  layout: true,
  items: true,
  glow: true,
  more: true,
  order: true,
};

const TS_MORE_KEYS: Record<keyof SectionMore, true> = { label: true, locales: true, target: true };

const TS_HERO_SLIDE_KEYS: Record<keyof HeroSlide, true> = { plugin: true, tag: true };

const TS_AUTHOR_KEYS: Record<keyof AuthorFile, true> = {
  "$schema": true,
  authorId: true,
  locales: true,
  name: true,
  avatar: true,
  introImage: true,
  intro: true,
  storeTitle: true,
  publicKey: true,
  repos: true,
  homepage: true,
};

/** SectionDecl 四变体的键并集（discriminator "type" 由 schema 的 required 管两侧一致，不进 diff）。
 *  keyof 作用于 union 只给公共键——并集要用分布式 UnionKeys。 */
type UnionKeys<T> = T extends unknown ? keyof T : never;
const TS_SECTION_UNION_KEYS: Record<Exclude<UnionKeys<SectionDecl>, "type">, true> = {
  slides: true,
  locales: true,
  collection: true,
  layout: true,
  title: true,
  hint: true,
  glow: true,
  more: true,
  top: true,
  scope: true,
};

describe("K2 对账腿③——kit 类型 ↔ schema 逐字段集合相等", () => {
  const eq = (name: string, tsKeys: string[], schemaDef: { properties?: Record<string, unknown> }): void =>
    it(`${name}：TS keys === schema properties（多字段/少字段即红）`, () => {
      expect(tsKeys.sort()).toEqual(propsOf(schemaDef));
    });

  eq("根 MarketplaceFile", Object.keys(TS_ROOT_KEYS), SCHEMA as { properties?: Record<string, unknown> });
  eq("条目 CatalogEntry", Object.keys(TS_ENTRY_KEYS), SCHEMA.$defs.pluginEntry!);
  eq("版本 CatalogVersion", Object.keys(TS_VERSION_KEYS), SCHEMA.$defs.catalogVersion!);
  eq("收录源 SourceDecl", Object.keys(TS_SOURCE_KEYS), SCHEMA.$defs.sourceLink!);
  eq("合集 CollectionDecl（含 R4-4.1 交办 glow/more）", Object.keys(TS_COLLECTION_KEYS), SCHEMA.$defs.collectionDecl!);
  eq("跳转字 SectionMore", Object.keys(TS_MORE_KEYS), SCHEMA.$defs.moreLink!);
  eq("hero 单张 HeroSlide", Object.keys(TS_HERO_SLIDE_KEYS), SCHEMA.$defs.heroSlide!);
  eq("作者块 AuthorFile", Object.keys(TS_AUTHOR_KEYS), SCHEMA.$defs.authorBlock!);
  it("板块 SectionDecl：TS 变体键并集 === schema homepageSection properties（去 discriminator）", () => {
    const schemaKeys = propsOf(SCHEMA.$defs.homepageSection!).filter((k) => k !== "type");
    expect(Object.keys(TS_SECTION_UNION_KEYS).sort()).toEqual(schemaKeys);
  });

  it("schema required 与类型必填同频（抽查两侧「缺了就崩」的骨架键）", () => {
    expect(SCHEMA.required).toEqual(["plugins"]);
    expect(SCHEMA.$defs.pluginEntry!.required).toEqual(expect.arrayContaining(["id", "name", "version", "downloadUrl", "versions"]));
    expect(SCHEMA.$defs.authorBlock!.required).toEqual(["authorId", "name", "repos"]);
    expect(SCHEMA.$defs.collectionDecl!.required).toEqual(["id", "title", "items"]);
    // publishedAt 是 catalogVersion 的 required —— 市场侧 missing-entry-field:publishedAt 在 kit 被 schema 前置拦截（validate.ts 头注）
    expect(SCHEMA.$defs.catalogVersion!.required).toContain("publishedAt");
  });
});
