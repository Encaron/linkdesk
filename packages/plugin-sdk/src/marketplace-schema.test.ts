/**
 * marketplace.schema.json 随包单测（E6#135 · 2026-09-20）。
 *
 * schema 的字段与类型以 publish.ts 的 TS 类型（`CatalogPluginEntry` / `MarketplaceCatalog`）
 * 为真源落——两处必须同源。防漂移的两条腿都在本文件：
 *   ① 正负例钉 schema 本身的判据（required / additionalProperties / minItems）；
 *   ② **代码契约对账**：`buildCatalogEntry` + `upsertCatalogEntry` 的**真实产出**必须过 schema
 *      ——publish 往远端写的形状 = schema 声明的形状。将来 TS 类型加字段而 schema 忘了跟，
 *      这条当场红（memory `test-double-must-match-contract-not-impl`：替身/契约同源纪律）。
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
import { buildCatalogEntry, upsertCatalogEntry, type ManifestView, type MarketplaceCatalog } from "./publish.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(readFileSync(join(HERE, "../schemas/marketplace.schema.json"), "utf8")) as object;

const validate = new Ajv2020().compile<MarketplaceCatalog>(SCHEMA);

const ok = (data: unknown): boolean => validate(data);
const errors = (): string => (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join("; ");

/** 合法全字段样例（作者手写视角） */
const GOOD_ENTRY = {
  id: "demo-plugin",
  name: "Demo",
  version: "1.2.0",
  description: "A demo",
  author: { name: "Someone", url: "https://example.invalid" },
  icon: "https://example.invalid/r/demo/v1.2.0/resources/icon.svg",
  iconSource: "manifest",
  marketIcon: "https://example.invalid/r/demo/v1.2.0/resources/marketIcon.svg",
  marketIconSource: "manifest",
  category: "tools",
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
});

describe("代码契约 ↔ schema 同源（E6#135 防漂移核心）", () => {
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
});
