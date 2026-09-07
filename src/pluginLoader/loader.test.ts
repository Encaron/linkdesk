/**
 * loader.ts 单元测试——extractThemeColors/parseContributions 核心逻辑。
 * #36l5：loader 层 vitest 覆盖。
 *
 * 注意：loadPlugin/loadPluginRuntime 依赖完整插件基础设施（文件系统/Vite/IPC），
 * 纯 vitest 环境无法模拟——此处聚焦可独立测试的纯函数。
 * 集成测试由 E3 UAT 手动验证覆盖。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { parseContributions, validateInstallManifest, resolveVersionConflict, runtimeEntryPath } from "./loader";
import { hasSidebarContainers } from "./discovery/manifest"; // E5.8#37.9.2.3：纯函数真源导入
import { extractThemeColors } from "./contributions/contributions"; // E5.8#1c：真源导入，替代本地等价重实现
import type { PluginManifest } from "../core/api/types";
import { ThemeRegistry } from "../core/registry/appearance/ThemeRegistry";
import { LanguageRegistry } from "../core/registry/languages/LanguageRegistry";
import { clearLangDefs, getLangDef } from "../core/registry/languages/LangDefRegistry";

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
    it("合法 manifest 返回三元组（manifest.pluginId 优先于目录名）", () => {
      const r = validateInstallManifest({ pluginId: "my-plugin", version: "1.0.0", name: "我的插件" }, "picked-dir");
      expect(r).toEqual({ pluginId: "my-plugin", version: "1.0.0", name: "我的插件" });
    });

    it("manifest 缺 pluginId → 目录名兜底（loader 惯例——lang-defaults/panel-demo 无此字段）", () => {
      const r = validateInstallManifest({ version: "1.0.0" }, "my-dir");
      expect(r.pluginId).toBe("my-dir");
      expect(r.name).toBe("my-dir");
    });

    it("name 缺失回退 pluginId", () => {
      const r = validateInstallManifest({ pluginId: "my-plugin", version: "1.0.0" }, "picked-dir");
      expect(r.name).toBe("my-plugin");
    });

    it("非对象 manifest 抛错", () => {
      expect(() => validateInstallManifest(null, "dir")).toThrow(/内容不是对象/);
      expect(() => validateInstallManifest("str", "dir")).toThrow(/内容不是对象/);
    });

    it("pluginId 非字符串抛错", () => {
      expect(() => validateInstallManifest({ pluginId: 123, version: "1.0.0" }, "dir")).toThrow(/必须是字符串/);
    });

    it("路径穿越/非法 pluginId 抛错（安装目录名 = pluginId——直通文件系统）", () => {
      expect(() => validateInstallManifest({ pluginId: "../evil", version: "1.0.0" }, "dir")).toThrow(/不合法/);
      expect(() => validateInstallManifest({ pluginId: "a/b", version: "1.0.0" }, "dir")).toThrow(/不合法/);
      expect(() => validateInstallManifest({ pluginId: "a\\b", version: "1.0.0" }, "dir")).toThrow(/不合法/);
      expect(() => validateInstallManifest({ pluginId: "..", version: "1.0.0" }, "dir")).toThrow(/不合法/);
      expect(() => validateInstallManifest({ pluginId: "-abc", version: "1.0.0" }, "dir")).toThrow(/不合法/);
    });

    it("目录名兜底同样过安全校验（含中文/空白目录名）", () => {
      expect(() => validateInstallManifest({ version: "1.0.0" }, "../evil")).toThrow(/不合法/);
      expect(() => validateInstallManifest({ version: "1.0.0" }, "我的插件")).toThrow(/不合法/);
    });

    it("缺少 version 抛错", () => {
      expect(() => validateInstallManifest({ pluginId: "my-plugin" }, "dir")).toThrow(/缺少 version/);
      expect(() => validateInstallManifest({ pluginId: "my-plugin", version: "  " }, "dir")).toThrow(/缺少 version/);
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

  describe("E5.7#82 runtimeEntryPath（E6 打包格式分支点）", () => {
    const manifestWith = (entry?: string) => ({ entry }) as unknown as PluginManifest;

    it("dev + entry → 源码路径原样返回（Vite 即时编译）", () => {
      expect(runtimeEntryPath(manifestWith("src/index.tsx"), TEST_PLUGIN_ID, true))
        .toBe("src/index.tsx");
    });

    it("dev + entryless → null（生命周期契约不绑 entry）", () => {
      expect(runtimeEntryPath(manifestWith(), TEST_PLUGIN_ID, true)).toBeNull();
    });

    it("prod → 预构建 chunk 名 <pluginId>.js（entry 源码路径不参与解析）", () => {
      expect(runtimeEntryPath(manifestWith("src/index.tsx"), TEST_PLUGIN_ID, false))
        .toBe("test-plugin.js");
    });

    it("prod + entryless + 非 bundle → null（E6#15d G3a：纯数据包无主 JS，跳过幻影 import 防误报）", () => {
      expect(runtimeEntryPath(manifestWith(), TEST_PLUGIN_ID, false)).toBeNull();
    });
  });

  /* ── E5.8#37.9.2.3：hasSidebarContainers——entryless 视图插件进 viewRegistry 的判定 ── */
  describe("hasSidebarContainers", () => {
    const vc = (containers: Record<string, unknown>) => ({ contributes: { viewsContainers: containers } }) as unknown as PluginManifest;

    it("有侧栏容器（location 未声明默认 sidebar）→ true", () => {
      expect(hasSidebarContainers(vc({ "hello-sidebar": { title: "Hello" } }))).toBe(true);
    });

    it("有显式 location:\"sidebar\" 容器 → true", () => {
      expect(hasSidebarContainers(vc({ "hello-sidebar": { title: "Hello", location: "sidebar" } }))).toBe(true);
    });

    it("只有 panel 容器 → false（图标栏语义 = 打开侧栏容器）", () => {
      expect(hasSidebarContainers(vc({ "demo-panel": { title: "输出", location: "panel" } }))).toBe(false);
    });

    it("只有 auxiliarybar 容器 → false", () => {
      expect(hasSidebarContainers(vc({ "aux": { title: "Aux", location: "auxiliarybar" } }))).toBe(false);
    });

    it("零 viewsContainers（Python 语言包等数据插件）→ false", () => {
      expect(hasSidebarContainers({ contributes: { languages: [] } } as unknown as PluginManifest)).toBe(false);
    });

    it("contributes 为空 / 无 contributes → false", () => {
      expect(hasSidebarContainers({} as PluginManifest)).toBe(false);
      expect(hasSidebarContainers({ contributes: {} } as PluginManifest)).toBe(false);
    });

    it("viewsContainers 空对象 → false", () => {
      expect(hasSidebarContainers(vc({}))).toBe(false);
    });

    it("entry 有无不影响判定（入口与容器是两个独立能力轴）", () => {
      expect(hasSidebarContainers({ entry: "src/index.tsx", ...vc({ "s": { title: "S", location: "sidebar" } }) } as unknown as PluginManifest)).toBe(true);
    });
  });
});

/* E6#30d：pruneUninstalledCache 已随 loader 第 7 步退役（探索插件视图改目录驱动）——原 E5.8#156 差集清理测试块删除 */
