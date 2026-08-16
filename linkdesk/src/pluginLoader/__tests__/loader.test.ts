/**
 * loader.ts 单元测试——extractThemeColors/parseContributions 核心逻辑。
 * #36l5：loader 层 vitest 覆盖。
 *
 * 注意：loadPlugin/loadPluginRuntime 依赖完整插件基础设施（文件系统/Vite/IPC），
 * 纯 vitest 环境无法模拟——此处聚焦可独立测试的纯函数。
 * 集成测试由 E3 UAT 手动验证覆盖。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { parseContributions, validateInstallManifest, resolveVersionConflict } from "../loader";
import { ThemeRegistry } from "../../core/registry/ThemeRegistry";
import { LanguageRegistry } from "../../core/registry/LanguageRegistry";
import { clearLangDefs, getLangDef } from "../../core/registry/LangDefRegistry";

// E5.7#95：测试夹具插件 ID——大写常量（linkdesk/no-plugin-id-hardcode 批准的常量通道）
const TEST_PLUGIN_ID = "test-plugin";

/* ── 辅助：清空注册表（每个测试前重置） ── */

function resetRegistries() {
  // 用 clearLangDefs 清理 LangDefRegistry（模块级函数，无 unregisterAll）
  clearLangDefs();
  // LanguageRegistry / ThemeRegistry 继承 RegistryBase，unregisterAll 是 protected——
  // 测试经窄接口 cast 直调（E5.7#98 替代 as any）
  const withUnregister = (r: unknown) =>
    (r as { unregisterAll?: (pluginId: string) => void }).unregisterAll;
  try { withUnregister(LanguageRegistry)?.(TEST_PLUGIN_ID); } catch { /* 无注册项 */ }
  try { withUnregister(ThemeRegistry)?.(TEST_PLUGIN_ID); } catch { /* 无注册项 */ }
}

/* ── normalizeManifest 等价逻辑（loader.ts 内部纯函数，不导出——测试等价逻辑） ── */

function normalizeManifest(manifest: Record<string, unknown>): Record<string, unknown> | undefined {
  if (manifest["contributes"]) return manifest["contributes"] as Record<string, unknown>;

  const themes = manifest["themes"];
  const languages = manifest["languages"];
  const file = manifest["file"];
  const hasThemes = Array.isArray(themes) && themes.length > 0;
  const hasLanguages = Array.isArray(languages) && languages.length > 0;
  const hasFile = typeof file === "string" && file.length > 0;

  if (!hasThemes && !hasLanguages && !hasFile) return undefined;

  const c: Record<string, unknown> = {};
  if (hasThemes) c["themes"] = themes;
  if (hasLanguages) c["languages"] = languages;
  return c;
}

/** 推导加载角色——等价 loadPluginLifecycle Step 4 逻辑 */
function deriveRole(manifest: { pluginRole?: string; entry?: string; contributes?: Record<string, unknown> }, contributes: Record<string, unknown> | undefined): string | undefined {
  return (manifest.pluginRole ?? (!manifest.entry && (contributes || manifest.contributes) ? "data" : undefined)) as string | undefined;
}

/* ── extractThemeColors —— loader.ts 内部函数，不导出，直接测试等价逻辑 ── */
function extractThemeColors(data: Record<string, unknown>): Record<string, string> {
  const raw = data.colors;
  if (!raw || typeof raw !== "object") return {};
  const colors: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") colors[k] = v;
  }
  return colors;
}

describe("loader — extractThemeColors", () => {
  it("提取 colors 字段中的颜色变量", () => {
    const data = {
      type: "dark",
      colors: { bg: "#000", fg: "#fff", accent: "#f00" },
    };
    const colors = extractThemeColors(data);
    expect(colors).toEqual({ bg: "#000", fg: "#fff", accent: "#f00" });
  });

  it("无 colors 字段返回空对象", () => {
    expect(extractThemeColors({})).toEqual({});
    expect(extractThemeColors({ type: "dark" })).toEqual({});
  });

  it("colors 为空对象返回空对象", () => {
    expect(extractThemeColors({ colors: {} })).toEqual({});
  });

  it("过滤非字符串值（数字/布尔/null）", () => {
    // 故意混入非字符串值——extractThemeColors 参数是 Record<string, unknown>，运行时过滤（E5.7#98 免 as any）
    const data = {
      colors: { bg: "#000", count: 42, flag: true, nil: null },
    };
    const colors = extractThemeColors(data);
    expect(colors).toEqual({ bg: "#000" });
    expect(colors.count).toBeUndefined();
    expect(colors.flag).toBeUndefined();
    expect(colors.nil).toBeUndefined();
  });
});

/* ── E5#27d: normalizeManifest——纯函数，不 mutate 只读 manifest ── */

describe("loader — normalizeManifest（等价逻辑）", () => {
  it("settings 类插件（无 contributes、无旧字段）→ undefined", () => {
    const manifest = { name: "settings", entry: "src/index.tsx", factoryRole: "settings" };
    expect(normalizeManifest(manifest)).toBeUndefined();
    // 不 mutate 原对象
    expect((manifest as { contributes?: unknown }).contributes).toBeUndefined();
  });

  it("新格式插件（有 contributes.themes）→ 返回 contributes", () => {
    const manifest = { name: "theme", contributes: { themes: [{ id: "dark" }] } };
    expect(normalizeManifest(manifest)).toBe(manifest.contributes);
  });

  it("旧格式插件（manifest.themes）→ 返回新 contributes 对象，不改原 manifest", () => {
    const manifest = { name: "old-theme", themes: [{ id: "vintage", file: "v.json" }] };
    const result = normalizeManifest(manifest);
    expect(result).toEqual({ themes: [{ id: "vintage", file: "v.json" }] });
    expect((manifest as { contributes?: unknown }).contributes).toBeUndefined(); // 不 mutate
  });

  it("混合——无旧字段且无 contributes → undefined（python 类）", () => {
    const manifest = { name: "python", entry: "src/index.tsx" };
    expect(normalizeManifest(manifest)).toBeUndefined();
  });
});

/* ── E5#27d: deriveRole——局部变量推导，不写 manifest ── */

describe("loader — deriveRole（等价逻辑）", () => {
  it("无 entry + 有 contributes → data", () => {
    expect(deriveRole({}, { themes: [] })).toBe("data");
  });

  it("有 entry → undefined（view）", () => {
    expect(deriveRole({ entry: "src/index.tsx" }, undefined)).toBeUndefined();
  });

  it("pluginRole 显式声明优先于推导", () => {
    expect(deriveRole({ pluginRole: "view", entry: "x" }, { themes: [] })).toBe("view");
    expect(deriveRole({ pluginRole: "data", entry: "x" }, {})).toBe("data");
  });
});

/* ── E5#27d: parseContributions 公共入口——主题/语言分发（langDefs 随 E5.7#49 移主进程） ── */

describe("loader — parseContributions（export function）", () => {
  beforeEach(() => {
    resetRegistries();
  });

  it("contributes.themes → ThemeRegistry 注册", () => {
    parseContributions(TEST_PLUGIN_ID, {
      themes: [{ id: "dark", label: "Dark", uiTheme: "dark", path: "dark.json" }],
    });
    const themes = ThemeRegistry.getAll().filter((t) => t.pluginId === TEST_PLUGIN_ID);
    expect(themes.length).toBe(1);
    expect(themes[0].label).toBe("Dark");
  });

  it("contributes.languages → LanguageRegistry 注册", () => {
    parseContributions(TEST_PLUGIN_ID, {
      languages: [{ id: "zh", label: "中文", path: "zh.json" }],
    });
    const langs = LanguageRegistry.getAll().filter((l) => l.pluginId === TEST_PLUGIN_ID);
    expect(langs.length).toBeGreaterThanOrEqual(1);
    expect(langs.some((l) => l.label === "中文")).toBe(true);
  });

  it("contributes.langDefs 不注册壳侧 LangDefRegistry（E5.7#49 Registry 主进程化）", () => {
    // 迁移后写入方唯一 = 主进程 plugin-manifest-loader（启动扫盘 + 装/卸重扫），
    // 壳侧 parseContributions 不写本表——本测试钉住"壳不写"的新契约
    parseContributions(TEST_PLUGIN_ID, {
      langDefs: [{ id: "python", extensions: [".py"] }],
    });
    expect(getLangDef(".py")).toBeUndefined();
  });
});

/* ── E5.7#81：安装包装纯函数——validateInstallManifest / resolveVersionConflict ── */

describe("E5.7#81 安装包装", () => {
  describe("validateInstallManifest", () => {
    it("合法 manifest 返回三元组", () => {
      const r = validateInstallManifest({ pluginId: "my-plugin", version: "1.0.0", name: "我的插件" });
      expect(r).toEqual({ pluginId: "my-plugin", version: "1.0.0", name: "我的插件" });
    });

    it("name 缺失回退 pluginId", () => {
      const r = validateInstallManifest({ pluginId: "my-plugin", version: "1.0.0" });
      expect(r.name).toBe("my-plugin");
    });

    it("非对象 manifest 抛错", () => {
      expect(() => validateInstallManifest(null)).toThrow(/内容不是对象/);
      expect(() => validateInstallManifest("str")).toThrow(/内容不是对象/);
    });

    it("缺少 pluginId 抛错", () => {
      expect(() => validateInstallManifest({ version: "1.0.0" })).toThrow(/缺少合法的 pluginId/);
    });

    it("路径穿越 pluginId 抛错（安装目录名 = pluginId——直通文件系统）", () => {
      expect(() => validateInstallManifest({ pluginId: "../evil", version: "1.0.0" })).toThrow(/缺少合法的 pluginId/);
      expect(() => validateInstallManifest({ pluginId: "a/b", version: "1.0.0" })).toThrow(/缺少合法的 pluginId/);
      expect(() => validateInstallManifest({ pluginId: "a\\b", version: "1.0.0" })).toThrow(/缺少合法的 pluginId/);
      expect(() => validateInstallManifest({ pluginId: "..", version: "1.0.0" })).toThrow(/缺少合法的 pluginId/);
      expect(() => validateInstallManifest({ pluginId: "-abc", version: "1.0.0" })).toThrow(/缺少合法的 pluginId/);
    });

    it("缺少 version 抛错", () => {
      expect(() => validateInstallManifest({ pluginId: "my-plugin" })).toThrow(/缺少 version/);
      expect(() => validateInstallManifest({ pluginId: "my-plugin", version: "  " })).toThrow(/缺少 version/);
    });
  });

  describe("resolveVersionConflict", () => {
    it("目标不存在（null）→ 放行", () => {
      expect(resolveVersionConflict(null, "1.0.0")).toBeNull();
    });

    it("目标存在但版本读不到 → 保守拒绝", () => {
      expect(resolveVersionConflict({ version: null }, "1.0.0")).toMatch(/版本信息读取失败/);
    });

    it("同版本 → 拒绝并含双方版本号", () => {
      const msg = resolveVersionConflict({ version: "1.2.0" }, "1.2.0")!;
      expect(msg).toContain("1.2.0");
      expect(msg).toMatch(/无需重复安装/);
    });

    it("源较旧 → 拒绝（提示降级需先卸载）", () => {
      const msg = resolveVersionConflict({ version: "1.2.0" }, "1.0.0")!;
      expect(msg).toContain("1.0.0");
      expect(msg).toContain("1.2.0");
      expect(msg).toMatch(/低于/);
    });

    it("源较新 → 拒绝升级（提示先卸载再装）", () => {
      const msg = resolveVersionConflict({ version: "1.2.0" }, "1.3.0")!;
      expect(msg).toContain("1.2.0");
      expect(msg).toContain("1.3.0");
      expect(msg).toMatch(/升级请先卸载/);
    });
  });
});
