/**
 * resolveIconTabOpen 纯判定单测——R4-1.1（I14/#18·正典 03 §一·3 方案 B）。
 * 判据（详案 R4-批1-壳.md）：开关关＝现状零行为差异；开＝侧栏＋商店标签同起；tabOnly 既有行为不变。
 */

import { describe, it, expect } from "vitest";
import { resolveIconCommand, resolveIconTabOpen } from "./iconTabOpen";

type ManifestLike = Parameters<typeof resolveIconTabOpen>[0];

/** appearsIn 三形态 fixture——与 plugin.schema.json appearsIn 字段同形 */
const tabOnly: ManifestLike = { appearsIn: { tabBar: true, sidePanel: false } };
const sidePanelOnly: ManifestLike = { appearsIn: { tabBar: false, sidePanel: true } };
const both: ManifestLike = { appearsIn: { tabBar: true, sidePanel: true } };

describe("resolveIconTabOpen", () => {
  it("tabOnly 插件恒直开标签——既有行为零变更（E5#5b）", () => {
    expect(resolveIconTabOpen(tabOnly, undefined)).toBe(true);
    expect(resolveIconTabOpen(tabOnly, false)).toBe(true);
    expect(resolveIconTabOpen(tabOnly, true)).toBe(true);
  });

  it("非 tabOnly 插件：配置未声明/关（undefined/false）＝不直开——默认关零行为差异", () => {
    // 未声明该配置键时 getConfigurationValue 返回 undefined——正是默认关的实况
    expect(resolveIconTabOpen(sidePanelOnly, undefined)).toBe(false);
    expect(resolveIconTabOpen(sidePanelOnly, false)).toBe(false);
    expect(resolveIconTabOpen(both, undefined)).toBe(false);
  });

  it("非 tabOnly 插件：配置声明为 true ＝直开标签（侧栏＋标签同起）", () => {
    expect(resolveIconTabOpen(sidePanelOnly, true)).toBe(true);
    expect(resolveIconTabOpen(both, true)).toBe(true);
  });

  it("视图注册表查不到的 pluginId（manifest undefined）＝永不直开", () => {
    expect(resolveIconTabOpen(undefined, true)).toBe(false);
  });
});

/**
 * resolveIconCommand 单测——0.2.60+ 容器入口命令（归一化：图标点击 = 命令面）。
 * 判据：非 main 容器；pluginId 同 id 优先；空白串 = 未声明；结构异常一律 null（回落旧行为）。
 */
describe("resolveIconCommand", () => {
  const withContainers = (viewsContainers: unknown) => ({ contributes: { viewsContainers } });

  it("未声明 / 结构异常 ⇒ null（回落旧行为，零行为差异）", () => {
    expect(resolveIconCommand(undefined)).toBeNull();
    expect(resolveIconCommand({})).toBeNull();
    expect(resolveIconCommand(withContainers(undefined))).toBeNull();
    expect(resolveIconCommand(withContainers([]))).toBeNull();
    expect(resolveIconCommand(withContainers({ sidebar: null }))).toBeNull();
    expect(resolveIconCommand(withContainers({ sidebar: { title: "A" } }))).toBeNull();
  });

  it("声明了 iconCommand ⇒ 原样返回（去首尾空白）", () => {
    expect(resolveIconCommand(withContainers({ marketplace: { title: "市场", iconCommand: "marketplace.openStore" } }))).toBe("marketplace.openStore");
    expect(resolveIconCommand(withContainers({ marketplace: { title: "市场", iconCommand: "  x.y  " } }))).toBe("x.y");
  });

  it("空白串 = 未声明", () => {
    expect(resolveIconCommand(withContainers({ sidebar: { title: "A", iconCommand: "   " } }))).toBeNull();
  });

  it("main 容器不是图标栏入口 ⇒ 忽略", () => {
    expect(resolveIconCommand(withContainers({ main: { title: "主区", location: "main", iconCommand: "x.main" } }))).toBeNull();
  });

  it("多容器：id === pluginId 优先，其余按声明顺序", () => {
    const containers = {
      alpha: { title: "A", iconCommand: "a.cmd" },
      demo: { title: "D", iconCommand: "d.cmd" },
      beta: { title: "B", iconCommand: "b.cmd" },
    };
    expect(resolveIconCommand(withContainers(containers), "demo")).toBe("d.cmd");
    expect(resolveIconCommand(withContainers(containers), "nope")).toBe("a.cmd");
  });
});
