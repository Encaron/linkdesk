/**
 * FactorySlots 单元测试——E5.8#41.11 一槽多插件：initialize/getPluginIds/getDefaultPluginId/hasSlot
 * + 重复 factoryRole fail-loud + 卸载后槽位刷新。
 *
 * 覆盖：单槽 / 多角色多槽 / 多候选 core 优先排序（默认=内置）/ 无 core 首声明 / 重复声明 fail-loud
 * 点名两 pluginId（每候选集合只喷一次）/ 卸载后 refreshFromPlugins 槽位刷新。
 *
 * 测试替身：插件身份用明显虚构值（demo-settings-a/b、demo-market、demo-plain）——硬约束 #21。
 * getLoadedPluginManifests 走 vi.mock（卸载刷新场景喂可控清单）。
 * 类已导出——每测试 new FactorySlots() 取干净实例（单例 factorySlots 状态跨测试累积，不直接复用）。
 */

import { describe, it, expect, vi, afterEach } from "vitest";

const manifestsMock = vi.hoisted(() => vi.fn());
vi.mock("../../../pluginLoader/loader", () => ({
  getLoadedPluginManifests: manifestsMock,
}));

import { FactorySlots } from "./FactorySlots";
import type { SlotPluginEntry } from "./FactorySlots";

// 窄化 fixture——只喂 FactorySlots 消费的字段（E5.7#98；完整 PluginManifest 字段几十个，测试不需要）
const entry = (pluginId: string, factoryRole?: string, core?: boolean): SlotPluginEntry => ({
  pluginId,
  manifest: {
    name: `Demo ${pluginId}`,
    version: "1.0.0",
    ...(factoryRole ? { factoryRole } : {}),
    ...(core ? { core } : {}),
  } as SlotPluginEntry["manifest"],
});

describe("FactorySlots — 一对多（E5.8#41.11）", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("单槽——一个插件声明 factoryRole 被登记", () => {
    const slots = new FactorySlots();
    slots.initialize([entry("demo-settings", "settings")]);
    expect(slots.getPluginIds("settings")).toEqual(["demo-settings"]);
    expect(slots.getDefaultPluginId("settings")).toBe("demo-settings");
    expect(slots.hasSlot("settings")).toBe(true);
    expect(slots.hasSlot("nonexistent")).toBe(false);
  });

  it("多角色多槽——各角色候选互不干扰", () => {
    const slots = new FactorySlots();
    slots.initialize([entry("demo-settings", "settings"), entry("demo-market", "marketplace")]);
    expect(slots.getDefaultPluginId("settings")).toBe("demo-settings");
    expect(slots.getDefaultPluginId("marketplace")).toBe("demo-market");
  });

  it("多候选 core 优先——后声明的 core:true 仍当选默认（排序保证，非扫描序巧合）", () => {
    const slots = new FactorySlots();
    slots.initialize([
      entry("demo-settings-b", "settings"), // 非 core，先声明
      entry("demo-settings-a", "settings", true), // core:true，后声明
    ]);
    expect(slots.getPluginIds("settings")).toEqual(["demo-settings-a", "demo-settings-b"]);
    expect(slots.getDefaultPluginId("settings")).toBe("demo-settings-a"); // core 优先
  });

  it("多候选无 core——首声明当选默认", () => {
    const slots = new FactorySlots();
    slots.initialize([entry("demo-settings-x", "settings"), entry("demo-settings-y", "settings")]);
    expect(slots.getPluginIds("settings")).toEqual(["demo-settings-x", "demo-settings-y"]);
    expect(slots.getDefaultPluginId("settings")).toBe("demo-settings-x"); // 首声明
  });

  it("重复声明 fail-loud——多候选 console.error 点名全部候选 + 默认（对标 #24.6 失败必出声，不静默抢椅）", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const slots = new FactorySlots();
    slots.initialize([
      entry("demo-settings-a", "settings", true),
      entry("demo-settings-b", "settings"),
    ]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const msg = errorSpy.mock.calls[0][0] as string;
    expect(msg).toContain("demo-settings-a");
    expect(msg).toContain("demo-settings-b");
    expect(msg).toContain("demo-settings-a"); // 默认点名
  });

  it("fail-loud 每候选集合只喷一次——同集合重扫不刷屏，集合变化才重喷", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const slots = new FactorySlots();
    const both = [entry("demo-settings-a", "settings", true), entry("demo-settings-b", "settings")];
    slots.initialize(both);
    slots.initialize(both); // 同集合重扫——不重喷
    expect(errorSpy).toHaveBeenCalledTimes(1);
    slots.initialize([entry("demo-settings-b", "settings")]); // 集合变化（卸载 a）——重喷（新集合无多候选 → 不喷）
    expect(errorSpy).toHaveBeenCalledTimes(1); // 单候选不诊断
  });

  it("无 factoryRole 声明的插件不进任何槽", () => {
    const slots = new FactorySlots();
    slots.initialize([entry("demo-plain")]);
    expect(slots.getPluginIds("settings")).toEqual([]);
    expect(slots.hasSlot("settings")).toBe(false);
    expect(slots.getDefaultPluginId("settings")).toBeUndefined();
  });

  it("卸载后槽位刷新——refreshFromPlugins 从已加载插件重扫（插件进出自动重扫）", () => {
    const slots = new FactorySlots();
    manifestsMock.mockReturnValue([
      { pluginId: "demo-settings-a", manifest: { name: "Demo A", version: "1.0.0", factoryRole: "settings", core: true } },
      { pluginId: "demo-settings-b", manifest: { name: "Demo B", version: "1.0.0", factoryRole: "settings" } },
    ]);
    slots.refreshFromPlugins();
    expect(slots.getPluginIds("settings")).toEqual(["demo-settings-a", "demo-settings-b"]);
    // 卸载 demo-settings-b → 重扫后只剩一个
    manifestsMock.mockReturnValue([
      { pluginId: "demo-settings-a", manifest: { name: "Demo A", version: "1.0.0", factoryRole: "settings", core: true } },
    ]);
    slots.refreshFromPlugins();
    expect(slots.getPluginIds("settings")).toEqual(["demo-settings-a"]);
    expect(slots.hasSlot("settings")).toBe(true);
  });
});
