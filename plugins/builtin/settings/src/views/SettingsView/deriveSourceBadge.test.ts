/**
 * E5.8#87：来源徽标派生纯函数单测。
 * 派生规则（14-档案 §六 #87）：无 sourceKey → null；有覆盖且值空 → 🎨 主题；有覆盖且值非空（含 __none__）→ ✏️ 用户；
 * 无覆盖 + mixMode=mix 且域来源 ≠ followTheme → 🔀 混搭；否则 🎨 主题。
 */

import { describe, it, expect } from "vitest";
import { deriveSourceBadge, MIX_FOLLOW_THEME_SENTINEL } from "./deriveSourceBadge";

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
    expect(deriveSourceBadge({ sourceKey: "app.mixRadius", userValue: false })).toBe("user");
    expect(deriveSourceBadge({ sourceKey: "app.mixRadius", userValue: 12 })).toBe("user");
  });

  it("无覆盖 + mixMode=mix 且域来源生效（≠ followTheme）→ 🔀 混搭", () => {
    expect(
      deriveSourceBadge({ sourceKey: "app.mixRadius", mixMode: "mix", sourceValue: "aurora" }),
    ).toBe("mix");
  });

  it("无覆盖 + mixMode=mix 但域来源 = followTheme（跟随整体配方）→ 🎨 主题", () => {
    expect(
      deriveSourceBadge({ sourceKey: "app.mixRadius", mixMode: "mix", sourceValue: MIX_FOLLOW_THEME_SENTINEL }),
    ).toBe("theme");
  });

  it("无覆盖 + mixMode=recipe（未开混搭）→ 🎨 主题", () => {
    expect(
      deriveSourceBadge({ sourceKey: "app.mixRadius", mixMode: "recipe", sourceValue: "aurora" }),
    ).toBe("theme");
  });

  it("无覆盖 + mixMode 未定义（读空）→ 🎨 主题", () => {
    expect(deriveSourceBadge({ sourceKey: "app.mixGlass" })).toBe("theme");
  });
});
