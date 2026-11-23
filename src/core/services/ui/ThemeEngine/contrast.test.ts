/**
 * 高对比派生（2026-11-24 极性 Phase 6）——用户级对比度与明暗极性正交。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { applyHighContrast, highContrastEnabled } from "./contrast";
import { resolvePolarity } from "./color";
import { applyRemoteConfigChange, clearConfigurationCache } from "../../configuration/ConfigurationService";

describe("applyHighContrast", () => {
  it("暗极性 → 黑面白字、边框白、内容面/压图面同步", () => {
    const tokens: Record<string, string> = {};
    applyHighContrast(tokens, "dark");
    expect(tokens["text-primary"]).toBe("white");
    expect(tokens["bg-window"]).toBe("black");
    expect(tokens["bg-window-solid"]).toBe("black");
    expect(tokens["border"]).toBe("white");
    expect(tokens["surface-reading"]).toBe("black");
    expect(tokens["surface-media-ink"]).toBe("white");
    expect(resolvePolarity(tokens, "dark")).toBe("dark");
  });

  it("亮极性 → 白面黑字、边框黑、内容面/压图面同步", () => {
    const tokens: Record<string, string> = {};
    applyHighContrast(tokens, "light");
    expect(tokens["text-primary"]).toBe("black");
    expect(tokens["bg-window"]).toBe("white");
    expect(tokens["border"]).toBe("black");
    expect(tokens["surface-reading"]).toBe("white");
    expect(tokens["surface-media-ink"]).toBe("black");
    expect(resolvePolarity(tokens, "light")).toBe("light");
  });

  it("不动 accent 身份", () => {
    const tokens: Record<string, string> = { accent: "#123456" };
    applyHighContrast(tokens, "dark");
    expect(tokens["accent"]).toBe("#123456");
  });
});

describe("highContrastEnabled — 用户级开关", () => {
  beforeEach(() => clearConfigurationCache());
  it("缺省 / standard → false；high → true", () => {
    expect(highContrastEnabled()).toBe(false);
    applyRemoteConfigChange("app.contrastMode", "standard");
    expect(highContrastEnabled()).toBe(false);
    applyRemoteConfigChange("app.contrastMode", "high");
    expect(highContrastEnabled()).toBe(true);
  });
});
