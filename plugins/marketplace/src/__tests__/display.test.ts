/**
 * display 测试——市场「展示图」裁决（E6#66 默认封面 + E6#67 双图标字段）。
 * 桩数据全用虚构值（demo-cover/demo-icon——硬约束 21，不指真实插件/文案）。
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COVER_SVG,
  DEFAULT_COVER_URI,
  pickDisplayArt,
  pickRowArt,
  type DisplayArt,
} from "../services/display";

/** 覆盖 + 小图标双字段都有的 manifest 子集（marketIcon 省略 source → linkdesk:// 路径推断惯例） */
const withBoth: DisplayArt = { icon: "demo-icon.svg", marketIcon: "resources/demo-cover.svg" };
const iconOnly: DisplayArt = { icon: "demo-icon", iconSource: "codicon" };
const coverOnly: DisplayArt = { marketIcon: "resources/demo-cover.svg" };
const emptyShape: DisplayArt = {};
const none: DisplayArt = undefined;

describe("pickDisplayArt（展示位 = marketIcon ?? icon ?? 默认封面，恒返）", () => {
  it("marketIcon 优先于 icon", () => {
    expect(pickDisplayArt(withBoth)).toEqual({ icon: "resources/demo-cover.svg", iconSource: undefined });
  });

  it("无 marketIcon → 回退 icon（source 原样带出）", () => {
    expect(pickDisplayArt(iconOnly)).toEqual({ icon: "demo-icon", iconSource: "codicon" });
  });

  it("无 marketIcon/icon → 默认封面（data-URI）", () => {
    const art = pickDisplayArt(emptyShape);
    expect(art.icon).toBe(DEFAULT_COVER_URI);
    expect(art.iconSource).toBe("url");
  });

  it("null/undefined 输入也落默认封面", () => {
    expect(pickDisplayArt(none)).toEqual({ icon: DEFAULT_COVER_URI, iconSource: "url" });
  });

  it("多 candidates 按序：首个有 marketIcon 的赢", () => {
    expect(pickDisplayArt(emptyShape, coverOnly, iconOnly)).toEqual({
      icon: "resources/demo-cover.svg",
      iconSource: undefined,
    });
  });
});

describe("pickRowArt（行内位 = icon ?? marketIcon ?? 默认封面，恒返）", () => {
  it("icon 优先于 marketIcon（小位不硬压封面）", () => {
    expect(pickRowArt(withBoth)).toEqual({ icon: "demo-icon.svg", iconSource: undefined });
  });

  it("无 icon → 封面兜底", () => {
    expect(pickRowArt(coverOnly)).toEqual({ icon: "resources/demo-cover.svg", iconSource: undefined });
  });

  it("两者皆无 → 默认封面", () => {
    expect(pickRowArt(emptyShape)).toEqual({ icon: DEFAULT_COVER_URI, iconSource: "url" });
  });
});

describe("默认封面资产（E6#66）", () => {
  it("SVG 640 方幅自含", () => {
    expect(DEFAULT_COVER_SVG).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"');
    expect(DEFAULT_COVER_SVG).toContain("viewBox=\"0 0 640 640\"");
  });

  it("data-URI 前缀 + 编码（<svg 头被 encodeURIComponent）", () => {
    expect(DEFAULT_COVER_URI.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(DEFAULT_COVER_URI).toContain("%3Csvg");
  });
});
