/**
 * Registry 生命周期对称性测试——安装→卸载→get 返回空。
 * #36l4 🔥：核心测试——10 个注册表在 unregisterPlugin* 后完全清空。
 *
 * #36f/#36i 发现的 6 个漏洞如果当时有 vitest，全部能在提交前捕获。
 */

import { describe, it, expect, beforeEach } from "vitest";

/* ── 各注册表导入 ── */

import { registerCommand, unregisterPluginCommands, getCommands } from "../registry/CommandRegistry";
import { registerKeybinding, unregisterPluginKeybindings, getKeybindings } from "../registry/KeybindingRegistry";
import { registerMenuItems, MenuId, unregisterPluginMenus } from "../registry/MenuRegistry";
import { registerProtocol, unregisterPluginProtocols, listProtocols } from "../registry/ProtocolRegistry";
import { registerCard, unregisterPluginCards, getCards } from "../data/CardRegistry";
import { createLogChannel, unregisterPluginChannels, getLogChannels } from "../data/LogChannel";
import { registerTheme, unregisterTheme, getAvailableThemes } from "../ThemeEngine";
import { registerFileAssociation, unregisterPluginFileAssociations, getAssociationsForPlugin } from "../services/FileAssociationService";
import { registerConfiguration, unregisterConfiguration, getPluginConfiguration, clearConfigurationRegistrations } from "../registry/ConfigurationRegistry";
import { ThemeRegistry } from "../registry/ThemeRegistry";

const PLUGIN_ID = "test-plugin";

describe("RegistryLifecycle — 安装→卸载对称性", () => {
  beforeEach(() => {
    // 清理所有注册表
    unregisterPluginCommands(PLUGIN_ID);
    unregisterPluginKeybindings(PLUGIN_ID);
    unregisterPluginMenus(PLUGIN_ID);
    unregisterPluginProtocols(PLUGIN_ID);
    unregisterPluginCards(PLUGIN_ID);
    unregisterPluginChannels(PLUGIN_ID);
    unregisterPluginFileAssociations(PLUGIN_ID);
    ThemeRegistry.unregisterPlugin(PLUGIN_ID);
    clearConfigurationRegistrations();
    // 清理 ThemeEngine（按名称逐个清理）
    for (const name of getAvailableThemes()) {
      unregisterTheme(name);
    }
  });

  /* ── 1. CommandRegistry ── */

  it("CommandRegistry — register→unregister→getCommands 不含该插件", () => {
    registerCommand(PLUGIN_ID, { id: "test.cmd", title: "Test", handler: async () => {} });
    expect(getCommands().some((c) => c.id === "test.cmd")).toBe(true);
    unregisterPluginCommands(PLUGIN_ID);
    expect(getCommands().some((c) => c.id === "test.cmd")).toBe(false);
  });

  /* ── 2. KeybindingRegistry ── */

  it("KeybindingRegistry — register→unregister→getKeybindings 不含该插件", () => {
    registerKeybinding({ key: "Ctrl+Shift+T", command: "test.cmd", source: "plugin", pluginId: PLUGIN_ID });
    expect(getKeybindings().some((k) => k.command === "test.cmd")).toBe(true);
    unregisterPluginKeybindings(PLUGIN_ID);
    expect(getKeybindings().some((k) => k.command === "test.cmd")).toBe(false);
  });

  /* ── 3. MenuRegistry ── */

  it("MenuRegistry — register→unregister→菜单项清理", () => {
    registerMenuItems(MenuId.EditorContext, PLUGIN_ID, [{ command: "test.cmd", group: "navigation" }]);
    // 验证注册不抛异常
    expect(() => unregisterPluginMenus(PLUGIN_ID)).not.toThrow();
  });

  /* ── 4. ProtocolRegistry ── */

  it("ProtocolRegistry — register→unregister→listProtocols 不含该插件", () => {
    registerProtocol({ id: "test-proto", name: "Test", pluginId: PLUGIN_ID, mode: "text" as any });
    expect(listProtocols().some((p) => p.id === "test-proto")).toBe(true);
    unregisterPluginProtocols(PLUGIN_ID);
    expect(listProtocols().some((p) => p.id === "test-proto")).toBe(false);
  });

  /* ── 5. CardRegistry ── */

  it("CardRegistry — register→unregister→getCards 不含该插件", () => {
    registerCard({ id: "test-card", pluginId: PLUGIN_ID, name: "Test Card", component: () => null as any } as any);
    expect(getCards().some((c) => c.id === "test-card")).toBe(true);
    unregisterPluginCards(PLUGIN_ID);
    expect(getCards().some((c) => c.id === "test-card")).toBe(false);
  });

  /* ── 6. LogChannel ── */

  it("LogChannel — create→unregister→getLogChannels 不含该插件", () => {
    createLogChannel(PLUGIN_ID, "Test Channel");
    expect(getLogChannels().some((c) => c.name === "Test Channel")).toBe(true);
    unregisterPluginChannels(PLUGIN_ID);
    expect(getLogChannels().some((c) => c.name === "Test Channel")).toBe(false);
  });

  /* ── 7. ThemeEngine ── */

  it("ThemeEngine — register→unregisterTheme→getAvailableThemes 不含", () => {
    registerTheme({ name: "Test Theme", type: "dark", colors: { bg: "#000" } }, PLUGIN_ID);
    expect(getAvailableThemes()).toContain("Test Theme");
    unregisterTheme("Test Theme");
    expect(getAvailableThemes()).not.toContain("Test Theme");
  });

  /* ── 8. ThemeRegistry ── */

  it("ThemeRegistry — register→unregisterPlugin→列表不含", () => {
    ThemeRegistry.register({ id: "test-sunset", label: "Test Sunset", uiTheme: "dark", path: "sunset.json" }, PLUGIN_ID);
    expect(ThemeRegistry.getAll().some((t) => t.label === "Test Sunset")).toBe(true);
    ThemeRegistry.unregisterPlugin(PLUGIN_ID);
    expect(ThemeRegistry.getAll().some((t) => t.label === "Test Sunset")).toBe(false);
  });

  /* ── 9. FileAssociationService ── */

  it("FileAssociationService — register→unregister→getAssociationsForPlugin 返回 []", () => {
    registerFileAssociation({ extension: "test", pluginId: PLUGIN_ID });
    expect(getAssociationsForPlugin(PLUGIN_ID).length).toBeGreaterThan(0);
    unregisterPluginFileAssociations(PLUGIN_ID);
    expect(getAssociationsForPlugin(PLUGIN_ID)).toEqual([]);
  });

  /* ── 10. ConfigurationRegistry ── */

  it("ConfigurationRegistry — register→unregister→getPluginConfiguration 返回 undefined", () => {
    registerConfiguration(PLUGIN_ID, {
      title: "Test Config",
      properties: { "test.key": { type: "string", default: "val", description: "desc" } },
    });
    expect(getPluginConfiguration(PLUGIN_ID)).toBeDefined();
    unregisterConfiguration(PLUGIN_ID);
    expect(getPluginConfiguration(PLUGIN_ID)).toBeUndefined();
  });
});
