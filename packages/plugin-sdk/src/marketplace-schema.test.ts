/**
 * marketplace.schema.json 随包单测（E6#135 · 2026-09-20；R4-0.4 三方对账扩 · 2026-11-20）。
 *
 * schema 的字段与类型以 publish.ts 的 TS 类型（`CatalogPluginEntry` / `MarketplaceCatalog`）
 * 为真源落——两处必须同源。防漂移的腿都在本文件：
 *   ① 正负例钉 schema 本身的判据（required / additionalProperties / minItems）；
 *   ② **代码契约对账**：`buildCatalogEntry` + `upsertCatalogEntry` 的**真实产出**必须过 schema
 *      ——publish 往远端写的形状 = schema 声明的形状。将来 TS 类型加字段而 schema 忘了跟，
 *      这条当场红（memory `test-double-must-match-contract-not-impl`：替身/契约同源纪律）；
 *   ③ **R4-0.4 对账腿①**：TS key bag（`Record<keyof T, true>`——编译器强制逐键，漏键 = tsc 红）
 *      ↔ schema properties **集合 diff 逐一相等**（条目级＋根级两条）。机械比对，⛔ 手工例举；
 *   ④ **R4-0.2 根级保全**：upsert 只拥有 version/updatedAt/plugins 三键——sources/collections/
 *      categoryRail 及任何未知根键必须原样带过（否则官方目录仓 v2 骨架的根级键会在下次收录
 *      发布时被静默抹掉）；
 *   ⑤ **R4-0.2 透传**：manifest 的 category/categories 经 collectManifestView → buildCatalogEntry
 *      写进条目（声明链路环①→②，04-分类体系 §四）。
 *
 * 第三条腿（v2 作者块）在本文件以 $defs 子模式编译验证（`$defs.authorBlock`）；
 * 插件侧白名单 ↔ schema 的腿②住市场插件仓（`src/__tests__/catalogV2Reconcile.test.ts`——
 * 白名单本体在那里，对着 node_modules 里**实际安装**的 SDK schema 对账，版本感知）。
 *
 * 范围收口（E6#135 定案）：schema 只**随包**（作者编辑器 $schema 补全/校验用），
 * ⛔ 不接进 publish/validate 行为（强校验门禁归 #143 一起设计）。
 * versions[]「最新在前」是数组顺序语义，JSON Schema 标准表达不了——schema 用 description
 * 声明，顺序由 upsertCatalogEntry 的合并逻辑保证（另有其单测）。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import {
  buildAuthorBlockFromConfig,
  buildCatalogEntry,
  buildCollectionFiles,
  collectManifestView,
  upsertCatalogEntry,
  type AuthorBlock,
  type CatalogPluginEntry,
  type ManifestView,
  type MarketplaceCatalog,
  type MarketplacePublishConfig,
} from "./publish.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(readFileSync(join(HERE, "../schemas/marketplace.schema.json"), "utf8")) as object;

const validate = new Ajv2020({ allErrors: true, strict: false }).compile<MarketplaceCatalog>(SCHEMA);

const ok = (data: unknown): boolean => validate(data);
const errors = (): string => (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join("; ");

/** 作者块子模式——把 $defs 带上让内部 $ref 可解析，单测直编译（作者文件 authors/<id>.json 的形态真源） */
const SCHEMA_DEFS = (SCHEMA as { $defs: Record<string, object> }).$defs;
const validateAuthorBlock = new Ajv2020({ allErrors: true, strict: false }).compile<AuthorBlock>({
  ...(SCHEMA_DEFS.authorBlock as object),
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $defs: SCHEMA_DEFS,
});

/** 合法全字段样例（作者手写视角——v2 字段齐全） */
const GOOD_ENTRY = {
  id: "demo-plugin",
  name: "Demo",
  version: "1.2.0",
  description: "A demo",
  author: { name: "Someone", url: "https://example.invalid" },
  authorId: "someone",
  icon: "https://example.invalid/r/demo/v1.2.0/resources/icon.svg",
  iconSource: "manifest",
  marketIcon: "https://example.invalid/r/demo/v1.2.0/resources/marketIcon.svg",
  marketIconSource: "manifest",
  category: "tools",
  categories: ["demo", "sample"],
  // 视频项至多 1 段且必须排第一（06 §二·2 媒体契约——prefixItems 首位放宽、其余位纯图片）
  screenshots: [
    { type: "video", url: "https://example.invalid/r/demo/v1.2.0/clip.mp4", poster: "https://example.invalid/r/demo/v1.2.0/poster.jpg" },
    "https://example.invalid/r/demo/v1.2.0/shot-1.png",
  ],
  cover: "https://example.invalid/r/demo/v1.2.0/cover.png",
  license: "MIT",
  repository: "https://example.invalid/someone/demo",
  pricing: { model: "paid", price: 9.9, currency: "USD", licenseUrl: "https://example.invalid/buy", refundUrl: "https://example.invalid/refund", trialDays: 14, channel: "self" },
  downloadUrl: "https://example.invalid/releases/download/v1.2.0/demo-plugin.linkdesk-plugin",
  size: 123456,
  publishedAt: "2026-09-20T00:00:00.000Z",
  minAppVersion: "0.2.13",
  readmeUrl: "https://example.invalid/r/demo/v1.2.0/README.md",
  versions: [
    {
      version: "1.2.0",
      downloadUrl: "https://example.invalid/releases/download/v1.2.0/demo-plugin.linkdesk-plugin",
      publishedAt: "2026-09-20T00:00:00.000Z",
      changelog: "- a fix",
    },
    {
      version: "1.1.0",
      downloadUrl: "https://example.invalid/releases/download/v1.1.0/demo-plugin.linkdesk-plugin",
      publishedAt: "2026-08-01T00:00:00.000Z",
    },
  ],
};

describe("marketplace.schema.json——正例", () => {
  it("全字段合法样例过；可选字段缺省也过（作者条目 = 纯增量）", () => {
    expect(ok({ version: "1", updatedAt: "2026-09-20T00:00:00.000Z", plugins: [GOOD_ENTRY] })).toBe(true);
    const minimal = {
      id: "demo-plugin",
      name: "Demo",
      version: "1.0.0",
      downloadUrl: "https://example.invalid/a.zip",
      versions: [{ version: "1.0.0", downloadUrl: "https://example.invalid/a.zip", publishedAt: "2026-09-20T00:00:00.000Z" }],
    };
    expect(ok({ plugins: [minimal] })).toBe(true);
  });

  it("R4-0.5 兼容矩阵·schema 侧：旧扁平 v1 目录（无任何 v2 根级/条目字段）零改动过新 schema", () => {
    // 双向兼容的 schema 半边：新字段全部可选 ⇒ v1 目录天然合法（06 §二·3「可选字段纪律」）
    const v1Catalog = {
      version: "1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      plugins: [
        {
          id: "demo-plugin",
          name: "Demo",
          version: "1.0.0",
          downloadUrl: "https://example.invalid/a.zip",
          versions: [{ version: "1.0.0", downloadUrl: "https://example.invalid/a.zip", publishedAt: "2026-01-01T00:00:00.000Z" }],
        },
      ],
    };
    expect(ok(v1Catalog)).toBe(true);
  });

  it("$schema 键合法（kit init 写这一行接编辑器补全——文件要能对它自己引用的 schema 校验通过）", () => {
    const withSchema = {
      $schema: "https://unpkg.com/@linkdesk/marketplace-kit/schemas/marketplace.schema.json",
      plugins: [],
    };
    expect(ok(withSchema)).toBe(true);
    expect(
      validateAuthorBlock({
        $schema: "https://unpkg.com/@linkdesk/marketplace-kit/schemas/authors.schema.json",
        authorId: "demo-author",
        name: "Demo Author",
        repos: [{ id: "main", name: "主仓", sourceUrl: "https://example.invalid/r/demo/marketplace.json" }],
      }),
    ).toBe(true);
  });

  it("v2 根级三件（sources/collections/categoryRail）合法样例过（含 collectionDecl glow/more——R4-4.1 交办）", () => {
    const v2Root = {
      plugins: [],
      sources: [{ url: "https://github.com/example-author/catalog", authorId: "example-author", addedAt: "2026-11-20" }],
      collections: [
        { id: "editor-picks", title: "编辑推荐", subtitle: "装机必备", hint: "由目录维护者挑选", layout: "strip", items: ["demo-plugin"], order: 1 },
        // 08 §三·v3.57 U4「两处都认」：合集级 glow:false ＋ more 跳转字（与板块级同规）
        { id: "quiet-corners", title: "小众精选", glow: false, more: { label: "全部小众", target: "category:entertainment" }, items: ["demo-plugin"] },
      ],
      categoryRail: { order: ["development", "documents"], icons: { development: "lucide:code" } },
    };
    expect(ok(v2Root)).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it("作者块（$defs.authorBlock）最小合法文件过——sections 缺省＝默认门面", () => {
    expect(
      validateAuthorBlock({
        authorId: "demo-author",
        name: "Demo Author",
        repos: [{ id: "main", name: "主仓", sourceUrl: "https://example.invalid/r/demo/marketplace.json" }],
      }),
    ).toBe(true);
  });

  it("作者块全字段过（sections 四型＋more 封闭 target＋hint/glow/scope）", () => {
    const block: AuthorBlock = {
      authorId: "demo-author",
      name: "Demo Author",
      avatar: "https://example.invalid/a.png",
      introImage: "https://example.invalid/i.png",
      intro: "演示作者",
      storeTitle: "Demo Store",
      publicKey: "ZGVtbw==",
      repos: [
        { id: "main", name: "主仓", intro: "总仓介绍", image: "https://example.invalid/banner.png", sourceUrl: "https://example.invalid/r/demo/marketplace.json" },
      ],
      homepage: {
        sections: [
          { type: "hero", slides: [{ plugin: "demo-plugin", tag: "作者精选" }] },
          { type: "collection", collection: "must-have", layout: "duo", more: { label: "全部硬件", target: "category:hardware" }, hint: "大家都在装……" },
          { type: "grid", title: "全部插件" },
          { type: "rank", top: 6, scope: "self", more: { label: "完整榜单", target: "rank" } },
          { type: "collection", collection: "new-arrivals", more: { label: "切仓", target: "repo:second" }, glow: false },
        ],
      },
    };
    expect(validateAuthorBlock(block)).toBe(true);
  });
});

describe("marketplace.schema.json——负例", () => {
  const entry = (): Record<string, unknown> => JSON.parse(JSON.stringify(GOOD_ENTRY));

  it("条目缺 id / 缺 versions / 缺 downloadUrl → 红（点名字段）", () => {
    for (const key of ["id", "versions", "downloadUrl"]) {
      const e = entry();
      delete e[key];
      expect(ok({ plugins: [e] })).toBe(false);
      expect(errors()).toContain(key === "versions" ? "/plugins/0" : key);
    }
  });

  it("versions 空数组 → 红（minItems 1：历史至少一条——首发也写当版）", () => {
    const e = entry();
    e.versions = [];
    expect(ok({ plugins: [e] })).toBe(false);
  });

  it("顶层缺 plugins / 条目拼错字段名（typo）→ 红（additionalProperties 封闭——手改时拼错立刻可见）", () => {
    expect(ok({})).toBe(false);
    const e = entry();
    e.marketicon = "typo-lowercase-i";
    expect(ok({ plugins: [e] })).toBe(false);
    // ajv 对 additionalProperties 违规不点名属性，但 instancePath 定位到出错条目
    expect(errors()).toContain("/plugins/0 must NOT have additional properties");
  });

  it("author 缺 name / versions 条目缺 publishedAt → 红", () => {
    const e = entry();
    (e.author as Record<string, unknown>) = { url: "https://example.invalid" };
    expect(ok({ plugins: [e] })).toBe(false);
    const v = entry();
    v.versions = (v.versions as Record<string, unknown>[]).map((x) => ({ ...x, publishedAt: undefined }));
    expect(ok({ plugins: [v] })).toBe(false);
  });

  it("R4-0.2 负例：pricing model 词汇表外 / paid 缺 licenseUrl → 红", () => {
    const e = entry();
    (e.pricing as Record<string, unknown>) = { model: "freemium" };
    expect(ok({ plugins: [e] })).toBe(false);
    const paid = entry();
    (paid.pricing as Record<string, unknown>) = { model: "paid" };
    expect(ok({ plugins: [paid] })).toBe(false); // if/then：paid ⇒ licenseUrl 必填
  });

  it("R4-0.2 负例：视频不在首位（第二段/图片位塞视频）→ 红（prefixItems 钉「至多 1 段且排第一」）", () => {
    const e = entry();
    e.screenshots = ["https://example.invalid/shot.png", { type: "video", url: "https://example.invalid/clip.mp4" }];
    expect(ok({ plugins: [e] })).toBe(false);
    const two = entry();
    two.screenshots = [
      { type: "video", url: "https://example.invalid/clip.mp4" },
      { type: "video", url: "https://example.invalid/clip2.mp4" },
    ];
    expect(ok({ plugins: [two] })).toBe(false);
  });

  it("R4-0.2 负例：分类 slug 形状非法（大写/空格）→ 红（只校形状、不校白名单）", () => {
    const e = entry();
    e.category = "Hardware";
    expect(ok({ plugins: [e] })).toBe(false);
    const c = entry();
    c.categories = ["ok-slug", "Bad Slug"];
    expect(ok({ plugins: [c] })).toBe(false);
    // 未注册但形状合法的 slug → 绿（白名单在市场侧，不在这里）
    const unknown = entry();
    unknown.category = "hello-world";
    expect(ok({ plugins: [unknown] })).toBe(true);
  });

  it("R4-0.2 负例：sources 缺 addedAt / collections 缺 items → 红", () => {
    const r = { plugins: [], sources: [{ url: "https://github.com/example/catalog", authorId: "example" }] };
    expect(ok(r)).toBe(false);
    const c = { plugins: [], collections: [{ id: "x", title: "X" }] };
    expect(ok(c)).toBe(false);
  });

  it("R4-4.1 交办负例：collectionDecl 的 more.target 自造页 / glow 非布尔 → 红（与板块级 more 同一封闭集合）", () => {
    const c = {
      plugins: [],
      collections: [{ id: "x", title: "X", items: ["demo"], more: { label: "更多", target: "https://example.invalid" } }],
    };
    expect(ok(c)).toBe(false);
    const g = { plugins: [], collections: [{ id: "x", title: "X", items: ["demo"], glow: "off" }] };
    expect(ok(g)).toBe(false);
  });

  it("作者块负例：缺 authorId / repos 空 / 板块 type 词汇表外 / more.target 自造页 → 红", () => {
    expect(validateAuthorBlock({ name: "Demo Author", repos: [{ id: "main", name: "主仓", sourceUrl: "https://example.invalid/x" }] })).toBe(false);
    expect(
      validateAuthorBlock({ authorId: "demo-author", name: "Demo Author", repos: [] }),
    ).toBe(false);
    const withBadSection = {
      authorId: "demo-author",
      name: "Demo Author",
      repos: [{ id: "main", name: "主仓", sourceUrl: "https://example.invalid/x" }],
      homepage: { sections: [{ type: "categories" }] }, // 「按分类浏览」渲染器硬保留——不在可声明清单
    };
    expect(validateAuthorBlock(withBadSection as unknown as AuthorBlock)).toBe(false);
    const withBadTarget = {
      authorId: "demo-author",
      name: "Demo Author",
      repos: [{ id: "main", name: "主仓", sourceUrl: "https://example.invalid/x" }],
      homepage: { sections: [{ type: "collection", collection: "x", more: { label: "更多", target: "https://example.invalid" } }] },
    };
    expect(validateAuthorBlock(withBadTarget as unknown as AuthorBlock)).toBe(false);
  });
});

/* ── R4-0.4 对账腿①：TS key bag ↔ schema 集合 diff（机械，⛔ 手工例举）───────────
 *  bag 的字面量被 `Record<keyof T, true>` 注解钉死——TS 类型加/删字段而 bag 没跟 = tsc 直接红
 *  （check 链的第一条腿）；schema 侧从磁盘文件实读。两侧 Object.keys 排序后逐一相等。 */

const TS_ENTRY_KEYS: Record<keyof CatalogPluginEntry, true> = {
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
  versions: true,
};

const TS_ROOT_KEYS: Record<keyof MarketplaceCatalog, true> = {
  "$schema": true,
  version: true,
  updatedAt: true,
  plugins: true,
  sources: true,
  collections: true,
  categoryRail: true,
};

const schemaPropsOf = (def: { properties?: Record<string, unknown> }): string[] =>
  Object.keys(def.properties ?? {}).sort();

describe("R4-0.4 三方对账腿①——TS 契约 ↔ schema 逐字段集合相等", () => {
  it("条目级：CatalogPluginEntry keys === schema pluginEntry properties（多字段/少字段即红）", () => {
    const schemaEntry = schemaPropsOf(SCHEMA_DEFS.pluginEntry as { properties?: Record<string, unknown> });
    const tsEntry = Object.keys(TS_ENTRY_KEYS).sort();
    expect(tsEntry).toEqual(schemaEntry);
  });

  it("根级：MarketplaceCatalog keys === schema 根 properties", () => {
    expect(Object.keys(TS_ROOT_KEYS).sort()).toEqual(schemaPropsOf(SCHEMA as { properties?: Record<string, unknown> }));
  });
});

describe("代码契约 ↔ schema 同源（E6#135 防漂移核心）", () => {
  it("R4-4.5 publish v2 产物过 schema（authors/<id>.json 走 $defs.authorBlock、collections/<id>.json 走 $defs.collectionDecl）", () => {
    const config: MarketplacePublishConfig = {
      authorId: "demo-author",
      name: "Demo Author",
      storeTitle: "Demo Store",
      publicKey: "ZGVtbw==",
      homepage: { sections: [{ type: "collection", collection: "picks", more: { label: "All", target: "category:hardware" }, glow: false }] },
      collections: [{ id: "picks", title: "Picks", layout: "strip", glow: false, more: { label: "More", target: "rank" }, items: ["demo-plugin"] }],
    };
    const remote = { owner: "demo-author", repo: "demo-plugins" };
    // 作者块真实产出过作者块子模式（写什么 schema 收什么）
    expect(validateAuthorBlock(buildAuthorBlockFromConfig(config, remote))).toBe(true);
    // 合集文件真实产出过 collectionDecl 子模式（含 R4-4.1 的 glow/more 字段）
    const v = new Ajv2020({ allErrors: true, strict: false }).compile({
      ...(SCHEMA_DEFS.collectionDecl as object),
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $defs: SCHEMA_DEFS,
    });
    for (const w of buildCollectionFiles(config)) {
      expect(v(JSON.parse(w.content)), `${w.path}`).toBe(true);
    }
    // 根级字符串引用形态过 schema（拆分写法读取入口）；坏 slug 引用红
    expect(ok({ plugins: [], collections: ["picks", "themes"] })).toBe(true);
    expect(ok({ plugins: [], collections: ["../escape"] })).toBe(false);
  });

  it("buildCatalogEntry + upsertCatalogEntry 的真实产出过 schema（publish 写什么，schema 收什么）", () => {
    // 样本纪律：虚构值（硬约束 21）
    const view: ManifestView = {
      id: "demo-plugin",
      name: "Demo",
      version: "1.0.0",
      author: "Someone",
      description: "A demo",
      minAppVersion: "0.2.13",
    };
    const entry = buildCatalogEntry(view, "https://example.invalid/a.zip", 1234, "someone", "2026-09-20T00:00:00.000Z", {
      readmeUrl: "https://example.invalid/README.md",
      changelog: "- a fix",
    });
    // 二发（1.1.0）走 upsert 拼历史——versions 最新在前正是 publish 的真实输出形态
    const next = buildCatalogEntry(
      { ...view, version: "1.1.0" },
      "https://example.invalid/b.zip",
      2345,
      "someone",
      "2026-09-21T00:00:00.000Z",
      {},
    );
    const catalog = upsertCatalogEntry(upsertCatalogEntry({ plugins: [] }, entry), next);
    expect(ok(catalog)).toBe(true);
    // 顺带钉住顺序语义的**数据源**：versions[0] = 最新（schema 声明不了，这里钉数据）
    expect(catalog.plugins[0]!.versions[0]!.version).toBe("1.1.0");
  });

  it("R4-0.2 透传：manifest 的 category/categories 经 collectManifestView → buildCatalogEntry 写进条目", () => {
    const view = collectManifestView({ name: "Demo", version: "1.0.0", category: "hardware", categories: ["serial", ""] }, "demo");
    expect(view.category).toBe("hardware");
    expect(view.categories).toEqual(["serial"]); // 空白值被剔（「缺省即不写」纪律的数组版）
    const entry = buildCatalogEntry(view, "https://example.invalid/a.zip", 1, "someone", "2026-09-20T00:00:00.000Z");
    expect(entry.category).toBe("hardware");
    expect(entry.categories).toEqual(["serial"]);
    expect(ok({ plugins: [entry] })).toBe(true); // 真实产出过 schema
    // 缺省 → 不写键（作者没声明分类的仓零回归）
    const plain = buildCatalogEntry(
      collectManifestView({ name: "Demo", version: "1.0.0" }, "demo"),
      "https://example.invalid/a.zip",
      1,
      "someone",
      "2026-09-20T00:00:00.000Z",
    );
    expect("category" in plain).toBe(false);
    expect("categories" in plain).toBe(false);
  });

  it("R4-0.2 根级保全：upsert 原样带过 sources/collections/categoryRail/未知根键（⛔ 静默抹根）", () => {
    const catalog = {
      version: "1",
      updatedAt: "2026-11-01T00:00:00.000Z",
      plugins: [],
      sources: [{ url: "https://github.com/example-author/catalog", authorId: "example-author", addedAt: "2026-11-20" }],
      collections: [{ id: "editor-picks", title: "编辑推荐", items: ["demo-plugin"] }],
      categoryRail: { order: ["development"] },
      futureUnknownRoot: { anything: true }, // v3 再来的新根键也必须活过一次 publish
    } as unknown as MarketplaceCatalog;
    const entry = buildCatalogEntry(
      { id: "demo-plugin", name: "Demo", version: "1.0.0" },
      "https://example.invalid/a.zip",
      1,
      "someone",
      "2026-11-20T00:00:00.000Z",
    );
    const merged = upsertCatalogEntry(catalog, entry);
    expect(merged.sources).toEqual(catalog.sources);
    expect(merged.collections).toEqual(catalog.collections);
    expect(merged.categoryRail).toEqual(catalog.categoryRail);
    expect((merged as unknown as Record<string, unknown>).futureUnknownRoot).toEqual({ anything: true });
    // 二发也保全（真实发布链 = 反复 upsert）
    const second = buildCatalogEntry(
      { id: "demo-plugin", name: "Demo", version: "1.1.0" },
      "https://example.invalid/b.zip",
      2,
      "someone",
      "2026-11-21T00:00:00.000Z",
    );
    const again = upsertCatalogEntry(merged, second);
    expect(again.sources).toEqual(catalog.sources);
  });

  it("R4-0.2 媒体/价格保全：upsert 不抹掉作者手改的 screenshots/cover/pricing/license/repository", () => {
    const existing = {
      id: "demo-plugin",
      name: "Demo",
      version: "1.0.0",
      downloadUrl: "https://example.invalid/a.zip",
      publishedAt: "2026-09-20T00:00:00.000Z",
      versions: [{ version: "1.0.0", downloadUrl: "https://example.invalid/a.zip", publishedAt: "2026-09-20T00:00:00.000Z" }],
      screenshots: [
        { type: "video" as const, url: "https://example.invalid/clip.mp4", poster: "https://example.invalid/poster.jpg" },
        "https://example.invalid/shot-1.png",
      ],
      cover: "https://example.invalid/cover.png",
      pricing: { model: "paid" as const, price: 9.9, currency: "USD", licenseUrl: "https://example.invalid/buy" },
      license: "MIT",
      repository: "https://example.invalid/someone/demo",
    };
    const next = buildCatalogEntry(
      { id: "demo-plugin", name: "Demo", version: "1.1.0" },
      "https://example.invalid/b.zip",
      2,
      "someone",
      "2026-09-21T00:00:00.000Z",
    );
    const merged = upsertCatalogEntry({ plugins: [existing] }, next).plugins[0]!;
    expect(merged.screenshots).toEqual(existing.screenshots);
    expect(merged.cover).toBe(existing.cover);
    expect(merged.pricing).toEqual(existing.pricing);
    expect(merged.license).toBe("MIT");
    expect(merged.repository).toBe(existing.repository);
    expect(merged.version).toBe("1.1.0"); // 版本/下载仍由 publish 拥有
  });
});
