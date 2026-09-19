/**
 * check-css-hardcode 腿单测（E6#132 · 2026-09-20）。
 *
 * 本文件的核心不是测「硬编码会被报」（那是腿的本职，改动时照 `dangling-names.test.ts` 的
 * 正负控惯例补），而是钉住 **报错文案与 token 库不再脱节**——E6#132 的病根就是文案：
 * 提示语列了不存在的 `--surface-*`、漏了真实存在的 `--shadow-*`，第三方作者照文案找 token
 * 不得，把三处 box-shadow 全删（视觉层次受损，只为过门禁）。
 *
 * 防再脱节的机制 = **对账**：文案（`CSS_TOKEN_HINT`）里列出的每个 token 族前缀，必须在
 * 壳 `src/index.css` 的 `:root` 真源（= 宿主运行时下发的 token 全集，`@linkdesk/ui` dist css
 * 的 token 也从这里来）里真实存在。ui/壳将来加减族 ⇒ 这条测试当场红，文案必须跟着改——
 * 提示语从「手抄字符串」变成「有对账的字符串」。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCssHardcodeCheck, CSS_TOKEN_HINT } from "./css-hardcode.js";

/** 壳仓 token 真源（monorepo 固定结构：checks/ 目录上溯五级 = 仓根）——⛔ 不锚 dist 构建产物 */
const SHELL_INDEX_CSS = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../src/index.css",
);

/** 提取顶层 `:root` 块内的自定义属性名集合（`[data-theme]` 变体是同名义不同值，不计） */
function rootTokenNames(css: string): Set<string> {
  const start = css.indexOf(":root");
  const open = css.indexOf("{", start);
  let depth = 1;
  let i = open + 1;
  while (depth > 0 && i < css.length) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") depth--;
    i++;
  }
  return new Set([...css.slice(open + 1, i - 1).matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
}

/** 族清单只从文案自身解析——文案加族自动进对账，测试不改 */
function hintFamilies(): string[] {
  return [...CSS_TOKEN_HINT.matchAll(/--([a-z0-9]+)-\*/g)].map((m) => m[1]);
}

const familyHit = (names: Set<string>, fam: string): boolean =>
  [...names].some((n) => n === fam || n.startsWith(`${fam}-`));

describe("报错文案 ↔ token 真源对账（E6#132 防再脱节）", () => {
  it("文案列出的每个 token 族，在壳 :root 真源里真实存在（列不存在的族 = 此事故根因，当场红）", () => {
    const names = rootTokenNames(readFileSync(SHELL_INDEX_CSS, "utf8"));
    expect(names.size).toBeGreaterThan(50); // 真源在位（读空/读错路径时这条先红，不让对账假绿）
    const missing = hintFamilies().filter((fam) => !familyHit(names, fam));
    expect(missing).toEqual([]);
  });

  it("文案至少覆盖 shadow 族（本格导火索）——防止将来『精简』时把它精简掉", () => {
    expect(hintFamilies()).toContain("shadow");
  });
});

describe("css-hardcode 报错文案（E6#132）", () => {
  /** 造临时插件工程：files 相对路径 → 内容 */
  function withProject(files: Record<string, string>, fn: (root: string) => void): void {
    const base = mkdtempSync(join(tmpdir(), "css-hardcode-"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(base, rel, ".."), { recursive: true });
      writeFileSync(join(base, rel), text, "utf8");
    }
    try {
      fn(base);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }

  it("正控：.css 里 box-shadow 硬编码 ⇒ 报错文案列出 --shadow-*（第三方作者的原始场景）", () => {
    withProject({ "src/view.css": ".card { box-shadow: rgb(0 0 0 / 20%); }" }, (root) => {
      const v = runCssHardcodeCheck(root);
      expect(v).toHaveLength(1);
      expect(v[0]!.message).toContain("--shadow-*");
      expect(v[0]!.message).toContain("rgb()");
    });
  });

  it("正控：.ts/.tsx 里 rgb() 字面量 ⇒ 同款文案（两处消费同一常量，不许再各写各的）", () => {
    withProject({ "src/index.tsx": "const s = { boxShadow: \"rgb(0 0 0 / 15%)\" };" }, (root) => {
      const v = runCssHardcodeCheck(root);
      expect(v).toHaveLength(1);
      expect(v[0]!.message).toBe(
        `${'const s = { boxShadow: "rgb(0 0 0 / 15%)" };'}  ← 硬编码 rgb()（${CSS_TOKEN_HINT}）`,
      );
    });
  });

  it("负控：token 定义行（--name: 字面量）豁免照旧——文案修正不得顺手改判据", () => {
    withProject({ "src/theme.css": ":root { --my-shadow: 0 2px 4px rgb(0 0 0 / 30%); }" }, (root) => {
      expect(runCssHardcodeCheck(root)).toHaveLength(0);
    });
  });
});
