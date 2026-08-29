/**
 * ThemeEngine/fonts 单元测试——资产字体两步机制（E5.8#50.17，@font-face → 族名写 --font-*）。
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  isAssetFontPath,
  ensureFontFace,
  resolveRecipeFonts,
  cleanupPluginFontFaces,
  ensurePluginFontFacesCleanup,
  applyRecipe,
} from "../ThemeEngine";
import { rollback } from "../../../registry/registrationTracker";
import { ThemeRegistry } from "../../../registry/appearance/ThemeRegistry";
import { RECIPE_ASSET } from "./testFixtures.mock";
import type { ThemeRecipe } from "../../../types/theme";

describe("ThemeEngine — 资产字体两步机制（E5.8#50.17，@font-face → 族名写 --font-*）", () => {
  // 虚构 fixture（硬约束 21）：demo-font 插件 + DemoFont.woff2 资产——不指向真实插件
  const PLUGIN = "demo-font";
  const ASSET_REL = "./resources/DemoFont.woff2";
  const ASSET_URL = "linkdesk://demo-font/resources/DemoFont.woff2";
  const FAMILY = "__ld_demo-font_DemoFont";

  // RECIPE_ASSET = testFixtures 共享 fixture；此处只用其资产相对路径 + 归属 demo-font 插件
  const RECIPE_SYSTEM: ThemeRecipe = {
    id: "demo-system-recipe",
    name: "Demo System Recipe",
    type: "dark",
    appearance: { font: { ui: "Noto Sans SC", mono: "Consolas" } },
    colorways: [{ id: "base", name: "Base", colors: {} }],
  };

  beforeEach(() => {
    rollback(PLUGIN); // 清上一测试的 recipe 登记 + 字体清理 disposer
    cleanupPluginFontFaces(PLUGIN); // 清会话表 + 摘归属 + 移除 DOM style（幂等）
    const root = document.documentElement;
    root.style.removeProperty("--font-ui");
    root.style.removeProperty("--font-mono");
  });

  it("isAssetFontPath — 路径/扩展名 → 资产；系统族名 → 直接写", () => {
    expect(isAssetFontPath("./resources/DemoFont.woff2")).toBe(true);
    expect(isAssetFontPath("resources/DemoFont.woff2")).toBe(true);
    expect(isAssetFontPath("C:\\fonts\\DemoFont.ttf")).toBe(true);
    expect(isAssetFontPath("DemoFont.otf")).toBe(true);
    expect(isAssetFontPath("Noto Sans SC")).toBe(false);
    expect(isAssetFontPath("SimSun")).toBe(false);
    expect(isAssetFontPath("Consolas")).toBe(false);
  });

  it("ensureFontFace — 注册 @font-face style + 会话表 + 幂等（同 URL 二次调用不重复插）", () => {
    const family = ensureFontFace(ASSET_URL, PLUGIN);
    expect(family).toBe(FAMILY);
    const style = document.getElementById(`ld-ff-${FAMILY}`) as HTMLStyleElement | null;
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain(`font-family:"${FAMILY}"`);
    expect(style!.textContent).toContain(`url("${ASSET_URL}")`);
    expect(style!.textContent).toContain('format("woff2")');
    expect(document.head.querySelectorAll(`style[id='ld-ff-${FAMILY}']`).length).toBe(1);
    // 幂等——同 URL 不重复插
    ensureFontFace(ASSET_URL, PLUGIN);
    expect(document.head.querySelectorAll(`style[id='ld-ff-${FAMILY}']`).length).toBe(1);
  });

  it("resolveRecipeFonts — 资产相对路径 → 族名 + fontFaces 表；系统族名原样", () => {
    ThemeRegistry.registerRecipe(RECIPE_ASSET, PLUGIN);
    const { appearance, fontFaces } = resolveRecipeFonts(RECIPE_ASSET);
    expect(appearance?.font?.ui).toBe(FAMILY); // 资产 → 两步换族名
    expect(fontFaces).toHaveLength(1);
    expect(fontFaces[0]).toEqual({ family: FAMILY, url: ASSET_URL, format: "woff2" });

    const sys = resolveRecipeFonts(RECIPE_SYSTEM);
    expect(sys.appearance?.font?.ui).toBe("Noto Sans SC"); // 系统族名直接写
    expect(sys.appearance?.font?.mono).toBe("Consolas");
    expect(sys.fontFaces).toHaveLength(0);
  });

  it("resolveRecipeFonts — 无归属插件（未登记）→ 资产写原值不注册（浏览器回退）", () => {
    const { appearance, fontFaces } = resolveRecipeFonts(RECIPE_ASSET); // 未 registerRecipe
    expect(appearance?.font?.ui).toBe(ASSET_REL);
    expect(fontFaces).toHaveLength(0);
    expect(document.getElementById(`ld-ff-${FAMILY}`)).toBeNull();
  });

  it("applyRecipe — 资产字体全链路：--font-ui 写族名 + @font-face style 落 DOM", () => {
    ThemeRegistry.registerRecipe(RECIPE_ASSET, PLUGIN);
    applyRecipe(RECIPE_ASSET, "base", {});
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--font-ui")).toBe(FAMILY); // 两步机制第二链：写族名不写 url()
    expect(document.getElementById(`ld-ff-${FAMILY}`)).not.toBeNull();
    expect(root.style.getPropertyValue("--bg-window")).toBe("#101014");
  });

  it("cleanupPluginFontFaces — 移除 style + 生效族名还原 --font-ui（字体回默认）", () => {
    ThemeRegistry.registerRecipe(RECIPE_ASSET, PLUGIN);
    applyRecipe(RECIPE_ASSET, "base", {});
    expect(document.documentElement.style.getPropertyValue("--font-ui")).toBe(FAMILY);
    cleanupPluginFontFaces(PLUGIN);
    expect(document.getElementById(`ld-ff-${FAMILY}`)).toBeNull();
    expect(document.documentElement.style.getPropertyValue("--font-ui")).toBe(""); // 还原回 :root 默认
  });

  it("ensurePluginFontFacesCleanup — 卸载 rollback 触发字体清理（卸插件 → 字体回默认验收）", () => {
    ThemeRegistry.registerRecipe(RECIPE_ASSET, PLUGIN);
    ensurePluginFontFacesCleanup(PLUGIN);
    applyRecipe(RECIPE_ASSET, "base", {});
    expect(document.getElementById(`ld-ff-${FAMILY}`)).not.toBeNull();
    rollback(PLUGIN);
    expect(document.getElementById(`ld-ff-${FAMILY}`)).toBeNull();
    expect(document.documentElement.style.getPropertyValue("--font-ui")).toBe("");
  });

  it("ensurePluginFontFacesCleanup — 幂等：多配方重复登记不重复挂 disposer（重装可再登记）", () => {
    ensurePluginFontFacesCleanup(PLUGIN);
    ensurePluginFontFacesCleanup(PLUGIN);
    ensurePluginFontFacesCleanup(PLUGIN);
    ensureFontFace(ASSET_URL, PLUGIN);
    rollback(PLUGIN);
    expect(document.getElementById(`ld-ff-${FAMILY}`)).toBeNull();
    // 重装后能再登记（守卫键被 disposer 自删）
    ensurePluginFontFacesCleanup(PLUGIN);
    ensureFontFace(ASSET_URL, PLUGIN);
    expect(document.getElementById(`ld-ff-${FAMILY}`)).not.toBeNull();
  });
});
