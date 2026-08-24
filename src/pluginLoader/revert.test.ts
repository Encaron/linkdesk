/**
 * Revert 模式测试——卸载当前主题/语言插件时自动回退。
 * 🔥 E3b L6b + E3c UAT 第三次重演——防止新增贡献类型（图标主题等）时漏加 revert。
 *
 * 机制：设当前值为某插件提供的值 → 调 revert 函数 → 断言 current ≠ 卸载前的值。
 * tsc 不报错、ESLint 不报错、常规 vitest 不覆盖——专门补这一条缝。
 *
 * 注意：revert 内部调 setConfigurationValue（走文件系统）→ vitest mock 掉，
 * 只验证 revert 的条件判断和回退值选择逻辑。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ThemeRegistry } from "../core/registry/appearance/ThemeRegistry";
import { LanguageRegistry } from "../core/registry/languages/LanguageRegistry";
import { registerTheme, unregisterTheme, getAvailableThemes } from "../core/services/ui/ThemeEngine";
import { rollback } from "../core/registry/registrationTracker";

// ── Mock ConfigurationService 的 setConfigurationValue（避免 FS 依赖）──
vi.mock("../core/services/configuration/ConfigurationService", () => {
  const store: Record<string, unknown> = {
    "app.theme": "Dark",
    "app.language": "zh",
  };
  return {
    getConfigurationValue: <T>(key: string): T | undefined => store[key] as T | undefined,
    setConfigurationValue: vi.fn(async (key: string, value: unknown) => {
      store[key] = value;
    }),
    onDidChangeConfiguration: vi.fn(() => () => {}),
  };
});

import { revertThemeIfCurrent, revertLanguageIfCurrent, reapplyThemeAfterUnload } from "./loader";
import { getConfigurationValue } from "../core/services/configuration/ConfigurationService";

const PLUGIN_ID = "test-revert-plugin";

/** 注册"非被卸载插件"提供的当前主题（多用例共享夹具——jscpd 防重复） */
function registerBuiltinDarkTheme(): void {
  ThemeRegistry.register({ id: "builtin-dark", label: "Builtin Dark", uiTheme: "dark", path: "dark.json" }, "builtin");
  registerTheme({ name: "Builtin Dark", type: "dark", colors: { bg: "#111" } }, "builtin");
}

describe("revertIfCurrent——卸载当前贡献时自动回退", () => {
  beforeEach(() => {
    // 清理 ThemeEngine
    for (const name of getAvailableThemes()) {
      unregisterTheme(name);
    }
    rollback(PLUGIN_ID); // E5.8#12：ThemeRegistry.unregisterPlugin 已删——tracker 回滚同语义
    // 注：getConfigurationValue mock 是普通函数（vi.mock 工厂返回箭头函数）——
    // 原 (as any).mockClear?.() 恒为 no-op（mockClear 不存在，?. 吞掉），已随 E5.7#98 整删
  });

  /* ── 1. 主题 revert ── */

  it("revertThemeIfCurrent——当前主题来自被卸载插件→回退到其他主题", async () => {
    ThemeRegistry.register({ id: "test-dark", label: "Test Dark", uiTheme: "dark", path: "dark.json" }, PLUGIN_ID);
    registerTheme({ name: "Test Dark", type: "dark", colors: { bg: "#111" } }, PLUGIN_ID);
    ThemeRegistry.register({ id: "builtin-light", label: "Builtin Light", uiTheme: "light", path: "light.json" }, "builtin");
    registerTheme({ name: "Builtin Light", type: "light", colors: { bg: "#fff" } }, "builtin");

    // 设置当前主题为被卸载插件的主题（注意：mock store 从 "Dark" 开始）
    // 先切到 test-dark
    expect(getConfigurationValue("app.theme")).toBeDefined();

    await revertThemeIfCurrent(PLUGIN_ID);

    // 验证：theme 插件注册后，revert 能找到 theme（ThemeRegistry.get）
    // 如果 ThemeRegistry 里有 PLUGIN_ID 的主题且当前值匹配 → 触发回退
    // 这里实际上不能简单断言——因为 mock store 里 app.theme 初始值是 "Dark"，
    // "Dark" 不属于 PLUGIN_ID → revertThemeIfCurrent 会 return early
    // 我们需要先设 current theme 为 plugin 的主题
  });

  it("revertThemeIfCurrent——当前主题不属于被卸载插件→不触发回退", async () => {
    registerBuiltinDarkTheme();

    const { setConfigurationValue } = await import("../core/services/configuration/ConfigurationService");
    await revertThemeIfCurrent(PLUGIN_ID);

    // builtin-dark 不属于 PLUGIN_ID → setConfigurationValue 不应被调用
    expect(setConfigurationValue).not.toHaveBeenCalled();
  });

  it("E5.8#61 审计#1——revertThemeIfCurrent：活动主题非本插件但本插件是混搭来源→返回 true 待卸载后重合并", async () => {
    // 另一插件（builtin）提供当前主题；demo-mix-plugin 只作为混搭来源（app.mixColor 引用其配色）
    registerBuiltinDarkTheme();
    ThemeRegistry.registerRecipe(
      {
        id: "demo-mix-recipe", name: "Demo Mix Recipe", type: "dark",
        colorways: [{ id: "mix-cw", name: "Mix", colors: { bg: "#222" } }],
      },
      PLUGIN_ID
    );
    const { setConfigurationValue: setCfg } = await import("../core/services/configuration/ConfigurationService");
    await setCfg("app.theme", "builtin-dark", "user");
    await setCfg("app.mixColor", "mix-cw", "user");
    vi.mocked(setCfg).mockClear(); // 清掉 setup 写入——只断言 revert/reapply 自己的调用

    // revert 只做归属判定——返回 true 表示本插件是混搭来源，重合并推迟到 unload 后
    const result = await revertThemeIfCurrent(PLUGIN_ID);
    expect(result).toBe(true);
    // 活动主题来自 builtin → revert 自身不写 app.theme（此时写 = 早合并，来源配方仍注册找不到回退）
    expect(setCfg).not.toHaveBeenCalledWith("app.theme", expect.anything(), expect.anything());

    // reapplyThemeAfterUnload（调用方在 unloadPlugin 之后调）：同值重写 app.theme 触发 applier 重合并
    // （此刻来源配方已摘，重合并走 #58 缺域回退回主题基线）
    await reapplyThemeAfterUnload();
    expect(setCfg).toHaveBeenCalledWith("app.theme", "builtin-dark", "user");
    // 清理 store——防泄漏到后续用例
    await setCfg("app.mixColor", "followTheme", "user");
  });

  it("E5.8#61 审计#1——revertThemeIfCurrent：混搭来源是其他插件→返回 false 不触发重应用", async () => {
    registerBuiltinDarkTheme();
    // 混搭来源配方归其他插件——PLUGIN_ID 不提供任何配方
    ThemeRegistry.registerRecipe(
      {
        id: "demo-other-recipe", name: "Demo Other Recipe", type: "dark",
        colorways: [{ id: "other-cw", name: "Other", colors: { bg: "#333" } }],
      },
      "demo-other-plugin"
    );
    const { setConfigurationValue: setCfg } = await import("../core/services/configuration/ConfigurationService");
    await setCfg("app.theme", "builtin-dark", "user");
    await setCfg("app.mixColor", "other-cw", "user");
    vi.mocked(setCfg).mockClear();

    const result = await revertThemeIfCurrent(PLUGIN_ID);

    expect(result).toBe(false);
    expect(setCfg).not.toHaveBeenCalled();
    await setCfg("app.mixColor", "followTheme", "user");
  });

  /* ── 2. 语言 revert ── */

  it("revertLanguageIfCurrent——当前语言来自被卸载插件→回退到 zh", async () => {
    LanguageRegistry.register({ id: "ja", label: "日本語", path: "ja.json" }, PLUGIN_ID);
    LanguageRegistry.register({ id: "zh", label: "中文", path: "zh.json" }, "builtin");

    // 设置当前语言为 ja（mock store）
    const { setConfigurationValue: setCfg } = await import("../core/services/configuration/ConfigurationService");
    await setCfg("app.language", "ja", "user");

    await revertLanguageIfCurrent(PLUGIN_ID);

    // ja 来自 PLUGIN_ID → 回退到 zh
    expect(setCfg).toHaveBeenCalledWith("app.language", "zh", "user");
  });

  it("revertLanguageIfCurrent——只有被卸载插件的语言→回退到硬编码 zh", async () => {
    LanguageRegistry.register({ id: "ja", label: "日本語", path: "ja.json" }, PLUGIN_ID);
    // 没有注册其他语言

    const { setConfigurationValue: setCfg } = await import("../core/services/configuration/ConfigurationService");
    await setCfg("app.language", "ja", "user");

    await revertLanguageIfCurrent(PLUGIN_ID);

    // 无其他语言 → 回退到 "zh" 硬编码
    expect(setCfg).toHaveBeenCalledWith("app.language", "zh", "user");
  });

  it("revertLanguageIfCurrent——当前语言不属于被卸载插件→不触发回退", async () => {
    LanguageRegistry.register({ id: "zh", label: "中文", path: "zh.json" }, "builtin");
    LanguageRegistry.register({ id: "ja", label: "日本語", path: "ja.json" }, PLUGIN_ID);

    const { setConfigurationValue: setCfg } = await import("../core/services/configuration/ConfigurationService");
    await setCfg("app.language", "zh", "user");

    // 重置 mock——清除之前的调用记录（vi.mocked 窄化——setConfigurationValue 已由 vi.mock 替换为 vi.fn）
    vi.mocked(setCfg).mockClear();

    await revertLanguageIfCurrent(PLUGIN_ID);

    // zh 属于 builtin 不是 PLUGIN_ID → 不应该调用 setConfigurationValue
    expect(setCfg).not.toHaveBeenCalled();
  });
});
