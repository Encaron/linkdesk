#!/usr/bin/env node
/**
 * 宿主保留面账（`scripts/host-reserved.json`）——**生成 ＋ 四向对账**。
 *
 * 是什么：宿主自己占用的名字，分十个家族——命令前缀 / `app.*` 配置键 / 伪 pluginId /
 *   **context key 两段**（宿主专用 ／ 宿主公开约定面）/ **兜底外观 id 四栏**（配方 / 配色 / 图标主题 / 哨兵）/ 内置协议 id。
 *   插件不得占用这些名字；改动本账 = 一次公共面决策。
 * 出处与判据（唯一真源，本文不重述）：`docs/02-Electron架构/插件生态与发布/01-插件独立构建/非样式命名空间归一化/02-任务-命令id归属落地.md` §六
 *   ＋ 1.31 评估档 §八（机制 A：宿主保留名账进 SDK）。
 *
 * ── 角色变更（E6#111b）──
 *   E6#109j 时它只是**生成侧原型**（文件头自述「只写不读」「无开关、无自测」）；1.32 升为**门禁**：
 *     · 默认跑        = 生成：写壳账 ＋ SDK 副本 ＋ 运行时模块（`npm run audit:plugin-scope:regen`）
 *     · `--check`     = 只读对账，挂 `npm run check`
 *     · `--self-test` = 逐条正控（绿）/ 负控（红），一条不符即红
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
 *   ⑤ **`version` 字段**（E6#111k／1.49 追加）：账的修订号必须存在、是正整数、且与生成器常量
 *      `LEDGER_VERSION` 一致。🔴 单独一条的理由：它是**只给人读**的字段，四向里只有「账 ↔ SDK 副本
 *      逐字节」会顺带带上它 ⇒ **两侧一起被手改成同一个错值**时全绿，而那正是它要防的事。
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
 * ── context key 两段 ＋ `when:` 抽取（1.38 拆段 ＋ 修截断）──
 *   旧账只有一栏 `contextKeys`（写 ∪ 读，11 项）——**两个字空间挤在一栏**：
 *   ① **宿主专用**（插件禁设）：`activeEditor` / `editorHasSelection` / `editorCount` /
 *      `sidebarPosition` / `updateActionable` / `updateButtonLabel` / `inputFocus`（共享内联输入组件面）；
 *   ② **宿主公开约定面**（插件可设、宿主 `when` 读）：`settingKey` / `settingFollowTheme` /
 *      `settingResetsToDefault` / `settingModified`——**写的人不是宿主**（官方插件 `settings` 的齿轮菜单），
 *      读的人是宿主命令 `when`。⇒ 合成一栏 ⇒ 分级不可区分 ⇒ 官方 `settings` 当场假红。
 *   🔴 段②**不手抄，是派生的**：`ctxRead − ctxWrite`（宿主读 ∧ 宿主不写）。
 *   🆕 **T3／2026-10-05 补第二来源**：另一类键壳**既不写也不静态读**——写的人是**插件**
 *      （file-tree 右键注入）、读的人是**任意第三方插件的 `when`** ⇒ 纯派生口径看不见。
 *      由宿主在此**裁定并逐条列出**（`HOST_SANCTIONED_PUBLIC_CONTEXT_KEYS`，判据见该常量）。
 *   🔴 **`when:` 抽取在 1.38 前是截断的**（`[^"'`]+` 把 `'` 当终止符 ⇒ 引号后的旗子名**静默漏账**，是**假绿**）；
 *      现改为「引号配对取完整表达式 ＋ 显式比较值过滤」，见 `extractWhenExpressions` / `whenKeys`。
 *
 * ── 口径 ──
 *   十个家族比的都是**名字集合**（生成侧已去重 ＋ 字典序排序）；**顺序不同不算漂移，多一个少一个才算**。
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

/** 十个家族——键名 ＋ 中文标签（报错文本与自测共用，避免两处各写一份）
 *  🔴 E6#111h／1.38：原 `contextKeys`（一栏混两段）拆成
 *  `contextKeysHostOnly`（宿主专用：插件禁设 🔴）＋ `contextKeysPublic`（宿主公开约定面：插件可设 🟠）
 *  ——**两段不许合并**（出处 1.37 §10.2／§13.5：合成一栏就看不出分级，官方 `settings` 当场假红，
 *  与 1.36「外观账一栏混两空间」同一种病）。 */
export const FAMILIES = [
  { key: "commandPrefixes", label: "宿主命令前缀" },
  { key: "configKeys", label: "宿主 app.* 配置键" },
  { key: "pseudoPluginIds", label: "宿主伪 pluginId" },
  { key: "contextKeysHostOnly", label: "宿主专用 context key（插件禁设）" },
  { key: "contextKeysPublic", label: "宿主公开约定 context key（插件可设）" },
  { key: "appearanceRecipeIds", label: "宿主兜底配方 id" },
  { key: "appearanceColorwayIds", label: "宿主兜底配色变体 id" },
  { key: "appearanceIconThemeIds", label: "宿主保底图标主题 id" },
  { key: "appearanceSentinels", label: "宿主外观哨兵值" },
  { key: "protocolIds", label: "宿主内置协议 id" },
  { key: "externalProtocols", label: "受控 openExternal 的协议白名单（T4）" },
];

// 🆕 宿主指定的公开 context key（第三种来源——T3）：判据与常量同住
//    `scripts/lib/host-reserved-public-keys.mjs`（本档 800 行临线，判据塞不进）。
import { HOST_SANCTIONED_PUBLIC_CONTEXT_KEYS } from "./lib/host-reserved-public-keys.mjs";
// 🆕 两类协议家族（内置协议 id ／ T4 受控 openExternal 白名单）：判据同住 `scripts/lib/`（本档 800 行临线）。
import { collectProtocolIds, collectExternalProtocols } from "./lib/host-reserved-protocols.mjs";

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

/* ── 账的修订号（E6#111k／1.49 定稿）──────────────────────────────────
 * 🔴 **抬版本号的唯一理由 = 本账的形状/口径变了**（家族增删、某家族改口径、判据收紧）。
 *    **逐条增删名字不抬它**——那只是实况漂移，由双向对账逼着重生成（重生成会让账自动跟上，
 *    与 version 无关）。把它当「内容版本」用，等于每次改名都要手改一个只给人看的数字。
 * ⚠️ 它与 `app.schemaVersion` 是**两回事**：这里记的是**账自己的**修订，不是用户 settings.json 的
 *    迁移版本；两者同名纯属巧合，⛔ 别拿它当迁移门禁。
 * 历史：1 = 十家族定稿（1.49 首次写入 `version` 字段本身）；
 *      2 = 加 `retired[]` 退役登记栏（E6#116：账多了一栏 = 形状变了 ⇒ 抬版；家族与名字一条没动）；
 *      3 = `contextKeysPublic` 的口径从「纯派生（`ctxRead − ctxWrite`）」改成「派生 ＋ **宿主指定**
 *          （`HOST_SANCTIONED_PUBLIC_CONTEXT_KEYS`）」——文件打开方式与贡献点 T3：宿主裁定
 *          `resourceExtname` / `resourceIsFile` 为公共约定面（**写的人是 file-tree、读的人是任意第三方插件**），
 *          而壳自己既不写也不静态读它们 ⇒ 纯派生口径**看不见**（改口径 ⇒ 抬版）。
 *      4 = **加家族** `externalProtocols`（本案 T4 受控 openExternal）：宿主承认「可交系统打开」的协议白名单进账——公开契约，非普通常量。 */
export const LEDGER_VERSION = 4;

export const LEDGER_COMMENT =
  "宿主保留面账（生成式·E6#111b／1.32 定稿，1.49 补 version）——插件不得占用这些名字。" +
  "消费方有**两条腿，互不覆盖**：" +
  "① **壳腿** = 壳仓 `scripts/audit-plugin-scope.mjs`（跨容器普查，读本账 ＋ 反向核对实况）" +
  "与 `src/core/registry/host-reserved.generated.ts`（壳**运行时**仲裁读的生成副本）；" +
  "② **SDK 腿** = `@linkdesk/plugin-sdk` 的四个 `check-*-ownership`（随包下发本账的副本" +
  " `schemas/host-reserved.json`，在**插件仓 CI** 判红）。" +
  "为什么必须两条腿：壳腿看不见插件仓的源码，SDK 腿看不见壳的运行时——各自的射程都到不了对面。" +
  "**改本表 = 一次公共面决策**：动手前先问「**这是公共面，还是漏网的借用？**」——" +
  "公共面（多人正当读写、按约定共享）该进本账的设计里单列，借用（某插件用了宿主的名字）一律判红、不许宽恕；" +
  "**新增条目要在这一段或对应家族的 why 里写明判据**，别只加一个名字。" +
  "改完必须重跑生成器 `npm run audit:plugin-scope:regen`（scripts/gen-host-reserved.mjs）——" +
  "账 ＋ SDK 副本 ＋ 运行时副本**三份同源**，手改任一份都会被判漂。" +
  "**双向对账门禁在哪**：`node scripts/gen-host-reserved.mjs --check`（四向：实况→账 ／ 账→实况 ／" +
  " SDK 副本逐字节 ／ 运行时副本逐元素），已接在 `npm run check` 里；" +
  "实况多一条报 `ledger-missing`、账多一条报 `ledger-stale`、家族整段缺失/为空另有专门的报警。" +
  "`version` = 本账**形状**的修订号（见生成器 `LEDGER_VERSION` 的抬版规则），不是 settings 迁移版本。" +
  "⚠️ configKeys 含**退役键**（曾被宿主使用、现已不再写入的键）：退役键**不腾出保留面**——" +
  "老 settings.json 里可能还留着值，插件此刻占它 = 顶掉的是宿主的历史数据（且迁移代码仍会读它）。" +
  "📌 **`retired[]` = 退役登记栏**（E6#116／本账 version 2 起）：**人工栏**——生成器**原样携带**（不扫描、不由实况推）。" +
  "每条 = { name, kind, since, why, replacedBy, landing, approvedBy }：谁批的（必须**用户本人**签的日期）、为什么、替身是谁、还剩哪个活口。" +
  "**退役 ≠ 删除**：退役名**不腾位**（同上——老值还在），所以它照旧留在本账对应家族里，只是不再是对插件许过的面。" +
  "🔴 它**不是黑名单**：只供人读与作者侧提示，⛔ 不许任何门禁拿它去拦插件；「有登记即放行」的唯一出口在" +
  "`scripts/check-api-surface-additive.mjs`（面被拿走 ＋ 有登记 ⇒ 放行），本栏自身的自洽对账在 `scripts/check-retired-ledger.mjs`。" +
  "⚠️ 运行时副本**不下发** `retired`（`renderRuntimeModule` 只渲染显式家族常量，运行时对它没有可执行判断）；" +
  "SDK 副本随本账**逐字节**含它——「要不要给作者侧提示退役名」= 格 6 的取舍点。";

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

/**
 * 读账里那一栏**人工**的退役登记（E6#116）——生成器**原样携带**：
 * `retired[]` **不来自任何扫描**，一次「重生成」若把它冲掉，等于抹掉全部退役记录与用户签名。
 * ⚠️ 推论：手改 `retired[]` **不会**被 `--check` 判红（它是本账唯一不由实况推的栏）——
 *   它的自洽（形状 ／ 退役的必须真退役 ／ 落点绑得住）由 `scripts/check-retired-ledger.mjs` 管。
 */
function readRetiredColumn(root = ROOT) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, LEDGER_REL), "utf8"));
    return Array.isArray(raw.retired) ? raw.retired : [];
  } catch {
    return [];
  }
}

/** 读一个文件，读不到返回 ""（扫描源缺失 ⇒ 少几条账项，由对账的 family-empty／ledger-missing 兜） */
function tryRead(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

/* ── `when:` 表达式抽取（🔴 E6#111h／1.38 修：原实现在**第一个单引号处截断**，是**假绿**）──────
 *
 * 修前（`:214`）：`/when:\s*["'`]([^"'`]+)["'`]/g`——字符类把 `'` 也当终止符 ⇒
 *   `when: "sidebarPosition == 'left'"` 抓到的是 `sidebarPosition == `（**截断**），
 *   而 `when: "settingKey == 'x' && myFlag"` 里 **`myFlag` 整个丢掉** ⇒ **漏报（假绿）**。
 *   ⚠️ 旧实现之所以「账还是对的」，靠的是**截断顺带把比较值也切掉了**——**账对，理由错**：
 *   比较值（`left` / `right` / `app.backgroundImage`）本该由**明处的过滤**剔掉，不该靠正则出错。
 * 修后：**按引号配对取完整表达式**（`"` 与 `'` 互相当作内容、`` ` `` 同为定界符）＋ token 切分
 *   ＋ **显式的比较值过滤**（`COMPARE_OPS` 右值 ＋ `WHEN_SKIP` 词表）⇒ 过滤写在明处、可被 `--self-test` 自测。
 */
const WHEN_DELIMITERS = [`"`, "'", "`"];
/** 比较运算符：紧跟其后的 token 是**右值**（`left` / `app.x` / `'app.x'`）——**不是旗子名** */
const COMPARE_OPS = ["==", "!=", "===", "!==", "=", "<=", ">=", "<", ">"];
/** `when` 语法词 ＋ 字面量：切出来也不是旗子名 */
const WHEN_SKIP = ["true", "false", "and", "or", "not", "in", "regex"];

/** 从 `when: <引号>…<同款引号>` 取**完整表达式**（引号配对；⛔ 别用「切到下一个引号」——那正是旧 bug） */
export function extractWhenExpressions(src) {
  const out = [];
  for (const m of src.matchAll(/\bwhen\s*:\s*/g)) {
    const start = (m.index ?? 0) + m[0].length;
    const delim = src[start];
    if (!WHEN_DELIMITERS.includes(delim)) continue;
    const end = src.indexOf(delim, start + 1);
    if (end > start) out.push(src.slice(start + 1, end));
  }
  return out;
}

/** 完整 `when` 表达式 → 读到的**旗子名**（左侧的标识符；比较值 / 语法词 / 属性名一律剔除）。
 *  ⚠️ 切分**必须把比较运算符留在 token 流里**（`COMPARE_OPS` 是「跳过右值」唯一的识别依据）：
 *  先把运算符前后补空白切成独立 token，**再按空白切**——⛔ 别按「非名字字符」切（那会把 `==`
 *  连同空格一起当分隔符吞掉 ⇒ `a == b` 切成 `["a","b"]` ⇒ **比较值 `b` 被当成旗子名收进账**）。 */
export function whenKeys(expr) {
  const out = [];
  const opsRe = /^(===|!==|==|!=|<=|>=|=|<|>)$/;
  const tokens = String(expr)
    .replace(/(===|!==|==|!=|<=|>=|=|<|>)/g, " $1 ")
    .split(/\s+/)
    .filter(Boolean)
    // ⛔ 削边**不能削运算符本身**（`=` 是非名字字符，削边会把 `==` 整条削成空串 ⇒ 运算符消失）
    .map((t) => (opsRe.test(t) ? t : t.replace(/^[^A-Za-z0-9_.$]+|[^A-Za-z0-9_.$]+$/g, "")))
    .filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (COMPARE_OPS.includes(t)) {
      i++; // 跳过右值——`== 'left'` 的 `left` **不是旗子名**（显式过滤，不靠截断）
      continue;
    }
    if (WHEN_SKIP.includes(t)) continue;
    if (!/^[a-z]/.test(t)) continue;
    // `a.x` 形态：`a` 是旗子名，`x` 是属性名（`!editorHasSelection` 之类无点，直接收）
    const dot = t.indexOf(".");
    out.push(dot > 0 ? t.slice(0, dot) : t);
  }
  return out;
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
    for (const expr of extractWhenExpressions(src)) for (const t of whenKeys(expr)) ctxRead.add(t);
  }
  /** 内核三键：`initCoreKeys` 以 `this._state.set(...)` 直写，绕过 `setValue` ⇒ 上面的正则抓不到（硬编码补）。
   *  🔴 **新增内核旗子必须同笔补这里**（出处 1.37 §10.3）。 */
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
  /* ⑤c 宿主保底图标主题 id —— `app.iconTheme` 取值空间里**宿主自己声明**的那些（"default" = codicon 保底）。
   *   2026-10-01 起声明处不再写字面量：`default` 走常量 `ICON_THEME_FALLBACK_ID`、`enum` 走
   *   `iconThemeEnumOptions().values`（枚举 ＋ 显示名同源装配，E6#165 图标主题显示面）⇒ 纯字面量扫描会
   *   扫成**空家族**（`family-empty` 当场报红）。做法 = 先把该仓的字符串常量解出来，再对**两处真源**
   *   （配置声明块 ／ 注册表函数体）里的字面量与标识符逐个求值；插件登记项是运行期数据，本就不进账。 */
  const iconThemeIds = new Set();
  {
    const declSrc = tryRead(path.join(root, "src", "App", "config", "appearance.ts"));
    const regSrc = tryRead(path.join(root, "src", "core", "registry", "appearance", "IconRegistry.ts"));
    const consts = new Map();
    for (const m of regSrc.matchAll(/export const ([A-Za-z_$][\w$]*)\s*=\s*"([^"]+)"/g)) consts.set(m[1], m[2]);
    const absorb = (expr) => {
      for (const m of expr.matchAll(/"([^"]+)"|([A-Za-z_$][\w$]*)/g)) {
        const v = m[1] ?? consts.get(m[2]);
        if (v) iconThemeIds.add(v);
      }
    };
    const keyAt = declSrc.indexOf('"app.iconTheme"');
    const obj = keyAt < 0 ? "" : objectLiteralAt(declSrc, keyAt);
    const dflt = obj.match(/\bdefault:\s*("[^"]+"|[A-Za-z_$][\w$]*)/);
    if (dflt) absorb(dflt[1]);
    const en = obj.match(/\benum:\s*([^,\n]+)/);
    if (en) absorb(en[1]);
    const vals = functionBodyAt(regSrc, "export function iconThemeEnumOptions(").match(/\bvalues:\s*\[([^\]]*)\]/);
    if (vals) absorb(vals[1]);
  }
  /* ⑤d 宿主外观**哨兵值**（不是 id）——混搭来源「跟随主题」；从常量取值处扫，不手写字面量。
   *     🆕 2026-10-03 设置控件案 4.1：字面量正典上移至 `@linkdesk/ui` 共享件（`settings-hints/
   *     settingsHints.ts` 的 `MIX_FOLLOW_THEME_SENTINEL`），core 侧只余 re-export ⇒ 两处都扫
   *     （正典件认新名、老的 core 定义处照旧认旧名），谁在定义就从谁取值——产物逐字节不变。 */
  const sentinels = new Set();
  {
    const candidates = [
      path.join(root, "src", "core", "services", "ui", "ThemeEngine", "constants.ts"),
      path.join(root, "src", "components", "shared", "settings-hints", "settingsHints.ts"),
    ];
    for (const f of candidates) {
      for (const m of tryRead(f).matchAll(/export const (?:MIX_FOLLOW_THEME|MIX_FOLLOW_THEME_SENTINEL)\s*=\s*"([^"]+)"/g)) sentinels.add(m[1]);
    }
  }
  /* ⑤b updateActionable / updateButtonLabel —— 以常量注册（非字面量），补上 */
  {
    const f = path.join(root, "src", "core", "commands", "shell", "updateCommands.ts");
    for (const m of fs.readFileSync(f, "utf8").matchAll(/export const UPDATE_[A-Z_]*KEY\s*=\s*"([^"]+)"/g)) {
      ctxWrite.add(m[1]);
      ctxRead.add(m[1]);
    }
  }
  /* ⑥ 两类协议家族（宿主内置协议处理器 id ／ T4 受控 openExternal 白名单）：判据与常量同住
   *    `scripts/lib/host-reserved-protocols.mjs`（⚠️ 后者扫的是**壳源码** `electron/`，是账里唯一源自 electron/ 的家族）。 */

  /* ⑦ 🔴 约定面派生（E6#111h／1.38）：**宿主 `when` 读 ∧ 宿主源码不写** ⇒ 宿主公开约定面。
   *    出处 = 1.37 §13.5 裁决（丙）：`settings` 的 4 个裸名旗子（`settingKey` / `settingFollowTheme` /
   *    `settingResetsToDefault` / `settingModified`）**写的人是官方插件 `settings`、读的人是宿主命令 `when`**
   *    ⇒ 它们事实上已是「谁都能设、谁都能读」的公开约定面，只是**没人登记**。登记 = 拆段 ＋ 双向对账 ＋ 出声。
   *    ⛔ **不手抄名单**——名单是**派生的**（改完 `settings`/`coreCommands` 后重跑即自动跟上）；
   *    手抄的名单迟早与实况漂，而漂的那天**双向对账会被自己骗过**（两边都拿手抄表）。
   *    ⚠️ 派生依赖上面对内核三键 ＋ `UPDATE_*_KEY` 两键的硬编码补写：宿主写过的名字**不许**落进约定面
   *    （否则「插件禁设」的段里混进宿主自己在写的旗子 ⇒ 官方 `usePoolSync` 当场假红）。
   *    🆕 **T3 补第二来源**（见文件头「context key 两段」）：宿主**裁定**的公共键——壳既不写也不静态读，
   *    纯派生扫不到 ⇒ 由下面的常量逐条列出，与派生结果取并集。 */
  const ctxPublic = [...new Set([...[...ctxRead].filter((k) => !ctxWrite.has(k)), ...HOST_SANCTIONED_PUBLIC_CONTEXT_KEYS])].sort();
  const ctxHostOnly = [...new Set([...ctxWrite, ...ctxRead])].filter((k) => !ctxPublic.includes(k)).sort();

  return {
    $comment: LEDGER_COMMENT,
    version: LEDGER_VERSION,
    commandPrefixes: [...prefix].sort(),
    configKeys: [...keys].sort(),
    pseudoPluginIds: [...new Set(pseudo)].sort(),
    contextKeysHostOnly: ctxHostOnly,
    contextKeysPublic: ctxPublic,
    appearanceRecipeIds: [...recipeIds].sort(),
    appearanceColorwayIds: [...colorwayIds].sort(),
    appearanceIconThemeIds: [...iconThemeIds].sort(),
    appearanceSentinels: [...sentinels].sort(),
    appearanceIdGrants: APPEARANCE_ID_GRANTS,
    protocolIds: collectProtocolIds(root),
    externalProtocols: collectExternalProtocols(root),
    retired: readRetiredColumn(root),
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

/**
 * 账的 `version` 字段自检（E6#111k／1.49 新增）。
 * 🔴 为什么这条不能省：`version` 是**只给人读**的字段（没有任何逐条比对碰它），
 *   四向对账里只有「账 ↔ SDK 副本逐字节」会顺带带上它——**两边一起被手改成同一个错值**时全绿。
 *   而它恰恰是「这本账被谁动过、动到第几版」的唯一线索 ⇒ 单列一条判据（缺 / 不是正整数 / 与生成器常量不符）。
 * @returns {{kind:string,msg:string}[]}
 */
export function diffVersion(ledger) {
  const v = ledger?.version;
  if (!Number.isInteger(v) || v < 1) {
    return [
      {
        kind: "version-bad",
        msg:
          `账的 \`version\` 缺失或不是正整数（实际 ${JSON.stringify(v)}）——` +
          `本账是**生成式**的：要它就跟生成器常量 \`LEDGER_VERSION\` 一致。` +
          `改法：npm run audit:plugin-scope:regen（⛔ 别手改 ${LEDGER_REL}）。`,
      },
    ];
  }
  if (v !== LEDGER_VERSION) {
    return [
      {
        kind: "version-drift",
        msg:
          `账的 \`version\`=${v}，生成器常量 \`LEDGER_VERSION\`=${LEDGER_VERSION}——两边不一致。` +
          `抬版本号的唯一理由是**本账形状/口径变了**（家族增删、改口径、判据收紧）；` +
          `只增删名字**不**抬版本（那是实况漂移，重生成即跟上）。` +
          `改法：改生成器的 \`LEDGER_VERSION\` 后 npm run audit:plugin-scope:regen。`,
      },
    ];
  }
  return [];
}

/** 全向合并（`--check` 与自测共用的唯一入口） */
export function checkAll({ ledger, actual, sdkRaw, ledgerRaw, runtimeRaw, runtimeExpected }) {
  return [
    ...diffVersion(ledger),
    ...diffFamilies(ledger, actual),
    ...diffGrants(ledger),
    ...diffSdk(sdkRaw, ledgerRaw),
    ...diffRuntime(runtimeRaw, runtimeExpected ?? renderRuntimeModule(ledger)),
  ];
}

/**
 * 渲染运行时保留面模块（纯函数——生成与 `--check` 第四向**共用同一份渲染**，⛔ 不许两处各写一份）。
 * 带运行时真正要用的家族：`configKeys`（保护区）＋ `pseudoPluginIds`（宿主身份判别）
 *   ＋ **外观四栏 ＋ 证照**（E6#111f／1.36 追加：运行时仲裁「顶替宿主兜底 id」要按空间查表）
 *   ＋ **context key 两段**（E6#111h／1.38 追加：运行时仲裁「插件经 IPC 写宿主专用旗子」要查专用段）。
 * ⚠️ 另外三个家族（命令前缀 / 协议 id / **约定面段**）**故意不进运行时**：它们的判据在作者侧门禁
 *   （SDK lint）出，壳运行时不需要它们——塞进来只会多一份要同步的东西。
 *   🔴 **约定面段不进运行时是刻意的**：约定面 = 「插件可设」⇒ 运行时对它**没有**可执行的判断；
 *   塞进来只会让人以为运行时在管它。
 */
export function renderRuntimeModule(reserved) {
  const arr = (name, values) =>
    `export const ${name}: readonly string[] = [\n${(values ?? []).map((v) => `  ${JSON.stringify(v)},`).join("\n")}\n];\n`;
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
 * 是什么：宿主保留面的**运行时副本**——壳运行时用它判五件事：
 *   · \`HOST_RESERVED_CONFIG_KEYS\`——插件不得占用的宿主配置键（保护区；撞了 ⇒ 拒绝注册 ＋ console.error）
 *   · \`HOST_PSEUDO_PLUGIN_IDS\`——宿主自己的注册身份（\`app\` = 壳通用 / \`appearance\` = 外观；\`update\` 已于 2026-09-26 退役——04 设置页通用归类，见 retired[]）
 *   · \`HOST_RESERVED_APPEARANCE_IDS\`——宿主兜底外观 id，**按空间分栏**（recipe / colorway / iconTheme /
 *     sentinel）；两个空间不许合栏（配方 id 与配色 id 是两个名字空间，合栏 ⇒ 官方主题仓假红）
 *   · \`HOST_RESERVED_APPEARANCE_GRANTS\`——外观 id 的**证照**（id → 宿主之外的正当持有者）。🔴 **不是白名单**：
 *     按 id 记持有者，不记「哪些仓被宽恕」⇒ 新插件永远不在表里、永远判红
 *   · \`HOST_RESERVED_CONTEXT_KEYS_HOST_ONLY\`——**宿主专用的 context key**（E6#111h／1.38）。
 *     🔴 运行时对它**只出声、不放行以外的动作**：经 IPC 写入宿主专用名 ⇒ \`console.error\` 点名 ＋
 *     **值照写**。理由 = 旗子是**状态写**不是注册（\`setValue\` 无归属参数、IPC 通道不带身份）⇒
 *     运行时**拿不到「谁是先者」**，「先者保留」在这里**结构上不可实现**（1.37 §12.1/§12.2）。
 *     ⚠️ **保护主力在静态腿**（SDK \`context-ownership\`）——运行时是**第二道网**，只覆盖
 *     「插件在运行时设了宿主专用名」这一形态。
 *
 * 为什么运行时需要一份**静态**副本（而不是「看谁先注册」）：
 *   宿主真键里有**从未被注册**的（\`app.schemaVersion\`——settings.json 的内部标志键），
 *   靠「宿主注册在先」这条顺序事实判不出来。**正确性不许押在注册顺序上**（1.33 §11.1 裁决）。
 *
 * 三份同源：壳账 \`scripts/host-reserved.json\` · SDK 副本 \`packages/plugin-sdk/schemas/host-reserved.json\`
 *   · 本文件。漂移由 \`node scripts/gen-host-reserved.mjs --check\` 拦（四向对账）。
 *
 * ⚠️ **账里的 \`contextKeysPublic\`（宿主公开约定面）刻意不进本模块**：约定面 = 「插件可设」⇒
 *   运行时对它没有可执行的判断。
 */
${arr("HOST_RESERVED_CONFIG_KEYS", reserved.configKeys)}
${arr("HOST_PSEUDO_PLUGIN_IDS", reserved.pseudoPluginIds)}
${arr("HOST_RESERVED_CONTEXT_KEYS_HOST_ONLY", reserved.contextKeysHostOnly)}
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

/* ── 入口 ──────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);

/**
 * 主流程（仅直接运行时执行）。`--self-test` 转发给同名测试模块——
 * ⛔ 这里是 `async function` 而非顶层 await：本文件与测试模块互为环（测试模块静态 import 本文件），
 *    顶层 await 会与其互等而死锁（实测 exit 13 / unsettled top-level await）。
 */
async function main() {
  if (args.includes("--self-test")) {
    const { selfTest } = await import("./gen-host-reserved.test.mjs");
    process.exit(selfTest());
  }

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
  console.log(
    "宿主专用 context key",
    out.contextKeysHostOnly.length,
    JSON.stringify(out.contextKeysHostOnly),
  );
  console.log(
    "宿主公开约定面 context key",
    out.contextKeysPublic.length,
    JSON.stringify(out.contextKeysPublic),
  );
  console.log("宿主兜底配方 id", JSON.stringify(out.appearanceRecipeIds));
  console.log("宿主兜底配色 id", JSON.stringify(out.appearanceColorwayIds));
  console.log("宿主保底图标主题 id", JSON.stringify(out.appearanceIconThemeIds));
  console.log("宿主外观哨兵", JSON.stringify(out.appearanceSentinels));
  console.log("外观 id 证照", JSON.stringify(out.appearanceIdGrants));
  console.log("宿主内置协议 id", JSON.stringify(out.protocolIds), "· 受控 openExternal 白名单", JSON.stringify(out.externalProtocols));
}

main();
