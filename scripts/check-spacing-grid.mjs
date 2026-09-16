/**
 * 机械检查：CSS 中 padding/margin/gap 是否在 4px 节奏刻度上。
 *
 * 用法：node scripts/check-spacing-grid.mjs
 *       node scripts/check-spacing-grid.mjs --self-test
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
 *
 * 排除：font-size、line-height、height、width、border-radius、定位属性（top/left/right/bottom）。
 * 1-6px 视为微调值（图标间距/紧凑内边距等有意的精细控制），不强制 4px 节奏。
 *
 * ── 🔴 E6#109p-b（1.28）修一条真缺口：判据从「三个短手属性」改成「三个属性族」──
 *   1.27 体检实测：**旧判据只认 `padding:` / `margin:` / `gap:` 三个短手写法**
 *   ⇒ **`padding-inline` / `margin-left` / `row-gap` / `column-gap` 一族全部在射程外**
 *   （实测：src 里这类属性 **46 行**、其中「>6px 且非 4 倍数」**1 行**，见下方存量登记）。
 *   这是同一类错的又一现场：**判据把「写法」当成了「属性」**——与 `@import` 只认带引号那一种
 *   （同轮修的 `check-pool-css-imports`）同形。现在按**属性族**判：短手 / 物理单边 / 逻辑单边
 *   （`-inline`·`-block`·`-start`·`-end`）/ `row-gap`·`column-gap` 一视同仁。
 *   ⚠️ **仍不在射程**（写在这里免得当下一个 bug）：`rem`/`em`/`%`/`calc()` 值（判据只认 px，
 *   与 1-6px 豁免同源——不假装能判相对单位）；`inset` 一族属定位，按既有排除规则不管。
 *
 * ── 存量登记（`REGISTERED`）——**只允许「文件 + 属性 + 值」级 ＋ 带理由 ＋ 每次运行逐条打印** ──
 *   本表是**门禁修好后翻出来的真账**的挂账处，⭐ **不是逃生口**：
 *   · 条目必须**今天真能匹配到**，否则报「过期登记」并红（照 `check-file-size.mjs` 的
 *     `EXEMPT_FILES` 机械核验先例——挂账纪律不靠自觉）；
 *   · ⛔ 不许为了凑绿新增条目：加一条 = 一次公共面决策，必须写清「为什么这个像素**不能**落 4 的倍数」
 *     与「**谁在什么时候**裁决」；
 *   · 全表**每次运行打印**（含合规时），所以在链里天天可见、不可能悄悄烂掉。
 *   🔴 **今天 0 条**：首条（`src/pool/floating/quick-pick/QuickPickHost.css` 的 `padding-left: 14px`）
 *     已在 E6#109p-b · 1.28a 当天清掉——走的是**视觉裁决**（14 → 16：4px 网格 ＋ 与列表项/空态同一 16px 左槽
 *     ＋ 姊妹视图先例），该 CSS 里有逐条记账。⇒ **机制自证**：像素一改好，旧条目就「匹配不到」，
 *     本脚本当场报「过期登记」并红——这正是它该有的样子。
 *   ⛔ 新增条目前先问：这是**跨门禁**的真账（要动视觉/版本/别的纪律）吗？是 ⇒ 登记并写明裁决人；
 *     不是 ⇒ **当场清掉，别往这里塞**。
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 收集 src/ 下所有 .css 文件 */
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

/**
 * 🔴 属性族判据（结构判定）：`padding`/`margin` 的短手、物理单边、逻辑单边，以及 `gap`/`row-gap`/`column-gap`。
 * ⛔ 别退回 `\b(padding|margin|gap)\s*:`——那个写法看不见 `padding-inline` 一族（1.27 实测）。
 */
const PROP_RE =
  /\b((?:padding|margin)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|(?:row-|column-)?gap)\s*:/;

/** 微调豁免上限（≤ 此值不判——图标间距/紧凑内边距） */
const TUNING_MAX = 6;
/** 刻度 */
const GRID = 4;

/**
 * 存量登记——见文件头「存量登记」一节（每条必须当天真能匹配到，否则红）。
 * 🔴 今天 **0 条**：首条（`QuickPickHost.css` 的 `padding-left: 14px`）已在 E6#109p-b · 1.28a
 *    当天走**视觉裁决**清掉（14 → 16，见该 CSS 里的记账）——**这条空数组本身就是机制的证明**：
 *    像素一改好，旧条目立刻「匹配不到」⇒ 本脚本报「存量登记过期」并红，逼人把账本跟实况对齐。
 * ⛔ 新增条目前先问：这是**跨门禁**的真账（例如要动视觉/版本）吗？是 ⇒ 登记并写明裁决人；
 *    不是 ⇒ 当场清，别往这里塞。
 */
export const REGISTERED = [];

/**
 * 纯判据：一段 CSS 文本里不在 4px 刻度上的 padding/margin/gap（1-based 行号）。
 * 注释（行内与跨行块注释）先剥——注释里的 px 不是声明。
 * ⚠️ 注释状态是**本函数自己的局部量**（旧版把它留在 main() 的循环外 ⇒ 一个文件里的未闭合注释
 *    会漏进下一个文件；纯函数化顺带修掉这条状态泄漏）。
 */
export function spacingViolations(text) {
  const out = [];
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

    const propMatch = PROP_RE.exec(line);
    if (!propMatch) continue;
    const prop = propMatch[1];

    const pxRegex = /\b(\d+)px\b/g;
    let match;
    while ((match = pxRegex.exec(line)) !== null) {
      const value = parseInt(match[1], 10);
      if (value <= TUNING_MAX) continue; // 微调值
      if (value % GRID === 0) continue; // 合规
      out.push({ line: i + 1, col: match.index + 1, prop, value });
    }
  }
  return out;
}

/** 存量登记命中判定（file + prop + value 三者全等才算） */
export function findRegistration(relPath, v) {
  return REGISTERED.find((r) => r.file === relPath && r.prop === v.prop && r.value === v.value);
}

// ────────────────────────────────── 自测 ──────────────────────────────────

function runSelfTest() {
  const cases = [
    // ── 正控：违规必须红（含 1.27 抓到的盲区形态） ──
    ["正控①：`padding: 7px`（短手）⇒ 1 处", ".a { padding: 7px; }\n", 1],
    ["正控②：🔴 `padding-inline: 7px` ⇒ 1 处（**1.27 实测的盲区**，旧判据漏它）", ".a { padding-inline: 7px; }\n", 1],
    ["正控③：🔴 `margin-left: 7px` ⇒ 1 处（**1.27 实测的盲区**）", ".a { margin-left: 7px; }\n", 1],
    ["正控④：`row-gap: 7px` ⇒ 1 处（盲区）", ".a { row-gap: 7px; }\n", 1],
    ["正控⑤：`column-gap: 7px` ⇒ 1 处（盲区）", ".a { column-gap: 7px; }\n", 1],
    ["正控⑥：`padding-block-end: 7px`（逻辑单边带方位）⇒ 1 处", ".a { padding-block-end: 7px; }\n", 1],
    ["正控⑦：`margin-top: 7px`（物理单边）⇒ 1 处", ".a { margin-top: 7px; }\n", 1],
    ["正控⑧：短手多值里的违规值也要抓（`padding: 4px 7px`）⇒ 1 处", ".a { padding: 4px 7px; }\n", 1],
    // ── 负控：合规与不属射程的都不许报 ──
    ["负控①：4 的倍数（`padding: 12px`）⇒ 0 处", ".a { padding: 12px; }\n", 0],
    ["负控②：微调值（`padding: 6px` / `1px`）⇒ 0 处", ".a { padding: 6px; }\n.b { margin: 1px; }\n", 0],
    [
      "负控③：不属射程的属性（font-size / width / border-radius / top）⇒ 0 处",
      ".a { font-size: 7px; width: 7px; border-radius: 7px; top: 7px; }\n",
      0,
    ],
    ["负控④：相对单位不在射程（`padding: 7rem`）⇒ 0 处（已知边界，钉在自测里）", ".a { padding: 7rem; }\n", 0],
    ["负控⑤：行内注释里的 ⇒ 0 处", ".a { color: red; } /* padding: 7px */\n", 0],
    ["负控⑥：跨行块注释里的 ⇒ 0 处（含未闭合起点）", "/*\n  padding: 7px;\n*/\n.a { color: red; }\n", 0],
    ["负控⑦：无 padding/margin/gap 的规则 ⇒ 0 处", ".a { display: flex; gap: 8px; }\n", 0],
  ];

  let bad = 0;
  for (const [tag, text, want] of cases) {
    const got = spacingViolations(text);
    const pass = got.length === want;
    if (!pass) bad++;
    process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} —— 实得 ${got.length} 处\n`);
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ check-spacing-grid self-test 全过（${cases.length} 例：正控红 / 负控绿）——` +
          `含 1.27 抓到的那族盲区形态（逻辑/单边属性）。\n`
      : `\n🔴 check-spacing-grid self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const cssFiles = collectCssFiles(resolve(ROOT, "src"));
  const violations = [];
  let registeredHits = 0;

  for (const file of cssFiles) {
    const relPath = file.replace(ROOT + "/", "").replace(ROOT + "\\", "").replace(/\\/g, "/");
    for (const v of spacingViolations(readFileSync(file, "utf-8"))) {
      if (findRegistration(relPath, v)) {
        registeredHits++;
        continue;
      }
      violations.push(`  ${relPath}:${v.line}:${v.col}  ⚠  ${v.prop}: ${v.value}px 不在 ${GRID}px 节奏刻度上`);
    }
  }

  // 存量登记机械核验：每条必须今天真能匹配到（否则 = 账过期，红）——照 check-file-size 先例
  const stale = REGISTERED.filter((r) => {
    const abs = resolve(ROOT, r.file);
    let text;
    try {
      text = readFileSync(abs, "utf-8");
    } catch {
      return true;
    }
    return !spacingViolations(text).some((v) => v.prop === r.prop && v.value === r.value);
  });

  if (stale.length > 0) {
    console.error("❌ 存量登记过期——下列条目今天已匹配不到任何违规（账本必须跟着实况走）：");
    for (const r of stale) console.error(`   ${r.file} · ${r.prop}: ${r.value}px —— ${r.why}`);
    console.error("   修法：把该条从 scripts/check-spacing-grid.mjs 的 REGISTERED 里删掉（或修好像素后删）。");
    process.exit(1);
  }

  if (violations.length > 0) {
    console.error(violations.join("\n"));
    console.error(`\n❌ ${violations.length} 处间距违规——请归到最近的 ${GRID}px 倍数值。`);
    if (REGISTERED.length) console.error(`   （另有 ${registeredHits} 处在存量登记里，见下）`);
    process.exit(1);
  }

  console.log(`✅ 所有 padding/margin/gap（含逻辑/单边属性）在 ${GRID}px 节奏刻度上——已扫 ${cssFiles.length} 个文件。`);
  for (const r of REGISTERED) {
    console.log(`   ⚠️ 存量登记 ${registeredHits} 处：${r.file} 的 ${r.prop}: ${r.value}px（${r.why}）`);
  }
}

main();
