/**
 * check 腿·**window/document 全局键盘监听判红**（E6#137 · 2026-09-20）单测。
 *
 * 覆盖任务书写死六例：window/document 两形态红、单双引号、capture 参数也红、disable 注释放行、
 * 正当容器 onKeyDown 不红。太紧方向（把容器 onKeyDown / 变量键名 / 注释提及判红）一并钉住——
 * 假红会让真红失效（作者学会「看到红就 disable」）。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGlobalKeyListenerCheck } from "./no-global-key-listener.js";

/** 造一个临时插件工程 */
function withPlugin(opts: { files?: Record<string, string> }, fn: (root: string) => void): void {
  const base = mkdtempSync(join(tmpdir(), "no-global-key-"));
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

/** 期望行号由夹具自己算 */
const lineOf = (text: string, needle: string): number => text.split("\n").findIndex((l) => l.includes(needle)) + 1;

describe("全局键盘监听判据（E6#137 · focus 分区正解的机械面）", () => {
  it("① window keydown / document keydown 两形态都红（文案教正解）", () => {
    const tsx = [
      "window.addEventListener('keydown', (e) => {});",
      "document.addEventListener(\"keydown\", (e) => {});",
    ].join("\n");
    withPlugin({ files: { "src/App.tsx": tsx } }, (root) => {
      const r = runGlobalKeyListenerCheck(root);
      expect(r.sites).toHaveLength(2);
      expect(r.violations).toHaveLength(2);
      expect(r.violations[0].message).toContain("onKeyDown");
      expect(r.violations[0].message).toContain("tabIndex");
      expect(r.violations[0].line).toBe(lineOf(tsx, "window.addEventListener"));
      expect(r.violations[1].line).toBe(lineOf(tsx, "document.addEventListener"));
    });
  });

  it("② keyup 也红；单双引号等价", () => {
    const ts = ['window.addEventListener("keyup", h);', "window.addEventListener('keyup', h);"].join("\n");
    withPlugin({ files: { "src/hook.ts": ts } }, (root) => {
      const r = runGlobalKeyListenerCheck(root);
      expect(r.sites).toHaveLength(2);
      expect(r.violations).toHaveLength(2);
      expect(r.sites.every((s) => s.event === "keyup")).toBe(true);
    });
  });

  it("③ 带 capture 第三参（录制器形态）照样红——正当性走豁免注释，判据无白名单", () => {
    const ts = ["window.addEventListener('keydown', h, true);"].join("\n");
    withPlugin({ files: { "src/recorder.ts": ts } }, (root) => {
      const r = runGlobalKeyListenerCheck(root);
      expect(r.violations).toHaveLength(1);
    });
  });

  it("④ 知情绕行：eslint-disable + 理由 ⇒ 放行（settings 录制器式豁免的出口）", () => {
    const ts = [
      "// eslint-disable-next-line linkdesk/no-global-key-listener -- 快捷键录制器：要在输入被吞前抓原始键",
      "window.addEventListener('keydown', captureRawKey, true);",
    ].join("\n");
    withPlugin({ files: { "src/recorder.ts": ts } }, (root) => {
      const r = runGlobalKeyListenerCheck(root);
      expect(r.sites).toHaveLength(1); // 豁免 ≠ 没看见
      expect(r.violations).toHaveLength(0);
    });
  });

  it("⑤ 正当形态不红：容器 onKeyDown + tabIndex（focus 分区正解）、注释提及、变量键名", () => {
    const tsx = [
      "export default function View() {",
      "  return <div tabIndex={0} onKeyDown={(e) => handleKey(e)} />;",
      "}",
      "// 注释里的 window.addEventListener(\"keydown\") 不算",
      "const EVENT = 'keydown';",
      "window.addEventListener(EVENT, h); // 键名走变量 ⇒ 静态读不出，不判（窄射程宁漏不猜）",
    ].join("\n");
    withPlugin({ files: { "src/App.tsx": tsx } }, (root) => {
      const r = runGlobalKeyListenerCheck(root);
      expect(r.violations).toHaveLength(0);
      expect(r.sites).toHaveLength(0);
    });
  });
});
