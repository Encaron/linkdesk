import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkManifestI18n } from "./i18n-gate.js";

const roots: string[] = [];
function fixture(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), "ldk-i18n-gate-"));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, typeof content === "string" ? content : JSON.stringify(content), "utf8");
  }
  return root;
}
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

const manifest = {
  pluginId: "demo",
  name: "演示",
  description: "演示插件",
  contributes: {
    i18n: { ja: "i18n/ja.json", ko: "i18n/ko.json" },
    commands: [{ id: "demo.x", title: "运行", description: "把东西跑起来" }],
  },
};

describe("checkManifestI18n — 第三方多语言硬闸", () => {
  it("两种语言都齐 ⇒ 0", () => {
    const root = fixture({
      "plugin.json": manifest,
      "i18n/ja.json": { 演示: "デモ", 演示插件: "デモプラグイン", 运行: "実行", 把东西跑起来: "実行する" },
      "i18n/ko.json": { 演示: "데모", 演示插件: "데모 플러그인", 运行: "실행", 把东西跑起来: "실행한다" },
    });
    const r = checkManifestI18n(root);
    expect(r.problems).toHaveLength(0);
    expect(r.missing).toHaveLength(0);
  });

  it("只翻了命令标题、漏了描述 ⇒ 精确报出 paths 与语言", () => {
    const root = fixture({
      "plugin.json": manifest,
      "i18n/ja.json": { 演示: "デモ", 演示插件: "デモプラグイン", 运行: "実行" },
      "i18n/ko.json": { 演示: "데모", 演示插件: "데모 플러그인", 运行: "실행" },
    });
    const r = checkManifestI18n(root);
    expect(r.missing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "contributes.commands[0].description", lang: "ja" }),
        expect.objectContaining({ label: "contributes.commands[0].description", lang: "ko" }),
      ]),
    );
  });

  it("字典文件读不到 ⇒ problems（不是「全缺」假红）", () => {
    const root = fixture({ "plugin.json": manifest, "i18n/ja.json": {} });
    const r = checkManifestI18n(root);
    expect(r.problems.join("\n")).toMatch(/i18n\/ko\.json/);
    expect(r.missing).toHaveLength(0);
  });

  it("没声明语言 ⇒ 不检查（单语言作者自由）", () => {
    const root = fixture({ "plugin.json": { name: "Demo", contributes: {} } });
    expect(checkManifestI18n(root).missing).toHaveLength(0);
  });
});
