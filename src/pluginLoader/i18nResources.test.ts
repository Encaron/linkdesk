import { describe, it, expect, afterEach } from "vitest";
import i18n from "../i18n";
import { registerPluginLanguageBundle } from "./i18nResources";
import { rollback } from "../core/registry/registrationTracker";

/**
 * 重装契约——卸载时 translation 命名空间按剩余插件整份重建。
 * 核心断言：碰撞正确（同顶层键不误删他插件子键）+ 注册序保持 + 重装干净重入。
 * E5.8#12：unregisterPluginLanguageBundles 已删——rollback(pid) 经 tracker 逆序回滚同语义。
 */
const TEST_PLUGINS = ["plugin-a", "plugin-b", "plugin-c"];

afterEach(() => {
  // 还原单例——每个用例从干净的资源表出发
  for (const pid of TEST_PLUGINS) {
    rollback(pid);
  }
});

describe("i18nResources——重装契约：卸载时 translation 命名空间按剩余插件重建", () => {
  it("注册写两份命名空间——translation（壳 t() 查键）+ pluginId（整份追踪）", () => {
    registerPluginLanguageBundle("zh", { "a.b": "甲" }, "plugin-a");
    expect(i18n.getResourceBundle("zh", "translation")).toMatchObject({ "a.b": "甲" });
    expect(i18n.getResourceBundle("zh", "plugin-a")).toMatchObject({ "a.b": "甲" });
  });

  it("卸载重建——被卸插件键消失，其余插件同顶层键的子键幸存（碰撞正确）", () => {
    registerPluginLanguageBundle("zh", { menu: { file: "文件" } }, "plugin-a");
    registerPluginLanguageBundle("zh", { menu: { edit: "编辑" } }, "plugin-b");
    rollback("plugin-a");
    const bundle = i18n.getResourceBundle("zh", "translation") as Record<string, unknown>;
    expect(bundle).toMatchObject({ menu: { edit: "编辑" } });
    expect(bundle.menu).not.toHaveProperty("file");
    expect(i18n.getResourceBundle("zh", "plugin-a")).toBeUndefined();
    expect(i18n.getResourceBundle("zh", "plugin-b")).toBeDefined();
  });

  it("注册序保持——重建后剩余插件仍按注册序合并且各自键完整", () => {
    registerPluginLanguageBundle("zh", { k: { v1: 1 } }, "plugin-a");
    registerPluginLanguageBundle("zh", { k: { v2: 2 } }, "plugin-b");
    rollback("plugin-b");
    const bundle = i18n.getResourceBundle("zh", "translation") as Record<string, unknown>;
    expect(bundle).toMatchObject({ k: { v1: 1 } });
    expect(bundle.k).not.toHaveProperty("v2");
  });

  it("未知插件卸载不崩 + 重装同 pluginId 干净重入", () => {
    expect(() => rollback("ghost")).not.toThrow();
    registerPluginLanguageBundle("zh", { "x.y": 1 }, "plugin-c");
    rollback("plugin-c");
    expect(i18n.getResourceBundle("zh", "translation")).toBeUndefined();
    registerPluginLanguageBundle("zh", { "x.y": 2 }, "plugin-c");
    expect(i18n.getResourceBundle("zh", "translation")).toMatchObject({ "x.y": 2 });
  });
});
