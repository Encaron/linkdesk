/**
 * 零插件安装路径的命令纯函数单测（D9′）——`selectCatalogEntries` / `sourceIdOfCatalog`。
 * 不碰网络、不碰 registry：这两个函数是"没有市场插件也能看目录"的解析内核。
 */

import { describe, expect, it } from "vitest";
import { selectCatalogEntries, sourceIdOfCatalog } from "./pluginInstallCommands";

const CATALOG = JSON.stringify({
  version: "1",
  plugins: [
    {
      id: "demo-plugin",
      name: "Demo Plugin",
      description: "demo entry",
      version: "2.0.0",
      size: 1024,
      minAppVersion: "0.2.60",
      downloadUrl: "https://example.dev/demo-2.0.0.zip",
      versions: [
        { version: "2.0.0", downloadUrl: "https://example.dev/demo-2.0.0.zip", publishedAt: "x", sha256: "a".repeat(64) },
        { version: "1.0.0", downloadUrl: "https://example.dev/demo-1.0.0.zip", publishedAt: "x" },
      ],
    },
    { id: "other", name: "Other Thing", version: "1.0.0", versions: [{ version: "1.0.0" }] },
  ],
});

describe("selectCatalogEntries", () => {
  it("取 versions[0] 的版本/下载址/sha256（历史里更新的一定在首位）", () => {
    const [e] = selectCatalogEntries(CATALOG);
    expect(e).toMatchObject({
      id: "demo-plugin",
      name: "Demo Plugin",
      version: "2.0.0",
      sha256: "a".repeat(64),
      downloadUrl: "https://example.dev/demo-2.0.0.zip",
      minAppVersion: "0.2.60",
      size: 1024,
    });
  });

  it("无 sha256 的旧条目 → sha256 undefined（壳标「未校验」不阻断）", () => {
    expect(selectCatalogEntries(CATALOG)[1].sha256).toBeUndefined();
  });

  it("按 id / 名称 / 描述过滤（大小写不敏感）", () => {
    expect(selectCatalogEntries(CATALOG, "demo").map((e) => e.id)).toEqual(["demo-plugin"]);
    expect(selectCatalogEntries(CATALOG, "OTHER").map((e) => e.id)).toEqual(["other"]);
    expect(selectCatalogEntries(CATALOG, "entry").map((e) => e.id)).toEqual(["demo-plugin"]);
    expect(selectCatalogEntries(CATALOG, "nothing-here")).toEqual([]);
  });

  it("坏 JSON → 空数组（⛔ 抛错把命令打断）", () => {
    expect(selectCatalogEntries("{not json")).toEqual([]);
  });

  it("缺 id 的条目跳过", () => {
    expect(selectCatalogEntries(JSON.stringify({ plugins: [{ name: "x" }] }))).toEqual([]);
  });
});

describe("sourceIdOfCatalog", () => {
  it("host + 路径前两段（稳定、可读、可当配置键）", () => {
    expect(sourceIdOfCatalog("https://github.com/Encaron/linkdesk-marketplace/raw/main/marketplace.json")).toBe(
      "github.com/Encaron/linkdesk-marketplace",
    );
  });

  it("无路径 → 仅 host", () => {
    expect(sourceIdOfCatalog("https://example.dev/")).toBe("example.dev");
  });

  it("坏 URL → 原样返回（⛔ 抛错）", () => {
    expect(sourceIdOfCatalog("not a url")).toBe("not a url");
  });

  it("同源不同文件名 → 同一个 id（源身份不随文件名变）", () => {
    expect(sourceIdOfCatalog("https://g.dev/a/b/marketplace.json")).toBe(sourceIdOfCatalog("https://g.dev/a/b/other.json"));
  });
});
