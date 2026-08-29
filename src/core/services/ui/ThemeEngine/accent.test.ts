/**
 * ThemeEngine/accent 单元测试——强调色独立轴（E5.8#98，accentSource 解耦外观主开关，schemaMigrations v5）。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { applyTheme, getEffectiveAccentColor } from "../ThemeEngine";
import {
  applyRemoteConfigChange, clearConfigurationCache,
} from "../../configuration/ConfigurationService";
import { MOCK_THEME, MOCK_THEME2 } from "./testFixtures.mock";

describe("ThemeEngine — getEffectiveAccentColor 强调色独立轴（E5.8#98，accentSource 解耦外观主开关，schemaMigrations v5）", () => {
  beforeEach(() => {
    clearConfigurationCache();
  });

  it("accentSource=followTheme + 主题有 accent → 主题色（外观主开关 followTheme）", () => {
    applyTheme(MOCK_THEME); // accent #ff0000
    applyRemoteConfigChange("app.appearanceMode", "followTheme");
    applyRemoteConfigChange("app.accentSource", "followTheme");
    applyRemoteConfigChange("app.accentColor", "#112233"); // 写但忽略——来源跟随主题
    expect(getEffectiveAccentColor()).toBe("#ff0000");
  });

  it("accentSource=followTheme + 外观主开关 custom → 仍主题色（强调色独立轴，不随外观主开关）", () => {
    applyTheme(MOCK_THEME);
    applyRemoteConfigChange("app.appearanceMode", "custom");
    applyRemoteConfigChange("app.accentSource", "followTheme");
    applyRemoteConfigChange("app.accentColor", "#112233");
    expect(getEffectiveAccentColor()).toBe("#ff0000");
  });

  it("accentSource=custom → 自定义色（外观主开关 followTheme 也生效——只调强调色不调外观）", () => {
    applyTheme(MOCK_THEME);
    applyRemoteConfigChange("app.appearanceMode", "followTheme");
    applyRemoteConfigChange("app.accentSource", "custom");
    applyRemoteConfigChange("app.accentColor", "#112233");
    expect(getEffectiveAccentColor()).toBe("#112233");
  });

  it("accentSource 缺省（未写）→ 跟随主题（?? followTheme 陷阱防护）", () => {
    applyTheme(MOCK_THEME);
    applyRemoteConfigChange("app.appearanceMode", "custom"); // 旧外观主开关不越权
    expect(getEffectiveAccentColor()).toBe("#ff0000");
  });

  it("accentSource=followTheme + 主题无 accent → 自定义兜底", () => {
    applyTheme(MOCK_THEME2); // 无 accent 域
    applyRemoteConfigChange("app.accentSource", "followTheme");
    applyRemoteConfigChange("app.accentColor", "#445566");
    expect(getEffectiveAccentColor()).toBe("#445566");
  });

  // E5.8#99（#5）：accentColor 清除语义——清除（空串）→ 跟随主题强调色（对标 backgroundImage/fontFamily 三键清除）
  it("accentSource=custom + 清除（空串）→ 跟随主题强调色", () => {
    applyTheme(MOCK_THEME); // accent #ff0000
    applyRemoteConfigChange("app.appearanceMode", "followTheme");
    applyRemoteConfigChange("app.accentSource", "custom");
    applyRemoteConfigChange("app.accentColor", ""); // 清除
    expect(getEffectiveAccentColor()).toBe("#ff0000");
  });

  it("accentSource=custom + 清除 + 主题无 accent → 系统默认兜底（数据默认）", () => {
    applyTheme(MOCK_THEME2); // 无 accent 域
    applyRemoteConfigChange("app.accentSource", "custom");
    applyRemoteConfigChange("app.accentColor", "");
    expect(getEffectiveAccentColor()).toBe("#0078d4");
  });
});
