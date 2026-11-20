/**
 * validate 纯函数测试——正例（examples 全过）＋ K 验收原话四判据（collection 键写成 id / hero 重复 /
 * 合集不存在 / 未知字段）＋ 小分类封闭名单「可用清单进报错」（08 作者知晓面）。
 * 样本纪律：一律虚构值（demo-*，硬约束 21）。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatCategoryWhitelist } from "./categoryWhitelist.js";
import { validateAuthorFile, validateMarketplace } from "./validate.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const readExample = (name: string): unknown => JSON.parse(readFileSync(join(HERE, "../examples", name), "utf8"));

describe("validate 正例——examples 全过（它们就是作者的参照物）", () => {
  it("min.json（多插件最小）errors=0", () => {
    const r = validateMarketplace(readExample("min.json"));
    expect(r.errors).toEqual([]);
  });
  it("full.json（全量，含 collectionDecl glow/more）errors=0 且语义 warnings=0（分类在册、抓取字段齐）", () => {
    const r = validateMarketplace(readExample("full.json"));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
  it("authors.json（作者块）errors=0 且 warnings=0（单 hero）", () => {
    const r = validateAuthorFile(readExample("authors.json"));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});

describe("K 验收判据——validate 抓得出这四件", () => {
  const baseAuthor = (): Record<string, unknown> => ({
    authorId: "demo-author",
    name: "Demo Author",
    repos: [{ id: "main", name: "主仓", sourceUrl: "https://github.com/demo-author/demo-market" }],
  });

  it("① collection 键写成 id → error 且提示「你是不是想写 collection」（近似键机械兜底）", () => {
    const bad = {
      ...baseAuthor(),
      homepage: { sections: [{ type: "collection", id: "must-have" }] }, // 「collection」写成了「id」
    };
    const r = validateAuthorFile(bad);
    expect(r.errors.length).toBeGreaterThan(0);
    const msg = r.errors.map((e) => e.message).join("\n");
    expect(msg).toContain("id");
    expect(msg).toContain("collection");
  });

  it("② hero 重复 → warning duplicate-hero（市场 authors.ts 同码）", () => {
    const dup = {
      ...baseAuthor(),
      homepage: {
        sections: [
          { type: "hero", slides: [{ plugin: "demo-a" }] },
          { type: "hero", slides: [{ plugin: "demo-b" }] },
        ],
      },
    };
    const r = validateAuthorFile(dup);
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toContain("duplicate-hero");
  });

  it("③ 合集不存在（目录模式，跨文件比对 collections[]）→ warning missing-collection", () => {
    const section = { ...baseAuthor(), homepage: { sections: [{ type: "collection", collection: "nope" }] } };
    const r = validateAuthorFile(section, new Set(["must-have"]));
    expect(r.warnings.map((w) => w.code)).toContain("missing-collection");
    const r2 = validateAuthorFile(section, new Set(["nope"]));
    expect(r2.warnings).toEqual([]); // 声明了就不冤枉
    const r3 = validateAuthorFile(section); // 单文件模式查不了 → 不假装查过
    expect(r3.warnings.map((w) => w.code)).not.toContain("missing-collection");
  });

  it("④ 未知字段 → error（市场侧会静默丢——kit 升级为红）且列出可用键", () => {
    const r = validateMarketplace({ plugins: [], futureUnknownField: true });
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]!.message).toContain("futureUnknownField");
    expect(r.errors[0]!.message).toContain("plugins");
  });

  it("④b author 块未知字段给近似键提示（storeTitle 写成 title）", () => {
    const bad = { ...baseAuthor(), title: "Demo Store" };
    const r = validateAuthorFile(bad);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors.map((e) => e.message).join("\n")).toContain("storeTitle");
  });
});

describe("小分类封闭名单——可用清单直接进报错（作者不用翻文档）", () => {
  const entry = (over: Record<string, unknown>): Record<string, unknown> => ({
    id: "demo-plugin",
    name: "Demo",
    version: "1.0.0",
    downloadUrl: "https://github.com/demo-author/demo-plugin/releases/download/v1.0.0/demo-plugin.linkdesk-plugin",
    versions: [{ version: "1.0.0", downloadUrl: "https://github.com/demo-author/demo-plugin/releases/download/v1.0.0/demo-plugin.linkdesk-plugin", publishedAt: "2026-11-20T00:00:00.000Z" }],
    author: { name: "demo-author" },
    ...over,
  });

  it("unknown-category：报错信息含 7 桶全表（主分类＋小分类逐桶）", () => {
    const r = validateMarketplace({ plugins: [entry({ category: "gaming" })] });
    const w = r.warnings.find((x) => x.code === "unknown-category");
    expect(w).toBeDefined();
    for (const slug of ["development", "documents", "hardware", "network", "productivity", "themes", "entertainment"]) {
      expect(w!.message).toContain(slug);
    }
    // 全表 = 04 §5.1 的逐桶小类也在（抽 3 个跨桶样本）
    for (const sub of ["code-editing", "serial", "color-scheme"]) {
      expect(w!.message).toContain(sub);
    }
  });

  it("unknown-subcategory：同样带全表（名单外 slug 原值在信息里，作者看得到自己写了什么）", () => {
    const r = validateMarketplace({ plugins: [entry({ categories: ["free-tags"] })] });
    const w = r.warnings.find((x) => x.code === "unknown-subcategory");
    expect(w).toBeDefined();
    expect(w!.message).toContain("free-tags");
    expect(w!.message).toContain(formatCategoryWhitelist());
  });

  it("unknown-rail-category：rail 顺序名单外 → 警告并给可用主分类", () => {
    const r = validateMarketplace({ plugins: [entry({})], categoryRail: { order: ["development", "nope"] } });
    const w = r.warnings.find((x) => x.code === "unknown-rail-category");
    expect(w).toBeDefined();
    expect(w!.message).toContain("nope");
    expect(w!.message).toContain("development");
  });

  it("missing-entry-field：author / repo 两类在册（publishedAt 被 schema required 前置拦——validate.ts 头注）", () => {
    // downloadUrl 用非 github 形态 ⇒ repo 推不出；author 缺 ⇒ author 缺行
    const r = validateMarketplace({
      plugins: [
        {
          id: "demo-plugin",
          name: "Demo",
          version: "1.0.0",
          downloadUrl: "https://example.invalid/a.zip",
          versions: [{ version: "1.0.0", downloadUrl: "https://example.invalid/a.zip", publishedAt: "2026-11-20T00:00:00.000Z" }],
        },
      ],
    });
    const codes = r.warnings.filter((w) => w.code === "missing-entry-field").map((w) => w.message);
    expect(codes.some((m) => m.includes("author"))).toBe(true);
    expect(codes.some((m) => m.includes("仓库 URL 推不出"))).toBe(true);
  });

  it("在册分类零警告（happy path 不给作者刷屏）", () => {
    const r = validateMarketplace({ plugins: [entry({ category: "hardware", categories: ["serial"] })] });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});
