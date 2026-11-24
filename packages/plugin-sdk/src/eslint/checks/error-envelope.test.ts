import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runErrorEnvelopeCheck } from "./error-envelope.js";

/** 造一个临时插件工程 */
function withPlugin(opts: { files?: Record<string, string> }, fn: (root: string) => void): void {
  const base = mkdtempSync(join(tmpdir(), "error-envelope-"));
  writeFileSync(
    join(base, "plugin.json"),
    JSON.stringify({ pluginId: "demo-plugin", name: "夹具", version: "1.0.0" }, null, 2),
    "utf8",
  );
  for (const [rel, text] of Object.entries(opts.files ?? {})) {
    mkdirSync(join(base, rel, ".."), { recursive: true });
    writeFileSync(join(base, rel), text, "utf8");
  }
  try {
    fn(base);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

const lineOf = (text: string, needle: string): number =>
  text.split("\n").findIndex((l) => l.includes(needle)) + 1;

describe("check-error-envelope ① 裸 throw new Error（advisory，不拦）", () => {
  it("裸 throw 进 advisory，不进 violations", () => {
    const ts = [
      'if (!session) throw new Error("会话不存在");',
      "throw new Error();",
    ].join("\n");
    withPlugin({ files: { "src/actions.ts": ts } }, (root) => {
      const r = runErrorEnvelopeCheck(root);
      expect(r.bareThrows).toBe(2);
      expect(r.advisories).toHaveLength(2);
      expect(r.violations).toHaveLength(0);
      expect(r.advisories[0].message).toContain("pluginError");
      expect(r.advisories[0].line).toBe(lineOf(ts, "会话不存在"));
    });
  });

  it("pluginError / 具体内置错误 / 注释提及都不判", () => {
    const ts = [
      'throw pluginError({ code: "ENO_SESSION", message: "没有会话" });',
      'throw new TypeError("编程错误");',
      "// throw new Error('注释里的不算');",
      "const text = 'nothing';",
    ].join("\n");
    withPlugin({ files: { "src/actions.ts": ts } }, (root) => {
      const r = runErrorEnvelopeCheck(root);
      expect(r.bareThrows).toBe(0);
      expect(r.advisories).toHaveLength(0);
    });
  });

  it("标准 disable 注释可知情豁免", () => {
    const ts = [
      "// eslint-disable-next-line linkdesk/no-bare-error-throw -- invariant，占位用",
      'throw new Error("不该发生");',
    ].join("\n");
    withPlugin({ files: { "src/invariant.ts": ts } }, (root) => {
      const r = runErrorEnvelopeCheck(root);
      expect(r.bareThrows).toBe(1);
      expect(r.advisories).toHaveLength(0);
    });
  });

  it("测试 / mock 文件不扫", () => {
    withPlugin({ files: { "src/__tests__/x.test.ts": 'throw new Error("test");' } }, (root) => {
      expect(runErrorEnvelopeCheck(root).bareThrows).toBe(0);
    });
  });
});

describe("check-error-envelope ② 自造壳保留码（红，视 reservedCodes 可用性）", () => {
  const reservedCodes = ["EVIEWREQUIRED", "ENOTACTIVE", "EUNKNOWNCOMMAND"];

  it("使用壳保留码 ⇒ 进 violations", () => {
    const ts = 'throw pluginError({ code: "EVIEWREQUIRED", message: "先开视图" });';
    withPlugin({ files: { "src/actions.ts": ts } }, (root) => {
      const r = runErrorEnvelopeCheck(root, { reservedCodes, reservedCodesSource: "test" });
      expect(r.reservedCodesAvailable).toBe(true);
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0].message).toContain("EVIEWREQUIRED");
      expect(r.violations[0].line).toBe(1);
    });
  });

  it("业务自造码不判", () => {
    const ts = 'throw pluginError({ code: "ENO_SESSION", message: "没有会话" });';
    withPlugin({ files: { "src/actions.ts": ts } }, (root) => {
      const r = runErrorEnvelopeCheck(root, { reservedCodes });
      expect(r.violations).toHaveLength(0);
    });
  });

  it("保留码清单缺席 ⇒ 判据空转，报告如实标注", () => {
    const ts = 'throw pluginError({ code: "EVIEWREQUIRED", message: "x" });';
    withPlugin({ files: { "src/actions.ts": ts } }, (root) => {
      const r = runErrorEnvelopeCheck(root);
      expect(r.reservedCodesAvailable).toBe(false);
      expect(r.reservedCodesSource).toBe("absent");
      expect(r.violations).toHaveLength(0);
    });
  });

  it("保留码站点也可用 disable 注释豁免", () => {
    const ts = [
      "// eslint-disable-next-line linkdesk/no-reserved-shell-error-code -- 夹具",
      'throw pluginError({ code: "ENOTACTIVE", message: "x" });',
    ].join("\n");
    withPlugin({ files: { "src/actions.ts": ts } }, (root) => {
      const r = runErrorEnvelopeCheck(root, { reservedCodes });
      expect(r.violations).toHaveLength(0);
    });
  });
});
