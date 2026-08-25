/**
 * ConfigurationRegistry 单元测试——register/unregister/updateEnum/merge/request+consumeSettingsGroup。
 * #36l2：核心 Registry/Service 层 vitest 覆盖。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PluginLifecycle } from "../../pluginLoader/lifecycle-events";
import { clearRegistrationLayers } from "./registrationTracker";
import {
  registerConfiguration,
  updateConfigurationEnum,
  getPluginConfiguration,
  getMergedSchema,
  getDefaults,
  registerConfigurationDefaults,
  getConfigurationDefaults,
  requestSettingsGroup,
  consumeSettingsGroup,
  onRequestSettingsGroup,
  clearConfigurationRegistrations,
} from "./ConfigurationRegistry";
import type { ConfigurationContribution } from "./ConfigurationRegistry";

const MOCK_CONFIG: ConfigurationContribution = {
  title: "测试设置",
  properties: {
    "app.theme": {
      type: "string",
      default: "Dark",
      enum: ["Dark", "Light"],
      description: "颜色主题",
    },
    "app.fontSize": {
      type: "number",
      default: 14,
      description: "字体大小",
    },
  },
};

describe("ConfigurationRegistry — register / unregister", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearConfigurationRegistrations();
  });

  it("registerConfiguration — 注册后 getPluginConfiguration 返回", () => {
    registerConfiguration("test-plugin", JSON.parse(JSON.stringify(MOCK_CONFIG)));
    const contrib = getPluginConfiguration("test-plugin");
    expect(contrib).toBeDefined();
    expect(contrib!.title).toBe("测试设置");
  });

  it("registerConfiguration — 注册后 getMergedSchema 含配置项", () => {
    registerConfiguration("test-plugin", JSON.parse(JSON.stringify(MOCK_CONFIG)));
    const merged = getMergedSchema();
    expect(merged["app.theme"]).toBeDefined();
    expect(merged["app.theme"].default).toBe("Dark");
  });

  it("registerConfiguration — 同一 pluginId 合并属性", () => {
    registerConfiguration("test-plugin", JSON.parse(JSON.stringify(MOCK_CONFIG)));
    registerConfiguration("test-plugin", {
      title: "测试设置",
      properties: { "app.extra": { type: "boolean", default: true, description: "额外" } },
    });
    const contrib = getPluginConfiguration("test-plugin");
    expect(Object.keys(contrib!.properties)).toContain("app.theme");
    expect(Object.keys(contrib!.properties)).toContain("app.extra");
  });

  // E5.8#12：unregisterConfiguration 已删——卸载清理由 fire onWillUninstall → tracker 逆序回滚
  // 深拷贝——回滚 disposer 从 contribution.properties 原地删键，不污染共享 MOCK_CONFIG
  it("卸载回滚 — fire onWillUninstall → getPluginConfiguration 返回 undefined", () => {
    registerConfiguration("test-plugin", JSON.parse(JSON.stringify(MOCK_CONFIG)));
    PluginLifecycle.onWillUninstall.fire({ pluginId: "test-plugin", reason: "uninstall" });
    expect(getPluginConfiguration("test-plugin")).toBeUndefined();
  });

  it("卸载回滚 — fire 未注册 pluginId → 不抛错", () => {
    expect(() => PluginLifecycle.onWillUninstall.fire({ pluginId: "nonexistent", reason: "uninstall" })).not.toThrow();
  });

  it("卸载回滚 — getMergedSchema 不含该配置项", () => {
    registerConfiguration("test-plugin", JSON.parse(JSON.stringify(MOCK_CONFIG)));
    PluginLifecycle.onWillUninstall.fire({ pluginId: "test-plugin", reason: "uninstall" });
    const merged = getMergedSchema();
    expect(merged["app.theme"]).toBeUndefined();
  });
});

describe("ConfigurationRegistry — updateEnum / defaults", () => {
  beforeEach(() => {
    clearConfigurationRegistrations();
    // 深拷贝——updateConfigurationEnum 原地修改 properties，避免跨测试污染
    registerConfiguration("test-plugin", JSON.parse(JSON.stringify(MOCK_CONFIG)));
  });

  it("updateConfigurationEnum — 更新 enum 值", () => {
    updateConfigurationEnum("app.theme", ["Dark", "Light", "Sunset"]);
    const merged = getMergedSchema();
    expect(merged["app.theme"].enum).toEqual(["Dark", "Light", "Sunset"]);
  });

  it("updateConfigurationEnum — 可同时更新 default", () => {
    updateConfigurationEnum("app.theme", ["Sunset"], "Sunset");
    const merged = getMergedSchema();
    expect(merged["app.theme"].default).toBe("Sunset");
  });

  it("getDefaults — 返回所有配置项默认值", () => {
    const defaults = getDefaults();
    expect(defaults["app.theme"]).toBe("Dark");
    expect(defaults["app.fontSize"]).toBe(14);
  });
});

describe("ConfigurationRegistry — configurationDefaults", () => {
  beforeEach(() => {
    clearConfigurationRegistrations();
  });

  it("registerConfigurationDefaults — 注册弱默认值", () => {
    registerConfigurationDefaults("test-plugin", { "editor.fontSize": 12 });
    const merged = getConfigurationDefaults();
    expect(merged["editor.fontSize"]).toBe(12);
  });

  it("getConfigurationDefaults — 合并多个插件的弱默认值", () => {
    registerConfigurationDefaults("plugin-a", { a: 1 });
    registerConfigurationDefaults("plugin-b", { b: 2 });
    const merged = getConfigurationDefaults();
    expect(merged.a).toBe(1);
    expect(merged.b).toBe(2);
  });
});

describe("ConfigurationRegistry — register 返 disposer（E5.8#10）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearConfigurationRegistrations();
  });

  it("registerConfiguration 注册→dispose→getPluginConfiguration 为空", () => {
    // 深拷贝——disposer 从 contribution.properties 删键（merge 语义），不污染共享 MOCK_CONFIG
    const dispose = registerConfiguration("disposer-test", JSON.parse(JSON.stringify(MOCK_CONFIG)));
    expect(getPluginConfiguration("disposer-test")).toBeDefined();

    dispose();

    expect(getPluginConfiguration("disposer-test")).toBeUndefined();
    expect(getMergedSchema()["app.theme"]).toBeUndefined();
  });

  it("merge 部分——dispose 只删本次 contribution 的属性，先前保留", () => {
    registerConfiguration("disposer-test", JSON.parse(JSON.stringify(MOCK_CONFIG))); // app.theme + app.fontSize
    const dispose = registerConfiguration("disposer-test", {
      title: "测试设置",
      properties: { "app.extra": { type: "boolean", default: true, description: "额外" } },
    });

    dispose();

    const contrib = getPluginConfiguration("disposer-test")!;
    expect(contrib.properties["app.theme"]).toBeDefined();  // 先前注册的属性保留
    expect(contrib.properties["app.extra"]).toBeUndefined(); // 本次新增的属性已删
  });

  it("registerConfigurationDefaults 注册→dispose→查询为空", () => {
    const dispose = registerConfigurationDefaults("disposer-test", { "editor.fontSize": 12 });
    expect(getConfigurationDefaults()["editor.fontSize"]).toBe(12);

    dispose();

    expect(getConfigurationDefaults()["editor.fontSize"]).toBeUndefined();
  });

  it("fire onWillUninstall → 配置 + 弱默认值自动逆序回滚（机械保障）", () => {
    registerConfiguration("disposer-test", JSON.parse(JSON.stringify(MOCK_CONFIG)));
    registerConfigurationDefaults("disposer-test", { "editor.fontSize": 12 });

    PluginLifecycle.onWillUninstall.fire({ pluginId: "disposer-test", reason: "uninstall" });

    expect(getPluginConfiguration("disposer-test")).toBeUndefined();
    expect(getConfigurationDefaults()["editor.fontSize"]).toBeUndefined();
  });
});

describe("ConfigurationRegistry — group 组内二级标题（E5.8#78）", () => {
  beforeEach(() => {
    clearConfigurationRegistrations();
  });

  it("registerConfiguration — group 字段随注册透传 getMergedSchema", () => {
    registerConfiguration("group-test", {
      title: "分组测试",
      properties: {
        "app.theme": { type: "string", default: "dark", description: "主题", group: "整体配方" },
        "app.accentMode": { type: "string", default: "custom", description: "强调色模式", group: "强调色" },
        "app.plain": { type: "boolean", default: true, description: "无分组" },
      },
    });
    const merged = getMergedSchema();
    expect(merged["app.theme"].group).toBe("整体配方");
    expect(merged["app.accentMode"].group).toBe("强调色");
    // 未声明 group → 字段缺省（平铺原样，SettingsView 渲染端按 "" 处理）
    expect(merged["app.plain"].group).toBeUndefined();
  });

  it("getConfigurationContributions — group 随插件配置贡献保留（SettingsView IPC 消费面）", () => {
    registerConfiguration("group-test", {
      title: "分组测试",
      properties: {
        "app.themeColor": { type: "string", default: "", description: "配色", group: "配色" },
      },
    });
    const contrib = getPluginConfiguration("group-test")!;
    expect(contrib.properties["app.themeColor"].group).toBe("配色");
  });
});

describe("ConfigurationRegistry — requestSettingsGroup / consumeSettingsGroup", () => {
  beforeEach(() => {
    clearConfigurationRegistrations();
  });

  it("requestSettingsGroup — consumeSettingsGroup 返回目标 pluginId", () => {
    requestSettingsGroup("my-plugin");
    expect(consumeSettingsGroup()).toBe("my-plugin");
  });

  it("consumeSettingsGroup — 消费后清空，再次调用返回 null", () => {
    requestSettingsGroup("my-plugin");
    consumeSettingsGroup();
    expect(consumeSettingsGroup()).toBeNull();
  });

  it("onRequestSettingsGroup — Emitter 在 request 时 fire", () => {
    let fired = "";
    onRequestSettingsGroup.event((id) => { fired = id; });
    requestSettingsGroup("target-plugin");
    expect(fired).toBe("target-plugin");
  });
});
