/**
 * E6#57.1d：compareVersions 单测——壳共享版本比较唯一权威（02 §2.5 零依赖算法）。
 * 覆盖：v 前缀 / 预发布（semver 规范 #11 示例链）/ 缺位补 0 / 相等。fixture = 纯版本字面量（硬约束 21）。
 */

import { describe, it, expect } from "vitest";
import { compareVersions, versionGte, updateTargetDirection, parseStrictSemver } from "./semverUtils";

describe("compareVersions 基础", () => {
  it("相等返回 0", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("忽略 v 前缀——v1.2.3 == 1.2.3", () => {
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("V1.2.3", "v1.2.3")).toBe(0);
  });

  it("v 前缀两位数主版本不被吞——V2.0.0 > v1.9.9", () => {
    expect(compareVersions("V2.0.0", "v1.9.9")).toBe(1);
    expect(compareVersions("v1.9.9", "V2.0.0")).toBe(-1);
  });

  it("缺位补 0——0.2 == 0.2.0、1.0 == 1.0.0", () => {
    expect(compareVersions("0.2", "0.2.0")).toBe(0);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.2.0", "0.2")).toBe(0);
  });

  it("升序判大小", () => {
    expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
  });

  it("宽容输入：超 3 段尾段照比", () => {
    expect(compareVersions("0.1.2.3", "0.1.2")).toBe(1);
  });
});

describe("compareVersions 预发布（semver 规范 #11 全序链）", () => {
  it("release > 同核心带 prerelease 版本", () => {
    expect(compareVersions("1.0.0", "1.0.0-beta")).toBe(1);
    expect(compareVersions("1.0.0-beta", "1.0.0")).toBe(-1);
  });

  it("规范全序链：alpha < alpha.1 < alpha.beta < beta < beta.2 < beta.11 < rc.1 < release", () => {
    const chain = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
    ];
    for (let i = 0; i < chain.length; i++) {
      for (let j = 0; j < chain.length; j++) {
        const got = compareVersions(chain[i], chain[j]);
        if (i === j) expect(got).toBe(0);
        else if (i < j) expect(got).toBeLessThan(0);
        else expect(got).toBeGreaterThan(0);
      }
    }
  });

  it("数字标识符 < 字母标识符——1.0.0-1 < 1.0.0-alpha", () => {
    expect(compareVersions("1.0.0-1", "1.0.0-alpha")).toBe(-1);
  });

  it("预发布数字按数值比（beta.2 < beta.11）", () => {
    expect(compareVersions("1.0.0-beta.2", "1.0.0-beta.11")).toBe(-1);
  });

  it("预发布前缀相同字段少者小（alpha < alpha.1）", () => {
    expect(compareVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
  });

  it("预发布字母按字典序（alpha.beta > alpha.alpha）", () => {
    expect(compareVersions("1.0.0-alpha.beta", "1.0.0-alpha.alpha")).toBe(1);
  });
});

describe("versionGte", () => {
  it("a >= b 语义", () => {
    expect(versionGte("1.2.3", "1.2.3")).toBe(true);
    expect(versionGte("2.0.0", "1.9.9")).toBe(true);
    expect(versionGte("1.0.0", "1.0.0-beta")).toBe(true);
    expect(versionGte("1.0.0-beta", "1.0.0")).toBe(false);
  });
});

describe("updateTargetDirection（E6#33c 锚① 版本方向——包内版本 vs 当前已装）", () => {
  it("目标更高 = upgrade（默认更新语义放行）", () => {
    expect(updateTargetDirection("1.2.0", "1.1.0")).toBe("upgrade");
    expect(updateTargetDirection("2.0.0", "1.99.99")).toBe("upgrade");
    expect(updateTargetDirection("1.1.0-beta", "1.0.0")).toBe("upgrade"); // prerelease 仍按 semver 高
  });

  it("目标更低 = downgrade（默认拒，仅 allowOlder 放行）", () => {
    expect(updateTargetDirection("1.0.0", "1.1.0")).toBe("downgrade");
    expect(updateTargetDirection("1.0.0-beta", "1.0.0")).toBe("downgrade");
  });

  it("同版本 = same（恒拒——重装非更新流职责）", () => {
    expect(updateTargetDirection("1.1.0", "1.1.0")).toBe("same");
    expect(updateTargetDirection("1.1.0", "v1.1.0")).toBe("same"); // v 前缀归一
  });
});

describe("parseStrictSemver（E6#57.5 更新源 tag 严格校验——与上面的宽容比较不是同一个问题）", () => {
  it("合法版本：v 前缀剥掉、缺段补 0 **不补**（核心段必须三段齐全）", () => {
    expect(parseStrictSemver("v0.1.50")).toEqual({ version: "0.1.50", prerelease: false });
    expect(parseStrictSemver("V0.1.50")).toEqual({ version: "0.1.50", prerelease: false });
    expect(parseStrictSemver("0.1.50")).toEqual({ version: "0.1.50", prerelease: false });
    expect(parseStrictSemver(" 1.2.3 ")).toEqual({ version: "1.2.3", prerelease: false });
  });

  it("预发布：判 true 且版本号带上预发布段（stable 通道据此忽略）", () => {
    expect(parseStrictSemver("v0.1.50-beta.1")).toEqual({ version: "0.1.50-beta.1", prerelease: true });
    expect(parseStrictSemver("1.0.0-rc.1")).toEqual({ version: "1.0.0-rc.1", prerelease: true });
  });

  it("构建元数据不进版本号（semver 2.0 §10：不参与优先级比较）", () => {
    expect(parseStrictSemver("v1.2.3+build.5")).toEqual({ version: "1.2.3", prerelease: false });
  });

  it("🔴 非法一律 null——`v1.0`（缺段）/ `release-0.2.0`（带前缀）/ 前导零 / 四段", () => {
    for (const bad of ["v1.0", "1.0", "release-0.2.0", "v0.1.50.1", "nightly", "", "v01.2.3"]) {
      expect(parseStrictSemver(bad)).toBeNull();
    }
  });

  it("与 compareVersions 的宽容形成对照——同一个输入，一个 null 一个给数", () => {
    // 这条故意把两个函数的差别钉住：`compareVersions` 永不失败，拿它当「tag 合法吗」用是错的
    expect(parseStrictSemver("v1.0")).toBeNull();
    expect(compareVersions("v1.0", "0.1.49")).toBe(1);
  });
});
