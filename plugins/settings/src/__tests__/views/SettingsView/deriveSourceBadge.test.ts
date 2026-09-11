/**
 * E5.8#87+#88：来源徽标派生纯函数单测。
 * 派生规则（14-档案 §六 #87 + #88）：无 sourceKey → null；有覆盖且值空 → 🎨 主题；
 * 有覆盖且值 === 主题/混搭基准种子（播种态/恰与主题同值）→ 🎨 主题；值非空且偏离基准（含 __none__）→ ✏️ 用户；
 * 无覆盖 + appearanceMode=custom 且域来源 ≠ followTheme → 🔀 混搭；否则 🎨 主题。
 * E5.8 超算：app.mixRadius/app.mixGlass 死键已删（#85/#86 圆角/玻璃绝对化——数值域来源删键）；
 * E5.8#132：app.mixSurface 随 surface 域整删——夹具不引用死键。
 * 本测试夹具全部改用现存键：surfaceRadius/zoneRadius（中性数值键）+ mixBackground/mixFont（资产域来源键）。
 */

import { describe, it, expect } from "vitest";
import { deriveSourceBadge, MIX_FOLLOW_THEME_SENTINEL } from "../../../views/SettingsView/deriveSourceBadge";

describe("deriveSourceBadge", () => {
  it("无 sourceKey（非徽标槽）→ null——第三方配置键零侵入", () => {
    expect(deriveSourceBadge({})).toBeNull();
    expect(deriveSourceBadge({ sourceKey: undefined, userValue: "x" })).toBeNull();
  });

  it("有用户覆盖 + 值空 → 🎨 主题（清除 = 回主题）", () => {
    // 清除图片——presence 门控回落主题图（A6 核心痛点）
    expect(deriveSourceBadge({ sourceKey: "app.mixBackground", userValue: "" })).toBe("theme");
  });

  it("有用户覆盖 + 值非空 → ✏️ 用户（含显式 __none__ 绝对无）", () => {
    expect(deriveSourceBadge({ sourceKey: "app.mixBackground", userValue: "linkdesk-userdata://img.jpg" })).toBe("user");
    // 显式「无背景」= 用户真实选择 → ✏️（非空非哨兵判定，__none__ 也非空）
    expect(deriveSourceBadge({ sourceKey: "app.mixBackground", userValue: "__none__" })).toBe("user");
    // 布尔键（zoneRadius=false 关闭）→ 非空 → ✏️
    expect(deriveSourceBadge({ sourceKey: "app.zoneRadius", userValue: false })).toBe("user");
    expect(deriveSourceBadge({ sourceKey: "app.surfaceRadius", userValue: 12 })).toBe("user");
  });

  it("有用户覆盖 + 值 === 主题/混搭基准种子 → 🎨 主题（E5.8#88 播种态/恰与主题同值）", () => {
    // 进 custom 播种写 9 键 = 主题反推值——不是用户改过（#87 presence 徽标在此显示 ✏️ 误报，本用例根治）
    expect(deriveSourceBadge({ sourceKey: "app.surfaceRadius", userValue: 8, baseline: 8 })).toBe("theme");
    expect(deriveSourceBadge({ sourceKey: "app.mixBackground", userValue: "linkdesk-userdata://img.jpg", baseline: "linkdesk-userdata://img.jpg" })).toBe("theme");
    // zoneRadius 播种恒 true——仍 true = 未改
    expect(deriveSourceBadge({ sourceKey: "app.zoneRadius", userValue: true, baseline: true })).toBe("theme");
  });

  it("有用户覆盖 + 值偏离基准 → ✏️ 用户（真偏离才报已修改）", () => {
    expect(deriveSourceBadge({ sourceKey: "app.surfaceRadius", userValue: 12, baseline: 8 })).toBe("user");
    // zoneRadius 显式关 = 偏离播种 true → ✏️（真实用户选择）
    expect(deriveSourceBadge({ sourceKey: "app.zoneRadius", userValue: false, baseline: true })).toBe("user");
    // 无 baseline（无活动配方 → getBaselineSeeds null → 空集）→ 退化 presence 派生
    expect(deriveSourceBadge({ sourceKey: "app.mixBackground", userValue: "img.jpg" })).toBe("user");
  });

  it("无覆盖 + appearanceMode=custom 且域来源生效（≠ followTheme）→ 🔀 混搭", () => {
    expect(
      deriveSourceBadge({ sourceKey: "app.backgroundOpacity", mode: "custom", sourceValue: "aurora" }),
    ).toBe("mix");
  });

  it("E5.8#90 中性槽 + 域来源生效 → 🔀（清除空 / 播种=基准 均不再被空串规则短路）", () => {
    // 清除空：fontFamily 空 + mixFont=songti → 实际字体来自宋体配方——🔀 而非 🎨（14-档案 #87「mix 来源生效 = 🔀」）
    expect(
      deriveSourceBadge({ sourceKey: "app.mixFont", userValue: "", mode: "custom", sourceValue: "songti-print" }),
    ).toBe("mix");
    // 播种=基准：backgroundOpacity 播种 0.5（=主题基准）+ mixBackground=songti → 背景域来源生效 → 🔀
    expect(
      deriveSourceBadge({ sourceKey: "app.backgroundOpacity", userValue: 0.5, baseline: 0.5, mode: "custom", sourceValue: "songti-print" }),
    ).toBe("mix");
    // 对照——域来源 = 跟随主题（未生效）→ 中性槽仍 🎨（A6 清除回主题保持）
    expect(
      deriveSourceBadge({ sourceKey: "app.mixFont", userValue: "", mode: "custom", sourceValue: MIX_FOLLOW_THEME_SENTINEL }),
    ).toBe("theme");
  });

  it("无覆盖 + appearanceMode=custom 但域来源 = followTheme（跟随整体配方）→ 🎨 主题", () => {
    expect(
      deriveSourceBadge({ sourceKey: "app.mixBackground", mode: "custom", sourceValue: MIX_FOLLOW_THEME_SENTINEL }),
    ).toBe("theme");
  });

  it("无覆盖 + appearanceMode=followTheme（未自定义）→ 🎨 主题", () => {
    expect(
      deriveSourceBadge({ sourceKey: "app.mixBackground", mode: "followTheme", sourceValue: "aurora" }),
    ).toBe("theme");
  });

  it("无覆盖 + appearanceMode 未定义（读空）→ 🎨 主题", () => {
    expect(deriveSourceBadge({ sourceKey: "app.mixBackground" })).toBe("theme");
  });
});
