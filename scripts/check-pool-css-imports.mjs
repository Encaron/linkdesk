/**
 * 机械检查：src/pool/ 下 .css 文件禁止 @import——池 CSS 必须自包含。
 *
 * 用法：node scripts/check-pool-css-imports.mjs
 *       node scripts/check-pool-css-imports.mjs --self-test
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
 *
 * 背景：E5.7#9（c5407294）删壳 UI DOM 连带删除壳侧 WelcomeView.css，
 * 池侧 WelcomePoolView.css 的 @import "../../components/views/WelcomeView.css"
 * 幸存未清理 → Vite ENOENT 潜伏 bug（#20 MainZone 挂载才引爆）。
 * TS 引用有 tsc 兜底，CSS @import 没有——此脚本就是那道机械兜底。
 *
 * 纪律来源：壳目录规范——池不 import 壳 components 目录（Path B），
 * zone 零跨 zone import——CSS 同样适用（RightSidebarZone.css 同源自包含先例）。
 *
 * ── 🔴 E6#109p-b（1.28）修一条真缺口：判据从「某一种写法」改成「这个 at-rule」──
 *   1.27 体检实测：**旧判据只认带引号的形态**（`/@import\s*["']/`）⇒
 *   **`@import url("./x.css");` 当场漏过**（它是合法且常见的写法，而本门禁正是由真事故立的）。
 *   旧写法把「**@import 的语法形态**」当成了判据 —— 与 `if (name.includes("-")) continue;`
 *   同一类错：**用启发式近似结构**。现在改成**结构性判定**：**任何 `@import` at-rule 都算违规**
 *   （`url(…)` 带不带引号 / 带不带 url() / 大小写，一视同仁）。
 *   ⚠️ 由此带来一条**有意接受的偏严**：`content: "@import"` 这类字符串里的字面量也会被判违规——
 *   池 CSS 里不存在这种写法，而「改掉它」的成本是 0，故不为此加例外（加例外反而给真 @import 留门）。
 *
 * ── 自测（`--self-test`）覆盖的形状 ──
 *   正控：带引号 / `url("…")` / `url(…)` 不带引号 / 大小写 / 同文件两处 ⇒ 全红
 *   负控：块注释内 / 行内注释内 / 多行块注释跨行 / 正常 CSS（@media・@keyframes・普通规则）⇒ 全绿
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 收集 src/pool/ 下所有 .css 文件 */
function collectCssFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      files.push(...collectCssFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".css")) {
      files.push(full);
    }
  }
  return files;
}

/** @import at-rule（任意语法形态、任意大小写）——这才是判据本体，不是某一种写法 */
const IMPORT_RE = /@import\b/i;

/**
 * 纯判据：一段 CSS 文本里的 @import 违规行号（1-based 数组）。
 * 注释（行内与跨行块注释）先剥——注释里的 @import 不是引用。
 */
export function importViolationLines(text) {
  const hits = [];
  const rawLines = text.split("\n");
  let inBlockComment = false;

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];

    if (inBlockComment) {
      const endIdx = line.indexOf("*/");
      if (endIdx === -1) continue;
      line = line.slice(endIdx + 2);
      inBlockComment = false;
    }
    line = line.replace(/\/\*.*?\*\//g, "");
    const startIdx = line.indexOf("/*");
    if (startIdx !== -1) {
      const afterStart = line.indexOf("*/", startIdx + 2);
      if (afterStart === -1) {
        line = line.slice(0, startIdx);
        inBlockComment = true;
      }
    }

    if (IMPORT_RE.test(line)) hits.push(i + 1);
  }
  return hits;
}

// ────────────────────────────────── 自测 ──────────────────────────────────

function runSelfTest() {
  const cases = [
    // ── 正控：任意形态的 @import 都必须红（含 1.27 抓到的盲区形态） ──
    ['正控①：`@import "x.css";`（引号形态）⇒ 红', '@import "./x.css";\n', 1],
    ['正控②：🔴 `@import url("x.css");` ⇒ 红（**1.27 实测的盲区形态**，旧判据漏它）', '@import url("./x.css");\n', 1],
    ['正控③：`@import url(x.css);`（不带引号）⇒ 红', "@import url(./x.css);\n", 1],
    ['正控④：`@IMPORT "x.css";`（大小写）⇒ 红（at-rule 名不区分大小写）', '@IMPORT "./x.css";\n', 1],
    [
      "正控⑤：同文件两处 ⇒ 2 条且行号准",
      '.a { color: red; }\n@import "a.css";\n.b { color: blue; }\n@import url(b.css);\n',
      2,
    ],
    // ── 负控：不是引用的不算 ──
    ["负控①：行内注释里的 @import ⇒ 绿", '/* @import "./x.css"; */\n.a { color: red; }\n', 0],
    [
      "负控②：多行块注释里的 @import ⇒ 绿（含跨行）",
      "/*\n  历史：这里曾有\n  @import \"./old.css\";\n  已删\n*/\n.a { color: red; }\n",
      0,
    ],
    ["负控③：行尾注释里的 @import ⇒ 绿", '.a { color: red; } /* @import "a.css" */\n', 0],
    [
      "负控④：正常 CSS（@media / @keyframes / 普通规则）⇒ 绿",
      '@media (min-width: 1px) {\n  .a { color: red; }\n}\n@keyframes ldk-x { from { opacity: 0; } }\n',
      0,
    ],
  ];

  let bad = 0;
  for (const [tag, text, wantCount] of cases) {
    const got = importViolationLines(text);
    const pass = got.length === wantCount;
    if (!pass) bad++;
    process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} —— 实得 ${got.length} 条（行 ${got.join(",") || "—"}）\n`);
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ check-pool-css-imports self-test 全过（${cases.length} 例：正控红 / 负控绿）——` +
          `含 1.27 抓到的那条盲区形态（\`@import url("…")\`）。\n`
      : `\n🔴 check-pool-css-imports self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const poolDir = resolve(ROOT, "src", "pool");
  const cssFiles = collectCssFiles(poolDir);

  const violations = [];
  for (const file of cssFiles) {
    const relPath = file.replace(ROOT + "/", "").replace(ROOT + "\\", "");
    for (const line of importViolationLines(readFileSync(file, "utf-8"))) {
      violations.push(`  ${relPath}:${line}  ⚠  @import 违规——池 CSS 必须自包含`);
    }
  }

  if (violations.length > 0) {
    console.error(violations.join("\n"));
    console.error(`\n❌ ${violations.length} 处 @import 违规——样式自包含拷入池文件（壳目录规范 / Path B）。`);
    process.exit(1);
  }

  console.log(`✅ src/pool/ CSS 全部自包含（零 @import）——已扫 ${cssFiles.length} 个文件。`);
}

main();
