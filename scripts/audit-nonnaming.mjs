/**
 * 非样式命名空间普查探针（第 0 格立；E6#111b／1.32 搬进仓内 ＋ 修命令家族字段）。
 * 只读：扫官方 18 仓 + 壳仓自身的「公共花名册」写入面，报「多方独立定义同一名字」。
 *
 * 用法：
 *   npm run audit:nonnaming                # 全部（人读）
 *   npm run audit:nonnaming:json           # 机读（每个家族一行 JSON）
 *   node scripts/audit-nonnaming.mjs [容器目录] [--json]   # 显式指定插件容器
 * ⚠️ 本脚本**只报读数，不含判据**（判据在总方案里；本轴的门禁 = SDK 腿 `check-command-ownership`
 *    ＋ 壳仓 `scripts/gen-host-reserved.mjs --check`）。
 *
 * ── 🔴 2026-09-17 搬迁与修正（E6#111b · 轮次 1.32）──
 *   ① **搬进仓内**：原在 `scratch/`（**gitignore**），却被 00 档 §八 ＋ 20 份任务书引作本轴「总探针」
 *      ⇒ 换机器 / 别人 clone 后**文件根本不存在**（`check-doc-links` 只管 `docs/` 互链，看不见
 *      「文档 → 脚本」）。与 2026-09-17 搬 `audit-plugin-scope.mjs` 同一个病，同笔处置。
 *   ② **命令家族读错了字段**：原 `:74` 读 **`x.command`**，而声明面的真字段是 **`id`**
 *      （`plugin.schema.json` 的 `required:["id","title"]`；消费方 `contributions.ts` 读 `cmd.id`）
 *      ⇒ `x.command` **恒 undefined** ⇒ 那个桶里实际只有 `:97` 塞进来的 `menus[].command`
 *      ⇒ 探针报的「命令 id 独立名 12」其实是**菜单引用数**，不是声明的 35。
 *   ③ **命令家族分三行报**（口径不同，别混）：
 *      · **声明面** = `contributes.commands[].id`（**归属的权威面**，loader 用真身份注册）；
 *      · **运行时面** = 源码里 `registerCommand("<字面量>")` 的调用点（改名要同笔改的另一半）；
 *      · **引用面** = `contributes.menus[].command` / `keybindings[].command`（**引用**，不是定义；
 *        撞宿主命中它只说明"引用了宿主命令"，不构成顶替）。
 *      ⇒ ⑩ 的「插件 ∩ 宿主」从**名字面**（声明 ∪ 运行时）算——**引用面单列**，不许混进来
 *        （1.31 §9.3 的连带缺陷正是「拿引用面当名字面」）。
 *
 * ── 🔴 2026-09-17 口径修正（E6#111f · 轮次 1.36）──
 *   ① **③e 主题配方 id**：原 `:160-161` 把 `theme.name`（**显示名**）也塞进 `recipeIds` 桶
 *      ⇒ ③e 读 **20**（真值 **10**）。现只收 `id`；显示名单列一行 ③e′（**不是 id，不参与归属判据**）。
 *   ② **③d 语言包 id**：原 `:116` 把 `langDefs[].id`（`python`）混进 `langCodes` ⇒ ③d 读 **4**
 *      （真值 **3**）。`LangDefRegistry` 按**扩展名**作键 ⇒ 那个字段根本不是名字空间，现剔除。
 *   ③ **⑩b** 并上外观两栏（配方 / 图标主题）——账 1.36 拆栏后，这正是「插件声明 ∩ 宿主兜底」的读数点。
 *      同笔**减证照**（`appearanceIdGrants`）：不减 ⇒ 官方 `theme-defaults` 声明宿主亮色兜底 `light`
 *      被读成顶替者（假红）——它恰恰是那条 id 的**持证照实现者**。读数行会另记「持证照」项。
 *
 * ── 口径（本脚本自报，读数别跨口径引用）──
 *   · **处**（site）= 出现点个数；**名**（name）= 去重后的名字个数；**多方共写** = 被 ≥2 个来源写的名字数。
 *   · 一个「来源」= 插件 id（壳仓自身面 = 文件路径）；i18n 面按 `id#目录/文件` 记。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OFFICIAL = process.env.LDK_PLUGINS_DIR || "E:/linkdesk-plugins/official";
const JSON_OUT = process.argv.includes("--json");
/** 显式容器目录（第一个非 `--` 开头的参数；缺省 = LDK_PLUGINS_DIR / 官方容器） */
const CONTAINER = process.argv.slice(2).find((a) => !a.startsWith("--")) || OFFICIAL;

/* ── 工具 ── */
function readJsonc(p) {
  let raw;
  try { raw = fs.readFileSync(p, "utf8"); } catch { return null; }
  // 去块注释 + 行注释 + 尾逗号（JSONC 子集，够 plugin.json 用）
  raw = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1").replace(/,(\s*[}\]])/g, "$1");
  try { return JSON.parse(raw); } catch { return null; }
}
function walk(dir, filter, out = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}
/** 收集 {name -> [sources]} */
function bucket(map, name, src) {
  if (!name || typeof name !== "string") return;
  const list = map.get(name);
  if (list) { if (!list.includes(src)) list.push(src); }
  else map.set(name, [src]);
}
function report(title, map, { showAll = false, limit = 25, sites = null } = {}) {
  const dupes = [...map.entries()].filter(([, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length);
  if (JSON_OUT) { console.log(JSON.stringify({ [title]: { sites, total: map.size, dupes: Object.fromEntries(dupes) } })); return dupes; }
  console.log(`\n### ${title}`);
  console.log(`   独立名 ${map.size}${sites === null ? "" : ` · 处 ${sites}`} · 多方共写 ${dupes.length}`);
  const rows = showAll ? dupes : dupes.slice(0, limit);
  for (const [n, v] of rows) console.log(`   • ${n}  ← ${v.join(" | ")}`);
  if (dupes.length > rows.length) console.log(`   … 其余 ${dupes.length - rows.length} 条`);
  return dupes;
}

/* ── 1. 插件仓收集 ── */
const pluginDirs = fs.existsSync(CONTAINER)
  ? fs.readdirSync(CONTAINER, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(CONTAINER, e.name))
  : [];
const plugins = [];
for (const dir of pluginDirs) {
  const manifest = readJsonc(path.join(dir, "plugin.json"));
  if (!manifest) continue;
  plugins.push({ dir, id: manifest.pluginId || path.basename(dir), manifest });
}
console.error(`[probe] 官方插件仓 ${plugins.length} 只（容器 ${CONTAINER}）`);

/* ── 2. 各类名字空间 ── */
const cmdDeclared = new Map(), cmdRuntime = new Map(), cmdRefs = new Map(),
  configKeys = new Map(), themeIds = new Map(), iconThemeIds = new Map(),
  sharedIconIds = new Map(), langCodes = new Map(), recipeIds = new Map(), viewIds = new Map(),
  recipeDisplayNames = new Map(),
  containerIds = new Map(), menuSlots = new Map(), titleBarSlots = new Map(), langDefExts = new Map(),
  fileAssocExts = new Map(), keyStrings = new Map(), i18nTopKeys = new Map(), contextKeysSet = new Map(),
  protocolIds = new Map();
/** 三个命令面的「处」（站点）计数——`bucket` 去重，处要另记 */
const cmdSites = { declared: 0, runtime: 0, refs: 0 };

for (const p of plugins) {
  const c = p.manifest.contributes || {};
  // ①a 声明面：真字段是 `id`（原 `x.command` 恒 undefined —— 见文件头 ②）
  for (const x of c.commands || []) { cmdSites.declared++; bucket(cmdDeclared, x.id ?? x.command, p.id); }
  // 配置面：configuration = { title, properties }（schema 实测为对象，不是数组）
  const cfg = c.configuration;
  const cfgList = Array.isArray(cfg) ? cfg : cfg ? [cfg] : [];
  for (const x of cfgList) for (const k of Object.keys(x?.properties || {})) bucket(configKeys, k, p.id);
  for (const x of c.themes || []) bucket(themeIds, x.id, p.id);
  for (const x of c.iconThemes || []) bucket(iconThemeIds, x.id, p.id);
  for (const k of Object.keys(c.icons || {})) bucket(sharedIconIds, k, p.id);
  for (const x of c.languages || []) bucket(langCodes, x.id, p.id);
  for (const x of c.langDefs || []) {
    for (const e of x.extensions || []) bucket(langDefExts, String(e).replace(/^\./, "").toLowerCase(), p.id);
    for (const e of x.filenamePatterns || []) bucket(langDefExts, String(e), p.id);
    // 🔴 `langDefs[].id` **不是名字空间**（`LangDefRegistry` 按**扩展名**作键——E6#111f／1.36 §二.5）
    //   ⇒ 不许并进语言码家族。原先这里 `bucket(langCodes, x.id)` 把 `python` 混进来，③d 读 4（真值 3）。
  }
  for (const x of c.fileAssociations || []) bucket(fileAssocExts, String(x.extension || "").replace(/^\./, "").toLowerCase(), p.id);
  for (const x of c.keybindings || []) {
    bucket(keyStrings, x.key, p.id);
    if (x.command) { cmdSites.refs++; bucket(cmdRefs, x.command, p.id); } // ①c 引用面（键位）
  }
  for (const [containerId, defs] of Object.entries(c.views || {})) {
    bucket(containerIds, containerId, p.id);
    for (const v of defs || []) bucket(viewIds, v.id, p.id);
  }
  for (const id of Object.keys(c.viewsContainers || {})) bucket(containerIds, id, p.id);
  for (const [menuId, items] of Object.entries(c.menus || {})) {
    bucket(menuSlots, menuId, p.id);
    for (const it of items || []) if (it.command) { cmdSites.refs++; bucket(cmdRefs, it.command, p.id); } // ①c 引用面（菜单）
  }
  for (const side of ["left", "right"]) for (const x of c.titleBar?.[side] || []) bucket(titleBarSlots, side, p.id);
  if (c.floatingPanel?.viewId) bucket(viewIds, c.floatingPanel.viewId, p.id);
  // 协议 id（E6#111b 判据⑦：与命令 id 同族——全局名册的键）
  for (const x of c.protocols || []) bucket(protocolIds, x.id, p.id);
  // i18n 顶层键（contributes.i18n 声明面 + i18n/ 目录实体）
  const i18nDir = path.join(p.dir, "i18n");
  for (const f of walk(i18nDir, (x) => x.endsWith(".json"))) {
    const data = readJsonc(f);
    if (data && typeof data === "object") for (const k of Object.keys(data)) bucket(i18nTopKeys, k, `${p.id}#${path.basename(path.dirname(f))}/${path.basename(f)}`);
  }
}
// ①b 运行时面：源码里 registerCommand("<字面量>")（与壳仓 audit-plugin-scope / SDK 腿同一条正则口径）
for (const p of plugins) {
  for (const f of walk(path.join(p.dir, "src"), (x) => /\.(ts|tsx|js|jsx)$/.test(x))) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/registerCommand\s*\(\s*["'`]([^"'`]+)["'`]/g)) {
      cmdSites.runtime++;
      bucket(cmdRuntime, m[1], `${p.id}:${path.relative(p.dir, f)}`);
    }
    for (const m of src.matchAll(/registerProtocol\s*\(\s*\{[\s\S]{0,400}?\bid\s*:\s*["'`]([^"'`]+)["'`]/g)) {
      bucket(protocolIds, m[1], `${p.id}:${path.relative(p.dir, f)}`);
    }
  }
}
// 主题配方 id（主题插件仓根 themes/*.json 或 i18n 同目录）
// 🔴 只收 `t.id`——`t.name` 是**显示名**，不是 id（E6#111f／1.36 探针口径修正）。原先两行合收
//   把 10 个配方名灌成 20，③e 读 20（真值 10）；显示名另有去处（设置页显示的是 name，
//   改名不动它 —— 见 1.35 §12.3）。
for (const p of plugins) {
  for (const f of walk(p.dir, (x) => /themes[\\/].*\.json$/.test(x))) {
    const t = readJsonc(f);
    if (t && t.id) bucket(recipeIds, t.id, p.id);
    if (t && t.name) bucket(recipeDisplayNames, t.name, p.id);
  }
}
// contextKey.set(...) 插件侧调用
for (const p of plugins) {
  for (const f of walk(path.join(p.dir, "src"), (x) => /\.(ts|tsx|js|jsx)$/.test(x))) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/contextKey\s*[?.]*\s*\.\s*set\s*\(\s*["'`]([^"'`]+)["'`]/g)) {
      bucket(contextKeysSet, m[1], `${p.id}:${path.relative(p.dir, f)}`);
    }
  }
}
// 插件语言包（contributes.languages 之外的 i18n 面）——注册文件形式
for (const p of plugins) {
  for (const f of walk(p.dir, (x) => /i18n[\\/].*\.json$/.test(x))) {
    const data = readJsonc(f);
    if (data && typeof data === "object") {
      for (const k of Object.keys(data)) bucket(i18nTopKeys, k, `${p.id}#${path.basename(path.dirname(f))}/${path.basename(f)}`);
    }
  }
}

/* ── 3. 壳仓自身写入的名字（对照面） ── */
const hostCommands = new Map(), hostConfigKeys = new Map(), hostMenuSlots = new Map();
for (const f of walk(path.join(ROOT, "src", "core"), (x) => /\.ts$/.test(x) && !/\.test\./.test(x))) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/\bid:\s*["'`]([^"'`]+)["'`]/g)) {
    // 只在像命令注册的地方收（同文件里出现 registerCommand / ensureCommand）
    if (/registerCommand|CommandRegistry|ensureCoreCommands|CommandMeta/.test(src)) bucket(hostCommands, m[1], path.relative(ROOT, f));
  }
  for (const m of src.matchAll(/key:\s*["'`](app\.[^"'`]+)["'`]/g)) bucket(hostConfigKeys, m[1], path.relative(ROOT, f));
}
for (const f of walk(path.join(ROOT, "src"), (x) => /\.tsx?$/.test(x) && !/\.test\./.test(x))) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/MENU_SLOTS\s*\[\s*\w+\s*\]\s*=\s*["'`]([^"'`]+)["'`]/g)) bucket(hostMenuSlots, m[1], path.relative(ROOT, f));
}
// MENU_SLOTS 常量对象
const msFile = path.join(ROOT, "src", "core", "registry", "commands", "MenuRegistry.ts");
const msSrc = fs.existsSync(msFile) ? fs.readFileSync(msFile, "utf8") : "";
for (const m of msSrc.matchAll(/["'`]([a-zA-Z0-9._-]+)["'`]\s*:\s*["'`]/g)) bucket(hostMenuSlots, m[1], "MenuRegistry.ts");

/* ── 4. 报告 ── */
if (!JSON_OUT) console.log("=".repeat(78));
report("①a 命令 id·声明面（contributes.commands[].id）", cmdDeclared, { sites: cmdSites.declared });
report("①b 命令 id·运行时面（源码 registerCommand 字面量）", cmdRuntime, { sites: cmdSites.runtime });
report("①c 命令 id·引用面（menus[].command ＋ keybindings[].command —— 引用不是定义）", cmdRefs, { sites: cmdSites.refs });
report("② 设置键（contributes.configuration.*.key）", configKeys);
report("③a 主题 id（contributes.themes[].id）", themeIds, { showAll: true });
report("③b 图标主题 id（contributes.iconThemes[].id）", iconThemeIds, { showAll: true });
report("③c 共享图标 id（contributes.icons）", sharedIconIds);
report("③d 语言包 id（contributes.languages[].id）", langCodes, { showAll: true });
report("③e 主题配方 id", recipeIds, { showAll: true });
report("③e′ 主题显示名（`theme.name`——🔴 **不是 id**，单列只为对照，不参与任何归属判据）", recipeDisplayNames, { showAll: true });
report("③f 协议 id（contributes.protocols[].id ＋ 源码 registerProtocol 字面量）", protocolIds, { showAll: true });
report("④ 插件设置的 context key（contextKey.set）", contextKeysSet, { showAll: true });
report("⑤ i18n 顶层键", i18nTopKeys, { limit: 15 });
report("⑥ 快捷键 key 串（contributes.keybindings[].key）", keyStrings);
report("⑦a 视图 id（contributes.views[].id）", viewIds);
report("⑦b 视图容器 id", containerIds, { showAll: true });
report("⑧a 菜单菜单槽 id（contributes.menus 的键）", menuSlots, { showAll: true });
report("⑧b 标题栏槽 id（contributes.titleBar）", titleBarSlots, { showAll: true });
report("⑨ 语言扩展名（contributes.languages[].extensions）", langDefExts);

/* ── 5. 与宿主命名的交集 ── */
if (!JSON_OUT) {
  console.log("\n### ⑩ 插件名字 ∩ 宿主名字（跨方交集）");
  const inter = (a, b, label) => {
    const hits = [...a.keys()].filter((k) => b.has(k));
    console.log(`   ${label}: ${hits.length}${hits.length ? " → " + hits.slice(0, 30).join(", ") : ""}`);
  };
  // 🔴 名字面 = 声明 ∪ 运行时（引用面**不并入**——见文件头 ③）
  const cmdNames = new Map([...cmdDeclared, ...cmdRuntime]);
  inter(cmdNames, hostCommands, "命令 id（声明∪运行时）插件∩宿主");
  inter(cmdRefs, hostCommands, "命令引用面 插件∩宿主（引用宿主命令 = 合法，仅报读数）");
  inter(configKeys, hostConfigKeys, "设置键 插件∩宿主(app.*)");
  inter(menuSlots, hostMenuSlots, "菜单槽 插件∩宿主");
  console.log(
    `   宿主面（**本脚本就地扫**，射程有限）已注册命令 id ${hostCommands.size} · 宿主 app.* 设置键 ${hostConfigKeys.size} · 宿主菜单槽 ${hostMenuSlots.size}` +
      `\n   ⚠️ 上表后两行恒 0 = **扫不到**（宿主设置键不写成 \`key: "app.x"\` 字面量），不是"事实为 0"——权威宿主面见 ⑩b`,
  );
  console.log(
    `   命令面口径：声明面 处 ${cmdSites.declared} / 名 ${cmdDeclared.size} · 运行时面 处 ${cmdSites.runtime} / 名 ${cmdRuntime.size}` +
      ` · 引用面 处 ${cmdSites.refs} / 名 ${cmdRefs.size}` +
      `\n   （修前那行「命令 id 独立名 12」读的是 **引用面**，不是声明面——见文件头 ②）`,
  );

  /* ── ⑩b 账背对账：宿主面**读生成式账**（权威），不再靠就地扫 ──
     🔴 修前 ⑩ 的「命令 id 插件∩宿主: 0」是拿**错集合**（引用面）算的，且宿主设置键面恒 0（扫不到）
        ⇒ 那句「跨方交集 0」当时**没被验证**。此块把它改成拿账算——账是生成式的（`npm run audit:plugin-scope:regen`），
        账 ↔ 实况由 `gen-host-reserved.mjs --check` 兜住。本块仍**只报读数，不含判据**。 */
  let ledger = null;
  try {
    ledger = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "host-reserved.json"), "utf8"));
  } catch {
    ledger = null;
  }
  console.log("\n### ⑩b 插件名字 ∩ 宿主保留名**账**（宿主面 = 生成式账，权威）");
  if (!ledger) {
    console.log("   ⚠️ 账没读到（scripts/host-reserved.json）——本块全部空转，**别把缺读数当 0**");
  } else {
    const hostFaces = [
      { label: "命令 id·声明∪运行时", map: cmdNames, keys: ledger.commandPrefixes, mode: "prefix" },
      { label: "命令 id·引用面", map: cmdRefs, keys: ledger.commandPrefixes, mode: "prefix" },
      { label: "设置键", map: configKeys, keys: ledger.configKeys, mode: "exact" },
      { label: "context key·宿主专用", map: contextKeysSet, keys: ledger.contextKeysHostOnly, mode: "exact" },
      { label: "context key·宿主约定面", map: contextKeysSet, keys: ledger.contextKeysPublic, mode: "exact" },
      { label: "协议 id", map: protocolIds, keys: ledger.protocolIds, mode: "exact" },
      // E6#111f／1.36：外观两栏并对（配方 / 图标主题）——🔴 **配方栏只跟配方栏比**（配色 id 是另一个
      //   名字空间，合栏 = 官方 theme-defaults 的配色 `dark` 假红，见生成器文件头）
      //   🔴 两栏都**减证照**（`grants`）——`appearanceIdGrants` 是**按 id 记**的正当持有者
      //   （`light` ⇐ theme-defaults，它是宿主亮色兜底的官方实现者）：不减 = 把官方实现者报成顶替者
      //   ⇒ **假红**，而假红会让真红失效（账文件头同款纪律）。
      { label: "配方 id ∩ 兜底配方栏", map: recipeIds, keys: ledger.appearanceRecipeIds, mode: "exact", grants: ledger.appearanceIdGrants },
      { label: "图标主题 id ∩ 保底栏", map: iconThemeIds, keys: ledger.appearanceIconThemeIds, mode: "exact", grants: ledger.appearanceIdGrants },
    ];
    /** 该 id 的**声明者里至少有一个没证照** ⇒ 才算真命中（证照按 id 记，见 ⑩b 上注） */
    const hasUngrantedDeclarer = (f, id) => {
      const holders = f.grants?.[id];
      if (!holders) return true;
      return [...(f.map.get(id) ?? [])].some((pid) => !holders.includes(pid));
    };
    for (const f of hostFaces) {
      const keys = f.keys || [];
      const raw = f.mode === "prefix"
        ? [...f.map.keys()].filter((k) => keys.some((p) => k.startsWith(p)))
        : [...f.map.keys()].filter((k) => keys.includes(k));
      const hits = f.grants ? raw.filter((k) => hasUngrantedDeclarer(f, k)) : raw;
      const granted = f.grants ? raw.filter((k) => !hasUngrantedDeclarer(f, k)) : [];
      console.log(
        `   ${f.label} ∩ 账（宿主 ${keys.length} 项）= ${hits.length}${hits.length ? " → " + hits.slice(0, 30).join(", ") : ""}` +
          (granted.length ? `（另有 ${granted.length} 项**持证照**、合法：${granted.join(", ")}）` : ""),
      );
    }
    const pseudo = ledger.pseudoPluginIds || [];
    const idHits = plugins.map((p) => p.id).filter((id) => pseudo.includes(id));
    console.log(`   插件 pluginId ∩ 账·宿主伪 id（${pseudo.length} 个）= ${idHits.length}${idHits.length ? " → " + idHits.join(", ") : ""}`);
    if (JSON_OUT) {
      console.log(JSON.stringify({
        "⑩b": {
          ledgerFamilies: Object.keys(ledger).filter((k) => k !== "$comment"),
          commandDeclared: { sites: cmdSites.declared, names: cmdDeclared.size },
          commandRuntime: { sites: cmdSites.runtime, names: cmdRuntime.size },
          commandRefs: { sites: cmdSites.refs, names: cmdRefs.size },
        },
      }));
    }
  }

  console.log("\n### ⑪ 宿主 context key 写入点（供插件避免占用）");
  const ckFiles = walk(path.join(ROOT, "src"), (x) => /\.tsx?$/.test(x) && !/\.test\./.test(x));
  const hostCk = new Map();
  for (const f of ckFiles) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/ContextKeyService\.setValue\(\s*["'`]([^"'`]+)["'`]/g)) bucket(hostCk, m[1], path.relative(ROOT, f));
    for (const m of src.matchAll(/contextKey[?.]*\.set[?.]*\(\s*["'`]([^"'`]+)["'`]/g)) bucket(hostCk, m[1], path.relative(ROOT, f));
  }
  for (const [k, v] of [...hostCk.entries()].sort()) console.log(`   • ${k}  ← ${v.join(" | ")}`);

  console.log("\n### ⑫ when 子句里被宿主导读的 key（宿主菜单/命令）");
  const whenKeys = new Map();
  for (const f of ckFiles) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/when:\s*["'`]([^"'`]+)["'`]/g)) {
      for (const t of m[1].split(/[^A-Za-z0-9_]+/)) {
        if (!t || ["true", "false", "and", "or", "not", "in", "regex"].includes(t)) continue;
        if (/^[a-z]/.test(t)) bucket(whenKeys, t, path.relative(ROOT, f));
      }
    }
  }
  for (const [k, v] of [...whenKeys.entries()].sort()) console.log(`   • ${k}  ← ${v.length} 处`);
}
