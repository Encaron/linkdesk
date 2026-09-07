/**
 * E6#57.1d：compareVersions 单测——壳共享版本比较唯一权威（02 §2.5 零依赖算法）。
 * 覆盖：v 前缀 / 预发布（semver 规范 #11 示例链）/ 缺位补 0 / 相等。fixture = 纯版本字面量（硬约束 21）。
 */

import { describe, it, expect } from "vitest";
import { compareVersions, versionGte } from "./semverUtils";

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
