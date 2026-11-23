import { describe, expect, it } from "vitest";
import {
  collectManifestDisplayText,
  dictDisplayText,
  missingDisplayTranslations,
  resolveDisplayManifest,
} from "./display-text.js";

const manifest = {
  pluginId: "demo",
  name: "演示",
  description: "演示插件",
  statusBar: [{ id: "s", label: "状态" }],
  contributes: {
    commands: [
      {
        id: "demo.hello",
        title: "打招呼",
        category: "演示",
        description: "说你好",
        params: [{ name: "args", type: "object", description: "参数说明" }],
      },
    ],
    menus: {
      "editor/context": [
        { command: "demo.hello", label: "打招呼" },
        {
          command: "",
          label: "更多",
          children: [{ command: "demo.hello", label: "子项" }],
        },
      ],
    },
    viewsContainers: { demo: { title: "演示容器", icon: "x.svg" } },
    views: {
      demo: [{ id: "v", render: "src/v.tsx", title: "演示视图", titleDescription: "副标题" }],
    },
    configuration: {
      title: "演示设置",
      subtitle: "设置副标题",
      groupDescriptions: { 分组: "分组说明" },
      properties: {
        "demo.flag": {
          type: "boolean",
          default: false,
          title: "开关",
          description: "开关说明",
          enumDescriptions: { on: "开" },
        },
      },
    },
    titleBar: {
      left: [{ command: "demo.hello", label: "按钮" }],
      right: [{ command: "demo.hello", label: "$dynamic" }],
    },
    themes: [{ id: "t", label: "主题", uiTheme: "dark", path: "t.json" }],
    languages: [{ id: "ja", label: "日语", path: "ja.json" }],
    icons: { star: { description: "星标", default: { fontCharacter: "\\e001" } } },
    fileAssociations: [{ extension: "demo", displayName: "演示文件" }],
  },
};

describe("collectManifestDisplayText", () => {
  const entries = collectManifestDisplayText(manifest);
  const labels = entries.map((e) => e.label);

  it("收集全部声明式显示字段", () => {
    expect(labels).toEqual(
      expect.arrayContaining([
        "name",
        "description",
        "statusBar[0].label",
        "contributes.commands[0].title",
        "contributes.commands[0].category",
        "contributes.commands[0].description",
        "contributes.commands[0].params[0].description",
        "contributes.menus.editor/context[0].label",
        "contributes.menus.editor/context[1].children[0].label",
        "contributes.viewsContainers.demo.title",
        "contributes.views.demo[0].title",
        "contributes.views.demo[0].titleDescription",
        "contributes.configuration.title",
        "contributes.configuration.subtitle",
        "contributes.configuration.groupDescriptions.分组",
        "contributes.configuration.properties.demo.flag.title",
        "contributes.configuration.properties.demo.flag.description",
        "contributes.configuration.properties.demo.flag.enumDescriptions.on",
        "contributes.titleBar.left[0].label",
        "contributes.themes[0].label",
        "contributes.languages[0].label",
        "contributes.icons.star.description",
        "contributes.fileAssociations[0].displayName",
      ]),
    );
  });

  it("不收集 id / command / path / render / when / icon 等机器字段", () => {
    expect(labels).not.toContain("pluginId");
    expect(labels.some((l) => l.endsWith(".id"))).toBe(false);
    expect(labels.some((l) => l.endsWith(".command"))).toBe(false);
    expect(labels.some((l) => l.endsWith(".path"))).toBe(false);
    expect(labels.some((l) => l.endsWith(".render"))).toBe(false);
    expect(labels.some((l) => l.endsWith(".icon"))).toBe(false);
  });

  it("动态 $ 上下文键不算显示文本", () => {
    expect(labels).not.toContain("contributes.titleBar.right[0].label");
  });
});

describe("resolveDisplayManifest", () => {
  const en = {
    演示: "Demo",
    演示插件: "Demo plugin",
    打招呼: "Say hello",
    演示容器: "Demo Container",
    演示视图: "Demo View",
    开关: "Toggle",
    开关说明: "Toggle description",
  };

  it("只替换显示字段，机器字段原样", () => {
    const resolved = resolveDisplayManifest(manifest, (text) => dictDisplayText(en, text));
    expect(resolved.name).toBe("Demo");
    expect(resolved.description).toBe("Demo plugin");
    expect(resolved.contributes.commands[0]).toMatchObject({
      id: "demo.hello",
      title: "Say hello",
      description: "说你好", // 这条没给英文 → base 兜底
    });
    expect(resolved.contributes.viewsContainers.demo).toMatchObject({
      title: "Demo Container",
      icon: "x.svg",
    });
    expect(resolved.contributes.configuration.properties["demo.flag"].title).toBe("Toggle");
    expect(resolved.contributes.configuration.properties["demo.flag"].type).toBe("boolean");
    expect(resolved.contributes.menus["editor/context"][0].command).toBe("demo.hello");
  });

  it("不修改原 manifest", () => {
    resolveDisplayManifest(manifest, (text) => dictDisplayText(en, text));
    expect(manifest.name).toBe("演示");
  });
});

describe("missingDisplayTranslations", () => {
  it("声明了 en 就报出全部缺键（含长描述），并给稳定路径", () => {
    const en = { 演示: "Demo", 演示插件: "Demo plugin" };
    const missing = missingDisplayTranslations(manifest, { en });
    expect(missing.length).toBeGreaterThan(10);
    expect(missing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "contributes.commands[0].description",
          text: "说你好",
          lang: "en",
        }),
        expect.objectContaining({
          label: "contributes.commands[0].params[0].description",
          text: "参数说明",
          lang: "en",
        }),
      ]),
    );
  });

  it("字典齐了 → 0；空值不算译文", () => {
    const all = Object.fromEntries(
      collectManifestDisplayText(manifest)
        .filter((e) => !e.text.startsWith("$"))
        .map((e) => [e.text, `EN:${e.text}`]),
    );
    expect(missingDisplayTranslations(manifest, { en: all })).toHaveLength(0);
    expect(missingDisplayTranslations(manifest, { en: { ...all, 演示: "  " } })).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: "演示", lang: "en" })]),
    );
  });

  it("没声明语言 → 不检查（单语言作者自由）", () => {
    expect(missingDisplayTranslations(manifest, {})).toHaveLength(0);
  });
});
