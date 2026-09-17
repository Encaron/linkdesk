/**
 * 官方插件仓「非样式命名空间」清账面清单（只读）。
 * 逐仓列出：命令 id / 运行时注册 / 设置键 / 外观族 id / 上下文旗子 / 其余声明面 的合规情况。
 * 用法：node scripts/audit-plugin-scope.mjs [容器目录]   （或 npm run audit:plugin-scope）
 * ⚠️ 口径：只报「不带本插件归属」与「撞宿主保留面」两类；同插件多写点不算冲突。
 *   🔴 E6#111f／1.36 修正两条口径（原先读数虚高，且对官方仓假阳性）：
 *     ① `file.name:`（主题**显示名**）**不再是配方 id** —— 显示名不改名、不参与判据，单列一行；
 *     ② 宿主**兜底外观 id**（账四栏）从「不带归属」剔除 —— 官方 `theme-defaults` 声明宿主兜底 `light`
 *        曾被报「主题 id 不带归属 1」（**假阳性**：它是宿主亮兜底的官方实现者）⇒ 现单列
 *        「顶替宿主兜底外观 id」并逐个标 `(有证照)/(无证照)`。
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

/* 🔴 E6#111f／1.36：宿主**兜底外观 id**（账的外观四栏）——**不是「不带归属」**。
 *   插件声明它们 = 「顶替宿主兜底 id」（判据②/⑥），与「命名卫生：id 不带本仓归属」（判据①）是两件事。
 *   混报的恶果（旧口径实测）：官方 `theme-defaults` 因声明宿主兜底 `light` 被报「主题 id 不带归属 1」
 *   ——**假阳性**（它恰恰是宿主亮兜底的官方实现者，见账 appearanceIdGrants）。
 *   本探针里**从「不带归属」剔除**，单列一行「顶替宿主兜底」＋逐个标是否有证照。 */
const HOST_APPEARANCE = new Set([
  ...(HOST.appearanceRecipeIds || []),
  ...(HOST.appearanceColorwayIds || []),
  ...(HOST.appearanceIconThemeIds || []),
  ...(HOST.appearanceSentinels || []),
]);
/** 证照 = 账 `appearanceIdGrants` 的键（**按 id 记**，不是白名单——见生成器文件头） */
const HOST_APPEARANCE_GRANTED = new Set(Object.keys(HOST.appearanceIdGrants || {}));
/** 去掉前缀（`file.id:` / `colorway:`）取裸 id——专供上面的兜底比对 */
const bareId = (x) => String(x).replace(/^(file\.id:|colorway:)/, "");

const rows = [];
for (const d of fs.readdirSync(CONTAINER, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  const dir = path.join(CONTAINER, d.name);
  const man = readJsonc(path.join(dir, "plugin.json"));
  if (!man) continue;
  const id = man.pluginId || d.name;
  const c = man.contributes || {};
  const r = { id, dir: d.name, cmdBad: [], cmdOk: 0, runtime: [], cfgBad: [], cfgOk: 0,
    themeIds: [], iconThemeIds: [], langIds: [], recipeIds: [], recipeNames: [], iconKeys: [], flags: [], langDefs: [], fileAssoc: [], i18nKeys: 0 };

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
  // 主题配方实体文件（themes/*.json）里的 id / name
  // 🔴 E6#111f／1.36 拆开：`file.id:` 才是配方 id（参与归属判据）；`file.name:` 是**显示名**——
  //   它不是 id（显示名不改名、不算冲突），混进来会让「配方 id 不带归属」虚高（真值见 1.35 §十三）。
  for (const f of walk(dir, (x) => /[\\/]themes[\\/].*\.json$/.test(x))) {
    const t = readJsonc(f);
    if (t?.id) r.recipeIds.push(`file.id:${t.id}`);
    if (t?.name) r.recipeNames.push(t.name);
  }
  for (const f of walk(path.join(dir, "i18n"), (x) => x.endsWith(".json"))) {
    const j = readJsonc(f); if (j && typeof j === "object") r.i18nKeys += Object.keys(j).length;
  }
  rows.push(r);
}

const bad = (arr, reserved = []) => arr.filter((x) => reserved.some((p) => x === p || x.startsWith(p)));
/** 逐仓的「需改」派生量——两处共用（⛔ 别只改一处：汇总表与明细会两边不一致） */
const faceOf = (r) => {
  // 🔴 E6#111h／1.38：旗子分两段判——宿主**专用**（插件禁设 ⇒ 需处理）与宿主**公开约定面**
  //   （插件可设 ⇒ **不是**需处理；合成一段会把官方 `settings` 的 4 个约定面旗子报成"占宿主旗子"= 假红）。
  //   仍逐条判「不带本仓 `<pluginId>.` 归属」（🟡 黄，1.49 才收紧）。
  const flagsBad = r.flags.filter(
    (f) => HOST.contextKeysHostOnly.includes(f) || !f.startsWith(r.id + "."),
  );
  const flagsPublic = r.flags.filter((f) => HOST.contextKeysPublic.includes(f));
  // 🔴 宿主兜底外观 id 从「不带归属」里剔除（见文件上方 HOST_APPEARANCE 注释）——它们单列一行
  const themeBad = r.themeIds.filter((x) => !HOST_APPEARANCE.has(x) && !x.startsWith(r.id + "-") && !x.startsWith(r.id + "."));
  const recBad = r.recipeIds.filter((x) => !HOST_APPEARANCE.has(bareId(x)) && !x.startsWith(r.id + "-") && !x.startsWith(r.id + "."));
  const hostHits = [...r.themeIds, ...r.iconThemeIds, ...r.recipeIds.map(bareId)]
    .filter((x) => HOST_APPEARANCE.has(x))
    .map((x) => `${x}${HOST_APPEARANCE_GRANTED.has(x) ? "(有证照)" : "(无证照)"}`);
  return { flagsBad, flagsPublic, themeBad, recBad, hostHits: [...new Set(hostHits)] };
};
console.log(`[scope] 容器 ${CONTAINER} · ${rows.length} 仓\n`);
const summary = [];
for (const r of rows.sort((a, b) => (b.cmdBad.length + b.cfgBad.length + b.flags.length) - (a.cmdBad.length + a.cfgBad.length + a.flags.length))) {
  const { flagsBad, themeBad, recBad, hostHits } = faceOf(r);
  const total = r.cmdBad.length + r.runtime.length + r.cfgBad.length + flagsBad.length + themeBad.length + recBad.length + hostHits.filter((x) => !x.includes("(有证照)")).length;
  summary.push({ id: r.id, total, r });
}
for (const { id, total, r } of summary) {
  const { flagsBad, flagsPublic, themeBad, recBad, hostHits } = faceOf(r);
  console.log(`── ${id}  需改 ${total} 处`);
  if (r.cmdBad.length) console.log(`   命令 id 不带归属 ${r.cmdBad.length}: ${r.cmdBad.join(", ")}`);
  if (r.runtime.length) console.log(`   运行时注册不带归属 ${r.runtime.length}: ${r.runtime.join(", ")}`);
  if (r.cfgBad.length) console.log(`   设置键不带归属 ${r.cfgBad.length}: ${r.cfgBad.join(", ")}`);
  if (flagsBad.length) console.log(`   旗子需处理 ${flagsBad.length}: ${flagsBad.join(", ")}`);
  // 🔴 宿主**公开约定面**旗子单列——它们**不是**"需处理"（插件可设），改名归 1.46 的「零改动登记」
  if (flagsPublic.length) console.log(`   宿主约定面旗子（🔴 不是需处理——登记为公开约定面）: ${flagsPublic.join(", ")}`);
  if (themeBad.length) console.log(`   主题 id 不带归属 ${themeBad.length}: ${themeBad.join(", ")}`);
  if (r.iconThemeIds.length) console.log(`   图标主题 id: ${r.iconThemeIds.join(", ")}`);
  if (r.langIds.length) console.log(`   语言包 id: ${r.langIds.join(", ")}`);
  if (hostHits.length) console.log(`   顶替宿主兜底外观 id ${hostHits.length}: ${hostHits.join(", ")}（判据②——无证照的须改名；有证照 = 保底接替，见账 appearanceIdGrants）`);
  if (recBad.length) console.log(`   配方 id 不带归属 ${recBad.length}: ${recBad.slice(0, 8).join(", ")}${recBad.length > 8 ? ` …共 ${recBad.length}` : ""}`);
  if (r.recipeNames.length) console.log(`   主题显示名（🔴 不是 id，不参与判据）: ${r.recipeNames.join(", ")}`);
  if (r.langDefs.length) console.log(`   语言定义扩展名: ${r.langDefs.join(", ")}`);
  if (r.fileAssoc.length) console.log(`   文件关联: ${r.fileAssoc.join(", ")}`);
  if (r.i18nKeys) console.log(`   i18n 顶层键 ${r.i18nKeys}（跨仓不可判，只登记）`);
  console.log(`   （合规：命令 ${r.cmdOk} / 设置键 ${r.cfgOk}）`);
}
console.log(`\n[scope] 汇总（按需改处数降序）`);
for (const { id, total } of summary) console.log(`   ${String(total).padStart(4)}  ${id}`);
