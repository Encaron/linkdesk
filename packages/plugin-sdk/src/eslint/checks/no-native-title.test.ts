/**
 * check 腿·**JSX 原生 `title=` 判红**（04「悬停提示系统」件 2 · 2026-09-27）单测。
 *
 * 覆盖：小写标签红 / 大写组件不红（假红会让真红失效——这条最重要）/ 已收编形态不红 /
 * 跨行与自闭合也要读出 / 注释与 `data-title=` 不误伤 / 豁免注释（含文件级）生效 /
 * 测试夹具文件不扫（与其余腿同口径）/ 行号准。
 *
 * 🔴 `锚⑪`（客居侧）：本文件同时断言**壳门禁** `scripts/check-native-title.mjs` 与本腿的**口径锚词**
 *    逐字同源——它挂在壳仓 `npm run check` 的 vitest 里 ⇒ 锚词漂移在 check 链当场红。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runNativeTitleCheck, NATIVE_TITLE_ID, findNativeTitleSites } from "./no-native-title.js";

/** 造一个临时插件工程 */
function withPlugin(opts: { files?: Record<string, string> }, fn: (root: string) => void): void {
  const base = mkdtempSync(join(tmpdir(), "no-native-title-"));
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
const lineOf = (text: string, needle: string): number =>
  text.split("\n").findIndex((l) => l.includes(needle)) + 1;

describe("原生 title= 判据（悬停提示统一走 data-hint 的机械面）", () => {
  it("① 小写 HTML 标签上的 title= 判红，行号准，文案教正解", () => {
    const tsx = [
      "export const A = () => <div>ok</div>;",
      "export const B = () => <button title={t(\"刷新\")}>x</button>;",
    ].join("\n");
    withPlugin({ files: { "src/views/V.tsx": tsx } }, (root) => {
      const r = runNativeTitleCheck(root);
      expect(r.sites).toHaveLength(1);
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0].file).toBe("src/views/V.tsx");
      expect(r.violations[0].line).toBe(lineOf(tsx, "<button"));
      expect(r.violations[0].message).toContain("data-hint");
      expect(r.violations[0].message).toContain("data-hint-delay");
      expect(r.violations[0].message).toContain("HintTip");
      expect(r.violations[0].message).toContain(NATIVE_TITLE_ID);
    });
  });

  it("② 大写组件上的 title 不判（组件自己的 prop——`<SidebarSection title=「」>` 形态）", () => {
    const tsx = [
      "export const A = () => <SidebarSection title=\"面板\" x={1} />;",
      "export const B = () => <Button title={t(\"关闭\")}>x</Button>;",
      "export const C = () => <HintCard title={t(\"说明\")} />;",
    ].join("\n");
    withPlugin({ files: { "src/views/V.tsx": tsx } }, (root) => {
      const r = runNativeTitleCheck(root);
      expect(r.sites).toHaveLength(0);
      expect(r.violations).toHaveLength(0);
    });
  });

  it("③ 已收编形态（data-hint / data-hint-command）不判：本腿不是「看谁写过 title 字样」", () => {
    const tsx = [
      "export const A = () => <button data-hint={t(\"刷新\")} aria-label={t(\"刷新\")}>x</button>;",
      "export const B = () => <button data-hint-command=\"fileTree.refresh\">y</button>;",
      "export const C = () => <div data-title=\"不是 title 属性\" titleTooltip={z} myTitle={w} />;",
    ].join("\n");
    withPlugin({ files: { "src/views/V.tsx": tsx } }, (root) => {
      expect(runNativeTitleCheck(root).violations).toHaveLength(0);
    });
  });

  it("④ 注释里的标签、测试夹具文件、`https://` 都不误伤", () => {
    const tsx = [
      "// <button title=\"注释里的死代码\">x</button>",
      "/* <span title=\"块注释\">y</span> */",
      "export const A = () => (",
      "  <button onClick={() => open(\"https://example.com/a\")} title={t(\"下载\")}>z</button>",
      ");",
    ].join("\n");
    withPlugin(
      { files: { "src/views/V.tsx": tsx, "src/views/V.test.tsx": "<button title=\"夹具不算\">x</button>" } },
      (root) => {
        const r = runNativeTitleCheck(root);
        expect(r.violations).toHaveLength(1); // 只有真界面上那一处；注释/夹具/https 行不误伤
        expect(r.violations[0].line).toBe(lineOf(tsx, "title={t(\"下载\")}"));
      },
    );
  });

  it("⑤ 跨行属性与自闭合标签同样读出（漏报方向钉住）", () => {
    const tsx = [
      "export const A = () => (",
      "  <button",
      "    className=\"b\"",
      "    title={t(\"跨行\")}",
      "  >x</button>",
      ");",
      "export const B = () => <input title={t(\"自闭合\")} />;",
    ].join("\n");
    withPlugin({ files: { "src/views/V.tsx": tsx } }, (root) => {
      const r = runNativeTitleCheck(root);
      expect(r.violations).toHaveLength(2);
      expect(r.violations[0].line).toBe(lineOf(tsx, "title={t(\"跨行\")}"));
      expect(r.violations[1].line).toBe(lineOf(tsx, "title={t(\"自闭合\")}"));
    });
  });

  it("⑥ 豁免注释生效：行级 next-line / 同行 / 文件级块注释三形都不红（站点仍计入 sites）", () => {
    const tsx = [
      "// eslint-disable-next-line linkdesk/no-native-title -- 提示渲染器够不到的形态",
      "export const A = () => <span title={t(\"a\")}>x</span>;",
      "export const B = () => <span title={t(\"b\")}>y</span>; // eslint-disable-line linkdesk/no-native-title -- 同行形",
      "/* eslint-disable linkdesk/no-native-title -- 文件级形",
      "*/",
      "export const C = () => <div title={t(\"c\")}>z</div>;",
    ].join("\n");
    withPlugin({ files: { "src/views/V.tsx": tsx } }, (root) => {
      const r = runNativeTitleCheck(root);
      expect(r.sites).toHaveLength(3);
      expect(r.violations).toHaveLength(0);
    });
  });

  it("保底：无 JSX 的工程 / 无 title 的界面 ⇒ 零站点零红（不是恒红的尺子）", () => {
    withPlugin({ files: { "src/index.ts": "export const a = 1;\n" } }, (root) => {
      const r = runNativeTitleCheck(root);
      expect(r.sites).toHaveLength(0);
      expect(r.violations).toHaveLength(0);
    });
  });

  it("纯函数：findNativeTitleSites 的直接口径（大写不返回 / 小写返回）", () => {
    expect(findNativeTitleSites("<Button title={a} />").length).toBe(0);
    expect(findNativeTitleSites("<button title={a} />").length).toBe(1);
    expect(findNativeTitleSites("<button data-hint={a} />").length).toBe(0);
  });

  // ────────────────────────── 锚⑪（口径同源，常驻 check） ──────────────────────────

  it("锚⑪：原生 title 口径壳门禁 / SDK 腿同源（3 句锚词两边都在 ⇒ 改一边不改另一边必红）", () => {
    const candidates = [
      resolve(process.cwd(), "scripts/check-native-title.mjs"),
      (() => {
        try {
          return fileURLToPath(new URL("../../../../../scripts/check-native-title.mjs", import.meta.url));
        } catch {
          return "";
        }
      })(),
    ].filter(Boolean);
    const rulerPath = candidates.find((p) => existsSync(p)) ?? candidates[0];
    // vitest 下 import.meta.url 未必是 file 协议 ⇒ 本腿那份同样先按 cwd（壳根）找
    const sdkCandidates = [
      resolve(process.cwd(), "packages/plugin-sdk/src/eslint/checks/no-native-title.ts"),
      (() => {
        try {
          return fileURLToPath(new URL("./no-native-title.ts", import.meta.url));
        } catch {
          return "";
        }
      })(),
    ].filter(Boolean);
    const sdkPath = sdkCandidates.find((p) => existsSync(p)) ?? sdkCandidates[0];
    const anchors = [
      "小写 HTML 标签上的 title= 判红",
      "大写组件上的 title= 是组件自己的 prop，不判",
      `豁免 = // eslint-disable-next-line ${NATIVE_TITLE_ID} -- 理由（理由必填）`,
    ];
    if (existsSync(rulerPath)) {
      const rulerSrc = readFileSync(rulerPath, "utf8");
      const sdkSrc = readFileSync(sdkPath, "utf8");
      for (const a of anchors) {
        expect(rulerSrc.includes(a), `壳门禁缺锚词：${a}`).toBe(true);
        expect(sdkSrc.includes(a), `SDK 腿缺锚词：${a}`).toBe(true);
      }
    }
    // 壳仓不存在（SDK 被单独 clone 出来跑）⇒ 只断言本腿那份，锚词机制仍成立
    else {
      const sdkSrc = readFileSync(sdkPath, "utf8");
      for (const a of anchors) expect(sdkSrc.includes(a), `SDK 腿缺锚词：${a}`).toBe(true);
    }
  });
});
