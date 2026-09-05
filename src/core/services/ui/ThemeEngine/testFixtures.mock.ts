/**
 * ThemeEngine 共享测试 fixture——虚构值（硬约束 21：demo-* 不指真实插件）。
 * MOCK_THEME 族 / RECIPE 族 / GLASS_VARS / 真实主题读取 helper——registry/apply/recipe/fonts/
 * seeds/mix/accent/integration 各组测试复用（模块级单份定义，防 jscpd 同款复制）。
 *
 * ⚠️ 命名故意用 `.mock.ts`（无测试用例的纯 fixture 数据）：audit-i18n /mock/i 与
 * eslint no-hardcoded-hex /mock/i 两门禁一致豁免测试桩数据（含主题色值/中文配色名）。
 * 不要改回 testFixtures.ts——会同时击穿 i18n 审计（中文配色名当 UI 文案）与 hex 门禁。
 */

import fs from "node:fs";
import path from "node:path";
import { parseThemeRecipe } from "../../../registry/appearance/ThemeRegistry";
import type { Theme } from "../ThemeEngine";
import type { ThemeRecipe } from "../../../types/theme";

export const MOCK_THEME: Theme = {
  name: "Test Dark",
  type: "dark",
  colors: { bg: "#000", fg: "#fff", accent: "#ff0000" },
};

export const MOCK_THEME2: Theme = {
  name: "Test Light",
  type: "light",
  colors: { bg: "#fff", fg: "#000" },
};

/* 真实主题 JSON 读取 helper（模块级单份，避免 jscpd 同款复制）——
 * 读 plugins/theme-* 真实 recipe 文件 → parseThemeRecipe → 返回 { raw, recipe }。
 * 2026-09-05 塌平单根（原 plugins/user/theme-*）。 */
const ROOT = process.cwd();
export function loadRealRecipe(rel: string, id: string, label: string, uiTheme: "light" | "dark") {
  const raw = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const recipe = parseThemeRecipe(JSON.parse(raw), { id, label, uiTheme, path: rel });
  return { raw, recipe };
}

/* 共享配方 fixture（虚构值，硬约束 21）——applyRecipe / 资产字体 / 混搭 三组 describe 复用：
 * 模块级单份定义，避免 jscpd 同款复制（每 describe 各写一份 = 重复代码）。 */
export const RECIPE: ThemeRecipe = {
  id: "demo-recipe",
  name: "Demo Recipe",
  type: "dark",
  appearance: {
    radius: { sm: 6, lg: 12 },
    glass: { type: "glass", blur: 14 },
    font: { ui: "Noto Sans SC" },
  },
  colorways: [
    { id: "dew", name: "露", colors: { "bg-window": "#FFFBF5", accent: "#2BA876" } },
    { id: "mint", name: "薄荷", colors: { "bg-window": "#F7FBF8", accent: "#3E9E8C" } },
  ],
};
export const RECIPE_NO_COLOR: ThemeRecipe = {
  id: "demo-plain",
  name: "Demo Plain",
  type: "light",
  colorways: [{ id: "plain", name: "Plain", colors: { "bg-window": "#FAFAFA" } }],
};
export const RECIPE_ASSET: ThemeRecipe = {
  id: "demo-font-recipe",
  name: "Demo Font Recipe",
  type: "dark",
  appearance: { font: { ui: "./resources/DemoFont.woff2" } },
  colorways: [{ id: "base", name: "Base", colors: { "bg-window": "#101014" } }],
};
export const GLASS_VARS = ["glass-blur", "glass-saturate", "glass-tint", "glass-opacity", "glass-specular", "glass-specular-color", "glass-morph"];
