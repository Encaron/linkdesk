/**
 * check-css-namespace 腿·**插件域自有类名引用悬空**（E6#136 · 2026-09-20）单测。
 *
 * 覆盖任务书判据五例 ＋ scoped 不假红 ＋ 豁免 ＋ 根因案回归：
 *   · 太松（放过一处悬空）⇒ 样式**静默不生效**——正是第三方作者踩的那口井；
 *   · 太紧（把 scoped 调优 / 动态拼接 / `ldk-*` 借用 / DOM 钩子判红）⇒ 假红，假红会让真红失效。
 * 根因案回归（任务书写死）：CSS 注释里写了 token 族名＋`/`（形如 --text- 后跟闭合符）⇒ 注释被提前闭合 ⇒ 残渣黏住规则 ⇒ 本腿必须红且文案指对根因。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDanglingOwnClassCheck } from "./dangling-own-classes.js";
import type { PluginIdResolution } from "./plugin-prefix.js";

const RESOLVED: PluginIdResolution = { pluginId: "demo-plugin", source: "plugin.json", error: null, note: null };

/** 造一个临时插件工程 */
function withPlugin(
  opts: { files?: Record<string, string> },
  fn: (root: string) => void,
): void {
  const base = mkdtempSync(join(tmpdir(), "dangling-own-classes-"));
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

/** 期望行号由夹具自己算——写死数字会在夹具微调时变成「测试在骗自己」 */
const lineOf = (text: string, needle: string): number => text.split("\n").findIndex((l) => l.includes(needle)) + 1;

describe("自有类名引用悬空判据（E6#136 · 窄口子补缝腿）", () => {
  // ────────────────────────── 任务书五例 ──────────────────────────

  it("① 正常引用过：自有前缀类名在 CSS 定义集 ⇒ 不红（ownRefs 照计）", () => {
    const tsx = ['export default () => <div className="demo-plugin-root demo-plugin-card">hi</div>;'].join("\n");
    const css = [".demo-plugin-root { color: red; }", ".demo-plugin-card { border: 1px solid; }"].join("\n");
    withPlugin({ files: { "src/App.tsx": tsx, "src/App.css": css } }, (root) => {
      const r = runDanglingOwnClassCheck(root, { resolution: RESOLVED });
      expect(r.error).toBeNull();
      expect(r.dangling).toHaveLength(0);
      expect(r.violations).toHaveLength(0);
      expect(r.ownRefs).toBe(2);
      expect(r.ownDefs).toBe(2);
    });
  });

  it("② 根因案回归：注释里写 `--text-*/` 提前闭合 ⇒ 残渣黏住下一条规则 ⇒ 引用红且文案指对根因", () => {
    // 根因最小复现（任务书写死形态）：注释内容里的 `*/` 把注释提前闭合，残渣把 .demo-plugin-root 规则吞掉
    const css = [
      "/* 可用 token：--text-*/--accent 等 */",
      ".demo-plugin-root { color: red; }",
      "",
    ].join("\n");
    const tsx = ['export default () => <div className="demo-plugin-root">hi</div>;'].join("\n");
    withPlugin({ files: { "src/App.tsx": tsx, "src/App.css": css } }, (root) => {
      const r = runDanglingOwnClassCheck(root, { resolution: RESOLVED });
      expect(r.orphanSegments).toBeGreaterThanOrEqual(1); // 孤儿闭合被看见
      expect(r.dangling).toHaveLength(1);
      expect(r.dangling[0]).toMatchObject({ name: "demo-plugin-root", file: "src/App.tsx" });
      expect(r.dangling[0].line).toBe(lineOf(tsx, "demo-plugin-root"));
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0].message).toContain("demo-plugin-root");
      expect(r.violations[0].message).toContain("提前闭合"); // 根因③在文案里
    });
  });

  it("③ 动态拼接跳过并计数：模板插值 / clsx / 变量 ⇒ 不红（skipped 记账）", () => {
    const tsx = [
      'const cls = "demo-plugin-dyn";',
      'export default () => (',
      '  <div>',
      '    <span className={`demo-plugin-${variant}`} />',
      '    <span className={clsx("demo-plugin-a", cond && "demo-plugin-b")} />',
      '    <span className={cls} />',
      '  </div>',
      ');',
    ].join("\n");
    withPlugin({ files: { "src/App.tsx": tsx } }, (root) => {
      const r = runDanglingOwnClassCheck(root, { resolution: RESOLVED });
      expect(r.dangling).toHaveLength(0);
      expect(r.violations).toHaveLength(0);
      expect(r.skipped.interp).toBe(1);
      expect(r.skipped.dynamic).toBe(2);
      expect(r.ownRefs).toBe(0);
    });
  });

  it("④ `ldk-*` 名不归本腿：引用宿主名悬空由 dangling-names 管，本腿不判", () => {
    const tsx = ['export default () => <div className="ldk-ghost-widget">hi</div>;'].join("\n");
    withPlugin({ files: { "src/App.tsx": tsx } }, (root) => {
      const r = runDanglingOwnClassCheck(root, { resolution: RESOLVED });
      expect(r.dangling).toHaveLength(0);
      expect(r.violations).toHaveLength(0);
      expect(r.ownRefs).toBe(0); // 非本前缀 ⇒ 连计数都不进
    });
  });

  it("⑤ 无 CSS 纯数据仓：没有 className 引用 ⇒ 零违规零计数", () => {
    const ts = ["export const dict = { hello: 'こんにちは' };"].join("\n");
    withPlugin({ files: { "src/index.ts": ts } }, (root) => {
      const r = runDanglingOwnClassCheck(root, { resolution: RESOLVED });
      expect(r.ownRefs).toBe(0);
      expect(r.ownDefs).toBe(0);
      expect(r.violations).toHaveLength(0);
    });
  });

  // ────────────────────────── 口径钉子 ──────────────────────────

  it("⑥ scoped 调优不假红：`.demo-root .demo-item` 里的 .demo-item 是合法定义（提及集口径）", () => {
    const tsx = ['export default () => <div className="demo-plugin-item">hi</div>;'].join("\n");
    const css = [".demo-plugin-root .demo-plugin-item { color: red; }"].join("\n");
    withPlugin({ files: { "src/App.tsx": tsx, "src/App.css": css } }, (root) => {
      const r = runDanglingOwnClassCheck(root, { resolution: RESOLVED });
      expect(r.dangling).toHaveLength(0);
      expect(r.violations).toHaveLength(0);
    });
  });

  it("⑦ 知情绕行（标准 disable 注释，与命名空间家族同 id）⇒ 豁免", () => {
    const tsx = [
      "// eslint-disable-next-line linkdesk/no-reserved-class-name -- 类名由主题包注入，运行时才拼得出",
      'export default () => <div className="demo-plugin-themed">hi</div>;',
    ].join("\n");
    withPlugin({ files: { "src/App.tsx": tsx } }, (root) => {
      const r = runDanglingOwnClassCheck(root, { resolution: RESOLVED });
      expect(r.dangling).toHaveLength(0);
      expect(r.violations).toHaveLength(0);
    });
  });

  it("⑧ fail-closed：pluginId 读不到 ⇒ 「无法判定」报红，⛔ 不许静默 0 处通过", () => {
    withPlugin({ files: { "src/App.tsx": 'export default () => <div className="demo-plugin-root" />;' } }, (root) => {
      const r = runDanglingOwnClassCheck(root, {
        resolution: { pluginId: null, source: null, error: "plugin.json 损坏", note: null },
      });
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0]).toMatchObject({ file: "plugin.json", line: 1 });
      expect(r.violations[0].message).toContain("无法判定");
    });
  });

  it("⑨ 引用了没定义的自有类名（普通拼错形态）⇒ 红、行号对齐", () => {
    const tsx = [
      'export default () => (',
      '  <div className="demo-plugin-ok demo-plugin-typo">hi</div>',
      ');',
    ].join("\n");
    const css = [".demo-plugin-ok { color: red; }"].join("\n");
    withPlugin({ files: { "src/App.tsx": tsx, "src/App.css": css } }, (root) => {
      const r = runDanglingOwnClassCheck(root, { resolution: RESOLVED });
      expect(r.dangling).toHaveLength(1);
      expect(r.dangling[0]).toMatchObject({ name: "demo-plugin-typo", file: "src/App.tsx" });
      expect(r.dangling[0].line).toBe(lineOf(tsx, "demo-plugin-typo"));
      expect(r.ownRefs).toBe(2);
    });
  });
});
