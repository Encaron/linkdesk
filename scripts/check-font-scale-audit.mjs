/**
 * 机械检查：字号度量防回潮——`font-size: NNpx` / `line-height: NNpx` 裸 px 拦截。
 *
 * E5.8 Phase 12 #180（度量体系归一化的机械兜底，对标 check-theme-audit.mjs）：
 * 全局 UI 字号缩放上线后，`--font-size-*` token + `--ui-scale` 是唯一合法字号来源。
 * 本脚本兜底「未来」——任何新代码（壳 / builtin / 仓库内 user 插件）再写裸 px 字号/行高
 * 被 `npm run check` 拦下。独立显示图标（装饰/品牌语义，不随字号比例）走 WHITELIST 声明。
 *
 * 用法：node scripts/check-font-scale-audit.mjs
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
 *
 * 规则（档案 §七）：
 * - 禁止 `font-size: \d+(\.\d+)?px`（含 tsx 行内 `style={{ fontSize: NN }}`）→ 必须 var(--font-size-*)。
 * - 禁止 `line-height: \d+px`（字容器）→ unitless 或 calc(... * var(--ui-scale))。
 * - 豁免：注释、`@font-face`、dist 构建产物、独立显示图标白名单（F7 固化 + #180 reconcile 协调）。
 * - 第三方插件（仓库外）不强制——靠 03-插件制造 文档约定。
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/**
 * 独立显示图标白名单——不随字号比例（与文本不直接相邻，语义 = 装饰/品牌，档案 §三.2）。
 * sel 以「子串」匹配规则选择器（支持复合类如 .welcome-card-icon.plugin-icon--codicon 与
 * 后代选择器如 .icon-btn .plugin-icon--codicon）。值 = 允许的裸 px 字号/行高。
 * F7 固化 = 用户拍板基线；reconcile = #180 协调补录（同 §三.2 语义的现存独立显示图标）。
 */
const WHITELIST = [
  // ── F7 固化（档案 §七） ──
  { sel: ".icon-btn .plugin-icon--codicon", prop: "font-size", value: 24, why: "F7 图标栏 codicon 24px" },
  { sel: ".plugin-icon--emoji", prop: "font-size", value: 24, why: "F7 图标栏 emoji 24px" },
  { sel: ".hamburger-btn", prop: "font-size", value: 20, why: "F7 ☰ 汉堡菜单 20px" },
  { sel: ".marketplace-hero-icon", prop: "font-size", value: 48, why: "F7 marketplace 空态 hero 图标 48px" },
  { sel: ".marketplace-row-icon", prop: "font-size", value: 20, why: "F7 marketplace 行图标 20px" },
  // ── reconcile（#180 协调补录，同 §三.2 语义） ──
  { sel: ".pd-icon-codicon", prop: "font-size", value: 96, why: "reconcile 插件详情大图标 96px" },
  { sel: ".pd-icon-badge", prop: "font-size", value: 16, why: "reconcile 插件详情徽标 codicon 16px" },
  { sel: ".pd-icon-badge", prop: "line-height", value: 28, why: "reconcile 插件详情徽标固定盒 28px" },
  // ── marketplace 插件详情主区视图（E6#30.11b 迁自 pd-*，同语义独立显示图标） ──
  { sel: ".mpd-icon .plugin-icon--codicon", prop: "font-size", value: 56, why: "marketplace 详情目录大图标 codicon 56px（30.11b 迁自 pd-icon）" },
  { sel: ".mpd-icon .plugin-icon--emoji", prop: "font-size", value: 56, why: "marketplace 详情目录大图标 emoji 56px（30.11b 迁自 pd-icon）" },
  { sel: ".mpd-icon-codicon", prop: "font-size", value: 96, why: "marketplace 详情无目录占位大图标 96px（30.11b 迁自 pd-icon-codicon）" },
  { sel: ".mpd-icon-badge", prop: "font-size", value: 16, why: "marketplace 详情徽标 codicon 16px（30.11b 迁自 pd-icon-badge）" },
  { sel: ".mpd-icon-badge", prop: "line-height", value: 28, why: "marketplace 详情徽标固定盒 28px（30.11b 迁自 pd-icon-badge）" },
  { sel: ".welcome-card-icon", prop: "font-size", value: 24, why: "reconcile 欢迎页卡片插件图标 24px" },
  { sel: ".welcome-recent-icon", prop: "font-size", value: 16, why: "reconcile 欢迎页 recent 图标 16px" },
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

/** 审计一个 CSS 文件：返回违规数组 */
function auditCss(file, violations) {
  const raw = readFileSync(file, "utf-8");
  const text = stripComments(raw);
  const rules = [];
  collectBlocks(text, 0, rules);
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
      violations.push({ file, line: declLine + 1, property, value, selector: rule.selector });
    }
  }
}

/** 审计 tsx 行内 `style={{ fontSize: NN }}`（px 数字字面量） */
function auditTsx(file, violations) {
  const text = readFileSync(file, "utf-8");
  const re = /style\s*[:=]\s*\{[\s\S]*?fontSize\s*:\s*(\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(text))) {
    const line = text.slice(0, m.index).split("\n").length;
    violations.push({ file, line, property: "font-size(inline)", value: m[1] + "px", selector: "(tsx inline style)" });
  }
}

function main() {
  const violations = [];

  // 壳：src/**/*.css + src/**/*.tsx
  for (const f of collectFiles(resolve(ROOT, "src"), [".css", ".tsx"], ["node_modules", "dist"])) {
    if (f.endsWith(".css")) auditCss(f, violations);
    else auditTsx(f, violations);
  }
  // 仓库内插件：plugins/<id> 的 src CSS（2026-09-05 塌平单根——原 builtin/user 双目录废除；
  // dist 构建产物跳过；.disabled 等点目录跳过，同旧双目录不扫墓地语义）
  const pluginsDir = resolve(ROOT, "plugins");
  for (const dir of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name.startsWith(".")) continue;
    for (const f of collectFiles(resolve(pluginsDir, dir.name), [".css"], ["node_modules", "dist"])) {
      auditCss(f, violations);
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
