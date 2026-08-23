/**
 * IpcBridgeHandler 主题域单测——E5.8#50.18 六方法（06 §2）。
 * 覆盖：listRecipes 配方→RecipeMeta（colorways 预览色 + domains）/ getActive 引擎态 + 配置回退 /
 * getEffectiveTokens 合并集 / setRecipe/setColorway 落配置 / resetAppearance 清覆盖 / 未知方法抛错。
 * fixture 用虚构值（硬约束 21：demo-plugin/Demo Recipe/Demo Mint）。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from "vitest";
import { handleThemeMethod } from "./theme";
import { ThemeRegistry } from "../../../registry/appearance/ThemeRegistry";
import { applyRecipe, applyTheme } from "../../ui/ThemeEngine";
import { rollback } from "../../../registry/registrationTracker";
import {
  getConfigurationValue, applyRemoteConfigChange, clearConfigurationCache,
} from "../../configuration/ConfigurationService";
import type { ThemeRecipe } from "../../../types/theme";

const PLUGIN = "demo-plugin";

const RECIPE: ThemeRecipe = {
  id: "demo-recipe",
  name: "Demo Recipe",
  type: "dark",
  appearance: { font: { ui: "Times New Roman" }, radius: { md: 8 } },
  colorways: [
    { id: "demo-dark", name: "Demo Dark", colors: { accent: "#123456", "bg-window": "#0a0a0a" } },
    { id: "demo-mint", name: "Demo Mint", colors: { accent: "#00aa88", "bg-window": "#f0fff8" } },
  ],
};

describe("IpcBridgeHandler/theme — 配方/配色 API（E5.8#50.18）", () => {
  beforeEach(() => {
    clearConfigurationCache();
    rollback(PLUGIN);
    ThemeRegistry.registerRecipe(RECIPE, PLUGIN);
    // flat apply 清 recipe 态——getActive 配置回退分支需要 currentRecipeId=null
    applyTheme({ name: "Demo Flat", type: "light", colors: {} });
  });

  it("listRecipes — 配方 → RecipeMeta（colorways 预览色 + domains）", async () => {
    const list = (await handleThemeMethod("theme.listRecipes", [])) as Array<Record<string, unknown>>;
    expect(list).toHaveLength(1);
    const meta = list[0];
    expect(meta.id).toBe("demo-recipe");
    expect(meta.name).toBe("Demo Recipe");
    expect(meta.type).toBe("dark");
    // domains——colorways 恒贡献 colors + appearance 有 font/radius
    expect(meta.domains).toEqual(["colors", "radius", "font"]);
    const colorways = meta.colorways as Array<{ id: string; name: string; preview: { accent: string; bgWindow: string } }>;
    expect(colorways).toHaveLength(2);
    expect(colorways[0]).toEqual({
      id: "demo-dark",
      name: "Demo Dark",
      preview: { accent: "#123456", bgWindow: "#0a0a0a" },
    });
    expect(colorways[1].preview.accent).toBe("#00aa88");
  });

  it("getActive — applyRecipe 提交后返回活动配方/配色", async () => {
    applyRecipe(RECIPE, "demo-mint", {});
    expect(await handleThemeMethod("theme.getActive", [])).toEqual({
      recipeId: "demo-recipe",
      colorwayId: "demo-mint",
    });
  });

  it("getActive — 无活动配方 + app.theme 已注册配方 → 配置回退", async () => {
    applyRemoteConfigChange("app.theme", "demo-recipe");
    applyRemoteConfigChange("app.themeColor", "demo-dark");
    expect(await handleThemeMethod("theme.getActive", [])).toEqual({
      recipeId: "demo-recipe",
      colorwayId: "demo-dark",
    });
  });

  it("getActive — 无活动配方 + 配置非注册配方 → null", async () => {
    applyRemoteConfigChange("app.theme", "not-a-recipe");
    expect(await handleThemeMethod("theme.getActive", [])).toBeNull();
  });

  it("getEffectiveTokens — 返回合并后 token 集（含配色覆盖）", async () => {
    applyRecipe(RECIPE, "demo-mint", {});
    const tokens = (await handleThemeMethod("theme.getEffectiveTokens", [])) as Record<string, string>;
    expect(tokens["accent"]).toBe("#00aa88");
    expect(tokens["bg-window"]).toBe("#f0fff8");
  });

  it("setRecipe / setColorway — 落配置（app.theme / app.themeColor）", async () => {
    // 持久化在测试环境可能失败——in-memory 值已写入即断言（对标 ConfigurationService.test 同款 try/catch）
    try {
      await handleThemeMethod("theme.setRecipe", ["demo-recipe"]);
      await handleThemeMethod("theme.setColorway", ["demo-mint"]);
    } catch { /* persist failed — expected in test */ }
    expect(getConfigurationValue("app.theme")).toBe("demo-recipe");
    expect(getConfigurationValue("app.themeColor")).toBe("demo-mint");
  });

  it("resetAppearance — 清设置层外观覆盖", async () => {
    applyRemoteConfigChange("app.glassBlur", 15);
    applyRemoteConfigChange("app.surfaceRadius", 1.5);
    applyRemoteConfigChange("app.backgroundImage", "C:/bg.png");
    try {
      await handleThemeMethod("theme.resetAppearance", []);
    } catch { /* persist failed — expected in test */ }
    expect(getConfigurationValue("app.glassBlur")).toBeUndefined();
    expect(getConfigurationValue("app.surfaceRadius")).toBeUndefined();
    expect(getConfigurationValue("app.backgroundImage")).toBeUndefined();
  });

  it("未知方法抛错", async () => {
    await expect(handleThemeMethod("theme.nope", [])).rejects.toThrow("未知的 plugins 方法");
  });
});
