/**
 * FactorySlots 单元测试——E5.8#41.11 一槽多插件：initialize/getPluginIds/getDefaultPluginId/hasSlot
 * + 重复 factoryRole fail-loud + 卸载后槽位刷新 + E5.8#41.12 活动套 getActive/setActive（落盘持久化）。
 *
 * 覆盖：单槽 / 多角色多槽 / 多候选按注册序落槽（E6#18b：core:true 不优先，默认=首声明）/
 * 重复声明 fail-loud 点名两 pluginId（每候选集合只喷一次）/ 卸载后 refreshFromPlugins 槽位刷新 /
 * 活动套四场景（无记录回退默认 / setActive 落盘重启保持 / 非候选 fail-loud 拒绝 / 激活套卸载候选漂移回退）。
 *
 * 测试替身：插件身份用明显虚构值（demo-settings-a/b、demo-market、demo-plain）——硬约束 #21。
 * getLoadedPluginManifests 走 vi.mock（卸载刷新场景喂可控清单）。
 * 活动套持久化走 PluginStateService 内存替身（真实现会写 plugin-states.json 磁盘）——afterEach 清 store。
 * 类已导出——每测试 new FactorySlots() 取干净实例（单例 factorySlots 状态跨测试累积，不直接复用）。
 */

import { describe, it, expect, vi, afterEach } from "vitest";

const manifestsMock = vi.hoisted(() => vi.fn());
vi.mock("../../../pluginLoader/loader", () => ({
  getLoadedPluginManifests: manifestsMock,
}));

// E5.8#41.12：活动套持久化走 PluginStateService——内存替身（真实现会写 plugin-states.json 磁盘）
const pluginStateMock = vi.hoisted(() => {
  const store: Record<string, Record<string, unknown>> = {};
  return {
    store,
    getPluginStateValue: (pluginId: string, key: string) => store[pluginId]?.[key],
    setPluginStateValue: async (pluginId: string, key: string, value: unknown) => {
      store[pluginId] = { ...(store[pluginId] ?? {}), [key]: value };
    },
    APP_PLUGIN_ID: "app",
  };
});
vi.mock("../plugins/PluginStateService", () => ({
  getPluginStateValue: pluginStateMock.getPluginStateValue,
  setPluginStateValue: pluginStateMock.setPluginStateValue,
  APP_PLUGIN_ID: "app",
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
    for (const k of Object.keys(pluginStateMock.store)) delete pluginStateMock.store[k]; // 活动套状态隔离
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

  it("多候选按注册序落槽——后声明的 core:true 不再优先当选默认（E6#18b：core:true 无行为特权）", () => {
    const slots = new FactorySlots();
    slots.initialize([
      entry("demo-settings-b", "settings"), // 非 core，先声明
      entry("demo-settings-a", "settings", true), // core:true，后声明
    ]);
    // 注册序直落（不排序）——默认 = 首声明（非 core 的 b），core 的 a 排后
    expect(slots.getPluginIds("settings")).toEqual(["demo-settings-b", "demo-settings-a"]);
    expect(slots.getDefaultPluginId("settings")).toBe("demo-settings-b"); // 注册序首声明，core 不优先
  });

  it("多候选 core 先声明——首声明（恰为 core）仍当选默认（顺序与 core 无关）", () => {
    const slots = new FactorySlots();
    slots.initialize([
      entry("demo-settings-x", "settings", true), // core:true，先声明
      entry("demo-settings-y", "settings"), // 非 core，后声明
    ]);
    expect(slots.getPluginIds("settings")).toEqual(["demo-settings-x", "demo-settings-y"]);
    expect(slots.getDefaultPluginId("settings")).toBe("demo-settings-x"); // 首声明（非 core 优先）
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

  it("listRoles 枚举全部已填充角色（注册序）——#41.14 ⑤ 角色分组枚举面", () => {
    const slots = new FactorySlots();
    slots.initialize([
      entry("demo-settings", "settings"),
      entry("demo-market", "marketplace"),
      entry("demo-plain"), // 无角色不进槽
    ]);
    expect(slots.listRoles()).toEqual(["settings", "marketplace"]);
  });

  it("listRoles 空表返回空数组", () => {
    const slots = new FactorySlots();
    slots.initialize([entry("demo-plain")]);
    expect(slots.listRoles()).toEqual([]);
  });

  it("listRoles 随 refreshFromPlugins 刷新——卸载后角色消失", () => {
    const slots = new FactorySlots();
    manifestsMock.mockReturnValue([
      { pluginId: "demo-settings-a", manifest: { name: "Demo A", version: "1.0.0", factoryRole: "settings", core: true } },
      { pluginId: "demo-market", manifest: { name: "Demo Market", version: "1.0.0", factoryRole: "marketplace" } },
    ]);
    slots.refreshFromPlugins();
    expect(slots.listRoles()).toEqual(["settings", "marketplace"]);
    manifestsMock.mockReturnValue([
      { pluginId: "demo-settings-a", manifest: { name: "Demo A", version: "1.0.0", factoryRole: "settings", core: true } },
    ]);
    slots.refreshFromPlugins();
    expect(slots.listRoles()).toEqual(["settings"]);
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

describe("FactorySlots — 活动套（E5.8#41.12）", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of Object.keys(pluginStateMock.store)) delete pluginStateMock.store[k];
  });

  it("无持久化记录——getActive 回退注册序首声明（E6#18b：不 core 优先；此例首声明恰为 core）", () => {
    const slots = new FactorySlots();
    slots.initialize([entry("demo-settings-a", "settings", true), entry("demo-settings-b", "settings")]);
    expect(slots.getActive("settings")).toBe("demo-settings-a"); // 首声明（非 core 偏袒）
  });

  it("setActive 落盘——getActive 返回激活套（重启保持语义：新实例读同一 store 仍命中）", async () => {
    const slots = new FactorySlots();
    slots.initialize([entry("demo-settings-a", "settings", true), entry("demo-settings-b", "settings")]);
    await slots.setActive("settings", "demo-settings-b");
    expect(slots.getActive("settings")).toBe("demo-settings-b");
    // 「重启」= 新实例 + 同持久化 store——getActive 仍读持久化激活，不回落默认
    const restarted = new FactorySlots();
    restarted.initialize([entry("demo-settings-a", "settings", true), entry("demo-settings-b", "settings")]);
    expect(restarted.getActive("settings")).toBe("demo-settings-b");
  });

  it("setActive 非候选——fail-loud 拒绝且不改动活动状态（对标 #24.6 失败必出声）", async () => {
    const slots = new FactorySlots();
    slots.initialize([entry("demo-settings-a", "settings", true)]);
    await expect(slots.setActive("settings", "demo-not-a-candidate")).rejects.toThrow("demo-not-a-candidate");
    expect(slots.getActive("settings")).toBe("demo-settings-a");
  });

  it("持久化激活套已卸载（候选漂移）——getActive 回退当前默认，不返回幽灵 ID", async () => {
    const slots = new FactorySlots();
    slots.initialize([entry("demo-settings-a", "settings", true), entry("demo-settings-b", "settings")]);
    await slots.setActive("settings", "demo-settings-b");
    // 卸载 b → 重扫只剩 a
    slots.initialize([entry("demo-settings-a", "settings", true)]);
    expect(slots.getActive("settings")).toBe("demo-settings-a");
  });
});
