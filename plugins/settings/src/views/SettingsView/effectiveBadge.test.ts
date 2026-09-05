/**
 * E5.8#155 跟随主题生效值徽标——纯函数单测（settings 插件无组件测试基建，徽标逻辑抽纯函数直测）。
 * 覆盖：跟随主题判定（isFollowingThemeValue）/ 徽标解析（resolveEffectiveBadge 四态）/
 * 生效值展示形态（formatEffectiveValue 字体首族截断 + 色值色块）。
 * fixture 用虚构值（硬约束 21：Demo Sans / Demo Mono；token key 为真实契约面）。
 * E5.8#155 归一化后：token 映射声明进配置 schema（appearance.ts effectiveToken）——本测试只测纯函数
 * 对 effectiveToken 声明值的解析（传显式 token），无插件内映射表契约；展示形态按值驱动（零 token 键知识）。
 */

import { describe, it, expect } from "vitest";
import {
  isFollowingThemeValue,
  resolveEffectiveBadge,
  formatEffectiveValue,
} from "./effectiveBadge";

describe("E5.8#155 生效值徽标纯函数", () => {
  it("isFollowingThemeValue——未修改（无覆盖/清除空/播种=基准）为真；显式偏离为假", () => {
    // 无覆盖（undefined）→ 跟随主题
    expect(isFollowingThemeValue(undefined, "")).toBe(true);
    // 清除空 "" → 跟随主题
    expect(isFollowingThemeValue("", "")).toBe(true);
    // 播种=基准（glassTint 物质化 rgba，与基准同值 → 未修改）→ 跟随主题
    expect(isFollowingThemeValue("rgba(59,77,148,0.35)", "rgba(59,77,148,0.35)")).toBe(true);
    // 显式偏离（fontFamily 选字 ≠ 基准空）→ 非跟随主题
    expect(isFollowingThemeValue("Demo Sans", "")).toBe(false);
    // 显式「系统字体」哨兵 → 显式偏离
    expect(isFollowingThemeValue("__none__", "")).toBe(false);
  });

  it("resolveEffectiveBadge——声明 effectiveToken + 跟随主题 + 生效值存在 → 徽标；三缺一不显", () => {
    const tokens = {
      "font-ui": "Demo Sans",
      "font-mono": "Demo Mono",
      "glass-tint": "rgba(59,77,148,0.35)",
    };
    // 字体行跟随主题（播种恒空基准）→ 现
    expect(resolveEffectiveBadge("font-ui", tokens, "", "")).toEqual({
      tokenKey: "font-ui",
      value: "Demo Sans",
    });
    // 等宽字体行 → 现
    expect(resolveEffectiveBadge("font-mono", tokens, "", "")).toEqual({
      tokenKey: "font-mono",
      value: "Demo Mono",
    });
    // 玻璃色行跟随主题（播种=基准）→ 现
    expect(resolveEffectiveBadge("glass-tint", tokens, "rgba(59,77,148,0.35)", "rgba(59,77,148,0.35)")).toEqual({
      tokenKey: "glass-tint",
      value: "rgba(59,77,148,0.35)",
    });
    // 未声明 effectiveToken（surfaceRadius 无生效 token 徽标）→ 不显
    expect(resolveEffectiveBadge(undefined, tokens, "", "")).toBeNull();
    // 显式偏离（user 态，已显 ✏️）→ 不显
    expect(resolveEffectiveBadge("font-ui", tokens, "Demo Sans", "")).toBeNull();
    // 生效值缺（无活动配方兜底空集）→ 不显
    expect(resolveEffectiveBadge("font-ui", {}, "", "")).toBeNull();
    // 透明哨兵（玻璃无实际 tint）→ 不显
    expect(resolveEffectiveBadge("glass-tint", { "glass-tint": "transparent" }, "", "")).toBeNull();
  });

  it("formatEffectiveValue——字体首族截断逗号栈（去引号）/ 色值（rgba/hex）带色块", () => {
    expect(formatEffectiveValue("Demo Sans, 'Demo Fallback', sans-serif")).toEqual({
      label: "Demo Sans",
    });
    expect(formatEffectiveValue("Demo Mono")).toEqual({ label: "Demo Mono" });
    expect(formatEffectiveValue("rgba(59,77,148,0.35)")).toEqual({
      label: "rgba(59,77,148,0.35)",
      color: "rgba(59,77,148,0.35)",
    });
    expect(formatEffectiveValue("#0078d4")).toEqual({ label: "#0078d4", color: "#0078d4" });
  });
});
