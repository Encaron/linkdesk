/**
 * pickIdentityArt 单测（E6#69f 共享裁决）——三图模型 Type-2 身份图裁决的唯一实现。
 * 契约：marketIcon ?? icon ?? 统一默认彩色块，恒返有效 descriptor（零 undefined，消费方无条件渲染）。
 *
 * fixture 全虚构（demo-plugin/demo-*），禁真实插件名/文案（硬约束 21 测试替身卫生）。
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_PLUGIN_IDENTITY_URI, DEFAULT_PLUGIN_IDENTITY_SVG } from "./defaultIdentityArt";
import { pickIdentityArt } from "./iconUtils";

const none = {};
const iconOnly = { icon: "demo-identity" };
const both = { icon: "demo-identity", marketIcon: "resources/demo-identity.svg" };

describe("pickIdentityArt（身份图 = marketIcon ?? icon ?? 默认彩色块，恒返 descriptor）", () => {
  it("marketIcon 优先（icon-bar 插件双图：Type-2 身份图胜 Type-1 剪影）", () => {
    expect(pickIdentityArt(both)).toEqual({ icon: "resources/demo-identity.svg", iconSource: undefined });
  });

  it("marketIcon 缺 → 落 icon（非图标栏插件 icon 即 Type-2）", () => {
    expect(pickIdentityArt(iconOnly)).toEqual({ icon: "demo-identity", iconSource: undefined });
  });

  it("双缺 → 统一默认彩色块（data-URI，source=url）", () => {
    expect(pickIdentityArt(none)).toEqual({ icon: DEFAULT_PLUGIN_IDENTITY_URI, iconSource: "url" });
  });

  it("候选间裁决：marketIcon 全局优先于 icon（任一位次的 Type-2 胜 Type-1）", () => {
    // 第一候选只有 icon（图标栏插件 Type-1 位），第二候选有 marketIcon（Type-2）→ marketIcon 全局仍胜
    expect(pickIdentityArt({ icon: "demo-first" }, { marketIcon: "demo-second.svg" })).toEqual({
      icon: "demo-second.svg",
      iconSource: undefined,
    });
    // 全无 marketIcon → 按序回退第一候选 icon
    expect(pickIdentityArt({ icon: "demo-first" }, { icon: "demo-second" })).toEqual({
      icon: "demo-first",
      iconSource: undefined,
    });
  });

  it("null/undefined 候选跳过（目录缺失安全）", () => {
    expect(pickIdentityArt(undefined, null, undefined)).toEqual({
      icon: DEFAULT_PLUGIN_IDENTITY_URI,
      iconSource: "url",
    });
  });

  it("E6#106 市场行两态：已装读包内身份图，未装读目录身份图——两态都不再落 Type-1 剪影", () => {
    // 一个图标栏插件的两个数据源（real-world 形态）：
    //   已装 manifest：icon = Type-1 剪影（包内相对路径）、marketIcon = Type-2 身份图
    //   目录条目：icon / marketIcon 均已 URL 化（未装态形态：绝对 URL + source "url"）
    const installed = { icon: "resources/icon-bar.svg", marketIcon: "resources/icon.svg" };
    const catalog = {
      icon: "https://raw.githubusercontent.com/owner-two/demo-repo/v1.0.0/resources/icon-bar.svg",
      iconSource: "url" as const,
      marketIcon: "https://raw.githubusercontent.com/owner-two/demo-repo/v1.0.0/resources/icon.svg",
      marketIconSource: "url" as const,
    };
    // 已装：候选序「已装 → 目录」→ 取**包内**身份图（本地、断网可用）
    expect(pickIdentityArt(installed, catalog)).toEqual({ icon: "resources/icon.svg", iconSource: undefined });
    // 未装（第一候选 undefined）→ 取**目录**身份图（URL 可达）——不是那张 icon-bar 剪影
    expect(pickIdentityArt(undefined, catalog)).toEqual({ icon: catalog.marketIcon, iconSource: "url" });
    // 回归钉子：目录条目若漏带 marketIcon（= 本 bug 原样），这里就退成剪影——正是要防的那张脸
    expect(pickIdentityArt(undefined, { icon: catalog.icon, iconSource: "url" })).toEqual({
      icon: catalog.icon,
      iconSource: "url",
    });
  });
});

describe("默认彩色块资产形态（48×48 玻璃磁贴语法）", () => {
  it("data-URI 前缀 + svg 编码（消费方直接作图像源）", () => {
    expect(DEFAULT_PLUGIN_IDENTITY_URI.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(DEFAULT_PLUGIN_IDENTITY_URI).toContain("%3Csvg");
  });

  it("画幅 48×48 viewBox、玻璃块 rx10 语法", () => {
    expect(DEFAULT_PLUGIN_IDENTITY_SVG).toContain('width="48" height="48" viewBox="0 0 48 48"');
    expect(DEFAULT_PLUGIN_IDENTITY_SVG).toContain('rx="10"');
  });
});
