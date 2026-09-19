#!/usr/bin/env node
/**
 * 官方插件仓「CSS 死类」审计尺（只报不拦）——E6#113 第三步。
 *
 * ── 它守的是哪句话 ──
 *   插件 CSS 里「规则写了、页面上没有任何节点带这个类」的死类**不是无害冗余**——它是一个会
 *   **静默吃掉样式**的挂载点（1.24 实证：token 挂在实机 DOM 里不存在的 `.serial-monitor-sidebar`
 *   上，侧栏状态点颜色静默丢失、零报错）。本尺把「删组件留孤儿 CSS」变成一眼可见的账。
 *
 * ── 方向（⛔ 单向）──
 *   CSS → 源码：规则里**定义**的类，在本仓 src 下的 ts/tsx/js/jsx 里找不到消费方 ⇒ 报出。
 *   **反向不查**——「源码用了、CSS 没定义」是合法标记类（如 `.marketplace-ms-section-items`，
 *   detail-shell.css:47 有登记），查它必误报（09 详案 禁区 7）。
 *
 * ── 口径（09 详案 §二 第三步 ＋ §八 复查补记）──
 *   · 只查**自写前缀**：类名以本仓 pluginId + "-" 开头。
 *   · 排除三方/共享面前缀：`ldk-*`（宿主共享面，跨方调优合法——全 18 仓实有 9 处合法消费）、
 *     `cm-*`（CodeMirror）、`codicon`、`plugin-icon*`（壳共享件运行时挂变体，禁区 8）；
 *     限定选择器后半段里的 ldk-*（`.foo .ldk-bar` 的 `.ldk-bar`）同被前缀排除覆盖（§1.5 后半段）。
 *   · 🔴 **容许动态拼接**：src 里出现「静态前缀 + ${」模板串 ⇒ 以该静态前缀开头的类全部视为
 *     有潜在消费方、**不报**（settings 实例：`settings-source-badge--${badge}` ⇒ `--user`/`--mix`
 *     两个变体不报）。残余盲区：「全动态」形态（`${var}-x`）静态不可判——只报不拦，宁可漏报。
 *   · 跨仓消费不在本尺范围（只看本仓 src）——删前跨方 grep 复核由 §1.3/§三 判据另行兜底。
 *
 * ── 定位 ──
 *   审计族：需要插件容器在场、**不进 `npm run check`**、exit 恒 0（同 runtime-style-audit /
 *   audit-plugin-scope）。⛔ 不许挪去 scratch/（scratch 不进 git，引它的文档全断链——§1.6）。
 *
 * 用法：node scripts/audit-plugin-dead-css.mjs [容器目录]   （或 npm run audit:plugin-dead-css；
 *       默认 E:/linkdesk-plugins/official）
 */
import fs from "node:fs";
import path from "node:path";

const CONTAINER = process.argv[2] || "E:/linkdesk-plugins/official";
const THIRD_PARTY = ["ldk-", "cm-", "codicon", "plugin-icon"];

function readJsonc(p) {
  try {
    let raw = fs.readFileSync(p, "utf8");
    raw = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1").replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function walk(dir, filter, out = []) {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}

/**
 * CSS 里「选择器段」定义的类（file:line 首现 + 规则条数）。
 * 块注释先抹成等长空白（保行号——serial-monitor 头注里就提到类名，不抹会算成定义）；
 * 选择器段 = `^` 或 `}` 之后到下一个 `{` 之前（嵌套 @media 下的规则也能取到）；
 * `@keyframes` 名不带点、不采。
 */
function cssClasses(cssPath) {
  const raw = fs.readFileSync(cssPath, "utf8");
  const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const found = [];
  for (const m of stripped.matchAll(/(^|\})([^{}]*)\{/g)) {
    const lineBase = m.index + m[1].length;
    for (const c of m[2].matchAll(/\.([A-Za-z_][\w-]*)/g)) {
      const line = stripped.slice(0, lineBase + c.index).split("\n").length;
      found.push({ name: c[1], line });
    }
  }
  return found;
}

const rows = [];
for (const d of fs.readdirSync(CONTAINER, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  const dir = path.join(CONTAINER, d.name);
  const man = readJsonc(path.join(dir, "plugin.json"));
  if (!man) continue;
  const id = man.pluginId || d.name;

  /* 定义面：本仓全部 CSS 的自写前缀类（name → {file, line, rules}） */
  const defined = new Map();
  for (const f of walk(dir, (p) => p.endsWith(".css"))) {
    const rel = path.relative(dir, f).split(path.sep).join("/");
    for (const c of cssClasses(f)) {
      if (!c.name.startsWith(id + "-")) continue;
      if (THIRD_PARTY.some((p) => c.name.startsWith(p))) continue;
      const e = defined.get(c.name) ?? { file: rel, line: c.line, rules: 0 };
      e.rules++;
      defined.set(c.name, e);
    }
  }
  if (defined.size === 0) {
    rows.push({ id, dead: [], candidates: 0 });
    continue;
  }

  /* 消费面：本仓 src 源码 ＋ 动态拼接前缀（静态前缀 + ${ ⇒ 同前缀类全算有潜在消费方） */
  const srcFiles = walk(path.join(dir, "src"), (p) => /\.(ts|tsx|js|jsx)$/.test(p));
  const texts = srcFiles.map((p) => fs.readFileSync(p, "utf8"));
  const dynPrefixes = [...new Set(texts.flatMap((t) => [...t.matchAll(/([A-Za-z][\w-]*)\$\{/g)].map((m) => m[1])))];
  const dynHit = (cls) => dynPrefixes.some((p) => p.length >= 4 && cls.startsWith(p));
  const srcHit = (cls) => texts.some((t) => new RegExp(`(?<![\\w-])${cls}(?![\\w-])`).test(t));

  const dead = [...defined.entries()]
    .filter(([name]) => !srcHit(name) && !dynHit(name))
    .map(([name, e]) => ({ name, ...e }))
    .sort((a, b) => (a.file + a.line).localeCompare(b.file + b.line));
  rows.push({ id, dead, candidates: defined.size });
}

const totalDead = rows.reduce((a, r) => a + r.dead.length, 0);
const totalCand = rows.reduce((a, r) => a + r.candidates, 0);
console.log(`[dead-css] 容器 ${CONTAINER} · ${rows.length} 仓 · 自写前缀候选类 ${totalCand} · 死类 ${totalDead} 处\n`);
for (const r of [...rows].sort((a, b) => b.dead.length - a.dead.length)) {
  if (r.dead.length === 0) continue;
  console.log(`── ${r.id}  死类 ${r.dead.length} 处`);
  for (const d of r.dead) console.log(`   ${d.file}:${d.line}  .${d.name}（${d.rules} 条规则）`);
}
const zero = rows.filter((r) => r.dead.length === 0).length;
console.log(`\n[dead-css] 零死类 ${zero}/${rows.length} 仓 · 只报不拦（exit 0）——删前照 09 详案 §二 走逐处四条证据，删后本尺应 10 → 0。`);
process.exitCode = 0;
