/**
 * E6#55 parseManifestJson 测试——作者 plugin.json JSONC 化（注释 + 尾逗号容忍）。
 *
 * 核心命题：JSONC ⊃ 严格 JSON——换解析器对现有纯 JSON 插件逐字节一致（零回归由既有
 * loader/lifecycle 测试全绿 + 本文件「严格 JSON 原样」用例双层证明）；语法错抛含 行:列 清晰错误。
 *
 * fixture 恒虚构值（test-fixture-hygiene）：不指向真实插件名/UI 文案。
 */

import { describe, it, expect } from "vitest";
import { parseManifestJson } from "./jsonc";

describe("parseManifestJson——严格 JSON 原样（零回归面）", () => {
  it("现有纯 JSON plugin.json（无注释尾逗号）解析结果与 JSON.parse 一致", () => {
    const raw = JSON.stringify(
      { name: "Demo Plugin", version: "1.0.0", entry: "src/index.tsx" },
      null,
      2
    );
    expect(parseManifestJson(raw)).toEqual(JSON.parse(raw));
  });

  it("嵌套结构（contributes 数组/对象）严格 JSON 原样", () => {
    const raw = `{"name":"Demo Alpha","version":"1.0.0","contributes":{"commands":[{"id":"demo.alpha.run","title":"Alpha Run"}]}}`;
    expect(parseManifestJson(raw)).toEqual(JSON.parse(raw));
  });
});

describe("parseManifestJson——JSONC 容忍（作者可写注释/尾逗号）", () => {
  it("文件头块注释 + 字段行尾注释 + 尾逗号 → 正常解析", () => {
    const raw = [
      "{",
      '  // 顶部注释：这包是干嘛的',
      '  "name": "Demo Beta", // 行内注释',
      '  "version": "1.0.0",',
      '  "contributes": {',
      '    "commands": [',
      '      { "id": "demo.beta.cmd", "title": "Beta Cmd" }, // 数组内尾逗号',
      "    ],",
      "  },",
      "}",
    ].join("\n");
    expect(parseManifestJson(raw)).toEqual({
      name: "Demo Beta",
      version: "1.0.0",
      contributes: { commands: [{ id: "demo.beta.cmd", title: "Beta Cmd" }] },
    });
  });

  it("注释注释掉的坏键不参与解析（模拟作者临时注释掉一段声明）", () => {
    const raw = [
      "{",
      '  "name": "Demo Gamma",',
      '  "version": "1.0.0",',
      '  // "entry": "src/index.tsx",  —— 注释掉 entry 不应报错',
      "}",
    ].join("\n");
    const manifest = parseManifestJson(raw);
    expect(manifest.name).toBe("Demo Gamma");
    expect("entry" in manifest).toBe(false);
  });
});

describe("parseManifestJson——语法错抛含 行:列 的清晰错误", () => {
  it("值缺失 → 抛错且消息含 行:列（作者易定位）", () => {
    const raw = ['{', '  "name": "Demo Delta",', '  "version":', '}'].join("\n");
    let msg = "";
    try {
      parseManifestJson(raw);
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toMatch(/第 \d+ 行第 \d+ 列/);
  });

  it("空文本 → 抛错（对齐 JSON.parse 语义，不留 undefined 穿透）", () => {
    expect(() => parseManifestJson("")).toThrow();
    expect(() => parseManifestJson("   \n  ")).toThrow();
  });

  it("语法错与 JSON.parse 同抛错语义（调用方既有 try/catch 不用改）", () => {
    const raw = '{"name": "Demo Epsilon", version: "1.0.0"}'; // 键不带引号
    expect(() => parseManifestJson(raw)).toThrow();
  });
});
