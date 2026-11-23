/**
 * 2026-11-24 拍板：跟随 ↔ 自定义切换保留用户覆盖（stash 语义）。
 * 覆盖：切 follow 先把值抄进 stash 再清；切 custom 有改动 → 恢复，无改动 → 按主题重新播种。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../core/services/configuration/StorageService", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../core/services/configuration/StorageService")>();
  return { ...mod, write: vi.fn(async () => {}), getFilePath: vi.fn(async () => "C:/linkdesk/settings.json") };
});
vi.mock("../../core/services/files/FileService", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../core/services/files/FileService")>();
  return { ...mod, readFile: vi.fn(async () => ""), exists: vi.fn(async () => true) };
});

import { registerConfiguration, clearConfigurationRegistrations, type ConfigurationProperty } from "../../core/registry/ConfigurationRegistry";
import {
  inspectConfiguration, clearConfigurationCache, setConfigurationValue,
} from "../../core/services/configuration/ConfigurationService";
import {
  stashCustomAppearance, enterCustomAppearance,
} from "./appearanceApplier";
import { APPEARANCE_OVERRIDE_KEYS, MIX_SOURCE_KEYS } from "../../core/services/ui/ThemeEngine";

const STASH_KEY = "linkdesk.appearance.customStash.v1";

describe("外观模式切换 —— 自定义覆盖 stash（2026-11-24）", () => {
  beforeEach(() => {
    clearConfigurationRegistrations();
    clearConfigurationCache();
    localStorage.removeItem(STASH_KEY);
    const props: Record<string, ConfigurationProperty> = {};
    // 数值键给数值默认，其余给空串
    for (const key of [...APPEARANCE_OVERRIDE_KEYS, ...MIX_SOURCE_KEYS]) {
      props[key] = String(key).match(/Opacity|Radius|Blur|Saturate|Mask|Scale|zoneRadius$/) ? { type: "number", default: 0, title: key, description: key } : { type: "string", default: "", title: key, description: key };
    }
    props["app.themeColor"] = { type: "string", default: "", title: "themeColor", description: "themeColor" };
    registerConfiguration("appearance", { title: "Appearance", properties: props });
  });

  it("切 follow：用户值抄进 stash（不被销毁）", () => {
    setConfigurationValue("app.glassOpacity", 0.37, "user");
    setConfigurationValue("app.backgroundImage", "linkdesk-userdata://wallpaper.jpg", "user");
    setConfigurationValue("app.themeColor", "other-recipe.color", "user");

    stashCustomAppearance();

    const raw = localStorage.getItem(STASH_KEY);
    expect(raw).toBeTruthy();
    const stash = JSON.parse(raw as string);
    expect(stash.overrides["app.glassOpacity"]).toBe(0.37);
    expect(stash.overrides["app.backgroundImage"]).toBe("linkdesk-userdata://wallpaper.jpg");
    expect(stash.themeColor).toBe("other-recipe.color");
    // 只写 stash，不动配置本身（复位由调用方做）
    expect(inspectConfiguration("app.glassOpacity").userValue).toBe(0.37);
  });

  it("切 custom：stash 有用户改动 → 原样恢复（不再被主题值覆盖）", () => {
    setConfigurationValue("app.glassOpacity", 0.37, "user");
    stashCustomAppearance();
    // 模拟 follow 态：值被复位清空
    setConfigurationValue("app.glassOpacity", 0.5, "user");

    const restored = enterCustomAppearance();

    expect(restored).toBe(true);
    expect(inspectConfiguration("app.glassOpacity").userValue).toBe(0.37);
  });

  it("切 custom：stash 无改动（纯种子） → 走播种，不恢复旧值", () => {
    // 无 stash 时也应播种而非抛错；无 glass 主题 → 玻璃键不写、其余种子照写
    expect(enterCustomAppearance()).toBe(false);
    expect(inspectConfiguration("app.glassOpacity").userValue).toBeUndefined();
    expect(inspectConfiguration("app.surfaceRadius").userValue).toBe(0);
    // 无 glass 声明的主题不再播种玻璃键（2026-11-24）——播种走其余覆盖
  });
});
