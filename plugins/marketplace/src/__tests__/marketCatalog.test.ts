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
  parseCatalog,
  compareVersions,
  isVersionNewer,
  mergeCatalogs,
  isPrereleaseVersion,
  stableLatestVersion,
  versionDownloadUrl,
  updateToVersion,
  selectableVersions,
  pinnedAfterApply,
  OFFICIAL_SOURCE_URL,
} from "../services/marketCatalog";
import type { CatalogEntry } from "../services/marketCatalog";

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

  /* ── 官方身份随胜出条目携带（E6#30.8f 官方徽标数据源） ── */

  it("官方源标记 official → 胜出条目带 official=true（平手官方胜）", () => {
    const merged = mergeCatalogs([
      { sourceName: "encaron/linkdesk-marketplace", official: true, entries: [entry("demo-e", "1.0.0")] },
      { sourceName: "owner-two/catalog-repo-b", entries: [entry("demo-e", "1.0.0")] },
    ]);
    expect(merged[0]).toMatchObject({ id: "demo-e", sourceName: "encaron/linkdesk-marketplace", official: true });
  });

  it("作者源版本更高胜出 → 条目不带官方身份（official falsy）", () => {
    const merged = mergeCatalogs([
      { sourceName: "encaron/linkdesk-marketplace", official: true, entries: [entry("demo-f", "1.0.0")] },
      { sourceName: "owner-two/catalog-repo-b", entries: [entry("demo-f", "1.5.0")] },
    ]);
    expect(merged[0]).toMatchObject({ version: "1.5.0", sourceName: "owner-two/catalog-repo-b" });
    expect(merged[0].official).toBeFalsy();
  });

  it("来源记录未标 official → 条目无官方身份（旧调用面兼容）", () => {
    const merged = mergeCatalogs([{ sourceName: "owner-two/catalog-repo-b", entries: [entry("demo-g", "1.0.0")] }]);
    expect(merged[0].official).toBeUndefined();
  });
});

/* ── E6#33a 稳定版判定（05 §二·四——发现/自动更新默认只看稳定版，beta 不提示） ── */

describe("isPrereleaseVersion / stableLatestVersion", () => {
  it("isPrereleaseVersion：含 - 预发布标识为 true；v 前缀与 +build 截断不影响判", () => {
    expect(isPrereleaseVersion("1.1.0")).toBe(false);
    expect(isPrereleaseVersion("v1.1.0")).toBe(false);
    expect(isPrereleaseVersion("1.1.0+build5")).toBe(false);
    expect(isPrereleaseVersion("1.1.0-beta.1")).toBe(true);
    expect(isPrereleaseVersion("v1.1.0-rc.2")).toBe(true);
    expect(isPrereleaseVersion("1.1.0-beta.1+build7")).toBe(true);
  });

  it("stableLatestVersion：versions[] 最新在前取首个非 prerelease", () => {
    const e: CatalogEntry = { id: "demo-alpha", name: "Demo Alpha", version: "1.2.0", versions: [{ version: "1.2.0" }, { version: "1.1.0" }] };
    expect(stableLatestVersion(e)).toBe("1.2.0");
  });

  it("stableLatestVersion：最新是 beta → 回落前一个稳定版（不提示 beta）", () => {
    const e: CatalogEntry = {
      id: "demo-alpha", name: "Demo Alpha", version: "1.3.0-beta.1",
      versions: [{ version: "1.3.0-beta.1" }, { version: "1.2.0" }, { version: "1.1.0" }],
    };
    expect(stableLatestVersion(e)).toBe("1.2.0");
  });

  it("stableLatestVersion：全 prerelease → undefined（beta 走手动安装 #33c）", () => {
    const e: CatalogEntry = {
      id: "demo-alpha", name: "Demo Alpha", version: "1.3.0-beta.1",
      versions: [{ version: "1.3.0-beta.1" }, { version: "1.3.0-beta.0" }],
    };
    expect(stableLatestVersion(e)).toBeUndefined();
  });

  it("stableLatestVersion：旧格式无 versions[] → 顶层 version；顶层本身 prerelease → undefined", () => {
    expect(stableLatestVersion({ id: "demo-alpha", name: "A", version: "1.1.0" })).toBe("1.1.0");
    expect(stableLatestVersion({ id: "demo-alpha", name: "A", version: "1.1.0-beta" })).toBeUndefined();
  });
});

/* ── E6#33b/c 版本资产寻址（升级动作/版本下拉选哪版取哪版 downloadUrl——不发错包） ── */

describe("versionDownloadUrl", () => {
  const DL_120 = "https://example.invalid/dl/demo-alpha-1.2.0.linkdesk-plugin";
  const DL_110 = "https://example.invalid/dl/demo-alpha-1.1.0.linkdesk-plugin";

  it("versions[] 命中该版本且带 downloadUrl → 取该版 URL（非顶层最新盲取）", () => {
    const e: CatalogEntry = {
      id: "demo-alpha", name: "Demo Alpha", version: "1.2.0", downloadUrl: DL_120,
      versions: [{ version: "1.2.0", downloadUrl: DL_120 }, { version: "1.1.0", downloadUrl: DL_110 }],
    };
    expect(versionDownloadUrl(e, "1.1.0")).toBe(DL_110);
  });

  it("versions[] 命中容 v 前缀（semver 等判）", () => {
    const e: CatalogEntry = {
      id: "demo-alpha", name: "Demo Alpha", version: "1.2.0", downloadUrl: DL_120,
      versions: [{ version: "v1.2.0", downloadUrl: DL_120 }],
    };
    expect(versionDownloadUrl(e, "1.2.0")).toBe(DL_120);
  });

  it("versions[] 无该版 downloadUrl → 仅目标 == 顶层 version 借顶层 entry.downloadUrl", () => {
    const e: CatalogEntry = {
      id: "demo-alpha", name: "Demo Alpha", version: "1.2.0", downloadUrl: DL_120,
      versions: [{ version: "1.2.0" }, { version: "1.1.0", downloadUrl: DL_110 }],
    };
    expect(versionDownloadUrl(e, "1.2.0")).toBe(DL_120);
    // 旧版无 URL 且非顶层 → 诚实 undefined（不拿顶层包顶旧版）
    expect(versionDownloadUrl(e, "1.0.0")).toBeUndefined();
  });

  it("旧格式无 versions[] → 目标 == 顶层 version 才返回；否则 undefined", () => {
    const e: CatalogEntry = { id: "demo-alpha", name: "Demo Alpha", version: "1.2.0", downloadUrl: DL_120 };
    expect(versionDownloadUrl(e, "1.2.0")).toBe(DL_120);
    expect(versionDownloadUrl(e, "1.1.0")).toBeUndefined();
  });
});

/* ── E6#33b 相对本地版本「可更新」判定（UI 徽标/升级入口 + #33d autoUpdate 同源单判据） ── */

describe("updateToVersion", () => {
  it("条目缺失（未上架/下架）/ 无本地版本 → undefined（§二·五 下架不提示）", () => {
    expect(updateToVersion(undefined, "1.0.0")).toBeUndefined();
    expect(updateToVersion({ id: "demo-alpha", name: "A", version: "1.1.0" }, undefined)).toBeUndefined();
  });

  it("稳定远端 > 本地 → 返回可更新远端稳定版", () => {
    const e: CatalogEntry = { id: "demo-alpha", name: "Demo Alpha", version: "1.3.0" };
    expect(updateToVersion(e, "1.2.0")).toBe("1.3.0");
  });

  it("本地 >= 远端 → undefined（等版不提示；本已最新不提示）", () => {
    const e: CatalogEntry = { id: "demo-alpha", name: "Demo Alpha", version: "1.3.0" };
    expect(updateToVersion(e, "1.3.0")).toBeUndefined();
    expect(updateToVersion(e, "1.4.0")).toBeUndefined();
  });

  it("顶层是 beta → 回落稳定版比（beta 不提示，§二·四）", () => {
    const e: CatalogEntry = {
      id: "demo-alpha", name: "Demo Alpha", version: "2.0.0-beta.1",
      versions: [{ version: "2.0.0-beta.1" }, { version: "1.5.0" }],
    };
    // 稳定版 1.5.0 > 本地 1.4.0 → 提示升到 1.5.0（绝不把 beta 当可更新目标）
    expect(updateToVersion(e, "1.4.0")).toBe("1.5.0");
    // 本地已 >= 稳定版（1.6.0 > 1.5.0）→ 无更新（beta 更高也不提示）
    expect(updateToVersion(e, "1.6.0")).toBeUndefined();
  });

  it("全 prerelease 无稳定版 → undefined（beta 走手动 #33c）", () => {
    const e: CatalogEntry = {
      id: "demo-alpha", name: "Demo Alpha", version: "1.3.0-beta.1",
      versions: [{ version: "1.3.0-beta.1" }],
    };
    expect(updateToVersion(e, "1.0.0")).toBeUndefined();
  });
});

/* ── E6#33c 版本下拉可选集（05 §四——下拉选项源：有 URL 才可装才入列，不发错包） ── */

describe("selectableVersions", () => {
  const DL_130 = "https://example.invalid/dl/demo-alpha-1.3.0.linkdesk-plugin";
  const DL_120 = "https://example.invalid/dl/demo-alpha-1.2.0.linkdesk-plugin";
  const DL_110 = "https://example.invalid/dl/demo-alpha-1.1.0.linkdesk-plugin";

  /* versions[] 全带 URL（最新在前）+ 顶层 = 1.3.0 = 最新——历史下拉全列 */
  const STABLE = (): CatalogEntry => ({
    id: "demo-alpha", name: "Demo Alpha", version: "1.3.0", downloadUrl: DL_130,
    versions: [
      { version: "1.3.0", downloadUrl: DL_130, publishedAt: "2026-09-02T00:00:00Z", changelog: "Added gamma" },
      { version: "1.2.0", downloadUrl: DL_120, publishedAt: "2026-08-01T00:00:00Z", changelog: "Fixed beta" },
      { version: "1.1.0", downloadUrl: DL_110 },
    ],
  });

  it("全带 URL 的版本历史 → 逐条入列 + 附带 publishedAt/changelog（下拉每条 = version/downloadUrl/publishedAt?/changelog?）", () => {
    const rows = selectableVersions(STABLE());
    expect(rows).toEqual([
      { version: "1.3.0", downloadUrl: DL_130, publishedAt: "2026-09-02T00:00:00Z", changelog: "Added gamma" },
      { version: "1.2.0", downloadUrl: DL_120, publishedAt: "2026-08-01T00:00:00Z", changelog: "Fixed beta" },
      { version: "1.1.0", downloadUrl: DL_110 },
    ]);
  });

  it("乱序 versions[] → semver 倒序最新在前（下拉默认 = 最高可选，保序平手）", () => {
    const e: CatalogEntry = {
      id: "demo-alpha", name: "Demo Alpha", version: "1.3.0", downloadUrl: DL_130,
      versions: [{ version: "1.1.0", downloadUrl: DL_110 }, { version: "1.3.0", downloadUrl: DL_130 }],
    };
    expect(selectableVersions(e).map((c) => c.version)).toEqual(["1.3.0", "1.1.0"]);
  });

  it("无 URL 的版本诚实不出现（选了也发不了包）；顶层在列则不入赘", () => {
    const e: CatalogEntry = {
      id: "demo-alpha", name: "Demo Alpha", version: "1.3.0", downloadUrl: DL_130,
      versions: [
        { version: "1.3.0", downloadUrl: DL_130 },
        { version: "1.2.0" }, // 无 URL → 不入下拉
        { version: "1.1.0", downloadUrl: DL_110 },
      ],
    };
    expect(selectableVersions(e).map((c) => c.version)).toEqual(["1.3.0", "1.1.0"]);
  });

  it("顶层不在 versions[]（作者漏列）→ 补入顶层——下拉恒含当前可装最新", () => {
    const e: CatalogEntry = {
      id: "demo-alpha", name: "Demo Alpha", version: "1.2.0", downloadUrl: DL_120,
      versions: [{ version: "1.1.0", downloadUrl: DL_110 }],
    };
    expect(selectableVersions(e).map((c) => c.version)).toEqual(["1.2.0", "1.1.0"]);
  });

  it("beta 版本带 URL → 手动可选入列（§二·四 beta 不自动提示但 #33c 可手动装）", () => {
    const e: CatalogEntry = {
      id: "demo-beta", name: "Demo Beta", version: "1.3.0-beta.1", downloadUrl: DL_130,
      versions: [
        { version: "1.3.0-beta.1", downloadUrl: DL_130 },
        { version: "1.2.0", downloadUrl: DL_120 },
      ],
    };
    expect(selectableVersions(e).map((c) => c.version)).toEqual(["1.3.0-beta.1", "1.2.0"]);
  });

  it("旧格式无 versions[] → 只顶层一条（length 1 = 调用方不显示下拉）+ 相同 version 行去重", () => {
    expect(selectableVersions({ id: "demo-alpha", name: "A", version: "1.2.0", downloadUrl: DL_120 })).toEqual([
      { version: "1.2.0", downloadUrl: DL_120, publishedAt: undefined },
    ]);
    const dup: CatalogEntry = {
      id: "demo-alpha", name: "A", version: "1.2.0", downloadUrl: DL_120,
      versions: [{ version: "1.2.0", downloadUrl: DL_120 }, { version: "1.2.0", downloadUrl: DL_120 }],
    };
    expect(selectableVersions(dup)).toHaveLength(1);
  });

  it("无条目 / 顶层也无 URL → []", () => {
    expect(selectableVersions(undefined)).toEqual([]);
    expect(selectableVersions({ id: "demo-alpha", name: "A", version: "1.0.0" })).toEqual([]);
  });
});

/* ── E6#33c pinnedVersion 记账（05 §二·九——落地稳定最新清钉追最新；停旧版/beta 记钉暂停 autoUpdate） ── */

describe("pinnedAfterApply", () => {
  it("目录有稳定最新且落地到它 → null（清钉——追最新，autoUpdate 恢复）", () => {
    const e: CatalogEntry = {
      id: "demo-alpha", name: "Demo Alpha", version: "1.3.0",
      versions: [{ version: "1.3.0" }, { version: "1.2.0" }],
    };
    expect(pinnedAfterApply(e, "1.3.0")).toBeNull();
  });

  it("停旧版（降级目标 < 稳定最新）→ 记 appliedVersion（暂停 autoUpdate，#33d 消费）", () => {
    const e: CatalogEntry = {
      id: "demo-alpha", name: "Demo Alpha", version: "1.3.0",
      versions: [{ version: "1.3.0" }, { version: "1.2.0" }],
    };
    expect(pinnedAfterApply(e, "1.2.0")).toBe("1.2.0");
  });

  it("停 beta（beta > 稳定最新，非稳定最新）→ 记 appliedVersion", () => {
    const e: CatalogEntry = {
      id: "demo-beta", name: "Demo Beta", version: "1.3.0-beta.1",
      versions: [{ version: "1.3.0-beta.1" }, { version: "1.2.0" }],
    };
    expect(pinnedAfterApply(e, "1.3.0-beta.1")).toBe("1.3.0-beta.1");
    // 但落地到稳定最新 1.2.0 → 清钉
    expect(pinnedAfterApply(e, "1.2.0")).toBeNull();
  });

  it("目录无稳定版可比（全 beta）→ undefined（无 auto-update 目标可防，不落盘不写空钉）", () => {
    const e: CatalogEntry = {
      id: "demo-beta", name: "Demo Beta", version: "1.3.0-beta.1",
      versions: [{ version: "1.3.0-beta.1" }, { version: "1.3.0-beta.0" }],
    };
    expect(pinnedAfterApply(e, "1.3.0-beta.1")).toBeUndefined();
    expect(pinnedAfterApply(e, "1.2.0")).toBeUndefined();
  });

  it("无条目 → undefined", () => {
    expect(pinnedAfterApply(undefined, "1.0.0")).toBeUndefined();
  });
});
