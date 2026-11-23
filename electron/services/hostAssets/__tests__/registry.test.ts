/**
 * hostAssets 域注册表 —— 插件只传 schema 声明的 {domain,target}：
 * 未注册域 / 缺 target 必须在边界 fail-loud，⛔ 不静默落回某个默认域。
 */

import { describe, expect, it } from "vitest";

import { hostAssetDomains, isHostAssetDomain, resolveHostAssetPick } from "../index";

describe("hostAssets 域注册表", () => {
  it("appearance 是已注册域", () => {
    expect(hostAssetDomains()).toContain("appearance");
    expect(isHostAssetDomain("appearance")).toBe(true);
    expect(isHostAssetDomain("nope")).toBe(false);
  });

  it("合法参数 → 返回驱动 + 原样 target", () => {
    const r = resolveHostAssetPick({ domain: "appearance", target: "zone" });
    expect(r.target).toBe("zone");
    expect(typeof r.driver.pick).toBe("function");
  });

  it("未注册域 → fail-loud", () => {
    expect(() => resolveHostAssetPick({ domain: "nope", target: "app" })).toThrow(/未注册的资产域/);
  });

  it("缺 target → fail-loud", () => {
    expect(() => resolveHostAssetPick({ domain: "appearance", target: "  " })).toThrow(/target 必填/);
  });

  it("参数缺失 → fail-loud", () => {
    expect(() => resolveHostAssetPick(undefined)).toThrow(/参数缺失/);
  });
});
