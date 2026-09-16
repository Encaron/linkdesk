/**
 * 机械检查：字号度量防回潮——`font-size: NNpx` / `line-height: NNpx` 裸 px 拦截。
 *
 * E5.8 Phase 12 #180（度量体系归一化的机械兜底，对标 check-theme-audit.mjs）：
 * 全局 UI 字号缩放上线后，`--font-size-*` token + `--ui-scale` 是唯一合法字号来源。
 * 本脚本兜底「未来」——任何新代码（壳 / builtin / 仓库内 user 插件）再写裸 px 字号/行高
 * 被 `npm run check` 拦下。独立显示图标（装饰/品牌语义，不随字号比例）走 WHITELIST 声明。
 *
 * 用法：node scripts/check-font-scale-audit.mjs
 *       node scripts/check-font-scale-audit.mjs --self-test
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
 *
 * 🔴 E6#109p-b（1.28）补自测：判据抽成 `fontScaleViolationsInCss()` / `fontScaleViolationsInTsx()`
 * 两个**纯函数**（吃文本、不读盘），`--self-test` 以此为尺逐例真跑断言——
 * 「本脚本会红」这件事从此有机械证据（1.27 体检发现本脚本此前没有自测）。
 *
 * 规则（档案 §七）：
 * - 禁止 `font-size: \d+(\.\d+)?px`（含 tsx 行内 `style={{ fontSize: NN }}`）→ 必须 var(--font-size-*)。
 * - 禁止 `line-height: \d+px`（字容器）→ unitless 或 calc(... * var(--ui-scale))。
 * - 豁免：注释、dist 构建产物、独立显示图标白名单（F7 固化 + #180 reconcile 协调）。
 *   ⚠️ **订正（E6#109p-b · 1.28 实测）**：此处原写「豁免 …、`@font-face`、…」是**与实现不符的假话**——
 *   `fontScaleViolationsInCss`（原 `auditCss`）里没有 `@font-face` 跳过分支，`collectBlocks` 会把 `@font-face` 当普通选择器收块，
 *   故 `@font-face { font-size: 13px }` **照红**（自测负控⑤ 钉住了这个真相）。
 *   本轮**只改这句话、不改判据**（是否该豁免 `@font-face` 不是本轮的事）。
 * - 第三方插件（仓库外）不强制——靠 03-插件制造 文档约定。
 *
 * ── 已知边界（钉在自测里，别修）──
 *   `WHITELIST` 的 `sel` 走**子串匹配**（`isWhitelisted` 用 `p.includes(w.sel)`）⇒
 *   例如 `.ldk-hamburger-btn` 会放行**任何包含该串**的选择器（`.__x.ldk-hamburger-btn-x` 也绿）。
 *   这是白名单宽松侧的已知边界，自测负控⑥ 把它记成事实。
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/**
 * 独立显示图标白名单——不随字号比例（与文本不直接相邻，语义 = 装饰/品牌，档案 §三.2）。
 * sel 以「子串」匹配规则选择器（支持复合类如 .ldk-welcome-card-icon.plugin-icon--codicon 与
 * 后代选择器如 .ldk-icon-btn .plugin-icon--codicon）。值 = 允许的裸 px 字号/行高。
 * ⚠️ 宿主侧选择器自 E6#109l 起一律带 `ldk-`（宿主独立定义 = `ldk-` 前缀，硬约束 23）——
 * 改宿主类名时要同笔改本表里的 `sel`，否则这条腿会因为「选择器不再匹配」而把豁免当成违规报出来。
 * F7 固化 = 用户拍板基线；reconcile = #180 协调补录（同 §三.2 语义的现存独立显示图标）。
 */
const WHITELIST = [
  // ── F7 固化（档案 §七） ──
  { sel: ".ldk-icon-btn .plugin-icon--codicon", prop: "font-size", value: 24, why: "F7 图标栏 codicon 24px" },
  { sel: ".plugin-icon--emoji", prop: "font-size", value: 24, why: "F7 图标栏 emoji 24px" },
  { sel: ".ldk-hamburger-btn", prop: "font-size", value: 20, why: "F7 ☰ 汉堡菜单 20px" },
  { sel: ".marketplace-hero-icon", prop: "font-size", value: 48, why: "F7 marketplace 空态 hero 图标 48px" },
  { sel: ".marketplace-row-icon", prop: "font-size", value: 20, why: "F7 marketplace 行图标 20px" },
  // ── reconcile（#180 协调补录，同 §三.2 语义） ──
  { sel: ".ldk-pd-icon-codicon", prop: "font-size", value: 40, why: "reconcile 插件详情大图标 codicon 40px（#63b B2 收敛 96→40）" },
  { sel: ".ldk-pd-icon-badge", prop: "font-size", value: 12, why: "reconcile 插件详情徽标 codicon 12px（#63b B2 收敛 16→12）" },
  { sel: ".ldk-pd-icon-badge", prop: "line-height", value: 20, why: "reconcile 插件详情徽标固定盒 20px（#63b B2 收敛 28→20）" },
  // ── marketplace 插件详情主区视图（E6#30.11b 迁自 pd-*，同语义独立显示图标） ──
  { sel: ".mpd-icon .plugin-icon--codicon", prop: "font-size", value: 56, why: "marketplace 详情展示位 codicon 56px（E6#69c 展示框 128 档后 48→56 同步——图形型不随 128 框等比撑满）" },
  { sel: ".mpd-icon .plugin-icon--emoji", prop: "font-size", value: 56, why: "marketplace 详情展示位 emoji 56px（同上）" },
  { sel: ".mpd-icon-badge", prop: "font-size", value: 12, why: "marketplace 详情徽标 codicon 12px（#63b B2 收敛 16→12）" },
  { sel: ".mpd-icon-badge", prop: "line-height", value: 20, why: "marketplace 详情徽标固定盒 20px（#63b B2 收敛 28→20）" },
  { sel: ".ldk-welcome-card-icon", prop: "font-size", value: 24, why: "reconcile 欢迎页卡片插件图标 24px" },
  { sel: ".ldk-welcome-recent-icon", prop: "font-size", value: 16, why: "reconcile 欢迎页 recent 图标 16px" },
  { sel: ".ms-item-icon .plugin-icon--codicon", prop: "font-size", value: 28, why: "reconcile marketplace 侧栏图标 28px" },
  { sel: ".toast-icon", prop: "font-size", value: 16, why: "reconcile toast 状态图标 codicon 16px" },
  { sel: ".serial-monitor-placeholder-icon", prop: "font-size", value: 32, why: "reconcile 串口监视器空态图标 32px" },
];

/** 收集 dir 下所有指定扩展名文件（跳过 node_modules / dist 构建产物） */
function collectFiles(dir, exts, skipDirs) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipDirs.includes(entry.name)) files.push(...collectFiles(full, exts, skipDirs));
    } else if (entry.isFile() && exts.some((e) => entry.name.endsWith(e))) {
      files.push(full);
    }
  }
  return files;
}

/** 把 /* *\/ 注释替换为等长空格（保留换行 → 行号不漂移，注释内 { ; 不干扰解析） */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

function countNewlines(s) {
  let c = 0;
  for (const ch of s) if (ch === "\n") c++;
  return c;
}

/** 递归收集 CSS 规则块 { selector, inner, line }（line 0-based；含 @media 内层嵌套块） */
function collectBlocks(text, baseLine, out) {
  let i = 0;
  const n = text.length;
  while (i < n) {
    const open = text.indexOf("{", i);
    if (open === -1) break;
    const prevSemi = text.lastIndexOf(";", open);
    const prevClose = text.lastIndexOf("}", open);
    const selStart = Math.max(prevSemi, prevClose) + 1;
    const selector = text.slice(selStart, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < n && depth > 0) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}") depth--;
      j++;
    }
    const inner = text.slice(open + 1, j - 1);
    const line = baseLine + countNewlines(text.slice(0, open));
    if (selector) out.push({ selector, inner, line });
    collectBlocks(inner, line, out);
    i = j;
  }
}

function isWhitelisted(selector, property, px) {
  const selParts = selector.split(",").map((s) => s.trim());
  for (const w of WHITELIST) {
    if (w.prop !== property || w.value !== px) continue;
    if (selParts.some((p) => p.includes(w.sel))) return true;
  }
  return false;
}

/**
 * 纯判据：一段 CSS 文本里的裸 px 字号/行高违规（1-based 行号）。
 * 不读盘——`main()` 读盘后调它，`--self-test` 直接喂字符串。语义与旧 `auditCss(file, violations)` 一字不差。
 * @param {string} text CSS 源文本
 * @returns {{line: number, property: string, value: string, selector: string}[]}
 */
export function fontScaleViolationsInCss(text) {
  const violations = [];
  const stripped = stripComments(text);
  const rules = [];
  collectBlocks(stripped, 0, rules);
  for (const rule of rules) {
    // 只扫本层声明（首个 `{` 之前）——嵌套块由递归单独处理，避免双报
    const nested = rule.inner.indexOf("{");
    const declText = nested === -1 ? rule.inner : rule.inner.slice(0, nested);
    for (const part of declText.split(";")) {
      const decl = part.trim();
      const colon = decl.indexOf(":");
      if (colon === -1) continue;
      const property = decl.slice(0, colon).trim().toLowerCase();
      if (property !== "font-size" && property !== "line-height") continue;
      const value = decl.slice(colon + 1).trim().replace(/!important\s*$/, "").trim();
      if (!/^\d+(\.\d+)?px$/.test(value)) continue; // 非裸 px（token/calc/unitless）放行
      const px = parseFloat(value);
      if (isWhitelisted(rule.selector, property, px)) continue;
      const declLine = rule.line + countNewlines(declText.slice(0, declText.indexOf(decl)));
      violations.push({ line: declLine + 1, property, value, selector: rule.selector });
    }
  }
  return violations;
}

/** 纯判据：一段 tsx 文本里的行内 `style={{ fontSize: NN }}`（px 数字字面量），1-based 行号。 */
export function fontScaleViolationsInTsx(text) {
  const violations = [];
  const re = /style\s*[:=]\s*\{[\s\S]*?fontSize\s*:\s*(\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(text))) {
    const line = text.slice(0, m.index).split("\n").length;
    violations.push({ line, property: "font-size(inline)", value: m[1] + "px", selector: "(tsx inline style)" });
  }
  return violations;
}

// ────────────────────────────────── 自测 ──────────────────────────────────

/**
 * 尺子自检：每例**真跑判据并断言实得结果**（不是「应该会红」的口头承诺）。
 * 计数规矩：**正控（合规 ⇒ 绿）条数 ≥ 负控（违规 ⇒ 红）条数**——尺子若不偏向「放行」，
 * 就可能靠恒红混过「会红」的检查。
 */
function runSelfTest() {
  const cases = [
    // ── 正控：合规必须绿 ──
    ["正控①：`font-size: var(--font-size-sm)`（token）⇒ 0 处", ".a { font-size: var(--font-size-sm); }\n", 0],
    ["正控②：`line-height: 1.5`（unitless）⇒ 0 处", ".a { line-height: 1.5; }\n", 0],
    ["正控③：`font-size: calc(13px * var(--ui-scale))`（缩放表达式）⇒ 0 处", ".a { font-size: calc(13px * var(--ui-scale)); }\n", 0],
    ["正控④：白名单命中（`.ldk-hamburger-btn { font-size: 20px }`）⇒ 0 处", ".ldk-hamburger-btn { font-size: 20px; }\n", 0],
    ["正控⑤：注释里的裸 px ⇒ 0 处", ".a { color: red; } /* font-size: 13px */\n", 0],
    ["正控⑥：非字号属性（`width: 13px` / `margin: 13px`）⇒ 0 处", ".a { width: 13px; margin: 13px; }\n", 0],
    ["正控⑦：非裸 px 值（`font-size: 1.3rem` / `13px` 后缀黏连）⇒ 0 处", ".a { font-size: 1.3rem; }\n.b { font-size: 13pxcalc(x); }\n", 0],
    // ── 负控：违规必须红（含 1.27 实测过的两条负控形态 + 两处真相钉子） ──
    ["负控①：CSS `font-size: 13px` ⇒ 1 处（1.27 实测负控）", ".ldk-probe-font { font-size: 13px; }\n", 1],
    ["负控②：CSS `line-height: 13px` ⇒ 1 处", ".a { line-height: 13px; }\n", 1],
    ["负控③：同一块两条裸 px 声明 ⇒ 2 处（不许只报一条）", ".a { font-size: 13px; line-height: 13px; }\n", 2],
    [
      "负控④：tsx 行内 `style={{ fontSize: 13 }}` ⇒ 1 处（1.27 实测负控）",
      "export const A = () => <div style={{ fontSize: 13 }} />;\n",
      1,
      "tsx",
    ],
    [
      // ⚠️ 与头部「豁免」那句话的关系：头部原写「豁免：注释、`@font-face`、dist…」= **假话**
      //    （`collectBlocks` 把 `@font-face` 当普通选择器收块，判据里没有跳过分支）⇒ 1.28 实测会红，
      //    头部那句已按实情订正为「注释 / dist 构建产物 / 白名单」。
      //    ⛔ 本行是**事实钉子**，不是「应该豁免」的主张：判据改不改不归本轮管。
      "负控⑤：🔴 `@font-face { font-size: 13px }` ⇒ 1 处（实测：**不豁免**；头部原措辞已订正）",
      "@font-face { font-family: x; font-size: 13px; }\n",
      1,
    ],
    [
      // 🔴 已知边界：WHITELIST 的 sel 走**子串匹配** ⇒ 越界选择器照样被放行（钉住事实，别「修」）
      "负控⑥：🔴 子串越界（`.__x.ldk-hamburger-btn-x { font-size: 20px }`）⇒ 0 处（已知边界钉子）",
      ".__x.ldk-hamburger-btn-x { font-size: 20px; }\n",
      0,
    ],
    ["负控⑦：`!important` 后缀的裸 px 也要抓 ⇒ 1 处", ".a { font-size: 13px !important; }\n", 1],
  ];

  // 计数规矩（硬要求，机械核验）：**正控 ≥ 负控**——尺子若不偏向放行，就可能靠恒红混过「会红」的检查
  const positive = cases.filter(([tag]) => tag.startsWith("正控")).length;
  const negative = cases.length - positive;
  if (positive < negative) {
    process.stdout.write(`🔴 例数配比不达标：正控 ${positive} 例 < 负控 ${negative} 例（要求 正控 ≥ 负控）。\n`);
    process.exit(1);
  }

  let bad = 0;
  for (const [tag, text, want, mode] of cases) {
    const got = mode === "tsx" ? fontScaleViolationsInTsx(text) : fontScaleViolationsInCss(text);
    const pass = got.length === want;
    if (!pass) bad++;
    process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} —— 实得 ${got.length} 处\n`);
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ check-font-scale-audit self-test 全过（${cases.length} 例：正控绿 / 负控红）——尺子不是在恒绿。\n`
      : `\n🔴 check-font-scale-audit self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const violations = [];

  // 壳：src/**/*.css + src/**/*.tsx
  for (const f of collectFiles(resolve(ROOT, "src"), [".css", ".tsx"], ["node_modules", "dist"])) {
    if (f.endsWith(".css")) {
      for (const v of fontScaleViolationsInCss(readFileSync(f, "utf-8"))) violations.push({ file: f, ...v });
    } else {
      for (const v of fontScaleViolationsInTsx(readFileSync(f, "utf-8"))) violations.push({ file: f, ...v });
    }
  }
  // 仓库内插件：plugins/<id> 的 src CSS（2026-09-05 塌平单根——原 builtin/user 双目录废除；
  // dist 构建产物跳过；.disabled 等点目录跳过，同旧双目录不扫墓地语义）
  //
  // 🔴 E6#99（L7 第 7.2 轮）覆盖域结论：本段**保留**，对象 = 两只开发夹具（panel-demo / floating-panel-demo）
  //   的 CSS。18 只发货插件的字号/行高红线随各插件仓自己的 CI 走（7.5 轮落）；仓内不是真空，故无需黄灯。
  const pluginsDir = resolve(ROOT, "plugins");
  for (const dir of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name.startsWith(".")) continue;
    for (const f of collectFiles(resolve(pluginsDir, dir.name), [".css"], ["node_modules", "dist"])) {
      for (const v of fontScaleViolationsInCss(readFileSync(f, "utf-8"))) violations.push({ file: f, ...v });
    }
  }

  for (const v of violations) {
    const rel = relative(ROOT, v.file).replace(/\\/g, "/");
    console.error(
      `  ${rel}:${v.line}  ⚠  ${v.property} = ${v.value}（selector: ${v.selector}）——` +
        `字号必须 var(--font-size-*) / 行高 unitless 或 calc(*var(--ui-scale))（E5.8 Phase 12 #180 门禁）。` +
        `独立显示图标走 WHITELIST 声明（scripts/check-font-scale-audit.mjs）。`
    );
  }

  if (violations.length > 0) {
    console.error(`\n❌ ${violations.length} 处裸 px 字号/行高违规——请迁移到 token 或补白名单。`);
    process.exit(1);
  }

  console.log(`✅ 全部 CSS 字号走 var(--font-size-*) / 行高 unitless 或 calc（白名单豁免 ${WHITELIST.length} 条独立显示图标）。`);
}

main();
