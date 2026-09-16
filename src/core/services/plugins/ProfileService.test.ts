/**
 * Profile 维度 2 的**外观键比较归一**（E6#111f／1.36 · 负控 15）。
 *
 * 负控 15 原话：「旧 profile 导入（含旧 id）⇒ 归一后**比较相等**」。
 * 为什么这条非跑不可：**Profile 文件不随版本 6 迁移**（那一版只改写 settings.json）⇒
 * 用户导入的旧 profile 存着旧外观 id，而盘面已是新名；若比较不归一，切换会**误报失败**（用户可见回归）。
 *
 * 本用例钉住四件事：
 *   ① 四键（`app.theme` / `app.themeColor` / `app.mixFont` / `app.mixBackground`）**旧值 ≡ 新值**；
 *   ② `app.iconTheme` **不在**归一表内（本格不动图标主题 id——列了就是替下一格做决定）；
 *   ③ 哨兵 `followTheme` 与显示名恒等（它们不是 id）；
 *   ④ 解析器**未装配**时恒等 = fail-safe（旧值 ≠ 新值）——负控方向不许反过来。
 */
import { afterEach, describe, expect, it } from "vitest";
import { normalizeProfileSettingForCompare } from "./ProfileService";
import { setAppearanceIdResolvers } from "../ui/ThemeEngine";
// ⚠️ `clearAppearanceIdResolvers` **只给测试用**、刻意没从 ThemeEngine 门面出口（生产没有清空解析器的路径）
import { clearAppearanceIdResolvers } from "../ui/ThemeEngine/migration";

/** 改名**已落地**的盘面：新名在册、旧名不在（解析器两问 ⇒ 映） */
function resolversForRenamedPlate(): void {
  const ids = [
    "theme-mint-soda.mint-soda",
    "theme-pill.pill-bubble",
    "theme-zones.paper-zones",
    "theme-zones.kraft",
  ];
  setAppearanceIdResolvers({
    recipe: (id) => ids.includes(id),
    colorway: (id) => ids.includes(id),
  });
}

afterEach(() => clearAppearanceIdResolvers());

describe("Profile 维度 2——外观键比较归一（负控 15）", () => {
  it("🔴 旧 profile 的旧 id 与盘面新名**判等**（四键）", () => {
    resolversForRenamedPlate();
    expect(normalizeProfileSettingForCompare("app.theme", "mint-soda"))
      .toBe(normalizeProfileSettingForCompare("app.theme", "theme-mint-soda.mint-soda"));
    expect(normalizeProfileSettingForCompare("app.mixFont", "pill-bubble"))
      .toBe(normalizeProfileSettingForCompare("app.mixFont", "theme-pill.pill-bubble"));
    expect(normalizeProfileSettingForCompare("app.mixBackground", "paper-zones"))
      .toBe(normalizeProfileSettingForCompare("app.mixBackground", "theme-zones.paper-zones"));
    // app.themeColor 双语义：配色语义（kraft）与配方语义（mint-soda）都要判得等
    expect(normalizeProfileSettingForCompare("app.themeColor", "kraft"))
      .toBe(normalizeProfileSettingForCompare("app.themeColor", "theme-zones.kraft"));
    expect(normalizeProfileSettingForCompare("app.themeColor", "mint-soda"))
      .toBe("theme-mint-soda.mint-soda"); // 先配色表、再配方表
  });

  it("🔴 `app.iconTheme` **不在**归一表内（本格不动图标主题 id）＋ 非外观键原样透传", () => {
    resolversForRenamedPlate();
    const oldIcon = "ld-iconset-pastel";
    expect(normalizeProfileSettingForCompare("app.iconTheme", oldIcon)).toBe(oldIcon);
    expect(normalizeProfileSettingForCompare("app.fontSize", 16)).toBe(16); // 数字**不转字符串**（非外观键零干预）
    expect(normalizeProfileSettingForCompare("app.language", "zh")).toBe("zh");
  });

  it("哨兵与显示名恒等（它们不是 id——负控 11/12 的比较面）", () => {
    resolversForRenamedPlate();
    expect(normalizeProfileSettingForCompare("app.themeColor", "followTheme")).toBe("followTheme");
    expect(normalizeProfileSettingForCompare("app.theme", "薄荷苏打 Mint Soda")).toBe("薄荷苏打 Mint Soda");
  });

  it("🔴 解析器**未装配** ⇒ 恒等（fail-safe 方向不许反过来：旧值 ≠ 新值）", () => {
    clearAppearanceIdResolvers();
    expect(normalizeProfileSettingForCompare("app.theme", "mint-soda")).toBe("mint-soda");
    expect(normalizeProfileSettingForCompare("app.theme", "mint-soda"))
      .not.toBe(normalizeProfileSettingForCompare("app.theme", "theme-mint-soda.mint-soda"));
  });
});
