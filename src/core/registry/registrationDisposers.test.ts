/**
 * 外观/语言/主题 register() 返 disposer 契约测试（E5.8#10-2）。
 *
 * 验收核心：注册→dispose→查询为空（每 Registry 独立钉）。
 * 附：同名覆盖 dispose 不误删后注册者（设计 §8 风险表）+ PluginLifecycle.onWillUninstall 自动回滚
 * + 无 pluginId（fallback/全局）不追踪。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PluginLifecycle } from "../../pluginLoader/lifecycle-events";
import { clearRegistrationLayers } from "./registrationTracker";
import { ThemeRegistry } from "./appearance/ThemeRegistry";
import { IconRegistry } from "./appearance/IconRegistry";
import { LanguageRegistry } from "./languages/LanguageRegistry";
import { registerTheme, getAvailableThemes, unregisterTheme } from "../services/ui/ThemeEngine";

const PID = "registry-disposer-test";
const PID_OTHER = "registry-disposer-test-other";

describe("ThemeRegistry — register() 返 disposer", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    for (const t of ThemeRegistry.getAll()) ThemeRegistry.unregister(t.id);
  });

  it("注册→dispose→has/getAll 为空", () => {
    const dispose = ThemeRegistry.register({ id: "td1", label: "T1", uiTheme: "dark", path: "a.json" }, PID);
    expect(ThemeRegistry.has("td1")).toBe(true);

    dispose();

    expect(ThemeRegistry.has("td1")).toBe(false);
    expect(ThemeRegistry.getAll().some((t) => t.id === "td1")).toBe(false);
  });

  it("同名覆盖——旧注册者 dispose 不删后注册者主题（防误删）", () => {
    const disposeA = ThemeRegistry.register({ id: "td2", label: "A", uiTheme: "dark", path: "a.json" }, PID);
    const disposeB = ThemeRegistry.register({ id: "td2", label: "B", uiTheme: "dark", path: "b.json" }, PID_OTHER);

    disposeA(); // 不再占位——不得删 B 的主题

    expect(ThemeRegistry.has("td2")).toBe(true);
    expect(ThemeRegistry.getAll().find((t) => t.id === "td2")!.label).toBe("B");

    disposeB();
    expect(ThemeRegistry.has("td2")).toBe(false);
  });

  it("fire onWillUninstall → 主题自动逆序回滚", () => {
    ThemeRegistry.register({ id: "td3", label: "T3", uiTheme: "dark", path: "c.json" }, PID);

    PluginLifecycle.onWillUninstall.fire({ pluginId: PID, reason: "uninstall" });

    expect(ThemeRegistry.has("td3")).toBe(false);
  });
});

describe("IconRegistry — register() 返 disposer", () => {
  beforeEach(() => {
    clearRegistrationLayers();
  });

  it("register（图标主题）注册→dispose→has 为空", () => {
    const dispose = IconRegistry.register({ id: "id1", label: "I1", path: "a.json" }, PID);
    expect(IconRegistry.has("id1")).toBe(true);

    dispose();

    expect(IconRegistry.has("id1")).toBe(false);
  });

  it("registerIcon 注册→dispose→hasIcon 为空", () => {
    const dispose = IconRegistry.registerIcon("shared-icon", {
      description: "shared",
      default: { fontCharacter: "" },
    }, PID);
    expect(IconRegistry.hasIcon("shared-icon")).toBe(true);

    dispose();

    expect(IconRegistry.hasIcon("shared-icon")).toBe(false);
  });

  it("fire onWillUninstall → 图标主题 + 共享图标自动回滚", () => {
    IconRegistry.register({ id: "id2", label: "I2", path: "b.json" }, PID);
    IconRegistry.registerIcon("shared2", { description: "s", default: {} }, PID);

    PluginLifecycle.onWillUninstall.fire({ pluginId: PID, reason: "uninstall" });

    expect(IconRegistry.has("id2")).toBe(false);
    expect(IconRegistry.hasIcon("shared2")).toBe(false);
  });
});

describe("LanguageRegistry — register() 返 disposer", () => {
  beforeEach(() => {
    clearRegistrationLayers();
  });

  it("注册→dispose→has/getAll 为空", () => {
    const dispose = LanguageRegistry.register({ id: "ja", label: "日本語", path: "ja.json" }, PID);
    expect(LanguageRegistry.has("ja")).toBe(true);

    dispose();

    expect(LanguageRegistry.has("ja")).toBe(false);
    expect(LanguageRegistry.getAll().some((l) => l.id === "ja")).toBe(false);
  });

  it("fire onWillUninstall → 语言自动逆序回滚", () => {
    LanguageRegistry.register({ id: "fr", label: "Français", path: "fr.json" }, PID);

    PluginLifecycle.onWillUninstall.fire({ pluginId: PID, reason: "uninstall" });

    expect(LanguageRegistry.has("fr")).toBe(false);
  });
});

describe("ThemeEngine — registerTheme() 返 disposer", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    for (const name of getAvailableThemes()) unregisterTheme(name);
  });

  it("注册→dispose→getAvailableThemes 不含", () => {
    const dispose = registerTheme({ name: "TE1", type: "dark", colors: {} }, PID);
    expect(getAvailableThemes()).toContain("TE1");

    dispose();

    expect(getAvailableThemes()).not.toContain("TE1");
  });

  it("无 pluginId（fallback）不追踪——卸载只滚插件主题，fallback 存活", () => {
    const disposeFallback = registerTheme({ name: "Fallback", type: "dark", colors: {} }); // 非插件域
    registerTheme({ name: "PluginTheme", type: "dark", colors: {} }, PID);

    PluginLifecycle.onWillUninstall.fire({ pluginId: PID, reason: "uninstall" });

    expect(getAvailableThemes()).not.toContain("PluginTheme"); // 追踪 → 已滚
    expect(getAvailableThemes()).toContain("Fallback");        // 未追踪 → 存活

    disposeFallback();
    expect(getAvailableThemes()).not.toContain("Fallback");
  });
});
