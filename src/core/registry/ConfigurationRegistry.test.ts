/**
 * ConfigurationRegistry 单元测试——register/unregister/updateEnum/merge/request+consumeSettingsGroup。
 * #36l2：核心 Registry/Service 层 vitest 覆盖。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PluginLifecycle } from "../../pluginLoader/lifecycle-events";
import { clearRegistrationLayers } from "./registrationTracker";
import {
  registerConfiguration,
  unregisterConfiguration,
  updateConfigurationEnum,
  getPluginConfiguration,
  getMergedSchema,
  getDefaults,
  registerConfigurationDefaults,
  unregisterConfigurationDefaults,
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
    clearConfigurationRegistrations();
  });

  it("registerConfiguration — 注册后 getPluginConfiguration 返回", () => {
    registerConfiguration("test-plugin", MOCK_CONFIG);
    const contrib = getPluginConfiguration("test-plugin");
    expect(contrib).toBeDefined();
    expect(contrib!.title).toBe("测试设置");
  });

  it("registerConfiguration — 注册后 getMergedSchema 含配置项", () => {
    registerConfiguration("test-plugin", MOCK_CONFIG);
    const merged = getMergedSchema();
    expect(merged["app.theme"]).toBeDefined();
    expect(merged["app.theme"].default).toBe("Dark");
  });

  it("registerConfiguration — 同一 pluginId 合并属性", () => {
    registerConfiguration("test-plugin", MOCK_CONFIG);
    registerConfiguration("test-plugin", {
      title: "测试设置",
      properties: { "app.extra": { type: "boolean", default: true, description: "额外" } },
    });
    const contrib = getPluginConfiguration("test-plugin");
    expect(Object.keys(contrib!.properties)).toContain("app.theme");
    expect(Object.keys(contrib!.properties)).toContain("app.extra");
  });

  it("unregisterConfiguration — 注销后返回 true", () => {
    registerConfiguration("test-plugin", MOCK_CONFIG);
    expect(unregisterConfiguration("test-plugin")).toBe(true);
  });

  it("unregisterConfiguration — 未注册返回 false", () => {
    expect(unregisterConfiguration("nonexistent")).toBe(false);
  });

  it("unregisterConfiguration — 注销后 getMergedSchema 不含该配置项", () => {
    registerConfiguration("test-plugin", MOCK_CONFIG);
    unregisterConfiguration("test-plugin");
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

  it("unregisterConfigurationDefaults — 注销后 getConfigurationDefaults 不含", () => {
    registerConfigurationDefaults("test-plugin", { "editor.fontSize": 12 });
    unregisterConfigurationDefaults("test-plugin");
    const merged = getConfigurationDefaults();
    expect(merged["editor.fontSize"]).toBeUndefined();
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
    registerConfiguration("disposer-test", MOCK_CONFIG);
    registerConfigurationDefaults("disposer-test", { "editor.fontSize": 12 });

    PluginLifecycle.onWillUninstall.fire({ pluginId: "disposer-test", reason: "uninstall" });

    expect(getPluginConfiguration("disposer-test")).toBeUndefined();
    expect(getConfigurationDefaults()["editor.fontSize"]).toBeUndefined();
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
