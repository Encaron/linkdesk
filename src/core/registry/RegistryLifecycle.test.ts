/**
 * Registry 生命周期对称性测试（E5.8#12 重写）——卸载链路机械保障。
 *
 * 旧版：9 个 unregisterPlugin* 手清（消费端 2b 已删）。新版：每个 register() 自 track →
 * fire onWillUninstall → registrationTracker 自动逆序回滚，卸载全机械、零手动 unregister*。
 * 契约钉死：装载→使用→卸载（回滚清空）→重装→再使用 全链通。
 *
 * 覆盖 9 个插件作用域注册表 + 重装契约。ThemeEngine 插件域主题走 getThemesByPlugin 反向索引，
 * 卸载后同步摘除（disposer 内含）。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PluginLifecycle } from "../../pluginLoader/lifecycle-events";

/* ── 各注册表导入 ── */

import { registerCommand, getCommands, clearCommands } from "./commands/CommandRegistry";
import { registerKeybinding, getKeybindings, clearKeybindings } from "./commands/KeybindingRegistry";
import { registerMenuItems, getMenuItems, MENU_SLOTS, clearMenus } from "./commands/MenuRegistry";
import { registerProtocol, listProtocols, clearProtocols } from "./ProtocolRegistry";
import { createLogChannel, getLogChannels, clearLogChannels } from "../services/ui/LogChannel";
// E5.8 Phase 11.15 3b：unregisterTheme 从门面撤出（零生产消费）——测试直引 registry 本体
import { registerTheme, getAvailableThemes } from "../services/ui/ThemeEngine";
import { unregisterTheme } from "../services/ui/ThemeEngine/registry";
import { registerFileAssociation, getAssociationsForPlugin, clearFileAssociations } from "../services/files/FileAssociationService";
import { registerConfiguration, getPluginConfiguration, clearConfigurationRegistrations } from "./ConfigurationRegistry";
import { ThemeRegistry } from "./appearance/ThemeRegistry";
import { clearRegistrationLayers } from "./registrationTracker";

const PLUGIN_ID = "test-plugin";

/** 卸载一个插件——经 PluginLifecycle.onWillUninstall 机械触发 tracker 逆序回滚 */
function uninstallPlugin(pluginId: string): void {
  PluginLifecycle.onWillUninstall.fire({ pluginId, reason: "uninstall" });
}

describe("RegistryLifecycle — 卸载 = tracker 机械逆序回滚（消费端 2/2b 已删）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearKeybindings();
    clearMenus();
    clearProtocols();
    clearLogChannels();
    clearFileAssociations();
    clearConfigurationRegistrations();
    for (const t of ThemeRegistry.getAll()) ThemeRegistry.unregister(t.id);
    for (const name of getAvailableThemes()) unregisterTheme(name);
  });

  /* ── 卸载回滚——register 后 fire onWillUninstall → 查询为空 ── */

  it("CommandRegistry — fire 卸载 → getCommands 不含该插件", () => {
    registerCommand(PLUGIN_ID, { id: "test.cmd", title: "Test", handler: async () => {} });
    expect(getCommands().some((c) => c.id === "test.cmd")).toBe(true);
    uninstallPlugin(PLUGIN_ID);
    expect(getCommands().some((c) => c.id === "test.cmd")).toBe(false);
  });

  it("KeybindingRegistry — fire 卸载 → getKeybindings 不含该插件", () => {
    registerKeybinding({ key: "Ctrl+Shift+T", command: "test.cmd", source: "plugin", pluginId: PLUGIN_ID });
    expect(getKeybindings().some((k) => k.command === "test.cmd")).toBe(true);
    uninstallPlugin(PLUGIN_ID);
    expect(getKeybindings().some((k) => k.command === "test.cmd")).toBe(false);
  });

  it("MenuRegistry — fire 卸载 → getMenuItems 不含该插件", () => {
    registerMenuItems(MENU_SLOTS.EditorContext, PLUGIN_ID, [{ command: "test.cmd", group: "navigation" }]);
    expect(getMenuItems(MENU_SLOTS.EditorContext).some((i) => i.command === "test.cmd")).toBe(true);
    uninstallPlugin(PLUGIN_ID);
    expect(getMenuItems(MENU_SLOTS.EditorContext).some((i) => i.command === "test.cmd")).toBe(false);
  });

  it("ProtocolRegistry — fire 卸载 → listProtocols 不含该插件", () => {
    registerProtocol({ id: "test-proto", name: "Test", pluginId: PLUGIN_ID, mode: "text" });
    expect(listProtocols().some((p) => p.id === "test-proto")).toBe(true);
    uninstallPlugin(PLUGIN_ID);
    expect(listProtocols().some((p) => p.id === "test-proto")).toBe(false);
  });

  it("LogChannel — create 后 fire 卸载 → getLogChannels 不含该插件", () => {
    createLogChannel(PLUGIN_ID, "Test Channel");
    expect(getLogChannels().some((c) => c.name === "Test Channel")).toBe(true);
    uninstallPlugin(PLUGIN_ID);
    expect(getLogChannels().some((c) => c.name === "Test Channel")).toBe(false);
  });

  it("ThemeEngine — fire 卸载 → getAvailableThemes 不含 + 反向索引摘除", () => {
    registerTheme({ name: "Test Theme", type: "dark", colors: { bg: "#000" } }, PLUGIN_ID);
    expect(getAvailableThemes()).toContain("Test Theme");
    uninstallPlugin(PLUGIN_ID);
    expect(getAvailableThemes()).not.toContain("Test Theme");
  });

  it("ThemeRegistry — fire 卸载 → getAll 不含该插件主题", () => {
    ThemeRegistry.register({ id: "test-sunset", label: "Test Sunset", uiTheme: "dark", path: "sunset.json" }, PLUGIN_ID);
    expect(ThemeRegistry.getAll().some((t) => t.label === "Test Sunset")).toBe(true);
    uninstallPlugin(PLUGIN_ID);
    expect(ThemeRegistry.getAll().some((t) => t.label === "Test Sunset")).toBe(false);
  });

  it("FileAssociationService — fire 卸载 → getAssociationsForPlugin 返回 []", () => {
    registerFileAssociation({ extension: "test", pluginId: PLUGIN_ID });
    expect(getAssociationsForPlugin(PLUGIN_ID).length).toBeGreaterThan(0);
    uninstallPlugin(PLUGIN_ID);
    expect(getAssociationsForPlugin(PLUGIN_ID)).toEqual([]);
  });

  it("ConfigurationRegistry — fire 卸载 → getPluginConfiguration 返回 undefined", () => {
    registerConfiguration(PLUGIN_ID, {
      title: "Test Config",
      properties: { "test.key": { type: "string", default: "val", description: "desc" } },
    });
    expect(getPluginConfiguration(PLUGIN_ID)).toBeDefined();
    uninstallPlugin(PLUGIN_ID);
    expect(getPluginConfiguration(PLUGIN_ID)).toBeUndefined();
  });

  /* ── 重装契约：装载→使用→卸载→重装→再使用 全链通 ── */

  it("重装契约——卸载清空后同插件重装再使用全链通", () => {
    // 第一轮：装载 → 使用
    registerCommand(PLUGIN_ID, { id: "test.cmd", title: "Test", handler: async () => {} });
    expect(getCommands().some((c) => c.id === "test.cmd")).toBe(true);
    // 卸载 → tracker 逆序回滚 → 查询空
    uninstallPlugin(PLUGIN_ID);
    expect(getCommands().some((c) => c.id === "test.cmd")).toBe(false);
    // 重装 → 再注册 → 再使用（新版本生效）
    registerCommand(PLUGIN_ID, { id: "test.cmd", title: "Test v2", handler: async () => {} });
    expect(getCommands().some((c) => c.id === "test.cmd")).toBe(true);
    expect(getCommands().find((c) => c.id === "test.cmd")?.title).toBe("Test v2");
    // 再次卸载 → 又清空（重装后的新层回滚仍工作）
    uninstallPlugin(PLUGIN_ID);
    expect(getCommands().some((c) => c.id === "test.cmd")).toBe(false);
  });
});
