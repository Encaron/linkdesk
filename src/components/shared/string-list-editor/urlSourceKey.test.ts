/**
 * urlSourceKey 单测——URL 源身份（E6#30c：设置 / 市场两扇「加源」门共用同一去重身份）。
 * 纯函数直测。fixture 全虚构（硬约束 21）：owner-one/owner-two 虚构仓库。
 * 官方源身份漏判的端到端回归在 plugins/marketplace marketSources.test（官方仓库主页/HEAD 不二次拉取、
 * 不入作者列表）——本测试只锁规则本身。
 */

import { describe, it, expect } from "vitest";
import { urlSourceKey } from "./urlSourceKey";

describe("urlSourceKey", () => {
  it("仓库主页 / raw 直链（main/HEAD）不同形态 → 同一 owner/repo 身份", () => {
    const k = "owner-one/catalog-repo-a";
    expect(urlSourceKey("https://github.com/owner-one/catalog-repo-a")).toBe(k);
    expect(urlSourceKey("https://raw.githubusercontent.com/owner-one/catalog-repo-a/main/marketplace.json")).toBe(k);
    expect(urlSourceKey("https://raw.githubusercontent.com/owner-one/catalog-repo-a/HEAD/marketplace.json")).toBe(k);
  });

  it("仓库主页带 tree/blob 尾仍归同一身份", () => {
    expect(urlSourceKey("https://github.com/owner-two/catalog-repo-b/tree/main")).toBe("owner-two/catalog-repo-b");
    expect(urlSourceKey("https://github.com/owner-two/catalog-repo-b/blob/main/README.md")).toBe("owner-two/catalog-repo-b");
  });

  it("大小写无关（GitHub 路由不分大小写）", () => {
    expect(urlSourceKey("https://github.com/Owner-One/Catalog-Repo-A")).toBe("owner-one/catalog-repo-a");
  });

  it("非 GitHub 源 / 垃圾输入 → null（调用方回退精确串比较）", () => {
    expect(urlSourceKey("https://gitee.com/a/b")).toBeNull();
    expect(urlSourceKey("not-a-url")).toBeNull();
    expect(urlSourceKey("   ")).toBeNull();
  });
});
