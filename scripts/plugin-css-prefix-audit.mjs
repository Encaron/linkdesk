#!/usr/bin/env node
/**
 * 插件 CSS 前缀**只读审计**（E6#109h-b①，详案 15 §三）——把「本仓不合规类名 / 关键帧 + 应改成什么」
 * 一次列清。**本工具不写任何文件**（改名与提交属于各仓自己的轮次 ③–⑦）。
 *
 * ── 为什么值得落这个工具（不是顺手）──
 * 1.14 的 9 轮里，③–⑦ **每一格**都要「拿到本仓的旧名清单 ＋ 生成旧名 → 新名映射」，⑧ 还要「全量复核」。
 * 若每格各写一次 grep，就是本仓反复打过的「**手抄第二份清单**」（1.15 花了一整轮才把作者面那张手抄表
 * 补上机器腿）。这里一次落盘、五格复用。
 *
 * ── 🔴 它必须与腿**同源**（详案 §三 / §七 禁区 3）──
 * 判据不在这里，也不许在这里出现第二份：本工具 `import` 的正是 `lint.ts` 那条
 * `check-css-namespace` 腿用的同一个函数（`runPluginPrefixCheck`，SDK 的具名导出）——
 * **改一处判据，腿与工具一起变**（`--self-test` 里有一步静态断言钉住这件事）。
 * 先例：`scripts/backfill-catalog-identity.mjs` 同样「依赖 SDK dist（先 build）」，不自己重写规则。
 * ⇒ 跑之前先 `npm run --prefix packages/plugin-sdk build`（dist 缺失/过旧时本工具**抛错**，不静默按旧规则报）。
 *
 * ── 射程（别指望它兜住全部）──
 * 本工具看的是 **CSS 侧的定义点**（`.x { }` / `@keyframes x`）。**渲染点**（TSX 里的 `className="x"`）
 * 与 `animation:` 引用处**不在本工具射程内**——那两处漏改就是「**静默失样式**」（本系列要杀的那个
 * bug 形态）。改名轮的正确性判据请照 17 号档 §四：**类名 token 判据 0 残留 ＋ 逐字节只插入前缀的
 * 机械证明**（`scratch/judge-class-tokens.mjs` / `prove-prefix-only-*.mjs` 那套）。
 *
 * ── 用法 ──
 *   node scripts/plugin-css-prefix-audit.mjs <插件仓目录>          # 单仓清单（人读）
 *   node scripts/plugin-css-prefix-audit.mjs <仓目录> --json       # 机器可读（生成改名映射用）
 *   node scripts/plugin-css-prefix-audit.mjs --all [<容器目录>]     # 多仓一次扫（默认 E:\linkdesk-plugins\official）
 *   node scripts/plugin-css-prefix-audit.mjs --all --json          # 多仓机器可读（⑧ 全量复核用）
 *   node scripts/plugin-css-prefix-audit.mjs --self-test           # 正控/负控（不动真仓）
 * 退出码 0 = 零不合规；1 = 有不合规（或仓目录不可用）——**这是只读审计的读数，不是门禁**：
 * 门禁是各插件仓 CI 里的 `check-css-namespace` 腿（fail-closed）。
 */
import { existsSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SDK_PREFIX_MODULE = join(ROOT, "packages", "plugin-sdk", "dist", "eslint", "checks", "plugin-prefix.js");
const SDK_LINT_MODULE = join(ROOT, "packages", "plugin-sdk", "dist", "eslint", "lint.js");
const DEFAULT_CONTAINER = process.env.LINKDESK_PLUGIN_CONTAINER || "E:\\linkdesk-plugins\\official";

/* ── SDK 导入（判据的单一真相源）──────────────────────────────────────── */

async function loadSdk() {
  if (!existsSync(SDK_PREFIX_MODULE)) {
    throw new Error(
      `SDK dist 不存在（${SDK_PREFIX_MODULE}）——先跑：npm run --prefix packages/plugin-sdk build\n` +
        `  （本工具刻意不自带判据：那是 check-css-namespace 腿的同一处实现，两处各写一套必漂移）`,
    );
  }
  const m = await import(pathToFileURL(SDK_PREFIX_MODULE).href);
  if (typeof m.runPluginPrefixCheck !== "function") {
    throw new Error(
      `SDK dist 里没有 runPluginPrefixCheck —— dist 是旧的（E6#109h-b① 之前构建的）。\n` +
        `  先跑：npm run --prefix packages/plugin-sdk build`,
    );
  }
  return m.runPluginPrefixCheck;
}

/* ── 单仓读数 ─────────────────────────────────────────────────────────── */

/** 一仓的审计结果（`--json` 的单元；人读输出也由它渲染） */
function auditRepo(runCheck, dir, reserved) {
  const report = runCheck(dir, reserved);
  /** 旧名 → 新名（去重；`sites` = 该名字在本仓出现多少处，供改名轮的 token 判据对数） */
  const map = new Map();
  const addSites = (sites, kind) => {
    for (const s of sites) {
      const key = `${kind}|${s.name}`;
      const cur = map.get(key);
      if (cur) cur.sites += 1;
      else map.set(key, { kind, from: s.name, to: s.suggested, sites: 1, reserved: s.reserved });
    }
  };
  addSites(report.classes, "class");
  addSites(report.keyframes, "keyframes");
  return {
    root: report.root,
    pluginId: report.pluginId,
    pluginIdSource: report.pluginIdSource,
    pluginIdNote: report.pluginIdNote,
    error: report.error,
    boundary: report.boundary,
    ok: !report.error && !report.boundary && report.violations.length === 0,
    counts: { classes: report.classes.length, keyframes: report.keyframes.length },
    files: [...new Set([...report.classes, ...report.keyframes].map((s) => s.file))].length,
    classes: report.classes,
    keyframes: report.keyframes,
    blocking: report.violations.filter((v) => v.file === "plugin.json"),
    mapping: [...map.values()].sort((a, b) => a.from.localeCompare(b.from)),
  };
}

/* ── 渲染（人读）─────────────────────────────────────────────────────── */

function renderRepo(r) {
  const L = [];
  L.push(`插件 CSS 前缀审计（只读）——${r.root}`);
  L.push(
    `pluginId = ${r.pluginId ?? "（拿不到）"}` +
      `（来源：${r.pluginIdSource ?? "—"}）` +
      (r.pluginIdNote ? `\n  ℹ ${r.pluginIdNote}` : ""),
  );
  L.push("─".repeat(72));
  if (r.blocking.length > 0) {
    L.push(`❌ 身份/清单层（判据 ③/④，**不受 disable 注释豁免**）——${r.blocking.length} 条：`);
    for (const b of r.blocking) L.push(`   · ${b.file}:${b.line}  ${b.message}`);
  }
  if (r.classes.length === 0 && r.keyframes.length === 0) {
    L.push(`✅ 零不合规（裸定义类名 / 关键帧都带本仓前缀）${r.error ? "（但身份层有红——见上）" : ""}`);
  } else {
    L.push(`⚠ 不合规类名 ${r.classes.length} 处（${r.counts.classes} 名去重后见映射表）／关键帧 ${r.keyframes.length} 处 · 涉及 ${r.files} 文件`);
    for (const s of r.classes) L.push(`   ${s.file}:${s.line}  .${s.name}  →  .${s.suggested}${s.reserved ? "   ⚠ 宿主保留名" : ""}`);
    for (const s of r.keyframes) L.push(`   ${s.file}:${s.line}  @keyframes ${s.name}  →  @keyframes ${s.suggested}${s.reserved ? "   ⚠ 与宿主关键帧同名" : ""}`);
    L.push(`\n改名映射（旧名 → 新名，形状 = **叠加**：前缀只插入、不改词干）：`);
    for (const m of r.mapping) {
      L.push(`   ${m.kind === "class" ? "." : "@keyframes "}${m.from}  →  ${m.kind === "class" ? "." : "@keyframes "}${m.to}   ×${m.sites}`);
    }
    L.push(`\n🔴 渲染点（TSX className）与 animation: 引用处**不在本工具射程**——漏改 = 静默失样式；`);
    L.push(`   改名轮请照 17 号档 §四：类名 token 判据 0 残留 ＋ 逐字节只插入前缀的机械证明。`);
  }
  return L.join("\n");
}

function renderAll(results, skipped) {
  const L = [];
  L.push(`插件 CSS 前缀审计（只读·多仓）——${results.length} 个含 plugin.json 的仓`);
  L.push("─".repeat(72));
  const pad = (s, n) => String(s).padEnd(n, " ");
  L.push(`   ${pad("仓", 22)} ${pad("pluginId", 24)} ${pad("来源", 12)} ${pad("类名处", 7)} ${pad("关键帧", 7)} 状态`);
  for (const r of results) {
    const status = r.ok ? "✅ 合规" : r.error || r.boundary ? "❌ 身份层红" : "⚠ 待改名";
    L.push(
      `   ${pad(basename(r.root), 22)} ${pad(r.pluginId ?? "—", 24)} ${pad(r.pluginIdSource ?? "—", 12)} ` +
        `${pad(r.counts.classes, 7)} ${pad(r.counts.keyframes, 7)} ${status}`,
    );
  }
  const totalClasses = results.reduce((n, r) => n + r.counts.classes, 0);
  const totalKf = results.reduce((n, r) => n + r.counts.keyframes, 0);
  const dirty = results.filter((r) => !r.ok);
  L.push("─".repeat(72));
  L.push(
    `合计：不合规类名 ${totalClasses} 处 / 关键帧 ${totalKf} 处 · 零不合规 ${results.length - dirty.length}/${results.length} 仓` +
      (skipped.length > 0 ? ` · 另有 ${skipped.length} 个非插件目录（无 plugin.json）未计` : ""),
  );
  if (dirty.length > 0) L.push(`待改名的仓：${dirty.map((r) => basename(r.root)).join(" / ")}`);
  return L.join("\n");
}

/* ── 自测（正控/负控 + 同源静态断言）────────────────────────────────── */

async function selfTest(runCheck) {
  const cases = [];
  const tmp = mkdtempSync(join(tmpdir(), "css-prefix-audit-"));
  const mk = (rel, content) => {
    const full = join(tmp, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  };
  const fresh = (pluginJson, css) => {
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    if (pluginJson !== null) mk("plugin.json", pluginJson);
    if (css !== null) mk("src/styles/App.css", css);
  };
  const MANIFEST = (id) => `{\n  "pluginId": "${id}",\n  "name": "夹具",\n  "version": "1.0.0",\n}\n`;

  // 正控：全合规 ⇒ ok
  fresh(MANIFEST("demo"), ".demo-card { color: red; }\n@keyframes demo-in { from { opacity: 0 } }\n");
  let r = auditRepo(runCheck, tmp);
  cases.push(["正控：带前缀 ⇒ ok=true 且零站点", r.ok === true && r.counts.classes === 0 && r.counts.keyframes === 0]);

  // 负控①：裸类名 ⇒ 1 处 + 建议名 = 前缀叠加
  fresh(MANIFEST("demo"), ".notmine-panel { color: red; }\n");
  r = auditRepo(runCheck, tmp);
  cases.push([
    "负控①：裸类名 ⇒ 1 处、建议 demo-notmine-panel、映射表 1 行",
    r.ok === false && r.counts.classes === 1 && r.mapping.length === 1 &&
      r.mapping[0].from === "notmine-panel" && r.mapping[0].to === "demo-notmine-panel" && r.mapping[0].sites === 1,
  ]);

  // 负控②：同一名字多处 ⇒ 映射去重、sites 累加（⚠️ `.dup-a .dup-b` 是 scoped 调优，不算裸定义——
  //   夹具必须用**两个各自裸定义**的选择器，否则测不到 sites 累加）
  fresh(MANIFEST("demo"), ".dup-a { color: red; }\n.dup-b { color: blue; }\n.dup-a { color: green; }\n");
  r = auditRepo(runCheck, tmp);
  cases.push([
    "负控②：同名多站点 ⇒ 映射合并且 sites=2（另一名 1 处）",
    r.mapping.length === 2 && r.mapping.find((m) => m.from === "dup-a").sites === 2 && r.mapping.find((m) => m.from === "dup-b").sites === 1,
  ]);

  // 负控③：关键帧 ⇒ kind=keyframes
  fresh(MANIFEST("demo"), "@keyframes fadeIn { from { opacity: 0 } }\n");
  r = auditRepo(runCheck, tmp);
  cases.push([
    "负控③：裸关键帧 ⇒ kind=keyframes、建议 demo-fadeIn",
    r.counts.keyframes === 1 && r.mapping[0].kind === "keyframes" && r.mapping[0].to === "demo-fadeIn",
  ]);

  // 负控④：ldk- 边界 ⇒ blocking 单独列出（不是「待改名」）
  fresh(MANIFEST("ldk-tools"), ".ldk-tools-a { color: red; }\n");
  r = auditRepo(runCheck, tmp);
  cases.push([
    "负控④：pluginId=ldk-tools ⇒ ok=false 且 blocking=1（身份层）",
    r.boundary === "ldk-tools" && r.ok === false && r.blocking.length === 1 && r.counts.classes === 0,
  ]);

  // 负控⑤：fail-closed ⇒ error + blocking
  fresh(null, ".anything { color: red; }\n");
  r = auditRepo(runCheck, tmp);
  cases.push([
    "负控⑤：无 plugin.json ⇒ error 非空、blocking=1、不给映射表",
    !!r.error && r.ok === false && r.blocking.length === 1 && r.mapping.length === 0,
  ]);

  // 同源：工具 import 的模块 === 腿 import 的模块（dist 里那条 import 边）
  const lintSrc = existsSync(SDK_LINT_MODULE) ? readFileSync(SDK_LINT_MODULE, "utf8") : "";
  cases.push([
    "同源：dist/eslint/lint.js（腿）import 的正是 checks/plugin-prefix.js（工具用的同一个模块）",
    /checks\/plugin-prefix\.js/.test(lintSrc),
  ]);

  rmSync(tmp, { recursive: true, force: true });
  let ok = true;
  for (const [name, pass] of cases) {
    console.log(`  ${pass ? "✓" : "✗"} ${name}`);
    if (!pass) ok = false;
  }
  console.log(`plugin-css-prefix-audit self-test ${ok ? "✔️ 全部符合预期（正控绿 / 负控红）" : "❌ 有判据不符预期"}`);
  process.exit(ok ? 0 : 1);
}

/* ── 入口 ─────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const all = argv.includes("--all");
const positional = argv.filter((a) => !a.startsWith("--"));

const runCheck = await loadSdk();
if (argv.includes("--self-test")) await selfTest(runCheck);

if (all) {
  const container = positional[0] ?? DEFAULT_CONTAINER;
  if (!existsSync(container)) {
    console.error(`❌ 容器目录不存在：${container}（用 --all <目录> 或 LINKDESK_PLUGIN_CONTAINER 指定）`);
    process.exit(1);
  }
  const entries = readdirSync(container, { withFileTypes: true }).filter((e) => e.isDirectory());
  const dirs = entries.map((e) => join(container, e.name)).filter((d) => statSync(d, { throwIfNoEntry: false }));
  const repos = dirs.filter((d) => existsSync(join(d, "plugin.json")));
  const skipped = dirs.filter((d) => !existsSync(join(d, "plugin.json")));
  const results = repos.map((d) => auditRepo(runCheck, d));
  if (json) console.log(JSON.stringify({ container, repos: results, skipped: skipped.length }, null, 2));
  else console.log(renderAll(results, skipped));
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

if (positional.length === 0) {
  console.error("用法：node scripts/plugin-css-prefix-audit.mjs <插件仓目录> [--json] | --all [<容器目录>] [--json] | --self-test");
  process.exit(1);
}

const results = positional.map((d) => {
  if (!existsSync(d)) {
    console.error(`❌ 目录不存在：${d}`);
    process.exit(1);
  }
  return auditRepo(runCheck, d);
});
if (json) console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
else console.log(results.map(renderRepo).join("\n\n"));
process.exit(results.every((r) => r.ok) ? 0 : 1);
