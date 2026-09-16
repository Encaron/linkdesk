#!/usr/bin/env node
/**
 * 宿主保留面账（`scripts/host-reserved.json`）——**生成 ＋ 四向对账**。
 *
 * 是什么：宿主自己占用的名字，分九个家族——命令前缀 / `app.*` 配置键 / 伪 pluginId /
 *   context key / **兜底外观 id 四栏**（配方 / 配色 / 图标主题 / 哨兵）/ 内置协议 id。
 *   插件不得占用这些名字；改动本账 = 一次公共面决策。
 * 出处与判据（唯一真源，本文不重述）：`docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/非样式命名空间归一化/02-任务-命令id归属落地.md` §六
 *   ＋ 1.31 评估档 §八（机制 A：宿主保留名账进 SDK）。
 *
 * ── 角色变更（E6#111b）──
 *   E6#109j 时它只是**生成侧原型**（文件头自述「只写不读」「无开关、无自测」）；1.32 升为**门禁**：
 *     · 默认跑        = 生成：写壳账 ＋ SDK 副本 ＋ 运行时模块（`npm run audit:plugin-scope:regen`）
 *     · `--check`     = 只读对账，挂 `npm run check`
 *     · `--self-test` = 正控 4 ＋ 负控 13（正控绿 / 负控红）
 *
 * ── 四向对账（`--check` 的判据）──
 *   ① **实况 → 账**：现场重扫（壳源码）扫到、账里没有 ⇒ 红。典型成因：改了宿主命令/设置面**忘了重跑**。
 *   ② **账 → 实况**：账里列了、现场扫不到 ⇒ 红。典型成因：账陈旧、被人手改、那条已被删。
 *   ③ **SDK 副本 ↔ 壳账**：`packages/plugin-sdk/schemas/host-reserved.json` 与壳账**逐字节**相等。
 *      🔴 这一向不是冗余：副本随 npm 包下发，漂了 = **第三方作者读到的判据是过期的**（那一侧的校验
 *      永远绿，而门禁以为自己守住了）。照 `reserved-class-names.json` 的单一真相源形状。
 *   ④ **运行时模块 ↔ 壳账**（E6#111d／1.34 新增）：`src/core/registry/host-reserved.generated.ts`
 *      与账的 `configKeys` / `pseudoPluginIds` / **外观四栏 ＋ 证照**（1.36 起）**逐元素**相等。
 *      壳运行时判保护区读的就是它——
 *      漂了 = **运行时拦的和门禁报的不是同一本账**（最坏的那种漂：两边都「绿」）。
 *   外加两条「不许静默放过」的守门（照 `check-reserved-names-doc-sync.mjs` 的 `table-missing` 口径）：
 *     · 家族**整段缺失** ⇒ 红（段被删/改名，后面的逐条比对就没有意义了）；
 *     · 家族**为空数组** ⇒ 红（扫描器瞎了、目录被搬走时，空家族会**假装**对账通过——这条是给
 *       「宿主把 `src/core/commands` 挪个位置」这类重构留的报警器）。
 *
 * ── 第四份产物：运行时保留面模块（E6#111d／1.34 新增）──
 *   `src/core/registry/host-reserved.generated.ts`——壳**运行时**判保护区用的静态副本（只带
 *   `configKeys` ＋ `pseudoPluginIds` ＋ 外观四栏/证照）。**为什么必须有**：宿主真键里有**从未被注册**的
 *   `app.schemaVersion`（`settings.json` 的内部标志键，设置 UI 不可见），靠「宿主注册在先」这条
 *   顺序事实判不出来，而**正确性不许押在注册顺序上**（1.33 §11.1 裁决）⇒ 只剩「生成式静态常量」这条路。
 *
 * ── `configKeys` 家族的扫描口径（1.34 扩宽：28 → 35）──
 *   ① `src/App/config/**` **非测试**文件的 `"app.*"` 字面量（含迁移点名的**退役键**——退役键不腾位）
 *   ② `src/App/startup.ts` 的 `"app.*"` 字面量（含仍在读/删的退役键，如 `app.themeColorMode`）
 *   ③ `SCHEMA_VERSION_KEY` 的值（未注册的内部标志键）
 *   🔴 **口径为什么是「文件清单」而不是「src 全域」**：实测 src/ 全域另有一批**同名不同物**的
 *     `app.*` 字面量——命令 id（`app.about` / `app.viewLicense`）、主题种子 token（`app.surfaceTexture`）、
 *     测试夹具（`app.staleA` / `app.staleB` / `app.extra` / `app.plain`）⇒ 全扫会把它们灌进配置键家族
 *     （**假账**：无辜插件会被拒），比缺口更坏。
 *   ⚠️ ② 取**任意形态**（不限于 `"app.x": {`）是有意的：错放 = 名字多保留一个（账 diff 里看得见）；
 *     错漏 = 插件**静默顶替**宿主键（看不见）。两害相权取保守的一侧。
 *
 * ── 外观族 id 的四栏 ＋ 证照（1.36 拆栏）──
 *   旧账只有一栏 `appearanceIds`（[dark, dark-fallback, light]）——那是**两个名字空间挤在一栏**：
 *   配方 id（`app.theme` 的取值）与配色变体 id（`app.themeColor` / colors 域来源的取值）。
 *   🔴 不合栏 ⇒ 官方 `theme-defaults` 的**配色** id `dark` 会撞进配方栏 ⇒ **当场假红**
 *   （而它恰恰是宿主亮兜底的官方实现者）。⇒ 拆四栏，各栏只跟同空间的声明比：
 *     · `appearanceRecipeIds`    配方 id（`app.theme` 取值空间）
 *     · `appearanceColorwayIds`  配色变体 id（`app.themeColor` / colors 域来源取值空间）
 *     · `appearanceIconThemeIds` 图标主题保底哨兵（`app.iconTheme` 取值空间）
 *     · `appearanceSentinels`    混搭来源哨兵（`app.themeColor` / `app.mix*` 的哨兵值——**不是 id**）
 *   🔴 另加一份 `appearanceIdGrants`：**按 id 记证照**（id → 宿主之外的正当持有者）。它不是白名单，
 *     不记「哪些仓被宽恕」——新插件永远不在表里，永远判红。今天唯一的证照 = `light` → `theme-defaults`。
 *
 * ── 口径 ──
 *   九个家族比的都是**名字集合**（生成侧已去重 ＋ 字典序排序）；**顺序不同不算漂移，多一个少一个才算**。
 *   本账记的是「有哪些名字」（名），不是「出现过几处」（处/站点）——数量口径的读数在探针
 *   `scripts/audit-plugin-scope.mjs` 出，两者的口径不可互相引用。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");

/** 壳账（生成式产物，唯一真相源） */
const LEDGER_REL = "scripts/host-reserved.json";
/** SDK 副本（随包下发，与壳账逐字节相等） */
const SDK_REL = "packages/plugin-sdk/schemas/host-reserved.json";
/** 运行时副本（壳运行时判保护区读它——见文件头「第四份产物」） */
const RUNTIME_REL = "src/core/registry/host-reserved.generated.ts";

/** 九个家族——键名 ＋ 中文标签（报错文本与自测共用，避免两处各写一份） */
export const FAMILIES = [
  { key: "commandPrefixes", label: "宿主命令前缀" },
  { key: "configKeys", label: "宿主 app.* 配置键" },
  { key: "pseudoPluginIds", label: "宿主伪 pluginId" },
  { key: "contextKeys", label: "宿主机读/写的 context key" },
  { key: "appearanceRecipeIds", label: "宿主兜底配方 id" },
  { key: "appearanceColorwayIds", label: "宿主兜底配色变体 id" },
  { key: "appearanceIconThemeIds", label: "宿主保底图标主题 id" },
  { key: "appearanceSentinels", label: "宿主外观哨兵值" },
  { key: "protocolIds", label: "宿主内置协议 id" },
];

/** 外观四栏的键名（证照校验与运行时渲染共用——⛔ 别在别处再写一份字面量） */
export const APPEARANCE_COLUMNS = [
  "appearanceRecipeIds",
  "appearanceColorwayIds",
  "appearanceIconThemeIds",
  "appearanceSentinels",
];

/** 四栏 → 运行时模块里的**空间名**（与 APPEARANCE_COLUMNS **同序**，第 i 项一一对应） */
export const APPEARANCE_SPACES = ["recipe", "colorway", "iconTheme", "sentinel"];

/**
 * 外观 id 的**证照**（id → 宿主之外的正当持有者）——「谁有资格声明这个宿主兜底 id」。
 * 🔴 **不是白名单**：它按 **id** 记持有者，不记「哪些仓被宽恕」⇒ 新插件永远不在表里、永远判红。
 * 今天唯一一条：`light` → `theme-defaults`——**它是宿主亮兜底的官方实现者**（插件加载后注册同名配方
 *   `light` 接替壳兜底，是设计里的交接，不是顶替）。没有这条证照，官方 `theme-defaults` 会被当场判红。
 * ⚠️ 改这张表 = 改判据（一次公共面决策）：每个 id 必须同时出现在四栏之一，否则对账报 `grant-dangling`。
 */
export const APPEARANCE_ID_GRANTS = { light: ["theme-defaults"] };

/** 取一段函数的函数体（花括号配对）——⛔ 别用「从某处起切 N 个字符」：切口长度是猜的，
 *  函数一改长就把后面的东西切掉（1.35 §十五.3 记的旧缺陷）。找不到函数头 ⇒ 返回 ""（由 family-empty 兜）。 */
function functionBodyAt(src, header) {
  const at = src.indexOf(header);
  if (at < 0) return "";
  const open = src.indexOf("{", at);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return "";
}

/** 取一个对象字面量的原文（从 afterAt 之后的第一个 `{` 起，花括号配对）——外观登记项解析用 */
function objectLiteralAt(src, afterAt) {
  const open = src.indexOf("{", afterAt);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return "";
}

const LEDGER_COMMENT =
  "宿主保留面账（生成式·定稿 E6#111b／1.32）——插件不得占用这些名字；改动本账 = 一次公共面决策，" +
  "改完壳仓命令/设置/协议面必须重跑 scripts/gen-host-reserved.mjs（npm run audit:plugin-scope:regen）。" +
  "⚠️ configKeys 含**退役键**（曾被宿主使用、现已不再写入的键）：退役键**不腾出保留面**——" +
  "老 settings.json 里可能还留着值，插件此刻占它 = 顶掉的是宿主的历史数据（且迁移代码仍会读它）。";

function walk(dir, f, out = []) {
  let e;
  try {
    e = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const x of e) {
    if (["node_modules", ".git", "dist"].includes(x.name)) continue;
    const p = path.join(dir, x.name);
    if (x.isDirectory()) walk(p, f, out);
    else if (f(p)) out.push(p);
  }
  return out;
}

/** 读一个文件，读不到返回 ""（扫描源缺失 ⇒ 少几条账项，由对账的 family-empty／ledger-missing 兜） */
function tryRead(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

/**
 * 现场重扫壳仓 → 账对象（九个家族，均已去重 ＋ 字典序）。
 * ⚠️ 扫描口径就是本函数：**改了扫描口径 = 改了公共面判据**，同笔在 §六 记一笔。
 * @param {string} [root] 壳仓根（自测可传 fixture 根；不传 = 真仓）
 */
export function collectHostReserved(root = ROOT) {
  /* ① 宿主命令前缀 */
  const prefix = new Set();
  for (const f of walk(path.join(root, "src", "core", "commands"), (x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
    for (const m of fs.readFileSync(f, "utf8").matchAll(/command:\s*"([a-zA-Z][^"]*)"/g)) {
      prefix.add(m[1].split(".")[0] + ".");
    }
  }
  /* ② 宿主 app.* 配置键（E6#111d／1.34 扩口径 = 三源，见文件头「configKeys 家族的扫描口径」） */
  const keys = new Set();
  for (const f of walk(path.join(root, "src", "App", "config"), (x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
    for (const m of fs.readFileSync(f, "utf8").matchAll(/"(app\.[a-zA-Z0-9_.]+)"/g)) keys.add(m[1]);
  }
  for (const m of tryRead(path.join(root, "src", "App", "startup.ts")).matchAll(/"(app\.[a-zA-Z0-9_.]+)"/g)) {
    keys.add(m[1]);
  }
  {
    const m = tryRead(path.join(root, "src", "core", "services", "configuration", "schemaMigrations.ts")).match(
      /SCHEMA_VERSION_KEY\s*=\s*"(app\.[a-zA-Z0-9_.]+)"/,
    );
    if (m) keys.add(m[1]);
  }
  /* ③ 宿主伪 pluginId */
  const pseudo = ["app"];
  for (const f of walk(path.join(root, "src", "App"), (x) => x.endsWith(".ts"))) {
    for (const m of fs.readFileSync(f, "utf8").matchAll(/registerConfiguration\(\s*"([a-z][a-z0-9-]*)"/g)) pseudo.push(m[1]);
  }
  /* ④ 宿主/共享组件写入 ＋ 宿主 when 读取的 context key */
  const ctxWrite = new Set(),
    ctxRead = new Set();
  for (const f of walk(path.join(root, "src"), (x) => /\.tsx?$/.test(x) && !x.includes(".test."))) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/ContextKeyService\.setValue\(\s*["'`]([^"'`]+)["'`]/g)) ctxWrite.add(m[1]);
    for (const m of src.matchAll(/contextKey[?.]*\.set[?.]*\(\s*["'`]([^"'`]+)["'`]/g)) ctxWrite.add(m[1]);
    for (const m of src.matchAll(/when:\s*["'`]([^"'`]+)["'`]/g)) {
      for (const t of m[1].split(/[^A-Za-z0-9_]+/)) {
        if (!t || ["true", "false", "and", "or", "not", "in", "regex"].includes(t)) continue;
        if (/^[a-z]/.test(t)) ctxRead.add(t);
      }
    }
  }
  for (const k of ["activeEditor", "editorHasSelection", "editorCount"]) {
    ctxWrite.add(k);
    ctxRead.add(k);
  }
  /* ⑤ 宿主兜底外观 id：**配方 / 配色变体**（1.36 拆栏——两个名字空间不许挤一栏，见文件头） */
  const recipeIds = new Set();
  const colorwayIds = new Set();
  {
    const src = tryRead(path.join(root, "src", "core", "services", "ui", "ThemeEngine", "registry.ts"));
    // ⚠️ 1.35 §十五.3 记的旧缺陷：原先是「自函数头切 1200 字符」——切口长度是猜的，函数一改长就切掉尾部。
    //   现改为花括号配对取函数体；找不到函数头 ⇒ body = "" ⇒ 两栏空 ⇒ family-empty 报红（不静默）。
    const body = functionBodyAt(src, "export function registerFallbackThemes");
    for (const m of body.matchAll(/registerRecipe\(/g)) {
      const obj = objectLiteralAt(body, m.index + m[0].length);
      if (!obj) continue;
      // 一条登记项里两个空间的分界 = `colorways`：之前 = 配方本体（配方 id 在这半），之后 = 配色变体数组。
      const cut = obj.indexOf("colorways");
      const head = cut < 0 ? obj : obj.slice(0, cut);
      const tail = cut < 0 ? "" : obj.slice(cut);
      const rid = head.match(/\bid:\s*"([^"]+)"/);
      if (rid) recipeIds.add(rid[1]);
      for (const c of tail.matchAll(/\bid:\s*"([^"]+)"/g)) colorwayIds.add(c[1]);
    }
  }
  /* ⑤c 宿主保底图标主题 id —— 从 `app.iconTheme` 声明块取 default ＋ 枚举里的字面量（"default" = codicon 保底） */
  const iconThemeIds = new Set();
  {
    const src = tryRead(path.join(root, "src", "App", "config", "appearance.ts"));
    const keyAt = src.indexOf('"app.iconTheme"');
    const obj = keyAt < 0 ? "" : objectLiteralAt(src, keyAt);
    const dflt = obj.match(/\bdefault:\s*"([^"]+)"/);
    if (dflt) iconThemeIds.add(dflt[1]);
    const en = obj.match(/\benum:\s*\[([^\]]*)\]/);
    if (en) for (const m of en[1].matchAll(/"([^"]+)"/g)) iconThemeIds.add(m[1]);
  }
  /* ⑤d 宿主外观**哨兵值**（不是 id）——混搭来源「跟随主题」；从常量取值处扫，不手写字面量 */
  const sentinels = new Set();
  {
    const src = tryRead(path.join(root, "src", "core", "services", "ui", "ThemeEngine", "constants.ts"));
    for (const m of src.matchAll(/export const MIX_FOLLOW_THEME\s*=\s*"([^"]+)"/g)) sentinels.add(m[1]);
  }
  /* ⑤b updateActionable / updateButtonLabel —— 以常量注册（非字面量），补上 */
  {
    const f = path.join(root, "src", "core", "commands", "shell", "updateCommands.ts");
    for (const m of fs.readFileSync(f, "utf8").matchAll(/export const UPDATE_[A-Z_]*KEY\s*=\s*"([^"]+)"/g)) {
      ctxWrite.add(m[1]);
      ctxRead.add(m[1]);
    }
  }
  /* ⑥ 宿主内置协议 id —— `registerProtocol({ id: "..." })` 的宿主写入点（与命令 id 同一个全局名册，
   *    E6#111b 判据⑦：插件协议 id 不得撞它。今日唯一写入点 = 内置方括号协议） */
  const protocols = new Set();
  for (const f of walk(path.join(root, "src"), (x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/registerProtocol\s*\(\s*\{[\s\S]{0,400}?\bid\s*:\s*["']([^"']+)["']/g)) protocols.add(m[1]);
  }

  return {
    $comment: LEDGER_COMMENT,
    commandPrefixes: [...prefix].sort(),
    configKeys: [...keys].sort(),
    pseudoPluginIds: [...new Set(pseudo)].sort(),
    contextKeys: [...new Set([...ctxWrite, ...ctxRead])].sort(),
    appearanceRecipeIds: [...recipeIds].sort(),
    appearanceColorwayIds: [...colorwayIds].sort(),
    appearanceIconThemeIds: [...iconThemeIds].sort(),
    appearanceSentinels: [...sentinels].sort(),
    appearanceIdGrants: APPEARANCE_ID_GRANTS,
    protocolIds: [...protocols].sort(),
  };
}

/**
 * 账 vs 实况逐家族对账（纯函数，`--self-test` 与真跑共用）。
 * @returns {{kind:string,msg:string}[]}
 */
export function diffFamilies(ledger, actual) {
  const violations = [];
  for (const f of FAMILIES) {
    const L = ledger?.[f.key];
    const A = actual?.[f.key];
    if (!Array.isArray(L) || !Array.isArray(A)) {
      violations.push({
        kind: "family-missing",
        msg:
          `「${f.label}」（${f.key}）段缺失：${Array.isArray(L) ? "实况扫描" : "账"}一侧没有这个数组。` +
          `——门禁的射程就是这九个家族；家族被删/改名，逐条比对就失去意义（不许静默放过）。` +
          `若确实要改家族构成，请同笔改 scripts/gen-host-reserved.mjs 的 FAMILIES 与 §六 判据。`,
      });
      continue;
    }
    if (A.length === 0 || L.length === 0) {
      violations.push({
        kind: "family-empty",
        msg:
          `「${f.label}」（${f.key}）是空家族（${A.length === 0 ? "实况扫描" : "账"}一侧为空）。` +
          `——宿主不可能一个都没有：空家族只会出现在「扫描目录被搬走/改名」或「账段被清空」时，` +
          `而它会让对账**假装通过**。红在这里是为了逼一次核对，不是逼你删掉这一条。`,
      });
      continue;
    }
    const ls = new Set(L);
    const as = new Set(A);
    const missing = A.filter((n) => !ls.has(n)); // 实况有、账里没有
    const stale = L.filter((n) => !as.has(n)); // 账里有、实况没有
    if (missing.length > 0) {
      violations.push({
        kind: "ledger-missing",
        msg:
          `「${f.label}」：现场有而账里没有 [${missing.join(", ")}]——多半是改了宿主命令/设置面**忘了重跑**。` +
          `改法：npm run audit:plugin-scope:regen（生成式账不许手补）。`,
      });
    }
    if (stale.length > 0) {
      violations.push({
        kind: "ledger-stale",
        msg:
          `「${f.label}」：账里列了而现场扫不到 [${stale.join(", ")}]——账陈旧、被手改，或那条真的没了。` +
          `改法：确认它确实不存在后跑 npm run audit:plugin-scope:regen（regen 会据此重写，不留旧项）。`,
      });
    }
  }
  return violations;
}

/**
 * 外观**证照**自检（纯函数）：证照是「按 id 记的正当持有者」，不是白名单 ⇒ 两条守门。
 *   ① 证照指着一个**不在四栏里**的 id ⇒ `grant-dangling`（多半是 id 改了名/被删，证照留在原地）；
 *   ② 某个 id 的持有者列表**为空/不是字符串数组** ⇒ `grant-empty`（「有证照」却不写持有人 = 等于宽恕一切）。
 * 🔴 为什么证照也进门禁：它是判据的一部分，手改一行就能让**任一插件**的 id 免判——比漂一条 id 严重得多。
 */
export function diffGrants(ledger) {
  const violations = [];
  const grants = ledger?.appearanceIdGrants;
  if (grants == null || typeof grants !== "object" || Array.isArray(grants)) {
    return [
      {
        kind: "grant-missing",
        msg:
          `账里没有 \`appearanceIdGrants\` 段（或它不是对象）——外观 id 的证照表。` +
          `缺了 = 外观判据里的「正当持有者」无从判定（官方 theme-defaults 会被假红，或反过来谁都放行）。` +
          `改法：npm run audit:plugin-scope:regen。`,
      },
    ];
  }
  const known = new Set(APPEARANCE_COLUMNS.flatMap((k) => (Array.isArray(ledger[k]) ? ledger[k] : [])));
  for (const [id, holders] of Object.entries(grants)) {
    if (!Array.isArray(holders) || holders.length === 0 || holders.some((h) => typeof h !== "string" || !h)) {
      violations.push({
        kind: "grant-empty",
        msg:
          `证照 \`${id}\` 没有持有者（须为非空字符串数组）——「有证照」却不写持有人等于**宽恕一切**。` +
          `改法：补上持有者 pluginId，或删掉这条证照（改这张表 = 改判据）。`,
      });
    }
    if (!known.has(id)) {
      violations.push({
        kind: "grant-dangling",
        msg:
          `证照 \`${id}\` 指向一个**不在外观四栏里**的 id——证照只对宿主保留面里的 id 有意义` +
          `（id 改名/被删后证照必须同笔跟走，否则它悄悄变成一条永远不生效的宽恕）。` +
          `已知 id：[${[...known].sort().join(", ")}]。改法：改 scripts/gen-host-reserved.mjs 的 APPEARANCE_ID_GRANTS。`,
      });
    }
  }
  return violations;
}

/** SDK 副本 ↔ 壳账（逐字节；纯函数） */
export function diffSdk(sdkRaw, ledgerRaw) {
  if (sdkRaw == null) {
    return [
      {
        kind: "sdk-missing",
        msg:
          `SDK 副本不存在：${SDK_REL}——插件作者侧的新规则读的就是这一份，缺了等于判据没下发。` +
          `改法：npm run audit:plugin-scope:regen。`,
      },
    ];
  }
  if (sdkRaw !== ledgerRaw) {
    return [
      {
        kind: "sdk-drift",
        msg:
          `SDK 副本与壳账**逐字节不同**（${SDK_REL} vs ${LEDGER_REL}）——两份必须同源。` +
          `🔴 副本随 npm 包下发：漂了 = 第三方作者读到的判据是过期的（他那侧全绿，而这里以为守住了）。` +
          `改法：npm run audit:plugin-scope:regen。`,
      },
    ];
  }
  return [];
}

/** 三向合并（`--check` 与自测共用的唯一入口） */
export function checkAll({ ledger, actual, sdkRaw, ledgerRaw, runtimeRaw, runtimeExpected }) {
  return [
    ...diffFamilies(ledger, actual),
    ...diffGrants(ledger),
    ...diffSdk(sdkRaw, ledgerRaw),
    ...diffRuntime(runtimeRaw, runtimeExpected ?? renderRuntimeModule(ledger)),
  ];
}

/**
 * 渲染运行时保留面模块（纯函数——生成与 `--check` 第四向**共用同一份渲染**，⛔ 不许两处各写一份）。
 * 带运行时真正要用的家族：`configKeys`（保护区）＋ `pseudoPluginIds`（宿主身份判别）
 *   ＋ **外观四栏 ＋ 证照**（E6#111f／1.36 追加：运行时仲裁「顶替宿主兜底 id」要按空间查表）。
 * ⚠️ 另外三个家族（命令前缀 / context key / 协议 id）**故意不进运行时**：它们的判据在作者侧门禁
 *   （SDK lint）出，壳运行时不需要它们——塞进来只会多一份要同步的东西。
 */
export function renderRuntimeModule(reserved) {
  const arr = (name, values) =>
    `export const ${name}: readonly string[] = [\n${values.map((v) => `  ${JSON.stringify(v)},`).join("\n")}\n];\n`;
  // 外观四栏 → 运行时按**空间名**查（配方 / 配色 / 图标主题 / 哨兵）——空间名写死在此，⛔ 别处不许再写一份
  const appearanceSpaces = APPEARANCE_COLUMNS.map((k, i) => [APPEARANCE_SPACES[i], k]);
  const appearanceBlock =
    `export const HOST_RESERVED_APPEARANCE_IDS: Readonly<Record<string, readonly string[]>> = {\n` +
    appearanceSpaces
      .map(([space, key]) => `  ${space}: [${(reserved[key] ?? []).map((v) => JSON.stringify(v)).join(", ")}],`)
      .join("\n") +
    `\n};\n`;
  const grants = reserved.appearanceIdGrants ?? {};
  const grantsBlock =
    `export const HOST_RESERVED_APPEARANCE_GRANTS: Readonly<Record<string, readonly string[]>> = {\n` +
    Object.keys(grants)
      .sort()
      .map((id) => `  ${JSON.stringify(id)}: [${(grants[id] ?? []).map((v) => JSON.stringify(v)).join(", ")}],`)
      .join("\n") +
    `\n};\n`;
  return `/**
 * 🔴 **生成式文件——别手改。** 生成器 = \`scripts/gen-host-reserved.mjs\`（\`npm run audit:plugin-scope:regen\`）。
 *
 * 是什么：宿主保留面的**运行时副本**——壳运行时用它判四件事：
 *   · \`HOST_RESERVED_CONFIG_KEYS\`——插件不得占用的宿主配置键（保护区；撞了 ⇒ 拒绝注册 ＋ console.error）
 *   · \`HOST_PSEUDO_PLUGIN_IDS\`——宿主自己的注册身份（\`app\` = 壳通用 / \`appearance\` = 外观 / \`update\` = 更新）
 *   · \`HOST_RESERVED_APPEARANCE_IDS\`——宿主兜底外观 id，**按空间分栏**（recipe / colorway / iconTheme /
 *     sentinel）；两个空间不许合栏（配方 id 与配色 id 是两个名字空间，合栏 ⇒ 官方主题仓假红）
 *   · \`HOST_RESERVED_APPEARANCE_GRANTS\`——外观 id 的**证照**（id → 宿主之外的正当持有者）。🔴 **不是白名单**：
 *     按 id 记持有者，不记「哪些仓被宽恕」⇒ 新插件永远不在表里、永远判红
 *
 * 为什么运行时需要一份**静态**副本（而不是「看谁先注册」）：
 *   宿主真键里有**从未被注册**的（\`app.schemaVersion\`——settings.json 的内部标志键），
 *   靠「宿主注册在先」这条顺序事实判不出来。**正确性不许押在注册顺序上**（1.33 §11.1 裁决）。
 *
 * 三份同源：壳账 \`scripts/host-reserved.json\` · SDK 副本 \`packages/plugin-sdk/schemas/host-reserved.json\`
 *   · 本文件。漂移由 \`node scripts/gen-host-reserved.mjs --check\` 拦（四向对账）。
 */
${arr("HOST_RESERVED_CONFIG_KEYS", reserved.configKeys)}
${arr("HOST_PSEUDO_PLUGIN_IDS", reserved.pseudoPluginIds)}
${appearanceBlock}${grantsBlock}`;
}

/** 运行时模块 ↔ 壳账（逐元素；纯函数。缺 = missing，内容不同 = drift） */
export function diffRuntime(runtimeRaw, expectedRaw) {
  if (runtimeRaw == null) {
    return [
      {
        kind: "runtime-missing",
        msg:
          `运行时保留面模块不存在：${RUNTIME_REL}——壳运行时判保护区读的就是它，缺了等于保护区当场失效。` +
          `改法：npm run audit:plugin-scope:regen。`,
      },
    ];
  }
  if (runtimeRaw !== expectedRaw) {
    return [
      {
        kind: "runtime-drift",
        msg:
          `运行时保留面模块与壳账不一致（${RUNTIME_REL}）——运行时拦的键和门禁报的键不是同一本账，` +
          `而这种漂**两边都显示为绿**（运行时不会报"我这份是旧的"）。改法：npm run audit:plugin-scope:regen。`,
      },
    ];
  }
  return [];
}

/* ── 自测（正控会绿 / 负控会红）────────────────────────────────────── */
function fixture() {
  const ledger = {
    $comment: LEDGER_COMMENT,
    commandPrefixes: ["app.", "view."],
    configKeys: ["app.theme"],
    pseudoPluginIds: ["app"],
    contextKeys: ["inputFocus"],
    appearanceRecipeIds: ["dark", "light"],
    appearanceColorwayIds: ["dark-fallback", "light"],
    appearanceIconThemeIds: ["default"],
    appearanceSentinels: ["followTheme"],
    appearanceIdGrants: { light: ["theme-defaults"] },
    protocolIds: ["bracket"],
  };
  const raw = JSON.stringify(ledger, null, 2) + "\n";
  return { ledger, raw, actual: JSON.parse(JSON.stringify(ledger)) };
}

function selfTest() {
  const cases = [];
  const T = (name, mutate = () => ({}), kinds = []) => {
    const f = fixture();
    const r = mutate(f) ?? {};
    const ledger = r.ledger ?? f.ledger;
    const actual = r.actual ?? f.actual;
    const sdkRaw = r.sdkRaw === undefined ? f.raw : r.sdkRaw;
    const ledgerRaw = r.ledgerRaw ?? f.raw;
    // 运行时副本默认与（可能被改过的）账同步——只有专门测第四向的负控才显式传 runtimeRaw
    const runtimeRaw = r.runtimeRaw === undefined ? renderRuntimeModule(ledger) : r.runtimeRaw;
    const got = checkAll({ ledger, actual, sdkRaw, ledgerRaw, runtimeRaw });
    const ok = kinds.length === 0 ? got.length === 0 : kinds.every((k) => got.some((v) => v.kind === k));
    cases.push([name, ok, got.map((v) => v.kind)]);
  };

  // 🔴 正控
  T("正控①：账 = 实况 = SDK 副本 = 运行时模块 ⇒ 绿");
  T("正控②：账里家族内顺序颠倒（集合不变）⇒ 绿（比的是集合，不是顺序）", (f) => {
    f.ledger.commandPrefixes = [...f.ledger.commandPrefixes].reverse();
    return {};
  });
  T("正控③：运行时模块与账逐元素相同（第四向基线）⇒ 绿", (f) => ({ runtimeRaw: renderRuntimeModule(f.ledger) }));

  // 🔴 负控①：实况多一条（改了宿主面忘重跑）
  T(
    "负控①：实况多一条命令前缀 ⇒ 红（ledger-missing）",
    (f) => {
      f.actual.commandPrefixes = [...f.actual.commandPrefixes, "core."];
      return {};
    },
    ["ledger-missing"],
  );
  // 🔴 负控②：账多一条（陈旧 / 手改）
  T(
    "负控②：账多一条配置键 ⇒ 红（ledger-stale）",
    (f) => {
      f.ledger.configKeys = [...f.ledger.configKeys, "app.ghost"];
      return {};
    },
    ["ledger-stale"],
  );
  // 🔴 负控③：家族整段被删（后面逐条比对已无意义）
  T(
    "负控③：账里 contextKeys 段被删 ⇒ 红（family-missing）",
    (f) => {
      delete f.ledger.contextKeys;
      return {};
    },
    ["family-missing"],
  );
  // 🔴 负控④：实况某家族为空（扫描目录被搬走 ⇒ 空家族会假装通过）
  T(
    "负控④：实况某家族为空 ⇒ 红（family-empty）",
    (f) => {
      f.actual.appearanceColorwayIds = [];
      return {};
    },
    ["family-empty"],
  );
  // 🔴 负控⑤：SDK 副本不存在
  T("负控⑤：SDK 副本缺失 ⇒ 红（sdk-missing）", () => ({ sdkRaw: null }), ["sdk-missing"]);
  // 🔴 负控⑥：SDK 副本漂移（改一个字）
  T(
    "负控⑥：SDK 副本与壳账不同 ⇒ 红（sdk-drift）",
    () => ({ sdkRaw: JSON.stringify(fixture().ledger, null, 2).replace('"dark"', '"light"') + "\n" }),
    ["sdk-drift"],
  );
  // 🔴 负控⑦：运行时模块漂一个键（第四向——最坏的那种漂：两边都"绿"）
  T(
    "负控⑦：运行时模块里一个配置键被改 ⇒ 红（runtime-drift）",
    (f) => ({ runtimeRaw: renderRuntimeModule(f.ledger).replace('"app.theme"', '"app.themeX"') }),
    ["runtime-drift"],
  );
  // 🔴 负控⑧：运行时模块不存在
  T("负控⑧：运行时模块缺失 ⇒ 红（runtime-missing）", () => ({ runtimeRaw: null }), ["runtime-missing"]);

  /* ── 1.36 新增：外观四栏 ＋ 证照 ─────────────────────────────────── */
  // 🔴 负控⑨：账里没有证照段（外观判据的「正当持有者」无从判定）
  T(
    "负控⑨：账里没有 appearanceIdGrants ⇒ 红（grant-missing）",
    (f) => {
      delete f.ledger.appearanceIdGrants;
      return {};
    },
    ["grant-missing"],
  );
  // 🔴 负控⑩：证照指向不在四栏里的 id（id 改名后证照留原地 = 一条永不生效的宽恕）
  T(
    "负控⑩：证照指向不在四栏里的 id ⇒ 红（grant-dangling）",
    (f) => {
      f.ledger.appearanceIdGrants = { ghost: ["theme-defaults"] };
      return {};
    },
    ["grant-dangling"],
  );
  // 🔴 负控⑪：证照没有持有者（「有证照」却不写持有人 = 宽恕一切）
  T(
    "负控⑪：证照持有者为空数组 ⇒ 红（grant-empty）",
    (f) => {
      f.ledger.appearanceIdGrants = { light: [] };
      f.actual.appearanceIdGrants = { light: [] };
      return {};
    },
    ["grant-empty"],
  );
  // 🔴 负控⑫：运行时模块漏掉一个外观 id（第五向——按空间渲染后仍逐字节比对）
  T(
    "负控⑫：运行时模块漏一个外观配色 id ⇒ 红（runtime-drift）",
    (f) => ({ runtimeRaw: renderRuntimeModule(f.ledger).replace('"dark-fallback", ', "") }),
    ["runtime-drift"],
  );
  // 🔴 负控⑬：实况**配方栏**被配色 id 灌进来（拆栏失效 = 官方 theme-defaults 配色 id `dark` 假红的成因）
  T(
    "负控⑬：配色 id 混进配方栏 ⇒ 红（ledger-missing）",
    (f) => {
      f.actual.appearanceRecipeIds = [...f.actual.appearanceRecipeIds, "mint-soda"];
      return {};
    },
    ["ledger-missing"],
  );

  /* 🔴 正控④：**真仓重扫**——外观四栏非空 ＋ 证照自洽（拆栏后"四栏悄悄空掉"必须当场可见） */
  {
    const real = collectHostReserved();
    const bad = diffGrants(real).map((v) => v.kind);
    for (const k of APPEARANCE_COLUMNS) {
      if (!Array.isArray(real[k]) || real[k].length === 0) bad.push(`family-empty:${k}`);
    }
    cases.push(["正控④：真仓重扫——外观四栏非空 ＋ 证照自洽 ⇒ 绿", bad.length === 0, bad]);
  }

  let bad = 0;
  for (const [name, ok, kinds] of cases) {
    if (!ok) bad++;
    console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `　← 实际违规 ${JSON.stringify(kinds)}`}`);
  }
  console.log(`gen-host-reserved self-test ${bad === 0 ? "✔️ 全部符合预期（正控绿 / 负控红）" : `❌ 有 ${bad} 条不符预期`}`);
  return bad === 0 ? 0 : 1;
}

/* ── 入口 ──────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
if (args.includes("--self-test")) process.exit(selfTest());

const ledgerPath = path.join(ROOT, LEDGER_REL);
const sdkPath = path.join(ROOT, SDK_REL);

if (args.includes("--check")) {
  if (!fs.existsSync(ledgerPath)) {
    console.error(`❌ [host-reserved] 账文件不存在：${LEDGER_REL}（跑 npm run audit:plugin-scope:regen 生成）`);
    process.exit(1);
  }
  const ledgerRaw = fs.readFileSync(ledgerPath, "utf8");
  let ledger;
  try {
    ledger = JSON.parse(ledgerRaw);
  } catch (e) {
    console.error(`❌ [host-reserved] 账文件不是合法 JSON：${LEDGER_REL}——${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  const actual = collectHostReserved();
  const sdkRaw = fs.existsSync(sdkPath) ? fs.readFileSync(sdkPath, "utf8") : null;
  const runtimePath = path.join(ROOT, RUNTIME_REL);
  const runtimeRaw = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, "utf8") : null;
  const violations = checkAll({ ledger, actual, sdkRaw, ledgerRaw, runtimeRaw });
  if (violations.length === 0) {
    const counts = FAMILIES.map((f) => `${f.label} ${ledger[f.key].length}`).join(" · ");
    console.log(`✅ [host-reserved] 四向一致（账 = 现场重扫 = SDK 副本 = 运行时模块）：${counts}`);
    process.exit(0);
  }
  console.error(`❌ [host-reserved] ${violations.length} 处不一致（宿主保留面账）：`);
  for (const v of violations) console.error(`   · [${v.kind}] ${v.msg}`);
  console.error(
    `   要对齐的四侧：现场重扫（壳源码）↔ ${LEDGER_REL} ↔ ${SDK_REL} ↔ ${RUNTIME_REL}；` +
      `判据见 scripts/gen-host-reserved.mjs 文件头。`,
  );
  process.exit(1);
}

// 默认：生成（写壳账 ＋ SDK 副本 ＋ 运行时模块）
const out = collectHostReserved();
const raw = JSON.stringify(out, null, 2) + "\n";
fs.writeFileSync(ledgerPath, raw);
fs.mkdirSync(path.dirname(sdkPath), { recursive: true });
fs.writeFileSync(sdkPath, raw);
const runtimePath = path.join(ROOT, RUNTIME_REL);
fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
fs.writeFileSync(runtimePath, renderRuntimeModule(out));
console.log("壳账", LEDGER_REL, "＋ SDK 副本", SDK_REL, "＋ 运行时模块", RUNTIME_REL, "已重写");
console.log("命令前缀", out.commandPrefixes.length, JSON.stringify(out.commandPrefixes));
console.log("app.* 键", out.configKeys.length);
console.log("伪 pluginId", JSON.stringify(out.pseudoPluginIds));
console.log("context key", out.contextKeys.length, JSON.stringify(out.contextKeys));
console.log("宿主兜底配方 id", JSON.stringify(out.appearanceRecipeIds));
console.log("宿主兜底配色 id", JSON.stringify(out.appearanceColorwayIds));
console.log("宿主保底图标主题 id", JSON.stringify(out.appearanceIconThemeIds));
console.log("宿主外观哨兵", JSON.stringify(out.appearanceSentinels));
console.log("外观 id 证照", JSON.stringify(out.appearanceIdGrants));
console.log("宿主内置协议 id", JSON.stringify(out.protocolIds));
