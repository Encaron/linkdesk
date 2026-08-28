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
 * fixture 命名遵守硬约束 21：虚构值（demo-plugin / demo-icon / Demo Icon），不指向真实插件。
 */

import { describe, it, expect, vi } from "vitest";
import { normalizeIconThemeMappings } from "./contributions";

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
});
