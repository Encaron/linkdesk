/**
 * marketCatalog 目录纯格式域单测——E6#29a/29c + #30a 数据层。
 * parse/normalize/merge/compare/源 URL 归一，全纯函数直测，零 IO mock。
 * fixture 全虚构（硬约束 21）：demo-* 插件 id、owner-one/owner-two 仓库、示例版本文案。
 */

import { describe, it, expect } from "vitest";
import {
  repoUrlToRawUrl,
  isRawMarketplaceUrl,
  normalizeSourceUrl,
  sourceNameOfUrl,
  sourceKeyOfUrl,
  parseCatalog,
  compareVersions,
  isVersionNewer,
  mergeCatalogs,
  OFFICIAL_SOURCE_URL,
} from "../services/marketCatalog";

/* ── 源 URL 归一（#29b GitHub repo 根 → marketplace.json 直链） ── */

describe("repoUrlToRawUrl", () => {
  it("github.com/owner/repo → raw HEAD marketplace.json 直链（免猜分支）", () => {
    expect(repoUrlToRawUrl("https://github.com/owner-one/catalog-repo-a")).toBe(
      "https://raw.githubusercontent.com/owner-one/catalog-repo-a/HEAD/marketplace.json",
    );
    expect(repoUrlToRawUrl("https://github.com/owner-two/catalog-repo-b/tree/main")).toBe(
      "https://raw.githubusercontent.com/owner-two/catalog-repo-b/HEAD/marketplace.json",
    );
  });

  it("非 github.com URL → null", () => {
    expect(repoUrlToRawUrl("https://gitee.com/a/b")).toBeNull();
    expect(repoUrlToRawUrl("not-a-url")).toBeNull();
  });
});

describe("isRawMarketplaceUrl / normalizeSourceUrl", () => {
  it("raw.githubusercontent 的 marketplace.json 直链识别", () => {
    expect(isRawMarketplaceUrl("https://raw.githubusercontent.com/owner-one/repo-a/main/marketplace.json")).toBe(true);
    expect(isRawMarketplaceUrl("https://raw.githubusercontent.com/o/r/HEAD/marketplace.json")).toBe(true);
  });

  it("normalize：仓库主页 URL 与已直链都收；垃圾输入 → null", () => {
    const raw = "https://raw.githubusercontent.com/owner-one/repo-a/main/marketplace.json";
    expect(normalizeSourceUrl("https://github.com/owner-one/repo-a")).toBe(
      "https://raw.githubusercontent.com/owner-one/repo-a/HEAD/marketplace.json",
    );
    expect(normalizeSourceUrl(raw)).toBe(raw);
    expect(normalizeSourceUrl("   ")).toBeNull();
    expect(normalizeSourceUrl("ftp://nope")).toBeNull();
  });

  it("sourceNameOfUrl：raw URL 抽 owner/repo 作来源标注", () => {
    expect(sourceNameOfUrl("https://raw.githubusercontent.com/owner-two/catalog-repo-b/main/marketplace.json")).toBe(
      "owner-two/catalog-repo-b",
    );
    // 官方源（真实仓库名 = 被测常量，非 fixture）
    expect(sourceNameOfUrl(OFFICIAL_SOURCE_URL)).toBe("encaron/linkdesk-marketplace");
  });
});

/* ── sourceKeyOfUrl（E6#30c 官方身份——owner/repo 分支无关，修 HEAD/main 漏判 bug） ── */

describe("sourceKeyOfUrl", () => {
  it("仓库主页 / raw 直链（main/HEAD）不同形态 → 同一 owner/repo 身份", () => {
    const repoPage = "https://github.com/owner-one/catalog-repo-a";
    const rawMain = "https://raw.githubusercontent.com/owner-one/catalog-repo-a/main/marketplace.json";
    const rawHead = "https://raw.githubusercontent.com/owner-one/catalog-repo-a/HEAD/marketplace.json";
    const k = "owner-one/catalog-repo-a";
    expect(sourceKeyOfUrl(repoPage)).toBe(k);
    expect(sourceKeyOfUrl(rawMain)).toBe(k);
    expect(sourceKeyOfUrl(rawHead)).toBe(k);
  });

  it("仓库主页带 tree/blob 尾仍归同一身份", () => {
    expect(sourceKeyOfUrl("https://github.com/owner-two/catalog-repo-b/tree/main")).toBe("owner-two/catalog-repo-b");
    expect(sourceKeyOfUrl("https://github.com/owner-two/catalog-repo-b/blob/main/README.md")).toBe("owner-two/catalog-repo-b");
  });

  it("官方源各形态恒归 encaron/linkdesk-marketplace（main 常量 + 仓库主页 + HEAD）", () => {
    expect(sourceKeyOfUrl(OFFICIAL_SOURCE_URL)).toBe("encaron/linkdesk-marketplace");
    expect(sourceKeyOfUrl("https://github.com/encaron/linkdesk-marketplace")).toBe("encaron/linkdesk-marketplace");
    expect(sourceKeyOfUrl("https://raw.githubusercontent.com/encaron/linkdesk-marketplace/HEAD/marketplace.json")).toBe(
      "encaron/linkdesk-marketplace",
    );
  });

  it("大小写无关（GitHub 路由不分大小写）", () => {
    expect(sourceKeyOfUrl("https://github.com/Encaron/LinkDesk-Marketplace")).toBe("encaron/linkdesk-marketplace");
  });

  it("非 GitHub 源 / 垃圾输入 → null", () => {
    expect(sourceKeyOfUrl("https://gitee.com/a/b")).toBeNull();
    expect(sourceKeyOfUrl("not-a-url")).toBeNull();
    expect(sourceKeyOfUrl("   ")).toBeNull();
  });
});

/* ── parseCatalog 结构校验（#30f 目录损坏空态判据） ── */

const ENTRY = {
  id: "demo-alpha",
  name: "Demo Alpha",
  version: "1.2.0",
  description: "A fictional demo",
  author: { name: "Author One", url: "https://example.invalid/author-one" },
  icon: "puzzle",
  iconSource: "lucide",
  downloadUrl: "https://example.invalid/releases/demo-alpha-1.2.0.linkdesk-plugin",
  size: 1024,
  publishedAt: "2026-09-01T00:00:00Z",
};

describe("parseCatalog", () => {
  it("合法 JSON + plugins 数组 → ok，条目归一保留", () => {
    const r = parseCatalog(JSON.stringify({ version: "1", plugins: [ENTRY] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.catalog.plugins).toHaveLength(1);
      expect(r.catalog.plugins[0]).toMatchObject({ id: "demo-alpha", version: "1.2.0" });
      // 纯格式域阶段不注入 sourceName——merge 时才填（作者/官方区分是合并时语义）
      expect(r.catalog.plugins[0].sourceName).toBeUndefined();
    }
  });

  it("坏 JSON → invalid-json；非对象 → not-object；缺 plugins 数组 → no-plugins-array", () => {
    expect(parseCatalog("{oops")).toEqual({ ok: false, reason: "invalid-json" });
    expect(parseCatalog("42")).toEqual({ ok: false, reason: "not-object" });
    expect(parseCatalog("{}")).toEqual({ ok: false, reason: "no-plugins-array" });
    expect(parseCatalog('{"plugins": "nope"}')).toEqual({ ok: false, reason: "no-plugins-array" });
  });

  it("元素缺 id/name/version → 丢弃（不崩其余）", () => {
    const r = parseCatalog(JSON.stringify({ plugins: [{ id: "demo-beta", name: "Demo Beta", version: "1.0.0" }, { id: "" }, { version: "1.0.0" }, { id: "demo-gamma" }] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.catalog.plugins).toHaveLength(1);
  });

  it("author/iconSource 兼容旧平铺形态（string author、无 iconSource 不崩）", () => {
    const r = parseCatalog(
      JSON.stringify({ plugins: [{ id: "demo-delta", name: "Demo Delta", version: "0.9.0", author: "Solo Dev" }] }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.catalog.plugins[0].author).toBe("Solo Dev");
  });
});

/* ── 版本比较（本地 semver，插件独立零 @src/core） ── */

describe("compareVersions / isVersionNewer", () => {
  it("数字比较：1.2.0 < 1.10.0（非字典序）", () => {
    expect(compareVersions("1.2.0", "1.10.0")).toBe(-1);
    expect(compareVersions("1.10.0", "1.2.0")).toBe(1);
  });

  it("忽略 v 前缀 + 缺位补 0：v1.2 == 1.2.0", () => {
    expect(compareVersions("v1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.0", "1.2")).toBe(0);
  });

  it("主版本优先：2.0.0 > 1.9.9", () => {
    expect(compareVersions("1.9.9", "2.0.0")).toBe(-1);
  });

  it("预发布 < 正式版：1.0.0-rc.1 < 1.0.0", () => {
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBe(-1);
    expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBe(1);
  });

  it("预发布逐位：1.0.0-alpha < 1.0.0-beta < 1.0.0-rc.1", () => {
    expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBe(-1);
    expect(compareVersions("1.0.0-beta", "1.0.0-rc.1")).toBe(-1);
  });

  it("isVersionNewer 包装比较", () => {
    expect(isVersionNewer("2.0.0", "1.9.9")).toBe(true);
    expect(isVersionNewer("1.9.9", "2.0.0")).toBe(false);
    expect(isVersionNewer("1.0.0", "1.0.0")).toBe(false);
  });
});

/* ── 多源合并去重（#30c） ── */

describe("mergeCatalogs", () => {
  const entry = (id: string, version: string) => ({ id, name: `Demo ${id}`, version });

  it("同 id 跨源 → 取 semver 高者 + 注入高者来源 sourceName", () => {
    const merged = mergeCatalogs([
      { sourceName: "owner-one/catalog-repo-a", entries: [entry("demo-a", "1.0.0")] },
      { sourceName: "owner-two/catalog-repo-b", entries: [entry("demo-a", "1.2.0")] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "demo-a", version: "1.2.0", sourceName: "owner-two/catalog-repo-b" });
  });

  it("版本平手 → 先到的源胜出（官方排前 → 官方胜，来源标注官方）", () => {
    const merged = mergeCatalogs([
      { sourceName: "encaron/linkdesk-marketplace", entries: [entry("demo-b", "1.0.0")] },
      { sourceName: "owner-two/catalog-repo-b", entries: [entry("demo-b", "1.0.0")] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].sourceName).toBe("encaron/linkdesk-marketplace");
  });

  it("异 id 并存 + 同 id 各源只见一次", () => {
    const merged = mergeCatalogs([
      { sourceName: "encaron/linkdesk-marketplace", entries: [entry("demo-a", "1.0.0"), entry("demo-c", "1.0.0")] },
      { sourceName: "owner-two/catalog-repo-b", entries: [entry("demo-a", "1.0.0")] },
    ]);
    const ids = merged.map((e) => e.id).sort();
    expect(ids).toEqual(["demo-a", "demo-c"]);
    expect(merged.filter((e) => e.id === "demo-a")).toHaveLength(1);
  });

  it("作者源版本更高 → 覆盖官方旧版（升级方向）", () => {
    const merged = mergeCatalogs([
      { sourceName: "encaron/linkdesk-marketplace", entries: [entry("demo-a", "1.0.0")] },
      { sourceName: "owner-two/catalog-repo-b", entries: [entry("demo-a", "2.0.0")] },
    ]);
    expect(merged[0]).toMatchObject({ version: "2.0.0", sourceName: "owner-two/catalog-repo-b" });
  });
});
