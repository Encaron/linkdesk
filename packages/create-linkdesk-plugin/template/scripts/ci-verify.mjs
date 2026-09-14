#!/usr/bin/env node
/**
 * ci-verify——插件仓自检门禁（E6#102 · L7 第 7.5 轮）。挂 `npm run verify`，由 `.github/workflows/ci.yml` 调起。
 *
 * ── 为什么有它 ──
 * 插件源码搬出壳仓之后（E6#99），壳仓的 `npm run check` **够不着它们了**（那份门禁只覆盖壳仓）。
 * 搬走的一共六类检查：编译图 / eslint（含 linkdesk/* 自定义规则）/ vitest / 体量 / i18n / 主题审计。
 * 本脚本 + ci.yml + vitest 配置 = 给插件仓装回来的那一份，否则「独立」就是拿「质量真空」换的。
 *
 * ── 四段（每段独立判红；**没有对象也要说话**，不许静默绿）──
 *   ① lint 严格腿   —— `@linkdesk/plugin-sdk` 的 eslint 规则腿 + css/font-scale/spacing 三条扫描腿。
 *                     🔴 SDK 的 `npm run lint` 是 **WARN 级、永不 fail**（07 §六·三档：警告不是封锁，
 *                     作者本地不被拦——那是刻意的）。CI 要的是**拦截**，所以本段把同一份报告按
 *                     「零偏离」判定。**这是「lint 会红」的唯一来源**，别把这段删了换成 `npm run lint`。
 *   ② 跨插件 import —— 壳仓 `linkdesk/no-cross-plugin-import` 的**仓外形态**：插件源码不得引用别的插件
 *                     仓库/包（相对路径越出本仓根，或裸包名形如 `linkdesk-plugin-*` / `@linkdesk/plugin-*`），
 *                     package.json 也不得依赖别的插件包。共享代码只经 `@linkdesk/ui`，插件间通信走
 *                     `window.linkdesk.*`。⚠️ 这条规则**不在** SDK preset 里（preset 只注册 8 条 linkdesk
 *                     规则、且全 WARN）——故必须自带（「补进 preset」已登记为待收的账，见 06-门禁与CI.md）。
 *   ③ 字典完整性    —— `contributes.i18n` / `contributes.languages` 声明的字典：文件在、可解析、
 *                     每个值都是**非空字符串**。另打印「本仓 `t()` key 的自有字典覆盖度」为**黄灯**。
 *   ④ 声明自洽      —— 声明必须落在**真实存在的文件**上（E6#102f 的仓内等价物：壳侧读的是随包种子 /
 *                     冻结快照，插件仓该有「直接吃自己源码」的那条）：`entry` / `icon` / `views[].render`
 *                     文件在；`contributes.themes` / `iconThemes` 的数据文件在且过各自的 schema；
 *                     主题 recipe 引用的 `linkdesk://<id>/…` 资产在（且 id 就是本插件）；floatingPanel
 *                     三向自洽（viewId ↔ views[].id ↔ render）。
 *
 * ── 为什么 ③ 的覆盖度只能黄灯（不是漏做）──
 * `t()` 的 key 可以合法地住在**应用级字典**里（`lang-defaults` 插件，运行时由它经 LanguageRegistry
 * 提供）。壳侧 `audit-i18n.mjs` 是把所有字典并成一个集合来判的，而**插件仓物理上看不到别的仓**——
 * 在这里判红必然产生假红（作者写 `t("取消")` 完全合法），而假红会让真红失效（壳侧 audit-i18n 头注
 * 同款理由）。所以：字典**文件本身**的问题判红（③ 上半），**跨仓才能回答**的覆盖度只报告。
 *
 * 用法：node scripts/ci-verify.mjs     （工程根 = cwd）
 * 退出码 0 = 四段全过；1 = 有红灯（逐条打印缺什么）
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { parse as parseJsonc, printParseErrorCode } from "jsonc-parser";
import { runPluginLint, renderPluginLintReport } from "@linkdesk/plugin-sdk/eslint";
import { validateThemeJson, validateIconThemeJson } from "@linkdesk/plugin-sdk";

const ROOT = process.cwd();
const failures = [];
const fail = (msg) => failures.push(msg);
const line = (s = "") => console.log(s);

/** 工程相对路径（正斜杠）——报错信息里一律用它 */
const rel = (p) => relative(ROOT, p).split(sep).join("/");

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".vite", "coverage", "__tests__"]);
function listFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) listFiles(p, out);
    else out.push(p);
  }
  return out;
}
/** 参与 lint / import 扫描的源码文件（测试与 mock 不在其列——它们不受这些纪律约束） */
const isSourceFile = (p) =>
  /\.(ts|tsx|js|jsx)$/.test(p) && !/\.(test|spec)\./.test(p) && !/\.(fixture|mock)\./.test(p) && !/mock/i.test(p);

const sourceFiles = listFiles(join(ROOT, "src")).filter(isSourceFile);

line("插件仓自检（ci-verify · E6#102）");
line("────────────────────────────────────────────────────────────");

// ── 读 manifest（JSONC——脚手架允许注释，与 SDK validatePluginJson 同一个解析器）──
let manifest = null;
const MANIFEST_PATH = join(ROOT, "plugin.json");
if (!existsSync(MANIFEST_PATH)) {
  fail("plugin.json 不在工程根——插件身份的唯一来源，缺了后面几段都无从谈起");
} else {
  const errors = [];
  manifest = parseJsonc(readFileSync(MANIFEST_PATH, "utf8"), errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    fail(`plugin.json 不是合法 JSONC：${errors.map((e) => printParseErrorCode(e.error)).join("、")}`);
    manifest = null;
  }
}
/** 本插件 id——顶层 `pluginId` 是唯一真源；缺了按目录名兜底（兼容存量插件，黄灯提示） */
const pluginId = manifest?.pluginId ?? basename(ROOT);

// ═══════════════ ① lint 严格腿 ═══════════════
// ⚠️ 无源码的仓（纯数据插件：主题 / 语言包 / 图标集）SDK 的 `lintFiles` 会抛 AllFilesIgnoredError
//    （匹配到的文件全在忽略表里 ⇒ eslint 视作「全被忽略」）。那是「无对象」，不是失败——但**要说出来**。
//    ⚠️ 「全无 ts/tsx」时连 `.css` 扫描腿也一并跳过——所以**必须**先确认本仓真的没有 .css 可查，
//       否则就成了「静默漏查」（宁可响亮报错，不许假装查过）。
const cssFiles = listFiles(ROOT).filter((p) => p.endsWith(".css"));
let report = null;
let lintNoObject = null;
try {
  report = await runPluginLint(ROOT);
} catch (e) {
  // 该异常的名字/模板/消息三处都可能承载「全被忽略」这个语义（实测：message 里没有错误类名）
  const sig = `${e?.name ?? ""} ${e?.messageTemplate ?? ""} ${e?.message ?? ""}`;
  if (/AllFilesIgnoredError|all-matched-files-ignored|All files matched by .* are ignored/i.test(sig)) {
    if (cssFiles.length > 0) {
      fail(
        `① lint 严格腿：本仓有 ${cssFiles.length} 个 .css 却没有 ts/tsx 源码——` +
          `SDK 的 lintFiles 在「全无 ts/tsx」时会抛，把 .css 扫描腿一起吃掉了。**不许静默放过**：` +
          `给本仓补一份最小 ts 入口，或把这条记进待收的 SDK 账。`,
      );
    } else {
      lintNoObject = "本仓没有 ts/tsx 源码、也没有 .css——SDK 的 lintFiles 在「全无对象」时会抛（已登记为 SDK 的账）";
    }
  } else {
    throw e;
  }
}
if (report) process.stdout.write(renderPluginLintReport(report) + "\n");

/**
 * 「disable 注释引用了 preset 里没有的规则名」这一类——eslint 把它当 **fatal** 报出来。
 * 已知来源：**壳仓专有**规则名随源码一起搬进了插件仓（实测：serial-monitor 的
 * `src/services/SerialContext/ipc.ts` 里那条 `linkdesk/no-module-level-ipc-listener`——
 * 它只在壳仓的 eslint.config.js 里注册过）。
 * **报告不拦**：这不是代码缺陷，是「规则名归属」问题（SDK preset 认得的名字是另一份名单）。
 * 但必须响亮打印——静默放过才是真问题。
 */
const RULE_NOT_FOUND_RE = /^Definition for rule '.*' was not found/;
/** 按腿取偏离数（label 与 lint.ts 的 legs 一致） */
const legCount = (label) => report?.legs.find((l) => l.label === label)?.violations.length ?? 0;

const allRows = report?.eslintRows ?? [];
const ruleNotFound = allRows.filter((r) => RULE_NOT_FOUND_RE.test(r.message));
const strictEslintRows = allRows.filter((r) => !RULE_NOT_FOUND_RE.test(r.message));
/** 判红的三样：真 eslint 偏离 + css 硬编码腿（硬约束 1 的 .css 半边，eslint 到不了 .css）+ 见下 ②③④ */
const cssLegViolations = legCount("check-css-hardcode");
const strictLintViolations = strictEslintRows.length + cssLegViolations;
/** 只报告不拦的两条腿：字号度量与 4px 节奏——属「审美校准」（SDK 07 §六），存量偏离多且修它们要动插件源码 */
const advisoryLintViolations = legCount("check-font-scale") + legCount("check-spacing-grid");

if (lintNoObject) {
  line(`⏭ ① lint 严格腿：${lintNoObject}——本仓**无对象**（不是「绿」，是「没有可查的东西」）。`);
} else if (strictLintViolations > 0) {
  fail(
    `① lint 严格腿：${strictLintViolations} 处偏离（eslint ${strictEslintRows.length} + css 硬编码腿 ${cssLegViolations}）` +
      `——SDK 的 \`npm run lint\` 只报告不拦，**CI 拦**。逐条见上方报告。`,
  );
} else {
  line(
    `✅ ① lint 严格腿：eslint 规则腿 ${report.files} 文件 + css 硬编码腿 零偏离` +
      `（本段判红的是「硬约束 1/2 那一档」）。`,
  );
}
if (ruleNotFound.length > 0) {
  line(
    `   ⚠ ${ruleNotFound.length} 处 disable 注释引用了 preset 里**没有的规则名**（报告不拦）——` +
      `壳仓专有规则名随源码搬进本仓后会是这样：`,
  );
  for (const r of ruleNotFound.slice(0, 5)) line(`       ${r.file}:${r.line}  ${r.message}`);
}
if (advisoryLintViolations > 0) {
  line(
    `   ⚠ 附加腿（**报告不拦**）：font-scale ${legCount("check-font-scale")} 处 / ` +
      `spacing-grid ${legCount("check-spacing-grid")} 处——字号度量与 4px 节奏属审美校准档` +
      `（SDK 07 §六），逐条见上方报告；确属有意的用标准 disable 注释写明理由。`,
  );
}

// ═══════════════ ② 跨插件 import ═══════════════
/** 提取 import/export/require/动态 import 的模块说明符 */
const SPEC_PATTERNS = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];
/** 别的插件仓/包的形态——N3 命名规范：**仓名与 npm 包名都是 `linkdesk-plugin-<id>`** */
const OTHER_PLUGIN_RE = /^linkdesk-plugin-/;
/**
 * 首方 npm 作用域里**不是插件**的那几个——`@linkdesk/plugin-*` 是 LinkDesk 自己的包作用域
 * （`@linkdesk/plugin-sdk` = 作者 SDK 本体），插件不叫这个名字。别把它误判成「另一个插件」：
 * 排除名单**显式写死**，命中即放行（放行面越小越安全——多写一个名字只会让规则更松）。
 */
const FIRST_PARTY_NOT_PLUGIN = /^@linkdesk\/plugin-sdk(\/|$)/;
/** 该说明符是否指向「另一个插件」——是则给出人话理由 */
function whyCrossPlugin(spec) {
  if (FIRST_PARTY_NOT_PLUGIN.test(spec)) return null;
  if (OTHER_PLUGIN_RE.test(spec)) return "裸包名指向另一个插件";
  if (/^@linkdesk\/plugin-/.test(spec)) return "裸包名指向另一个插件";
  return null;
}
/** abs 是否落在 ROOT 内（防路径穿越式互引） */
const isInside = (abs) => abs === ROOT || abs.startsWith(ROOT + sep);

if (sourceFiles.length === 0) {
  line("⏭ ② 跨插件 import：本仓无源码（纯数据插件）——无对象（下面 package.json 那条依赖检查仍然适用）。");
}
const crossHits = [];
for (const file of sourceFiles) {
  const text = readFileSync(file, "utf8");
  for (const re of SPEC_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const spec = m[1];
      if (spec.startsWith(".")) {
        // 相对 import——解析出真实路径，越出本仓根 = 指向别的插件树（同仓内互引是合法的）
        const abs = resolve(dirname(file), spec);
        if (!isInside(abs)) crossHits.push(`${rel(file)} → "${spec}"（解析到本仓之外：${abs}）`);
      } else if (OTHER_PLUGIN_RE.test(spec)) {
        crossHits.push(`${rel(file)} → "${spec}"（裸包名指向另一个插件）`);
      }
    }
  }
}
// package.json 的依赖声明也算「引用」——import 扫不到的那半（有人只声明不 import 也是在搭耦合）
const PKG_PATH = join(ROOT, "package.json");
let selfPkgName = null;
if (existsSync(PKG_PATH)) {
  const pkg = JSON.parse(readFileSync(PKG_PATH, "utf8"));
  selfPkgName = pkg.name;
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    for (const dep of Object.keys(pkg[field] ?? {})) {
      if (OTHER_PLUGIN_RE.test(dep) && dep !== selfPkgName) {
        crossHits.push(`package.json ${field} 依赖了另一个插件包："${dep}"`);
      }
    }
  }
}
if (crossHits.length > 0) {
  fail(
    `② 跨插件 import：${crossHits.length} 处指向别的插件——万物皆可插件（换/卸任一插件不能影响其他）。\n` +
      crossHits.map((h) => `       ${h}`).join("\n") +
      `\n     共享代码走 @linkdesk/ui；插件间数据/命令走 window.linkdesk.*（configuration/commands/events）。`,
  );
} else if (sourceFiles.length > 0) {
  line(`✅ ② 跨插件 import：${sourceFiles.length} 文件零互引（源码 + package.json 依赖声明都查了）。`);
}

// ═══════════════ ③ 字典完整性 ═══════════════
/** 收集 manifest 声明的字典文件——`contributes.i18n`（langId → 路径）与 `contributes.languages[]` */
function collectDictDecls(m) {
  const out = [];
  const c = m?.contributes;
  if (c && typeof c === "object") {
    const i18n = c.i18n;
    if (i18n && typeof i18n === "object" && !Array.isArray(i18n)) {
      for (const [lang, p] of Object.entries(i18n)) {
        if (typeof p === "string") out.push({ origin: `contributes.i18n.${lang}`, rel: p });
      }
    }
    if (Array.isArray(c.languages)) {
      for (const l of c.languages) {
        if (l && typeof l.path === "string") out.push({ origin: `contributes.languages[${l.id ?? "?"}]`, rel: l.path });
      }
    }
  }
  return out;
}

const dictDecls = manifest ? collectDictDecls(manifest) : [];
const dictKeys = new Set();
if (dictDecls.length === 0) {
  line(
    `⏭ ③ 字典完整性：本仓**无字典声明**（contributes.i18n / contributes.languages 都没有）——无对象。` +
      `\n     插件 UI 文案的 key 若由应用级字典（lang-defaults 插件）提供，这是正常形态，不是漏配。`,
  );
} else {
  const dictProblems = [];
  for (const d of dictDecls) {
    const abs = resolve(ROOT, d.rel);
    if (!isInside(abs)) {
      dictProblems.push(`${d.rel}（${d.origin} 声明的路径越出插件根目录）`);
      continue;
    }
    if (!existsSync(abs)) {
      dictProblems.push(`${d.rel}（${d.origin} 声明但文件不存在）`);
      continue;
    }
    let dict;
    try {
      dict = JSON.parse(readFileSync(abs, "utf8"));
    } catch (e) {
      dictProblems.push(`${d.rel} 不是合法 JSON：${e.message}`);
      continue;
    }
    if (!dict || typeof dict !== "object" || Array.isArray(dict)) {
      dictProblems.push(`${d.rel} 不是一个「key → 文案」对象`);
      continue;
    }
    for (const [k, v] of Object.entries(dict)) dictKeys.add(k);
    const badValues = Object.entries(dict).filter(([, v]) => typeof v !== "string" || v.trim() === "");
    if (badValues.length > 0) {
      dictProblems.push(
        `${d.rel} 有 ${badValues.length} 个空值/非字符串值：${badValues.slice(0, 5).map(([k]) => k).join("、")}`,
      );
    }
  }
  if (dictProblems.length > 0) {
    fail(`③ 字典完整性：${dictProblems.length} 处问题\n${dictProblems.map((p) => `       ${p}`).join("\n")}`);
  } else {
    line(
      `✅ ③ 字典完整性：${dictDecls.length} 个声明的字典文件全部在、可解析、无非空值问题` +
        `（共 ${dictKeys.size} 个 key）。`,
    );
  }
}

/** ③ 黄灯：本仓 t() key 的自有字典覆盖度——**只报告不判红**（理由见文件头注） */
if (sourceFiles.length > 0) {
  const tKeys = new Set();
  for (const file of sourceFiles) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/\bt\(\s*(["'])((?:\\.|(?!\1)[^\\\r\n])*)\1/g)) tKeys.add(m[2]);
  }
  const missing = [...tKeys].filter((k) => !dictKeys.has(k) && !/^[\x20-\x7e]*$/.test(k));
  if (tKeys.size === 0) {
    line("   （本仓源码里没有 t() 调用——没有可核的 key。）");
  } else if (missing.length === 0) {
    line(`   ✅ 本仓 ${tKeys.size} 个 t() key 全部命中自有字典。`);
  } else {
    line(
      `   ⚠ 本仓 ${tKeys.size} 个 t() key 里，有 ${missing.length} 个不在自有字典——` +
        `**黄灯不拦**（key 可能由应用级字典 lang-defaults 提供，插件仓看不到它）：`,
    );
    line(`       ${missing.slice(0, 8).join("、")}${missing.length > 8 ? ` … 等 ${missing.length} 个` : ""}`);
  }
}

// ═══════════════ ④ 声明自洽（声明必须落在真实存在的文件上）═══════════════
if (!manifest) {
  line("⏭ ④ 声明自洽：plugin.json 读不到——本段跳过（上面那条红灯先修）。");
} else {
  const problems = [];
  const ok = [];

  /** 声明的相对路径 → 检查文件真的在（本仓根为基准） */
  const checkDeclaredFile = (declRel, origin) => {
    const abs = resolve(ROOT, declRel);
    if (!isInside(abs)) {
      problems.push(`${declRel}（${origin} 声明的路径越出插件根目录）`);
      return false;
    }
    if (!existsSync(abs)) {
      problems.push(`${declRel}（${origin} 声明但文件不存在）`);
      return false;
    }
    return true;
  };

  // entry / icon / marketIcon——顶层声明（schema 只验形状，不验文件在不在）
  if (typeof manifest.entry === "string") checkDeclaredFile(manifest.entry, "entry");
  for (const key of ["icon", "marketIcon"]) {
    if (typeof manifest[key] === "string") checkDeclaredFile(manifest[key], key);
  }

  // contributes.views[][].render——池打开视图时 import 的就是它，缺了当场失败
  const views = manifest.contributes?.views;
  const allViewIds = [];
  if (views && typeof views === "object") {
    for (const [containerId, list] of Object.entries(views)) {
      if (!Array.isArray(list)) continue;
      for (const v of list) {
        if (!v || typeof v !== "object") continue;
        if (typeof v.id === "string") allViewIds.push(v.id);
        if (typeof v.render === "string") {
          checkDeclaredFile(v.render, `contributes.views.${containerId}[${v.id ?? "?"}].render`);
        } else if (v.id !== undefined) {
          problems.push(`contributes.views.${containerId}[${v.id}].render 缺失——池打开该视图时无从 import`);
        }
      }
    }
    if (allViewIds.length > 0) ok.push(`${allViewIds.length} 个视图的 render`);
  }

  // contributes.themes / iconThemes——数据文件在 + 过各自的 schema（SDK 的公开校验器，与壳侧同 schema）
  const dataLegs = [
    { key: "themes", label: "主题", validate: validateThemeJson },
    { key: "iconThemes", label: "图标主题", validate: validateIconThemeJson },
  ];
  for (const leg of dataLegs) {
    const list = manifest.contributes?.[leg.key];
    if (!Array.isArray(list) || list.length === 0) continue;
    for (const item of list) {
      if (!item || typeof item.path !== "string") {
        problems.push(`contributes.${leg.key} 有条目缺 path`);
        continue;
      }
      if (!checkDeclaredFile(item.path, `contributes.${leg.key}[${item.id ?? "?"}].path`)) continue;
      const res = leg.validate(resolve(ROOT, item.path));
      if (!res.valid) {
        problems.push(
          `${item.path}（${leg.label}数据不符合 schema）:\n         ` + res.errors.slice(0, 5).join("\n         "),
        );
      }
    }
    ok.push(`${list.length} 个${leg.label}数据文件（过 schema）`);
  }

  // 主题 recipe 引用的资产——`linkdesk://<pluginId>/<相对路径>` 必须真在（且 id 就是本插件）
  const themeAssetRefs = new Map();
  const collectRefs = (node, fileRel) => {
    if (typeof node === "string") {
      const m = node.match(/^linkdesk:\/\/([^/]+)\/(.+)$/);
      if (m) themeAssetRefs.set(`${m[1]}|${m[2]}`, fileRel);
    } else if (Array.isArray(node)) {
      node.forEach((n) => collectRefs(n, fileRel));
    } else if (node && typeof node === "object") {
      Object.values(node).forEach((n) => collectRefs(n, fileRel));
    }
  };
  for (const key of ["themes", "iconThemes"]) {
    for (const item of manifest.contributes?.[key] ?? []) {
      if (!item || typeof item.path !== "string") continue;
      const abs = resolve(ROOT, item.path);
      if (!existsSync(abs)) continue; // 上面已报过
      try {
        collectRefs(JSON.parse(readFileSync(abs, "utf8")), item.path);
      } catch {
        /* JSON 解析问题由 schema 腿报——这里不抢 */
      }
    }
  }
  for (const [key, fromFile] of themeAssetRefs) {
    const [refId, refPath] = key.split("|");
    if (refId !== pluginId) {
      problems.push(`${fromFile} 引用 "linkdesk://${refId}/…"——插件资产 URL 的 id 段必须是本插件 id "${pluginId}"`);
      continue;
    }
    checkDeclaredFile(refPath, `${fromFile} 的 linkdesk:// 资产引用`);
  }
  if (themeAssetRefs.size > 0) ok.push(`${themeAssetRefs.size} 处 linkdesk:// 资产引用`);

  // floatingPanel 声明自洽（壳侧 floatingPanelDeclarers.test.ts 的仓内等价物）
  const fp = manifest.contributes?.floatingPanel;
  if (fp && typeof fp === "object") {
    const viewId = fp.viewId;
    if (typeof viewId !== "string" || viewId.length === 0) {
      problems.push("contributes.floatingPanel.viewId 必须是非空字符串");
    } else {
      if (!allViewIds.includes(viewId)) {
        problems.push(`contributes.floatingPanel.viewId "${viewId}" 不是 contributes.views 里已声明的视图 id`);
      }
      const containerId = Object.keys(views ?? {}).find((k) =>
        (views[k] ?? []).some((v) => v && v.id === viewId && typeof v.render === "string"),
      );
      if (!containerId) {
        problems.push(`contributes.floatingPanel 指向的视图 "${viewId}" 没有声明 render（池打开时无从 import）`);
      } else {
        const loc = manifest.contributes?.viewsContainers?.[containerId]?.location;
        ok.push(`floatingPanel → viewId "${viewId}"（容器 "${containerId}"，location=${String(loc)}）`);
        if (loc !== "auxiliarybar") {
          line(
            `   ℹ floatingPanel 容器 location = ${JSON.stringify(loc)}（壳侧按 auxiliarybar 语义钉着：` +
              `LinkDesk 无该区域渲染，面板走 window.linkdesk.panel.revealFloating 打开）——记录不拦。`,
          );
        }
      }
    }
  }

  if (problems.length > 0) {
    fail(`④ 声明自洽：${problems.length} 处声明指向了不存在/不合规的东西\n${problems.map((p) => `       ${p}`).join("\n")}`);
  } else {
    line(`✅ ④ 声明自洽：${ok.length > 0 ? ok.join("、") + "——全部兑现。" : "本仓无声明对象（无 entry/views/themes）。"}`);
  }

  // pluginId 缺声明——schema 兜底打黄灯（E6#98g），这里同款提示
  if (!manifest.pluginId) {
    line(
      `   ⚠ plugin.json 未显式声明 pluginId——身份现按目录名 "${pluginId}" 兜底。发布后身份不可变，` +
        `显式声明能防「目录改名 = 身份漂移」。`,
    );
  }
}

// ═══════════════ 结论 ═══════════════
line("────────────────────────────────────────────────────────────");
if (failures.length > 0) {
  console.error(`❌ 插件仓自检未过（${failures.length} 条）：`);
  for (const f of failures) console.error(`  · ${f}`);
  console.error(`\n  SDK 的 \`npm run lint\` 只报告不拦（作者本地哲学）；**CI 拦**。修不动的正当偏离用标准`);
  console.error(`  eslint-disable 注释 + 理由（见上面报告尾部），别把检查删了。`);
  process.exitCode = 1;
} else {
  console.log(`✅ 插件仓自检全过（${pluginId}）——lint / 跨插件 / 字典 / 声明自洽四段。`);
}
