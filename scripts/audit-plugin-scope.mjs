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
 *   🔴 E6#111n／1.47 再修正三条（原先**漏项** ⇒ 读数偏小 = **假绿**；详案 17 号档 §2.1）：
 *     ① `iconThemes[].id`（`app.iconTheme` 的取值空间）**只**参与「顶替宿主兜底」那一行——既不进任何
 *        「不带归属」腿、**也不进 `total`** ⇒ 官方 `theme-iconset-pastel` 的 `ld-iconset-pastel` 落在
 *        `total` 的**补集**里（00 档 §〇c.4 口径订正已钉死：它不是 0 处，是 **1 处**）。现补 `iconBad` 腿。
 *     ② `themes/*.json` 的 `colorways[].id`（`app.themeColor` / colors 域来源的取值空间）**根本没采**——
 *        官方 10 个主题仓的 16 条配色 id 全在读数之外。现补 `colorwayIds` 桶与 `colorwayBad` 腿。
 *     ③ 判据改成**按空间比**（原先拿四栏**并集**比）：并集会把**跨空间同名**的 id 误判成「顶替宿主兜底」
 *        ——`theme-defaults` 的**配色** id `dark` 撞进**配方**栏正是实例（就是账拆四栏要治的那个病，
 *        见 gen-host-reserved 文件头「外观族 id 的四栏」）。各空间只跟**同栏**的声明比。
 *     ⚠️ 哨兵栏（`followTheme`）**同属配方与配色两个取值空间**（`app.mixFont`/`app.mixBackground` 取配方
 *        id、`app.themeColor` 取配色 id，两处都能取到它）⇒ 进这两栏，不进图标主题栏。
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
 *   本探针里**从「不带归属」剔除**，单列一行「顶替宿主兜底」＋逐个标是否有证照。
 * 🔴 1.47 口径③：**按空间比，不拿并集比**（三个空间的取值不是一回事，见文件头三条修正）。 */
const RECIPE_SET = new Set([...(HOST.appearanceRecipeIds || []), ...(HOST.appearanceSentinels || [])]);
const COLORWAY_SET = new Set([...(HOST.appearanceColorwayIds || []), ...(HOST.appearanceSentinels || [])]);
const ICON_SET = new Set(HOST.appearanceIconThemeIds || []);
/** 空间名 → 该空间的宿主保留名集合（`badIn` / `hostHits` 共用同一张表，⛔ 别只改一处） */
const SPACE_SET = { 配方: RECIPE_SET, 配色: COLORWAY_SET, 图标主题: ICON_SET };
/** 证照 = 账 `appearanceIdGrants` 的键（**按 id 记**，不是白名单——见生成器文件头） */
const HOST_APPEARANCE_GRANTED = new Set(Object.keys(HOST.appearanceIdGrants || {}));
/** 去掉采集前缀（`file.id:` / `file.cw:` / `colorway:`）取裸 id——兜底比对与归属判据都用裸 id */
const bareId = (x) => String(x).replace(/^(file\.id:|file\.cw:|colorway:)/, "");
/** 本仓归属 = `<pluginId>-` 或 `<pluginId>.`（形状见 1.35 §12.2；与账/SDK 腿同一判据） */
const ownedBy = (x, pid) => x.startsWith(pid + "-") || x.startsWith(pid + ".");
/** 顶替宿主兜底的标注——**带空间名**：同一裸 id 可同时活在两个空间，不带空间名看不出是哪一个 */
const hitTag = (space, x) =>
  `${x}〔${space}〕${HOST_APPEARANCE_GRANTED.has(x) ? "(有证照)" : "(无证照)"}`;

const rows = [];
for (const d of fs.readdirSync(CONTAINER, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  const dir = path.join(CONTAINER, d.name);
  const man = readJsonc(path.join(dir, "plugin.json"));
  if (!man) continue;
  const id = man.pluginId || d.name;
  const c = man.contributes || {};
  const r = { id, dir: d.name, cmdBad: [], cmdOk: 0, runtime: [], cfgBad: [], cfgOk: 0,
    themeIds: [], colorwayIds: [], iconThemeIds: [], langIds: [], recipeIds: [], recipeNames: [], iconKeys: [], flags: [], langDefs: [], fileAssoc: [], i18nKeys: 0 };

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
    // 🔴 1.47 口径③：`contributes.themes[].colorways[].id` 是**配色** id（不是配方 id）——原先塞进
    //   `recipeIds` 桶（靠 `colorway:` 前缀在比对时剥回裸 id）⇒ 同名的配方/配色 id 互相顶替。
    //   现归 `colorwayIds` 桶。⚠️ 实测本容器 18 仓该字段**全空** ⇒ 改的是口径，不是数字。
    for (const cw of t.colorways || []) if (cw.id) r.colorwayIds.push(cw.id);
  }
  for (const t of c.iconThemes || []) if (t.id) r.iconThemeIds.push(t.id);
  for (const l of c.languages || []) if (l.id) r.langIds.push(l.id);
  for (const k of Object.keys(c.icons || {})) r.iconKeys.push(k);
  for (const l of c.langDefs || []) for (const e of l.extensions || []) r.langDefs.push(String(e));
  for (const a of c.fileAssociations || []) r.fileAssoc.push(String(a.extension || ""));
  // 主题配方实体文件（themes/*.json）里的 id / name / colorways[].id
  // 🔴 E6#111f／1.36 拆开：`file.id:` 才是配方 id（参与归属判据）；`file.name:` 是**显示名**——
  //   它不是 id（显示名不改名、不算冲突），混进来会让「配方 id 不带归属」虚高（真值见 1.35 §十三）。
  // 🔴 E6#111n／1.47 补漏项②：`colorways[].id` 此前**根本没采**（官方 10 个主题仓 16 条配色 id 全在
  //   读数之外 ⇒ 探针报 0 = 假绿）。它是**独立取值空间**（`app.themeColor` / colors 域来源）⇒ 独立成桶，
  //   ⛔ 不许并进 `recipeIds`（`mint-soda` 的配方 id 与配色 id 就是同一个词干，并栏必互顶）。
  for (const f of walk(dir, (x) => /[\\/]themes[\\/].*\.json$/.test(x))) {
    const t = readJsonc(f);
    if (t?.id) r.recipeIds.push(`file.id:${t.id}`);
    if (t?.name) r.recipeNames.push(t.name);
    for (const cw of Array.isArray(t?.colorways) ? t.colorways : []) {
      if (cw?.id) r.colorwayIds.push(cw.id);
    }
  }
  for (const f of walk(path.join(dir, "i18n"), (x) => x.endsWith(".json"))) {
    const j = readJsonc(f); if (j && typeof j === "object") r.i18nKeys += Object.keys(j).length;
  }
  rows.push(r);
}

const bad = (arr, reserved = []) => arr.filter((x) => reserved.some((p) => x === p || x.startsWith(p)));
/** 逐仓的「需改」派生量——**三处共用**（⛔ 别只改一处：汇总表与明细会两边不一致） */
const faceOf = (r) => {
  // 🔴 E6#111h／1.38：旗子分两段判——宿主**专用**（插件禁设 ⇒ 需处理）与宿主**公开约定面**
  //   （插件可设 ⇒ **不是**需处理；合成一段会把官方 `settings` 的 4 个约定面旗子报成"占宿主旗子"= 假红）。
  //   仍逐条判「不带本仓 `<pluginId>.` 归属」（1.49 起 SDK 腿判红，见下）。
  /* 🔴 E6#111k／1.49 口径修正（**两条腿对齐**）：约定面那一段**同时**豁免「不带归属」这一问——
   *   与 SDK 腿 `context-ownership.ts` 判据③ 逐字对齐（那边 `contextKeysPublic` 直接 `return null`：
   *   既不红也不黄）。修前这里自相矛盾：明细行写着「🔴 不是需处理——登记为公开约定面」，
   *   同一批名字却被 `!f.startsWith(...)` 算进 `flagsBad` ⇒ 官方 `settings` **需改读数 4**，
   *   而 SDK 腿对同一批名字**零报点**——两条腿一个说"要改"一个说"不用改"，谁的读数都不能当判据用。
   *   为什么约定面不该要求归属前缀（1.37 §13.5 裁决丙 ＋ 1.46 落地）：这 4 个旗子**写的人是插件、
   *   读的人是宿主命令 `when`**，事实属性就是「谁都能设、谁都能读」的**跨方约定**；
   *   给它加 `<pluginId>.` 前缀 = 把**公共契约面**私有化，下一个插件就没法再设了。 */
  const isPublicFlag = (f) => HOST.contextKeysPublic.includes(f);
  const flagsBad = r.flags.filter(
    (f) => HOST.contextKeysHostOnly.includes(f) || (!isPublicFlag(f) && !f.startsWith(r.id + ".")),
  );
  const flagsPublic = r.flags.filter(isPublicFlag);
  /* 🔴 1.47 口径③：三个外观空间**各自只跟同栏**的宿主保留名比（并集比会跨空间误判，见文件头）。 */
  const badIn = (space, ids) =>
    [...new Set(ids)].filter((x) => !SPACE_SET[space].has(x) && !ownedBy(x, r.id));
  const recipeBad = badIn("配方", [...r.themeIds, ...r.recipeIds.map(bareId)]);
  const colorwayBad = badIn("配色", r.colorwayIds);
  const iconBad = badIn("图标主题", r.iconThemeIds);
  // 顶替宿主兜底 id（账的外观四栏）——逐空间标出；**有证照**的不计入需改（见 total）
  const hostHits = [...new Set([
    ...r.themeIds.filter((x) => RECIPE_SET.has(x)).map((x) => hitTag("配方", x)),
    ...r.recipeIds.map(bareId).filter((x) => RECIPE_SET.has(x)).map((x) => hitTag("配方", x)),
    ...r.colorwayIds.filter((x) => COLORWAY_SET.has(x)).map((x) => hitTag("配色", x)),
    ...r.iconThemeIds.filter((x) => ICON_SET.has(x)).map((x) => hitTag("图标主题", x)),
  ])];
  return { flagsBad, flagsPublic, recipeBad, colorwayBad, iconBad, hostHits };
};
console.log(`[scope] 容器 ${CONTAINER} · ${rows.length} 仓\n`);
const summary = [];
for (const r of rows.sort((a, b) => (b.cmdBad.length + b.cfgBad.length + b.flags.length) - (a.cmdBad.length + a.cfgBad.length + a.flags.length))) {
  const { flagsBad, recipeBad, colorwayBad, iconBad, hostHits } = faceOf(r);
  const total = r.cmdBad.length + r.runtime.length + r.cfgBad.length + flagsBad.length
    + recipeBad.length + colorwayBad.length + iconBad.length
    + hostHits.filter((x) => !x.includes("(有证照)")).length;
  summary.push({ id: r.id, total, r });
}
for (const { id, total, r } of summary) {
  const { flagsBad, flagsPublic, recipeBad, colorwayBad, iconBad, hostHits } = faceOf(r);
  console.log(`── ${id}  需改 ${total} 处`);
  if (r.cmdBad.length) console.log(`   命令 id 不带归属 ${r.cmdBad.length}: ${r.cmdBad.join(", ")}`);
  if (r.runtime.length) console.log(`   运行时注册不带归属 ${r.runtime.length}: ${r.runtime.join(", ")}`);
  if (r.cfgBad.length) console.log(`   设置键不带归属 ${r.cfgBad.length}: ${r.cfgBad.join(", ")}`);
  if (flagsBad.length) console.log(`   旗子需处理 ${flagsBad.length}: ${flagsBad.join(", ")}`);
  // 🔴 宿主**公开约定面**旗子单列——它们**不是**"需处理"（插件可设），改名归 1.46 的「零改动登记」
  if (flagsPublic.length) console.log(`   宿主约定面旗子（🔴 不是需处理——登记为公开约定面）: ${flagsPublic.join(", ")}`);
  if (recipeBad.length) console.log(`   主题/配方 id 不带归属 ${recipeBad.length}: ${recipeBad.slice(0, 8).join(", ")}${recipeBad.length > 8 ? ` …共 ${recipeBad.length}` : ""}`);
  if (colorwayBad.length) console.log(`   配色变体 id 不带归属 ${colorwayBad.length}: ${colorwayBad.join(", ")}`);
  if (iconBad.length) console.log(`   图标主题 id 不带归属 ${iconBad.length}: ${iconBad.join(", ")}`);
  if (r.iconThemeIds.length) console.log(`   图标主题 id（全部声明）: ${r.iconThemeIds.join(", ")}`);
  if (r.langIds.length) console.log(`   语言包 id: ${r.langIds.join(", ")}`);
  if (hostHits.length) console.log(`   顶替宿主兜底外观 id ${hostHits.length}: ${hostHits.join(", ")}（判据②——无证照的须改名；有证照 = 保底接替，见账 appearanceIdGrants）`);
  if (r.recipeNames.length) console.log(`   主题显示名（🔴 不是 id，不参与判据）: ${r.recipeNames.join(", ")}`);
  if (r.langDefs.length) console.log(`   语言定义扩展名: ${r.langDefs.join(", ")}`);
  if (r.fileAssoc.length) console.log(`   文件关联: ${r.fileAssoc.join(", ")}`);
  if (r.i18nKeys) console.log(`   i18n 顶层键 ${r.i18nKeys}（跨仓不可判，只登记）`);
  console.log(`   （合规：命令 ${r.cmdOk} / 设置键 ${r.cfgOk}）`);
}
console.log(`\n[scope] 汇总（按需改处数降序）`);
for (const { id, total } of summary) console.log(`   ${String(total).padStart(4)}  ${id}`);
