/**
 * `@linkdesk/ui` 导出面**账本**——提取 / 序列化 / diff 的**唯一口径**（E6#121 立尺；「插件最低壳版本门禁」
 * G1 加 `since` 一栏）。
 *
 * ── 它守的是哪两句话 ──
 *   L9「UI 集中供给」把 `@linkdesk/ui` 从「编译进插件 bundle」翻转为「池 vendor 单实例供给」。
 *   翻转后插件运行时只有**壳那一版**组件——每个导出名从此是终身承诺（作者面 npm i 的只是
 *   类型 + dev 解析体）。⇒ 同一份账本供两条判据：
 *     ① **只许新增、不许删除 / 改名**：`scripts/check-ui-surface-additive.mjs` 常驻判红；
 *     ② **每个导出名带 `since`**（＝它**首次随哪个壳版本**提供）：插件据此算自己的最低壳版本
 *        （`plugin.json` 的 `minAppVersion`）。判据本体随包下发，住
 *        `packages/plugin-sdk/src/eslint/checks/ui-min-app-version.ts`（第三方 npm i 后离线可判）。
 *   🔴 **`since` 的语义是「壳版本」不是「ui 包版本」**——`minAppVersion` 比的是**壳版本**，而 ui
 *      与壳的「同号锁步」已退役（E6#166「对货不对号」）⇒ ⛔ 绝不能靠版本号大小推，只能显式记录。
 *   写侧 = `scripts/gen-ui-surface.mjs`（历史回填 ＋ 增量打戳 ＋ 随 SDK 包投影两份）。
 *
 * ── 真相源 ──
 *   `packages/linkdesk-ui/src/index.ts`（barrel，头注释自称「公共导出面的唯一真相源」）。
 *   导出行是规整的 `export { default as X } from "@shared/…"` / `export { X } from …` /
 *   `export type { … } from …`——正则逐行提取，⛔ 不引 AST 依赖（照 `lib/api-surface.mjs` 的朴素风格）。
 *
 * ── 分类（只影响账本的归档栏目，不影响判红——任何一栏缺项都红）──
 *   · `components`  默认导出（`export { default as X }`）＋ 具名组件（InlineInput / PluginIcon /
 *                   FileIconResolver / OverlayPortal / SegmentPreviewText / SegmentPreviewSwatch 等）——
 *                   **新导出的默认落栏**；
 *   · `hooks`       名字 `use` 开头（useClickPreview 一族，E6#15h）；
 *   · `helpers`     显式清单（pickIdentityArt / DEFAULT_PLUGIN_IDENTITY_URI / inferSliderStep /
 *                   urlSourceKey / 设置控件词表一族的函数与常量）；
 *   · `types`       `export type { … }`（对插件许诺的类型面，同样只加不删）。
 *   新增导出不认识就落 `components`——⛔ 不许为了「归档好看」在门禁里发明第四道判断。
 *
 * ── 集合语义 ──
 *   所有栏目按名排序写入 ⇒ 只改顺序、只改 barrel 注释**不产生 diff**（判红的输入只有名字集合）。
 *   · E6#110 起另有 `collectUiSharedDirs()`——barrel 引用的 `@shared/<dir>` 目录集（黄灯名单覆盖面断言的输入）。
 *
 * ── 形态：**两代并存**（老 tag 里是旧形态，判据必须都认）──
 *   旧（E6#121 起至 G1 之前）：`{ components: ["Badge", …], … , count }`——**名字数组**；
 *   新（G1 起）：`{ generatedAt, shellVersion, components: { "Badge": { "since": "0.2.13" }, … }, … , count }`。
 *   `check-ui-surface-additive` 的基线降级链会读到 **tag 里的旧形态** ⇒ `surfaceNames()` 是两代的
 *   归一化入口：**所有消费者都经它取名字**（⛔ 别各自判断形态）。`ledgerGaps()` 则是新形态的完整性判据。
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "..", "..");
export const BARREL_REL = "packages/linkdesk-ui/src/index.ts";
/** 壳仓账本（唯一数据源；`check-ui-surface-additive` 与生成器都读它） */
export const SNAPSHOT_REL = "scripts/ui-surface.json";
/** 随 `@linkdesk/plugin-sdk` 包下发的**同一份账本**（生成器同笔投影；`--check` 对账） */
export const SDK_LEDGER_REL = "packages/plugin-sdk/schemas/ui-surface.json";
/**
 * 壳运行期 TS 投影（「插件最低壳版本门禁」G4 加的**第四份投影**，同笔生成；`--check` 对账）。
 * 壳不依赖 `@linkdesk/plugin-sdk` ⇒ 运行期读不到随包那份 ⇒ 照 `host-css.generated.ts` 同族先例，
 * 生成一份编译内的账本给兼容读数腿（`src/core/compat/compatibility.ts`）。
 */
export const RUNTIME_LEDGER_REL = "src/core/compat/ui-surface.generated.ts";
/** 壳版本来源（`since` 打戳 + 账本信息栏都取它） */
export const SHELL_PKG_REL = "package.json";

export const CATEGORIES = ["components", "hooks", "helpers", "types"];

/** `x.y.z` —— `since` 与 `minAppVersion` 的同一形态口径 */
export const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/** helpers 栏的显式清单（见头注「分类」）——新增 helper 在这里加一行名即可 */
const HELPER_NAMES = new Set([
  "pickIdentityArt",
  "DEFAULT_PLUGIN_IDENTITY_URI",
  "inferSliderStep",
  "urlSourceKey",
  // 设置控件词表正典与共享化（2026-10-03）：正典运行时值（哨兵/名单/类型守卫）+ 纯函数
  "CONFIG_NONE_SENTINEL",
  "MIX_FOLLOW_THEME_SENTINEL",
  "SETTINGS_UI_HINTS",
  "SETTINGS_RENDER_HINTS",
  "isSettingsUiHint",
  "formatEffectiveValue",
  "splitStringList",
  // 默认打开方式管理器共享化（2026-10-06）：聚合口径与归一存储键的纯函数/常量（一处实现）
  "buildManagerModel",
  "normalizeExt",
  "normalizeExtList",
  "overrideKeyOf",
  "readOverride",
  "extractDeclaredExtensions",
  "extLabelHead",
  "EXT_LABEL_MAX",
  // 默认打开方式管理器共享化 1.7（2026-10-06）：C5 卡内工具条的行序/过滤口径（同「一处实现」性质）
  "orderRows",
  "filterRows",
  "hitKindOf",
]);

const RE_DEFAULT = /^export\s*\{\s*default\s+as\s+([A-Za-z_$][\w$]*)\s*\}\s*from\s*["']([^"']+)["']/;
const RE_TYPE = /^export\s+type\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/;
const RE_NAMED = /^export\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/;

/**
 * 从 barrel **源码文本**提取导出面 → `{ components, hooks, helpers, types }`（各栏排序）。
 * 纯函数（不碰盘）——`collectUiSurface` 就是「读盘 + 本函数」。
 * 🔴 历史回填**不走源码历史**（走快照提交序列，见 `gen-ui-surface.mjs` 的 `historyStamps` 注释）：
 *    拿今天的提取器去解析历史 barrel，旧形状解析不了就抛，回填会中断。本函数域 = 工作区这一份。
 */
function extractUiSurface(barrelSrc) {
  const surface = { components: new Set(), hooks: new Set(), helpers: new Set(), types: new Set() };
  for (const rawLine of String(barrelSrc).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
    const mDefault = RE_DEFAULT.exec(line);
    if (mDefault) {
      surface.components.add(mDefault[1]);
      continue;
    }
    const mType = RE_TYPE.exec(line);
    if (mType) {
      for (const name of mType[1].split(",").map((s) => s.trim()).filter(Boolean)) surface.types.add(name);
      continue;
    }
    const mNamed = RE_NAMED.exec(line);
    if (mNamed) {
      for (const name of mNamed[1].split(",").map((s) => s.trim()).filter(Boolean)) {
        if (name.startsWith("use")) surface.hooks.add(name);
        else if (HELPER_NAMES.has(name)) surface.helpers.add(name);
        else surface.components.add(name);
      }
      continue;
    }
    if (line.startsWith("export ")) {
      throw new Error(`${BARREL_REL} 出现本提取器不认识的导出行：${line}\n（新导出形状要么改归 lib/ui-surface.mjs 的口径，要么别用该形状）`);
    }
  }
  return {
    components: [...surface.components].sort(),
    hooks: [...surface.hooks].sort(),
    helpers: [...surface.helpers].sort(),
    types: [...surface.types].sort(),
  };
}

/** 读盘版（= `extractUiSurface(readBarrel())`；消费者照旧用这个） */
export function collectUiSurface(root = ROOT) {
  return extractUiSurface(readBarrel(root));
}

/**
 * barrel 引用的 `@shared/<dir>` 目录集（排序）——E6#110 黄灯名单「覆盖面断言」的输入。
 * 🔴 与 collectUiSurface 同一组正则、同一份 barrel——同一把尺子的第二个读数，⛔ 不在别处另写解析器
 * （仓里出现第二个 barrel 解析器 = 又一把会自我漂移的尺子，正是 E6#110 要防的病）。
 * 形状纪律与 collectUiSurface 同步：不认识的导出行照样抛（fail-closed，别让新形状悄悄绕出名单）。
 */
export function collectUiSharedDirs(root = ROOT) {
  const src = readBarrel(root);
  const dirs = new Set();
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
    const m = RE_DEFAULT.exec(line) ?? RE_TYPE.exec(line) ?? RE_NAMED.exec(line);
    if (!m) {
      if (line.startsWith("export ")) {
        throw new Error(
          `${BARREL_REL} 出现本提取器不认识的导出行：${line}\n（新导出形状要么改归 lib/ui-surface.mjs 的口径，要么别用该形状）`,
        );
      }
      continue;
    }
    if (typeof m[2] === "string" && m[2].startsWith("@shared/")) {
      dirs.add(m[2].slice("@shared/".length).split("/")[0]);
    }
  }
  return [...dirs].sort();
}

function readBarrel(root) {
  return readFileSync(resolve(root, BARREL_REL), "utf8");
}

/* ══════════════════════════════════════════════════════════════════════════
   形态与读写——**所有形态判断只在这里**（消费者经这些函数，⛔ 别各自判形态）
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * 两代形态归一化 → `{ components: [名…], hooks: […], helpers: […], types: […] }`（各栏排序）。
 * 🔴 **名字集合的唯一出口**：`diffUiSurface` / `flattenUiSurface` / 生成器 / 门禁都经它取名字。
 * 未知形态的栏一律当空（真判红由 `isUiSurfaceShape` 的 fail-closed 负责，⛔ 不在这里静默造名字）。
 */
export function surfaceNames(surface) {
  const out = {};
  for (const cat of CATEGORIES) {
    const col = surface?.[cat];
    if (Array.isArray(col)) out[cat] = col.filter((n) => typeof n === "string");
    else if (col && typeof col === "object") out[cat] = Object.keys(col).filter((n) => col[n] && typeof col[n].since === "string");
    else out[cat] = [];
    out[cat] = [...out[cat]].sort();
  }
  return out;
}

/** 通用形态防烂：四栏**都在**，且每栏非空形态合法（名字数组 或 对象）⇒ true。门禁对烂账本 fail-closed。 */
export function isUiSurfaceShape(snap) {
  if (!snap || typeof snap !== "object") return false;
  return CATEGORIES.every((c) => {
    const col = snap[c];
    return Array.isArray(col) || (Boolean(col) && typeof col === "object");
  });
}

/**
 * **账本完整性判据**（G1 的机械腿，05 §三 原文：「四列每一项都有 `since`；缺一即红」）。
 * 返回问题行清单（空 = 完整）。防的正是「回填只回填了一半」——
 * 半个账本比没有账本更坏：插件会拿它算出一个**偏低的地板**，然后照样绿。
 */
export function ledgerGaps(snap) {
  if (!snap || typeof snap !== "object") return ["账本不是对象（读到的不是 JSON 对象）"];
  const gaps = [];
  for (const c of CATEGORIES) {
    const col = snap[c];
    if (col === undefined) {
      gaps.push(`缺 \`${c}\` 栏——四栏（${CATEGORIES.join(" / ")}）一个都不能少`);
      continue;
    }
    if (Array.isArray(col)) {
      gaps.push(`\`${c}\` 栏还是旧形态（裸名字数组、无 since）——跑 \`npm run ui-surface:regen -- --backfill\``);
      continue;
    }
    if (!col || typeof col !== "object") {
      gaps.push(`\`${c}\` 栏不是对象（名 → { since }）`);
      continue;
    }
    for (const [name, v] of Object.entries(col)) {
      if (!v || typeof v !== "object") {
        gaps.push(`${c}.${name} 缺 since（条目不是对象）`);
        continue;
      }
      if (typeof v.since !== "string" || v.since.trim() === "") gaps.push(`${c}.${name} 缺 since`);
      else if (!SEMVER_RE.test(v.since)) gaps.push(`${c}.${name} 的 since = ${JSON.stringify(v.since)} 不是 x.y.z 形态`);
    }
  }
  return gaps;
}

/** 账本 → `{ "<栏>.<名>": "<since>" }`（排序、路径唯一——生成器的打戳表与对账输入） */
export function ledgerSinceMap(snap) {
  const out = {};
  for (const cat of CATEGORIES) {
    const col = snap?.[cat];
    if (!col || typeof col !== "object" || Array.isArray(col)) continue;
    for (const [name, v] of Object.entries(col)) {
      if (v && typeof v.since === "string") out[`${cat}.${name}`] = v.since;
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** 内容指纹（生成器对账用）：名字集合 ＋ since 表——**不含 generatedAt / shellVersion**（那两个是活戳，天天变） */
export function ledgerContent(snap) {
  return JSON.stringify({ names: surfaceNames(snap), since: ledgerSinceMap(snap) });
}

/** 壳仓账本文本（键序固定；名字排序在前 ⇒ diff 稳定；`count` = 四栏导出名总数，与 barrel 头注释计数互为对账） */
export function renderLedger({ names, since, shellVersion, generatedAt = new Date().toISOString() }) {
  const cols = CATEGORIES.map((cat) => {
    const rows = names[cat].map((n) => `    ${JSON.stringify(n)}: { "since": ${JSON.stringify(since[`${cat}.${n}`] ?? "")} }`);
    return `  ${JSON.stringify(cat)}: {\n${rows.join(",\n")}\n  }`;
  });
  const count = CATEGORIES.reduce((a, c) => a + names[c].length, 0);
  return (
    `{\n  "generatedAt": ${JSON.stringify(generatedAt)},\n  "shellVersion": ${JSON.stringify(shellVersion)},\n` +
    `${cols.join(",\n")},\n  "count": ${count}\n}\n`
  );
}

/**
 * SDK 随包账本（`packages/plugin-sdk/schemas/ui-surface.json`）——**同一投影、另一种装帧**。
 * 照 `host-css-names.json` 的先例：带 `$comment` 自述出处 ＋ `version`（装帧版本），⛔ 不带活戳
 * （生成时间/壳版本），好让「内容没变就字节不动」——发布物的 diff 才有意义。
 */
export function renderSdkLedger({ names, since }) {
  const body = {
    $comment:
      "`@linkdesk/ui` 导出面账本（随包下发，生成物勿手改）——每个导出名 → since（首次随哪个**壳版本**提供）。" +
      "插件据此算自己 `plugin.json` 的 minAppVersion 地板：地板 = max(since(实际导入的名字))。" +
      "数据唯一源 = 壳仓 scripts/ui-surface.json（同一次采集），由 scripts/gen-ui-surface.mjs 同笔投影（--check 对账）；" +
      "口径 = scripts/lib/ui-surface.mjs。since 是**壳版本**空间（不是 ui 包版本），语义与判据见 docs/03-插件制造/04-插件分发格式.md §minAppVersion。",
    version: 1,
  };
  for (const cat of CATEGORIES) body[cat] = Object.fromEntries(names[cat].map((n) => [n, { since: since[`${cat}.${n}`] }]));
  body.count = CATEGORIES.reduce((a, c) => a + names[c].length, 0);
  return JSON.stringify(body, null, 2) + "\n";
}

/**
 * 壳运行期 TS 投影（G4 的第四份投影，`src/core/compat/ui-surface.generated.ts`）。
 * 与 `renderSdkLedger` 同一纪律：**无活戳**（⛔ 不塞 generatedAt——字节稳定，发布物 diff 才有意义）；
 * `shellVersion` 是账本信息栏，照留。任一 since 缺失/形态坏 ⇒ **抛**（运行期半本账比没账更坏——
 * 消费方拿它算实际地板，空 since 会算出假绿）。
 */
export function renderRuntimeLedger({ names, since, shellVersion }) {
  for (const cat of CATEGORIES) {
    for (const n of names[cat]) {
      const v = since[`${cat}.${n}`];
      if (typeof v !== "string" || !SEMVER_RE.test(v)) {
        throw new Error(`renderRuntimeLedger：${cat}.${n} 的 since = ${JSON.stringify(v)} 不是 x.y.z——运行期投影拒绝生成（先补账）`);
      }
    }
  }
  const cols = CATEGORIES.map((cat) => {
    const rows = names[cat].map((n) => `    ${JSON.stringify(n)}: { since: ${JSON.stringify(since[`${cat}.${n}`])} },`);
    return `  ${cat}: {\n${rows.join("\n")}\n  }`;
  });
  return `/**
 * \`@linkdesk/ui\` 导出面账本——**生成物，勿手改**（「插件最低壳版本门禁」G4 · 壳运行期投影）。
 *
 * 生成器：\`scripts/gen-ui-surface.mjs\`；数据唯一源 = \`scripts/ui-surface.json\`（同笔第四份投影：
 * 账本 json ×2 ＋ 作者手册 since 表 ＋ 本文件，\`--check\` 对账抓漂移）。
 * 壳不依赖 \`@linkdesk/plugin-sdk\` ⇒ 运行期读不到随包那份 ⇒ 照 \`host-css.generated.ts\` 同族先例
 * 生成编译内的一份。⚠️ 字节稳定（无 generatedAt 之类活戳）；改了账本跑 \`npm run ui-surface:regen\`
 * 同笔重写四份。
 *
 * 消费方：\`src/core/compat/compatibility.ts\`（G4 兼容读数腿）——已装产物对 \`@linkdesk/ui\` 的
 * 静态具名导入名在此查 \`since\`（四栏一个面），取 max ＝ 实际地板。
 */
export interface UiSurfaceLedger {
  /** 打戳基准（账本信息栏，非判据输入） */
  shellVersion: string;
  components: Readonly<Record<string, { readonly since: string }>>;
  hooks: Readonly<Record<string, { readonly since: string }>>;
  helpers: Readonly<Record<string, { readonly since: string }>>;
  types: Readonly<Record<string, { readonly since: string }>>;
}

export const UI_SURFACE_LEDGER: UiSurfaceLedger = {
  shellVersion: ${JSON.stringify(shellVersion)},
${cols.join(",\n")},
};
`;
}

/** 两份账本 diff：`removed` = 面被拿走（判红），`added` = 面变多（允许方向）。路径 = `<栏>.<名>`。 */
export function diffUiSurface(base, current) {
  const before0 = surfaceNames(base);
  const now0 = surfaceNames(current);
  const removed = [];
  const added = [];
  for (const cat of CATEGORIES) {
    const before = new Set(before0[cat]);
    const now = new Set(now0[cat]);
    for (const n of now) if (!before.has(n)) added.push(`${cat}.${n}`);
    for (const n of before) if (!now.has(n)) removed.push(`${cat}.${n}`);
  }
  return { removed: removed.sort(), added: added.sort() };
}

/** 账本拍平成面路径（人读 / 放行匹配用） */
export function flattenUiSurface(surface) {
  const names = surfaceNames(surface);
  return CATEGORIES.flatMap((cat) => names[cat].map((n) => `${cat}.${n}`));
}

/* ── 作者手册里的「起于哪个壳版本」表（19 号档 §2.1；生成物，⛔ 不手写） ── */

/**
 * 生成块的两处标记——文档里手放一次，块内内容由生成器写。
 * ⛔ 不做「找不到就 append」的兜底：那会造出**第二份**真相（同一张表两处、各有各的日期）。
 */
export const SINCE_DOC_BEGIN = "<!-- ui-since:begin";
export const SINCE_DOC_END = "<!-- ui-since:end -->";

/** 两处落点（中英各一，`check-author-docs-bilingual` 的映射表里也是这一对） */
export const SINCE_DOC_FILES = {
  zh: "docs/03-插件制造/19-组件速查.md",
  en: "docs/03-plugin-authoring/19-component-cheatsheet.md",
};

/** x.y.z 比较（数字序——`0.2.9 < 0.2.13`，字符串序会反） */
function cmpVersion(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/** 列分组：`components / hooks+helpers / types`——与 19 号档自己的分节（组件 · Hooks 与工具函数 · 类型）对齐 */
const SINCE_DOC_LOCALES = {
  zh: { since: "起于", cols: ["组件", "Hooks / 工具函数", "类型"], sep: "、" },
  en: { since: "Since", cols: ["Components", "Hooks & helpers", "Types"], sep: ", " },
};
const SINCE_DOC_GROUPS = [["components"], ["hooks", "helpers"], ["types"]];

/**
 * 账本 → 生成块正文（markdown 表：一行一个壳版本，名字按列落位）。
 * 这张表是 `minAppVersion` 的**事实来源**：作者静态导入的名字，取它们 `since` 的最大值 = 地板下限。
 */
export function renderSinceDoc({ names, since, locale = "zh" }) {
  const L = SINCE_DOC_LOCALES[locale];
  if (!L) throw new Error(`未知语种 ${JSON.stringify(locale)}（只有 ${Object.keys(SINCE_DOC_LOCALES).join(" / ")}）`);
  const versions = [...new Set(Object.values(since))].sort(cmpVersion);
  const rows = versions.map((v) => {
    const cells = SINCE_DOC_GROUPS.map((group) => {
      const hit = group.flatMap((cat) => (names[cat] ?? []).filter((n) => since[`${cat}.${n}`] === v));
      return hit.length > 0 ? hit.map((n) => `\`${n}\``).join(L.sep) : "—";
    });
    return `| **${v}** | ${cells.join(" | ")} |`;
  });
  return [`| ${L.since} | ${L.cols.join(" | ")} |`, "|:--|:--|:--|:--|", ...rows].join("\n");
}

/**
 * 把生成块嵌进文档正文（纯函数——生成器与自测共用同一段代码，⛔ 不各写一份）。
 * 两处标记缺一 ⇒ **抛**（打回，见 SINCE_DOC_BEGIN 的注记）。
 */
export function spliceSinceDoc(text, block) {
  const beginIdx = text.indexOf(SINCE_DOC_BEGIN);
  const endIdx = text.indexOf(SINCE_DOC_END);
  if (beginIdx < 0 || endIdx < 0 || endIdx < beginIdx) {
    throw new Error(`正文里找不到 \`${SINCE_DOC_BEGIN} …\` 与 \`${SINCE_DOC_END}\` 这对标记（⛔ 不 append：那会造出第二份真相）`);
  }
  const head = text.slice(0, text.indexOf("\n", beginIdx) + 1); // begin 那一行整行保留
  return `${head}${block}\n${text.slice(endIdx)}`;
}
