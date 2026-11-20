/**
 * resolveIconTabOpen 纯判定单测——R4-1.1（I14/#18·正典 03 §一·3 方案 B）。
 * 判据（详案 R4-批1-壳.md）：开关关＝现状零行为差异；开＝侧栏＋商店标签同起；tabOnly 既有行为不变。
 */

import { describe, it, expect } from "vitest";
import { resolveIconTabOpen } from "./iconTabOpen";

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
