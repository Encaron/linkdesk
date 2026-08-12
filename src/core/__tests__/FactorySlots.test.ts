/**
 * FactorySlots 单元测试——initialize/getPluginId/hasSlot。
 * #36l6：核心 Registry/Service 层 vitest 覆盖。
 *
 * 注意：factorySlots 是单例，状态跨测试累积。
 * initialize() 不清理已存在的 slot——后续测试需考虑此行为。
 */

import { describe, it, expect } from "vitest";
import { factorySlots } from "../services/FactorySlots";
import type { SlotPluginEntry } from "../services/FactorySlots";

const SETTINGS_PLUGIN: SlotPluginEntry = {
  pluginId: "my-settings",
  manifest: { name: "My Settings", version: "1.0", factoryRole: "settings" } as any,
};

describe("FactorySlots — initialize / getPluginId / hasSlot", () => {
  it("initialize — 声明 factoryRole 的插件被登记", () => {
    factorySlots.initialize([SETTINGS_PLUGIN]);
    expect(factorySlots.getPluginId("settings")).toBe("my-settings");
  });

  it("hasSlot — 已登记返回 true，未登记返回 false", () => {
    // settings 已由上一测试登记——hasSlot 应返回 true
    expect(factorySlots.hasSlot("settings")).toBe(true);
    expect(factorySlots.hasSlot("nonexistent")).toBe(false);
  });

  it("initialize — 先注册者优先，后注册者不覆盖", () => {
    factorySlots.initialize([
      { pluginId: "other-settings", manifest: { name: "Other", version: "1.0", factoryRole: "settings" } as any },
    ]);
    // 先注册者优先级高（settings 已在第一测试登记为 my-settings）
    expect(factorySlots.getPluginId("settings")).toBe("my-settings");
  });

  it("initialize — 无 factoryRole 声明的插件不影响已登记的 slot", () => {
    const before = factorySlots.getPluginId("settings");
    factorySlots.initialize([
      { pluginId: "no-role", manifest: { name: "No Role", version: "1.0" } as any },
    ]);
    // 无 factoryRole 的插件不影响已登记 slot
    expect(factorySlots.getPluginId("settings")).toBe(before);
  });

  it("getPluginId — 未登记的 role 返回 undefined", () => {
    expect(factorySlots.getPluginId("never-registered")).toBeUndefined();
  });

  it("initialize — 多个角色同时登记", () => {
    factorySlots.initialize([
      { pluginId: "my-terminal", manifest: { name: "Terminal", version: "1.0", factoryRole: "terminal" } as any },
    ]);
    expect(factorySlots.getPluginId("settings")).toBe("my-settings");
    expect(factorySlots.getPluginId("terminal")).toBe("my-terminal");
  });
});
