import { describe, expect, it } from "vitest";
import { registerPluginLanguageBundle } from "../contributions/i18nResources";
import { resolvePluginDisplayText, resolvePluginManifestForDisplay } from "./displayService";

describe("displayService — 宿主层显示文本解析", () => {
  it("按插件命名空间解析，且不串到别的插件", () => {
    registerPluginLanguageBundle("en", { 打开: "Open" }, "plugin-a");
    registerPluginLanguageBundle("en", { 打开: "Launch" }, "plugin-b");

    expect(resolvePluginDisplayText("plugin-a", "打开", "en")).toBe("Open");
    expect(resolvePluginDisplayText("plugin-b", "打开", "en")).toBe("Launch");
    // 没有字典的插件 → 原文兜底
    expect(resolvePluginDisplayText("plugin-c", "打开", "en")).toBe("打开");
  });

  it("整份 manifest：只换显示字段，机器字段原样", () => {
    registerPluginLanguageBundle(
      "en",
      {
        演示: "Demo",
        演示插件: "Demo plugin",
        打招呼: "Say hello",
        说你好: "Say hello (long)",
      },
      "plugin-demo",
    );
    const manifest = {
      pluginId: "plugin-demo",
      name: "演示",
      description: "演示插件",
      contributes: {
        commands: [
          { id: "demo.hello", title: "打招呼", description: "说你好", when: "x == 1" },
        ],
      },
    };
    const d = resolvePluginManifestForDisplay("plugin-demo", manifest, "en");
    expect(d.name).toBe("Demo");
    expect(d.description).toBe("Demo plugin");
    expect(d.contributes.commands[0]).toEqual({
      id: "demo.hello",
      title: "Say hello",
      description: "Say hello (long)",
      when: "x == 1",
    });
  });
});
