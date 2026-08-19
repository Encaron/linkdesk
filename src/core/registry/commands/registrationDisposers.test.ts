/**
 * 命令三件套 register() 返 disposer 契约测试（E5.8#10-1）。
 *
 * 验收核心：注册→dispose→查询为空（每 Registry 独立钉）。
 * 附：重注册分支 no-op（不误删首注册者条目）+ PluginLifecycle.onWillUninstall 自动逆序回滚。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PluginLifecycle } from "../../../pluginLoader/lifecycle-events";
import { clearRegistrationLayers } from "../registrationTracker";
import { registerCommand, getCommand, getCommands, clearCommands } from "./CommandRegistry";
import { registerKeybinding, getKeybindings, clearKeybindings } from "./KeybindingRegistry";
import { registerMenuItems, MENU_SLOTS, getMenuItems, registerTitleBarContribution, getTitleBarContributions, clearMenus } from "./MenuRegistry";

const PID = "disposer-test";
const PID_OTHER = "disposer-test-other";

describe("CommandRegistry — register() 返 disposer", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
  });

  it("注册→dispose→getCommand 为空", () => {
    const dispose = registerCommand(PID, { id: "test.cmd", title: "Test", handler: async () => {} });
    expect(getCommand("test.cmd")).toBeDefined();

    dispose();

    expect(getCommand("test.cmd")).toBeUndefined();
    expect(getCommands().some((c) => c.id === "test.cmd")).toBe(false);
  });

  it("重注册分支返 no-op——dispose 只删首注册者的条目", () => {
    const dispose1 = registerCommand(PID, { id: "test.cmd", title: "Test", handler: async () => {} });
    // 异插件重注册——仅更新 handler/title，不新增条目（设计 §8 风险表钉死）
    const dispose2 = registerCommand(PID_OTHER, { id: "test.cmd", title: "Test2", handler: async () => {} });

    dispose2(); // no-op——不得误删他人命令

    expect(getCommand("test.cmd")).toBeDefined();
    expect(getCommand("test.cmd")!.title).toBe("Test2"); // 重注册更新仍生效

    dispose1();
    expect(getCommand("test.cmd")).toBeUndefined();
  });

  it("fire onWillUninstall → 命令自动逆序回滚（机械保障）", () => {
    registerCommand(PID, { id: "test.cmd", title: "Test", handler: async () => {} });

    PluginLifecycle.onWillUninstall.fire({ pluginId: PID, reason: "uninstall" });

    expect(getCommand("test.cmd")).toBeUndefined();
  });
});

describe("KeybindingRegistry — register() 返 disposer", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearKeybindings();
  });

  it("注册→dispose→getKeybindings 为空", () => {
    const dispose = registerKeybinding({ key: "Ctrl+Shift+K", command: "test.cmd", source: "plugin", pluginId: PID });
    expect(getKeybindings().some((k) => k.command === "test.cmd")).toBe(true);

    dispose();

    expect(getKeybindings().some((k) => k.command === "test.cmd")).toBe(false);
  });

  it("去重分支返 no-op——dispose 不删首条（同命令同 key 归一化后判重）", () => {
    const dispose1 = registerKeybinding({ key: "Ctrl+Shift+K", command: "test.cmd", source: "plugin", pluginId: PID });
    const dispose2 = registerKeybinding({ key: "ctrl+shift+k", command: "test.cmd", source: "plugin", pluginId: PID });

    dispose2();

    expect(getKeybindings().some((k) => k.command === "test.cmd")).toBe(true);

    dispose1();
    expect(getKeybindings().some((k) => k.command === "test.cmd")).toBe(false);
  });

  it("无 pluginId（user）不追踪——卸载只滚插件绑定，user 绑定存活", () => {
    const disposeUser = registerKeybinding({ key: "Ctrl+Alt+U", command: "test.user", source: "user" });
    registerKeybinding({ key: "Ctrl+Shift+K", command: "test.cmd", source: "plugin", pluginId: PID });

    PluginLifecycle.onWillUninstall.fire({ pluginId: PID, reason: "uninstall" });

    expect(getKeybindings().some((k) => k.command === "test.user")).toBe(true); // user 绑定不受影响
    expect(getKeybindings().some((k) => k.command === "test.cmd")).toBe(false); // 插件绑定已滚

    disposeUser();
    expect(getKeybindings().some((k) => k.command === "test.user")).toBe(false);
  });
});

describe("MenuRegistry — register() 返 disposer", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearMenus();
  });

  it("registerMenuItems 注册→dispose→查询为空", () => {
    const dispose = registerMenuItems(MENU_SLOTS.EditorContext, PID, [{ command: "test.cmd", group: "navigation" }]);
    expect(getMenuItems(MENU_SLOTS.EditorContext).some((i) => i.command === "test.cmd")).toBe(true);

    dispose();

    expect(getMenuItems(MENU_SLOTS.EditorContext).some((i) => i.command === "test.cmd")).toBe(false);
  });

  it("批量部分去重——dispose 只删本次新增，先前条目保留", () => {
    registerMenuItems(MENU_SLOTS.EditorContext, PID, [{ command: "test.keep" }]);
    // test.keep 已存在 → 去重跳过；test.new 本次新增
    const dispose = registerMenuItems(MENU_SLOTS.EditorContext, PID, [{ command: "test.keep" }, { command: "test.new" }]);

    dispose();

    const items = getMenuItems(MENU_SLOTS.EditorContext);
    expect(items.some((i) => i.command === "test.keep")).toBe(true); // 先前条目保留
    expect(items.some((i) => i.command === "test.new")).toBe(false); // 本次新增删除
  });

  it("registerTitleBarContribution 注册→dispose→槽位为空", () => {
    const dispose = registerTitleBarContribution(PID, "right", { command: "test.cmd" });
    expect(getTitleBarContributions("right").some((i) => i.command === "test.cmd")).toBe(true);

    dispose();

    expect(getTitleBarContributions("right").some((i) => i.command === "test.cmd")).toBe(false);
  });

  it("fire onWillUninstall → 菜单 + TitleBar 自动逆序回滚", () => {
    registerMenuItems(MENU_SLOTS.EditorContext, PID, [{ command: "test.cmd" }]);
    registerTitleBarContribution(PID, "left", { command: "test.cmd" });

    PluginLifecycle.onWillUninstall.fire({ pluginId: PID, reason: "uninstall" });

    expect(getMenuItems(MENU_SLOTS.EditorContext).some((i) => i.command === "test.cmd")).toBe(false);
    expect(getTitleBarContributions("left").some((i) => i.command === "test.cmd")).toBe(false);
  });
});
