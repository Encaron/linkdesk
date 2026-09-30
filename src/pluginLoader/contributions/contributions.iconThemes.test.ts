/**
 * E5.8#133.1 normalizeIconThemeMappings 单测——图标主题 mappings JSON 双形态归一化。
 *
 * 验证：
 * 1. 字体 glyph（class / class+color）原样透传
 * 2. 图像资产（imagePath）→ getPluginAssetPath 解析 linkdesk:// 绝对 URL（硬约束 12 同族）
 * 3. 四段（files/extensions/folders/foldersExpanded）同表可混用
 * 4. 无效条目跳过 + warn；整表无效 → null
 * 5. `./` 前缀路径归一化
 *
 * E5.8#133.4 normalizeIconThemeFontMeta——可选自定义字体 font 段归一化。
 * E5.8#133.5 resolvePluginDataUrl——删除 dev 探测后恒 linkdesk://（dev/prod 零分叉，单一权威契约）。
 *
 * fixture 命名遵守硬约束 21：虚构值（demo-plugin / demo-icon / Demo Icon），不指向真实插件。
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  normalizeIconThemeMappings,
  normalizeIconThemeFontMeta,
  resolvePluginDataUrl,
  syncIconThemeEnum,
} from "./contributions";
import { IconRegistry, ICON_THEME_FALLBACK_ID } from "../../core/registry/appearance/IconRegistry";
import {
  clearConfigurationRegistrations,
  getConfigurationContributions,
  registerConfiguration,
} from "../../core/registry/ConfigurationRegistry";
import { rollback } from "../../core/registry/registrationTracker";

describe("resolvePluginDataUrl——单一权威：恒 linkdesk://（E5.8#133.5）", () => {
  it("dev/prod 零分叉——恒返回 linkdesk://{pluginId}/{filePath}，不探测本地端口", () => {
    expect(resolvePluginDataUrl("demo-plugin", "data.json")).toBe("linkdesk://demo-plugin/data.json");
    // 嵌套路径（主题/图标/字体/glyph CSS 共用同一条寻址）
    expect(resolvePluginDataUrl("demo-plugin", "icons/fonts/demo.woff2")).toBe(
      "linkdesk://demo-plugin/icons/fonts/demo.woff2"
    );
  });
});

describe("normalizeIconThemeMappings——字体 glyph 形态", () => {
  it("class 单态透传", () => {
    const m = normalizeIconThemeMappings(
      { files: { "demo.txt": { class: "demo-font demo-font-demo" } } },
      "demo-plugin"
    );
    expect(m).toEqual({ files: { "demo.txt": { class: "demo-font demo-font-demo" } } });
  });

  it("class + color 带色透传", () => {
    const m = normalizeIconThemeMappings(
      { files: { "demo.rs": { class: "demo-font demo-font-rust", color: "#dea584" } } },
      "demo-plugin"
    );
    expect(m).toEqual({ files: { "demo.rs": { class: "demo-font demo-font-rust", color: "#dea584" } } });
  });
});

describe("normalizeIconThemeMappings——图像资产形态", () => {
  it("imagePath → linkdesk:// 绝对 URL", () => {
    const m = normalizeIconThemeMappings(
      { files: { "demo.svg": { imagePath: "icons/demo.svg" } } },
      "demo-plugin"
    );
    expect(m).toEqual({ files: { "demo.svg": { imagePath: "linkdesk://demo-plugin/icons/demo.svg" } } });
  });

  it("`./` 前缀路径归一化（正源 normalizePath + 去 ./）", () => {
    const m = normalizeIconThemeMappings(
      { extensions: { ".demo": { imagePath: "./icons/demo.png" } } },
      "demo-plugin"
    );
    expect(m).toEqual({ extensions: { ".demo": { imagePath: "linkdesk://demo-plugin/icons/demo.png" } } });
  });
});

describe("normalizeIconThemeMappings——四段混用 + 无效条目", () => {
  it("同表混用双形态（字体 + 图像）", () => {
    const m = normalizeIconThemeMappings(
      {
        files: { "demo.txt": { class: "demo-font demo-font-demo" } },
        folders: { demo: { imagePath: "icons/folder.svg" } },
      },
      "demo-plugin"
    );
    expect(m).toEqual({
      files: { "demo.txt": { class: "demo-font demo-font-demo" } },
      folders: { demo: { imagePath: "linkdesk://demo-plugin/icons/folder.svg" } },
    });
  });

  it("无效条目跳过 + warn，有效条目保留", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = normalizeIconThemeMappings(
      {
        files: {
          "demo.txt": { class: "demo-font" },
          "broken.json": { somethingElse: 42 },
          "nested.ts": "not-an-object",
        },
      },
      "demo-plugin"
    );
    expect(m).toEqual({ files: { "demo.txt": { class: "demo-font" } } });
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("非对象段忽略", () => {
    const m = normalizeIconThemeMappings({ files: "nope" as unknown as Record<string, unknown> }, "demo-plugin");
    expect(m).toBeNull();
  });

  it("整表无效 → null", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = normalizeIconThemeMappings(
      { files: { "broken.json": { imagePath: 42 } } } as unknown as Record<string, unknown>,
      "demo-plugin"
    );
    expect(m).toBeNull();
    warn.mockRestore();
  });

  it("空数据 → null", () => {
    expect(normalizeIconThemeMappings({}, "demo-plugin")).toBeNull();
  });

  it("顶层 font 段不进 mappings 结果（只归一化四段 + 默认图标）", () => {
    const m = normalizeIconThemeMappings(
      { font: { path: "icons/fonts/demo.woff2", family: "demo-font" }, files: { "demo.txt": { class: "demo-font demo-font-demo" } } },
      "demo-plugin"
    );
    expect(m).toEqual({ files: { "demo.txt": { class: "demo-font demo-font-demo" } } });
  });
});

describe("normalizeIconThemeMappings——顶层默认图标（E5.8#133.6）", () => {
  it("单条目默认图标 imagePath → linkdesk://（对齐 VS Code iconTheme 顶层键）", () => {
    const m = normalizeIconThemeMappings(
      {
        file: { imagePath: "icons/file.svg" },
        folder: { imagePath: "icons/folder.svg" },
        folderExpanded: { imagePath: "icons/folder-open.svg" },
        rootFolder: { imagePath: "icons/folder-root.svg" },
        rootFolderExpanded: { imagePath: "icons/folder-root-open.svg" },
      },
      "demo-plugin"
    );
    expect(m).toEqual({
      file: { imagePath: "linkdesk://demo-plugin/icons/file.svg" },
      folder: { imagePath: "linkdesk://demo-plugin/icons/folder.svg" },
      folderExpanded: { imagePath: "linkdesk://demo-plugin/icons/folder-open.svg" },
      rootFolder: { imagePath: "linkdesk://demo-plugin/icons/folder-root.svg" },
      rootFolderExpanded: { imagePath: "linkdesk://demo-plugin/icons/folder-root-open.svg" },
    });
  });

  it("glyph 形态默认图标原样透传", () => {
    const m = normalizeIconThemeMappings(
      { folder: { class: "demo-font demo-folder", color: "#ffcc00" } },
      "demo-plugin"
    );
    expect(m).toEqual({ folder: { class: "demo-font demo-folder", color: "#ffcc00" } });
  });

  it("匹配表 + 默认图标混合归一化", () => {
    const m = normalizeIconThemeMappings(
      {
        extensions: { ".py": { imagePath: "icons/python.svg" } },
        folder: { imagePath: "icons/folder.svg" },
      },
      "demo-plugin"
    );
    expect(m).toEqual({
      extensions: { ".py": { imagePath: "linkdesk://demo-plugin/icons/python.svg" } },
      folder: { imagePath: "linkdesk://demo-plugin/icons/folder.svg" },
    });
  });

  it("默认图标无效 → 跳过 + warn，其余有效保留", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = normalizeIconThemeMappings(
      {
        folder: { imagePath: 42 } as unknown as Record<string, unknown>,
        files: { "demo.txt": { class: "demo-font" } },
      },
      "demo-plugin"
    );
    expect(m).toEqual({ files: { "demo.txt": { class: "demo-font" } } });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("仅默认图标有效也算有效表（整表非空）", () => {
    const m = normalizeIconThemeMappings({ folder: { imagePath: "icons/folder.svg" } }, "demo-plugin");
    expect(m).toEqual({ folder: { imagePath: "linkdesk://demo-plugin/icons/folder.svg" } });
  });
});

describe("normalizeIconThemeFontMeta——自定义字体 font 段（E5.8#133.4）", () => {
  it("font 段有效 → FontFaceSpec（linkdesk:// 解析 + woff2 format）+ glyphCssPath", () => {
    const meta = normalizeIconThemeFontMeta(
      { font: { path: "icons/fonts/demo.woff2", family: "demo-font", glyphs: "icons/demo-glyphs.css" } },
      "demo-plugin"
    );
    expect(meta).toEqual({
      fontFaces: [{ family: "demo-font", url: "linkdesk://demo-plugin/icons/fonts/demo.woff2", format: "woff2" }],
      glyphCssPath: "icons/demo-glyphs.css",
    });
  });

  it("glyphs 缺省 → glyphCssPath 空串（仅 @font-face，无 glyph 类）", () => {
    const meta = normalizeIconThemeFontMeta(
      { font: { path: "icons/fonts/demo.ttf", family: "demo-font" } },
      "demo-plugin"
    );
    expect(meta).toEqual({
      fontFaces: [{ family: "demo-font", url: "linkdesk://demo-plugin/icons/fonts/demo.ttf", format: "ttf" }],
      glyphCssPath: "",
    });
  });

  it("绝对 URL 原样透传（不二次解析）", () => {
    const meta = normalizeIconThemeFontMeta(
      { font: { path: "https://example.test/demo.otf", family: "demo-font" } },
      "demo-plugin"
    );
    expect(meta?.fontFaces[0].url).toBe("https://example.test/demo.otf");
    expect(meta?.fontFaces[0].format).toBe("otf");
  });

  it("无 font 段 → null", () => {
    expect(normalizeIconThemeFontMeta({ files: { "demo.txt": { class: "demo-font" } } }, "demo-plugin")).toBeNull();
  });

  it("font 段缺 path/family → null + warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(normalizeIconThemeFontMeta({ font: { path: "icons/fonts/demo.woff2" } }, "demo-plugin")).toBeNull();
    expect(normalizeIconThemeFontMeta({ font: { family: "demo-font" } }, "demo-plugin")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

/**
 * 2026-10-01 接线：`syncIconThemeEnum` 把**显示名随枚举一起推**（此前只推 id ⇒ 设置页下拉里是裸 id）。
 * 钉的是**接线**，装配口径另有 IconRegistry.test.ts 的 `iconThemeEnumOptions` 一组——两处都留着：
 * 这条证明「装/卸图标主题插件 ⇒ 下拉名字当场刷新」，即枚举同步这条既有路径真的带上了描述位。
 */
describe("syncIconThemeEnum — 枚举 ＋ 显示名同推（装/卸即刷新）", () => {
  /** 造一个只含 app.iconTheme 的配置贡献（键名 = 真键，验证的是真实落点） */
  function registerIconThemeKey(): void {
    clearConfigurationRegistrations();
    registerConfiguration("app", {
      title: "主题",
      properties: {
        "app.iconTheme": { type: "string", default: ICON_THEME_FALLBACK_ID, description: "图标主题" },
      },
    });
  }
  const prop = () => getConfigurationContributions().get("app")!.properties["app.iconTheme"];

  afterEach(() => {
    clearConfigurationRegistrations();
    rollback("demo-plugin");
  });

  it("装插件 → 枚举带 id、显示名带 label 原文；卸插件 → 回退保底单条", () => {
    registerIconThemeKey();
    syncIconThemeEnum();
    expect(prop().enum).toEqual([ICON_THEME_FALLBACK_ID]);
    expect(prop().enumDescriptions).toEqual(["内置图标集"]);

    const dispose = IconRegistry.register(
      { id: "demo-plugin.demo-icons", label: "薄荷苏打", path: "icons.json" },
      "demo-plugin"
    );
    syncIconThemeEnum();
    expect(prop().enum).toEqual([ICON_THEME_FALLBACK_ID, "demo-plugin.demo-icons"]);
    expect(prop().enumDescriptions).toEqual(["内置图标集", "薄荷苏打"]);

    dispose();
    syncIconThemeEnum();
    expect(prop().enum).toEqual([ICON_THEME_FALLBACK_ID]);
    expect(prop().enumDescriptions).toEqual(["内置图标集"]);
  });
});
