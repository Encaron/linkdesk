/**
 * 官方插件仓「非样式命名空间」清账面清单（只读）。
 * 逐仓列出：命令 id / 运行时注册 / 设置键 / 外观族 id / 上下文旗子 / 其余声明面 的合规情况。
 * 用法：node scripts/audit-plugin-scope.mjs [容器目录]   （或 npm run audit:plugin-scope）
 * ⚠️ 口径：只报「不带本插件归属」与「撞宿主保留面」两类；同插件多写点不算冲突。
 * ⚠️ 只读 · report-only · **不接 check 链**（判红须「本仓可答 ＋ 有真害」两条齐备，见 35 号档 §九）。
 * 🔴 它读的 scripts/host-reserved.json 是**生成式产物**，别手改——重跑 node scripts/gen-host-reserved.mjs。
 * ⛔ 本文件在 scripts/check-gate-health.mjs 的**域外**（域 = check-*.mjs），故没有 --self-test。
 */
import fs from "node:fs";
import path from "node:path";

const CONTAINER = process.argv[2] || "E:/linkdesk-plugins/official";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");

function readJsonc(p) {
  try {
    let raw = fs.readFileSync(p, "utf8");
    raw = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1").replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(raw);
  } catch { return null; }
}
function walk(dir, filter, out = []) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, filter, out); else if (filter(p)) out.push(p);
  }
  return out;
}

/* 宿主保留面（账草案，见 00 档 §2.8；生成式产物，见 scripts/gen-host-reserved.mjs） */
const HOST = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "host-reserved.json"), "utf8"));

const rows = [];
for (const d of fs.readdirSync(CONTAINER, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  const dir = path.join(CONTAINER, d.name);
  const man = readJsonc(path.join(dir, "plugin.json"));
  if (!man) continue;
  const id = man.pluginId || d.name;
  const c = man.contributes || {};
  const r = { id, dir: d.name, cmdBad: [], cmdOk: 0, runtime: [], cfgBad: [], cfgOk: 0,
    themeIds: [], iconThemeIds: [], langIds: [], recipeIds: [], iconKeys: [], flags: [], langDefs: [], fileAssoc: [], i18nKeys: 0 };

  for (const x of c.commands || []) {
    const k = x.id || x.command; if (!k) continue;
    if (k.startsWith(id + ".")) r.cmdOk++; else r.cmdBad.push(k);
  }
  for (const f of walk(path.join(dir, "src"), (x) => /\.(ts|tsx|js|jsx)$/.test(x))) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/registerCommand\s*\(\s*["'`]([^"'`]+)["'`]/g)) {
      if (!m[1].startsWith(id + ".")) r.runtime.push(`${m[1]} @${path.relative(dir, f)}`);
    }
    for (const m of src.matchAll(/contextKey\s*[?.]*\s*\.\s*set\s*\(\s*["'`]([^"'`]+)["'`]/g)) {
      if (!r.flags.includes(m[1])) r.flags.push(m[1]);
    }
  }
  const cfg = Array.isArray(c.configuration) ? c.configuration : c.configuration ? [c.configuration] : [];
  for (const cc of cfg) for (const k of Object.keys(cc?.properties || {})) {
    if (k.startsWith(id + ".")) r.cfgOk++; else r.cfgBad.push(k);
  }
  for (const t of c.themes || []) {
    if (t.id) r.themeIds.push(t.id);
    for (const cw of t.colorways || []) if (cw.id) r.recipeIds.push(`colorway:${cw.id}`);
  }
  for (const t of c.iconThemes || []) if (t.id) r.iconThemeIds.push(t.id);
  for (const l of c.languages || []) if (l.id) r.langIds.push(l.id);
  for (const k of Object.keys(c.icons || {})) r.iconKeys.push(k);
  for (const l of c.langDefs || []) for (const e of l.extensions || []) r.langDefs.push(String(e));
  for (const a of c.fileAssociations || []) r.fileAssoc.push(String(a.extension || ""));
  // 主题配方实体文件（themes/*.json）里的 id/name
  for (const f of walk(dir, (x) => /[\\/]themes[\\/].*\.json$/.test(x))) {
    const t = readJsonc(f);
    if (t?.id) r.recipeIds.push(`file.id:${t.id}`);
    if (t?.name) r.recipeIds.push(`file.name:${t.name}`);
  }
  for (const f of walk(path.join(dir, "i18n"), (x) => x.endsWith(".json"))) {
    const j = readJsonc(f); if (j && typeof j === "object") r.i18nKeys += Object.keys(j).length;
  }
  rows.push(r);
}

const bad = (arr, reserved = []) => arr.filter((x) => reserved.some((p) => x === p || x.startsWith(p)));
console.log(`[scope] 容器 ${CONTAINER} · ${rows.length} 仓\n`);
const summary = [];
for (const r of rows.sort((a, b) => (b.cmdBad.length + b.cfgBad.length + b.flags.length) - (a.cmdBad.length + a.cfgBad.length + a.flags.length))) {
  const flagsBad = r.flags.filter((f) => HOST.contextKeys.includes(f) || !f.startsWith(r.id + "."));
  const themeBad = r.themeIds.filter((x) => !x.startsWith(r.id + "-") && !x.startsWith(r.id + "."));
  const recBad = r.recipeIds.filter((x) => !x.startsWith(r.id + "-") && !x.startsWith(r.id + "."));
  const total = r.cmdBad.length + r.runtime.length + r.cfgBad.length + flagsBad.length + themeBad.length + recBad.length;
  summary.push({ id: r.id, total, r });
}
for (const { id, total, r } of summary) {
  const flagsBad = r.flags.filter((f) => HOST.contextKeys.includes(f) || !f.startsWith(r.id + "."));
  const themeBad = r.themeIds.filter((x) => !x.startsWith(r.id + "-") && !x.startsWith(r.id + "."));
  const recBad = r.recipeIds.filter((x) => !x.startsWith(r.id + "-") && !x.startsWith(r.id + "."));
  console.log(`── ${id}  需改 ${total} 处`);
  if (r.cmdBad.length) console.log(`   命令 id 不带归属 ${r.cmdBad.length}: ${r.cmdBad.join(", ")}`);
  if (r.runtime.length) console.log(`   运行时注册不带归属 ${r.runtime.length}: ${r.runtime.join(", ")}`);
  if (r.cfgBad.length) console.log(`   设置键不带归属 ${r.cfgBad.length}: ${r.cfgBad.join(", ")}`);
  if (flagsBad.length) console.log(`   旗子需处理 ${flagsBad.length}: ${flagsBad.join(", ")}`);
  if (themeBad.length) console.log(`   主题 id 不带归属 ${themeBad.length}: ${themeBad.join(", ")}`);
  if (r.iconThemeIds.length) console.log(`   图标主题 id: ${r.iconThemeIds.join(", ")}`);
  if (r.langIds.length) console.log(`   语言包 id: ${r.langIds.join(", ")}`);
  if (recBad.length) console.log(`   配方 id 不带归属 ${recBad.length}: ${recBad.slice(0, 8).join(", ")}${recBad.length > 8 ? ` …共 ${recBad.length}` : ""}`);
  if (r.langDefs.length) console.log(`   语言定义扩展名: ${r.langDefs.join(", ")}`);
  if (r.fileAssoc.length) console.log(`   文件关联: ${r.fileAssoc.join(", ")}`);
  if (r.i18nKeys) console.log(`   i18n 顶层键 ${r.i18nKeys}（跨仓不可判，只登记）`);
  console.log(`   （合规：命令 ${r.cmdOk} / 设置键 ${r.cfgOk}）`);
}
console.log(`\n[scope] 汇总（按需改处数降序）`);
for (const { id, total } of summary) console.log(`   ${String(total).padStart(4)}  ${id}`);
