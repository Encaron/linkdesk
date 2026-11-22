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

/* ── 媒体声明（批次 A2/E2）：错误模板 = 文件:字段 → 期望 → 示例 ── */
describe("媒体校验——相对 URL / 多视频 / 视频越位 / http 明文 / 缺海报", () => {
  const mediaEntry = (extra: Record<string, unknown>): Record<string, unknown> => ({
    id: "demo-plugin",
    name: "Demo",
    version: "1.0.0",
    author: { name: "Demo Author" },
    repository: "https://github.com/demo-owner/demo-repo",
    downloadUrl: "https://example.invalid/a.zip",
    publishedAt: "2026-11-20T00:00:00.000Z",
    versions: [{ version: "1.0.0", downloadUrl: "https://example.invalid/a.zip", publishedAt: "2026-11-20T00:00:00.000Z" }],
    ...extra,
  });
  const messages = (r: ReturnType<typeof validateMarketplace>): string =>
    [...r.errors, ...r.warnings].map((i) => i.message).join("\n");

  it("相对 URL → error，消息含「文件:字段 → 期望 → 示例」", () => {
    const r = validateMarketplace({ plugins: [mediaEntry({ screenshots: ["resources/shot-1.png"] })] });
    const msg = messages(r);
    expect(r.errors.some((e) => e.code === "screenshot-url-invalid" && e.path === "plugins[demo-plugin].screenshots[0]")).toBe(true);
    expect(msg).toContain("文件 marketplace.json：plugins[demo-plugin].screenshots[0] → 期望");
    expect(msg).toContain("示例：https://");
    expect(msg).toContain("404");
  });

  it("多视频 → error（至多 1 段）；视频越位 → error（只能排第一）", () => {
    const two = validateMarketplace({
      plugins: [mediaEntry({
        screenshots: [
          { type: "video", url: "https://example.invalid/a.mp4", poster: "https://example.invalid/p.jpg" },
          { type: "video", url: "https://example.invalid/b.mp4", poster: "https://example.invalid/q.jpg" },
        ],
      })],
    });
    expect(messages(two)).toContain("至多 1 段封面视频");
    const late = validateMarketplace({
      plugins: [mediaEntry({ screenshots: ["https://example.invalid/1.png", { type: "video", url: "https://example.invalid/a.mp4" }] })],
    });
    expect(late.errors.some((e) => e.code === "screenshot-video-restricted" && e.path.includes("screenshots[1]"))).toBe(true);
    expect(messages(late)).toContain("封面视频只能排第一");
  });

  it("http 明文（cover/图片/视频）→ error，说明只接受 https", () => {
    const r = validateMarketplace({
      plugins: [mediaEntry({ cover: "http://example.invalid/c.png", screenshots: ["http://example.invalid/1.png"] })],
    });
    expect(r.errors.filter((e) => e.code === "screenshot-url-invalid").length).toBe(2);
    expect(messages(r)).toContain("明文 http 不安全");
  });

  it("缺海报 → warning（不拦发布，但解释卡片会回落）", () => {
    const r = validateMarketplace({
      plugins: [mediaEntry({ screenshots: [{ type: "video", url: "https://example.invalid/a.mp4" }] })],
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => w.code === "screenshot-poster-missing")).toBe(true);
  });

  it("合法媒体（https 静帧/cover/海报）→ 零 error 零媒体 warning", () => {
    const r = validateMarketplace({
      plugins: [mediaEntry({
        cover: "https://example.invalid/cover.png",
        screenshots: [
          { type: "video", url: "https://example.invalid/a.mp4", poster: "https://example.invalid/p.jpg" },
          "https://example.invalid/2.png",
        ],
      })],
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});
