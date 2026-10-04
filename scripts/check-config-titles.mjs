/**
 * 机械检查：配置项短名（`contributes.configuration.properties.*.title`）——**D6 分级门禁的壳侧红灯**，
 * 同时是插件侧黄灯腿的**同源入口**（配置项短名案 2026-10-04，层 5 红门禁）。
 *
 * ── 两个模式（同一把尺子，两种消费）──
 *   ① **默认（壳红灯）**：壳的五个配置声明文件（`src/App/config/` 的 appearance / aiBridge / update /
 *      storage ＋ `src/App/startup.ts` 通用组）里**每一条 property 都必须有 `title:`**——缺一条即判红、
 *      **无豁免账**（壳是软件本体，一步到位不设黄灯；48 条必须齐）。壳声明是 TS 多行写法，故提取住本脚本
 *      （`scanSource`）。`startup.ts` 那 7 条（`app.language` 等）2026-10-04 用户拍板纳入普查域。
 *   ② **`--plugin <dir>`（黄灯腿真源）**：对一只插件仓跑三族判据（无 title / 缺 en 译名 / 缺枚举显示名），
 *      判据本体 = **`@linkdesk/plugin-sdk/check-config-titles`**（`packages/plugin-sdk/check-config-titles.mjs`）
 *      ——⛔ 壳侧不复写一份判据（两把尺子同一份实现；官方各仓 CI 的 `ci-verify` ⑨ 段调的就是同一个模块）。
 *      默认 warn（列单、exit 0）；`--strict` 才判红（v1 正式版统一切红，E21 预留开关）。
 *
 * ── 🔴 发现式断言（自 check-config-baseline 学来的一条纪律）──
 *   壳的配置声明站点若**漏登记**在下方 `TARGETS` 里，那些键**根本不被扫** ⇒ 门禁静默放行。
 *   故本脚本在真跑时先扫全 `src/` 找出「调 registerConfiguration 且声明 app.* / ai.* / window.* 键」
 *   的生产文件，与 TARGETS 比对；差额**每次都打印**（⚠️ 行）——本案普查口径 = 五文件 48 条
 *   （四文件 41 条 ＋ `startup.ts` 7 条，2026-10-04 用户拍板扩面），再扩面是一次公共面决策
 *   （⛔ 不由本脚本擅自判红逼人扩范围），但**也绝不静默**。
 *
 * 用法：
 *   node scripts/check-config-titles.mjs                                 # 壳红灯（挂 npm run check）
 *   node scripts/check-config-titles.mjs --self-test                     # 门禁自测（负控必须真红）
 *   node scripts/check-config-titles.mjs --plugin <dir> [--strict]       # 插件黄灯腿（同一份判据）
 * 退出码 0 = 合规；1 = 有违规（壳缺 title / `--strict` 下插件有缺口）。
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { readManifestJson } from "./lib/plugin-repos.mjs";
import { collectConfigTitleGaps, formatTitleGap, titleGapHint } from "../packages/plugin-sdk/check-config-titles.mjs";
import { loadOwnDict } from "../packages/plugin-sdk/own-dict-coverage.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/**
 * 壳配置声明站点（普查口径 = 配置项短名案 03 表的「壳 48 条」五文件）。
 * ⚠️ 白名单漏登记 = 该文件的门禁静默放行——下方发现式断言每次都把差额打出来。
 */
const TARGETS = [
  "src/App/config/appearance.ts", // 主题组 24 条
  "src/App/config/aiBridge.ts", // AI 接入 14 条
  "src/App/config/update.ts", // 更新 2 条
  "src/App/config/storage.ts", // 存储 1 条
  "src/App/startup.ts", // 通用组 7 条：界面 4（显示语言/菜单栏样式/悬停提示/窗口缩放级别）＋系统集成 3
];

/** 从 offset 找匹配的右大括号——跳过字符串字面量（对标 check-config-baseline 的同名辅助） */
function findMatchingBrace(text, start) {
  let depth = 0;
  let inString = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === inString) inString = null;
    } else if (ch === "'" || ch === '"' || ch === "`") {
      inString = ch;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 壳侧配置键射程——`"app.xxx": {` / `"ai.xxx": {` / `"window.zoomLevel": {` 字面量键（与 check-config-baseline 同一条正则） */
const KEY_SCOPE_RE = /"(?:app|ai|window)\.[\w.]+":\s*\{/g;

/**
 * 纯判据：一段源码里「声明了壳配置项却块内无 title:」的行（不读盘，`--self-test` 注入）。
 * 块级语义（与 check-config-baseline 的 `default:` 判据同口径）：`title:` 出现在块内**嵌套对象**里
 * 也算命中——那是同一套实现，本自测把它记下来，⛔ 不另立判据。
 */
export function scanSource(relPath, src) {
  const violations = [];
  const re = new RegExp(KEY_SCOPE_RE.source, "g");
  let m;
  while ((m = re.exec(src)) !== null) {
    const key = m[1];
    const open = src.indexOf("{", m.index + m[0].length - 1);
    const close = findMatchingBrace(src, open);
    if (close === -1) {
      violations.push(`  ${relPath}  ⚠  "${key}" 块括号不闭合——审计无法解析`);
      continue;
    }
    const block = src.slice(open, close + 1);
    if (!/\btitle\s*:/.test(block)) {
      violations.push(
        `  ${relPath}  ⚠  "${key}" 声明了但块内无 title:——壳配置项必须带行名短名（配置项短名案 D1/D6，无豁免账）`,
      );
    }
  }
  return violations;
}

/** 同一条射程的非 /g 副本（.test 带 lastIndex 状态，不能共用） */
const APP_KEY_DECL_RE = /"(?:app|ai|window)\.[\w.]+":\s*\{/;
const REGISTER_CALL = "registerConfiguration(";

/** 纯判据：`[{ rel, src }]` 里哪些文件是「壳配置声明站点」 */
export function configDeclarationSources(sources) {
  return sources
    .filter(({ src }) => src.includes(REGISTER_CALL) && APP_KEY_DECL_RE.test(src))
    .map(({ rel }) => rel);
}

/** 发现式断言（纯函数）：返回「声明了壳配置却没登记在 targets 里」的生产文件（rel 路径） */
export function unregisteredConfigSources(sources, targets) {
  return configDeclarationSources(sources).filter((rel) => !targets.includes(rel));
}

/** 递归收集 src/ 下的生产 .ts/.tsx（排 `*.test.*`）——供发现式断言扫「谁声明了壳配置」 */
function collectProductionSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...collectProductionSources(full));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push({
        rel: full.replace(ROOT + "/", "").replace(ROOT + "\\", "").replace(/\\/g, "/"),
        src: readFileSync(full, "utf-8"),
      });
    }
  }
  return out;
}

// ────────────────────────────────── 插件黄灯腿 ──────────────────────────────────

/**
 * 一只插件仓的三族缺口（读盘：plugin.json ＋ 本仓 i18n 字典）——判据本体来自 SDK 模块（同一份实现）。
 * @returns {{ok: true, gaps, degraded} | {ok: false, why: string}}
 */
export function collectPluginGaps(dir) {
  const r = readManifestJson(join(dir, "plugin.json"));
  if (!r.ok) return { ok: false, why: `plugin.json 读取失败：${r.why}` };
  const cov = loadOwnDict(dir, r.manifest);
  // 字典声明了但读不全 ⇒ 跳过「缺译名」族（否则「全部 gap」是假红——口径同 SDK ⑧ 段）
  const gaps = collectConfigTitleGaps(r.manifest, { dictKeys: cov.degraded ? null : cov.keys });
  return { ok: true, gaps, degraded: cov.degraded };
}

// ────────────────────────────────── 自测 ──────────────────────────────────

/**
 * 每例都**真跑判据**并断言实得条数——负控必须真的红、正控必须真的绿（只写不断言 = 假门禁的常见死法）。
 */
function runSelfTest() {
  const cases = [
    // ── 正控：合规 / 不属射程 ⇒ 0 条（绿） ──
    [
      "正控①：合规壳配置块（块内有 title:）⇒ 0 条",
      scanSource("x.ts", `{ properties: { "app.theme": { type: "string", title: t("主题配方"), description: t("x") } } }`)
        .length,
      0,
    ],
    [
      "正控②：只声明非射程键（plugin.foo 无 title）⇒ 0 条（壳尺子不管插件键）",
      scanSource("x.ts", `{ properties: { "plugin.foo": { type: "string" } } }`).length,
      0,
    ],
    [
      "正控③：title: 在块内**嵌套对象**里也算命中（钉住块级语义，⛔不改判据）⇒ 0 条",
      scanSource("x.ts", `{ properties: { "app.nested": { type: "object", uiHint: { title: "x" } } } }`).length,
      0,
    ],
    [
      "正控④：源码里没有任何射程内键 ⇒ 0 条",
      scanSource("x.ts", `export function noop() {\n  return { a: 1 };\n}\n`).length,
      0,
    ],
    [
      "正控⑤：ai.* 键也在射程（AI 接入分区）＋ 有 title ⇒ 0 条",
      scanSource("x.ts", `{ properties: { "ai.mcp.enabled": { type: "boolean", title: t("MCP 通道") } } }`).length,
      0,
    ],
    [
      "正控⑤b：window.* 键也在射程（通用组缩放级别，2026-10-04 扩面）＋ 有 title ⇒ 0 条",
      scanSource("x.ts", `{ properties: { "window.zoomLevel": { type: "number", title: t("窗口缩放级别") } } }`).length,
      0,
    ],
    [
      "正控⑥：发现式断言——已登记的五个声明文件 ⇒ 0 个未登记",
      unregisteredConfigSources(
        TARGETS.map((rel) => ({ rel, src: `registerConfiguration("x", {\n  properties: { "app.k": { title: t("k") } },\n});` })),
        TARGETS,
      ).length,
      0,
    ],
    [
      "正控⑦：调 registerConfiguration 但**不带壳配置键**（contributions.ts 形态）⇒ 不要求登记，0 个",
      unregisteredConfigSources(
        [{ rel: "src/pluginLoader/contributions/contributions.ts", src: `registerConfiguration(pluginId, {\n  properties: config.properties,\n});` }],
        TARGETS,
      ).length,
      0,
    ],
    // ── 负控：违规 ⇒ 红（条数也要对） ──
    [
      "负控①：声明了但块内无 title:（本案要拦的形态）⇒ 1 条",
      scanSource("x.ts", `{ properties: { "app.probeNoTitle": { type: "string" } } }`).length,
      1,
    ],
    [
      "负控①b：ai.* 键同样受红灯管 ⇒ 1 条",
      scanSource("x.ts", `{ properties: { "ai.cli.enabled": { type: "boolean" } } }`).length,
      1,
    ],
    [
      "负控①c：window.* 键同样受红灯管（扩面后的射程真有牙）⇒ 1 条",
      scanSource("x.ts", `{ properties: { "window.zoomLevel": { type: "number" } } }`).length,
      1,
    ],
    [
      "负控②：块括号不闭合 ⇒ 1 条「审计无法解析」",
      scanSource("x.ts", `{ properties: { "app.unclosed": { type: "string"`).length,
      1,
      scanSource("x.ts", `{ properties: { "app.unclosed": { type: "string"`)[0]?.includes("审计无法解析"),
    ],
    [
      "负控③：同一文件两个坏块 ⇒ 2 条（不是首个命中就停）",
      scanSource("x.ts", `{ properties: {\n  "app.alpha": { type: "string" },\n  "app.beta": { type: "number" },\n} }`).length,
      2,
    ],
    [
      "负控④：发现式断言——一个**未登记**的壳声明文件 ⇒ 报 1 个（并点名）",
      unregisteredConfigSources(
        [{ rel: "src/App/config/probe-unregistered.ts", src: `registerConfiguration("probe", {\n  properties: { "app.probe": { title: t("p") } },\n});` }],
        TARGETS,
      ).length,
      1,
      unregisteredConfigSources(
        [{ rel: "src/App/config/probe-unregistered.ts", src: `registerConfiguration("probe", {\n  properties: { "app.probe": { title: t("p") } },\n});` }],
        TARGETS,
      )[0] === "src/App/config/probe-unregistered.ts",
    ],
    [
      "负控⑤：插件黄灯腿判据 = SDK 同一份实现——缺 title 的 manifest ⇒ noTitle 命中（不是壳侧另写一份）",
      (() => {
        const g = collectConfigTitleGaps({ contributes: { configuration: { properties: { "x.a": { type: "string" } } } } });
        return g.noTitle.length;
      })(),
      1,
      (() => {
        const g = collectConfigTitleGaps({ contributes: { configuration: { properties: { "x.a": { type: "string" } } } } });
        return g.hasConfiguration === true && formatTitleGap("noTitle", g.noTitle[0]).includes("x.a") && typeof titleGapHint("noTitle") === "string";
      })(),
    ],
  ];

  let bad = 0;
  for (const [tag, got, want, probe] of cases) {
    const pass = got === want && probe !== false;
    if (!pass) bad++;
    process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} —— 实得 ${got} 处\n`);
  }
  const positives = cases.filter(([, , want]) => want === 0).length;
  const negatives = cases.length - positives;
  process.stdout.write(
    bad === 0
      ? `\n✅ check-config-titles self-test 全过（${cases.length} 例：${positives} 正控绿 / ${negatives} 负控红）——尺子不是在恒绿。\n`
      : `\n🔴 check-config-titles self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

/** 插件模式：三族黄单（默认 warn；`--strict` 判红） */
function runPluginMode(dir, strict) {
  const r = collectPluginGaps(resolve(dir));
  if (!r.ok) {
    console.error(`❌ [config-titles] ${r.why}`);
    process.exit(1);
  }
  const { gaps } = r;
  if (!gaps.hasConfiguration) {
    console.log(`✅ [config-titles] ${dir}：无 contributes.configuration —— 不在射程（黄灯腿空转）。`);
    return;
  }
  const lines = [
    ...gaps.noTitle.map((g) => ["noTitle", g]),
    ...gaps.missingEn.map((g) => ["missingEn", g]),
    ...gaps.missingEnumDescriptions.map((g) => ["missingEnumDescriptions", g]),
  ];
  if (lines.length === 0) {
    console.log(
      `✅ [config-titles] ${dir}：${gaps.scanned.properties} 条配置项短名齐、${gaps.scanned.enums} 档枚举显示名齐。`,
    );
    return;
  }
  const mark = strict ? "❌" : "🟡";
  console.error(`${mark} [config-titles] ${dir}：${lines.length} 处缺口（${strict ? "strict 判红" : "内测期黄灯·不判红"}）：`);
  const seen = new Set();
  for (const [family, g] of lines) {
    console.error(`   · ${formatTitleGap(family, g)}`);
    if (!seen.has(family)) {
      console.error(`     修法：${titleGapHint(family)}`);
      seen.add(family);
    }
  }
  if (r.degraded) console.error("   ⚠️ 本仓字典读取不全 ⇒ 已跳过「缺 en 译名」族（避免假红）");
  if (strict) process.exit(1);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) return runSelfTest();

  const pi = argv.indexOf("--plugin");
  if (pi !== -1) {
    const dir = argv[pi + 1];
    if (!dir) {
      console.error("❌ --plugin 需要一个目录参数：node scripts/check-config-titles.mjs --plugin ../linkdesk-plugins/official/<id>");
      process.exit(1);
    }
    return runPluginMode(dir, argv.includes("--strict"));
  }

  // ── 壳红灯 ──
  const sources = collectProductionSources(resolve(ROOT, "src"));
  const drift = unregisteredConfigSources(sources, TARGETS);
  if (drift.length > 0) {
    // ⚠️ 报告而非判红：普查口径（四文件 41 条）是一次公共面决策，扩面须用户点头——
    //    但静默放行是另一回事，故每次都出声（发现式断言，见文件头）。
    console.error("⚠️  [config-titles] 下列生产文件声明了壳配置，却不在本脚本 TARGETS 里——它们**不被本门禁扫**：");
    for (const rel of drift) console.error(`      ${rel}`);
    console.error("       （如需纳入射程，是一次公共面决策——先与用户核对普查口径，再改 TARGETS。）");
  }

  const violations = TARGETS.flatMap((relPath) => {
    const abs = resolve(ROOT, relPath);
    try {
      statSync(abs);
    } catch {
      return [`  ${relPath}  ⚠  文件不存在——TARGETS 登记了一个已删/改名的声明文件`];
    }
    return scanSource(relPath, readFileSync(abs, "utf-8"));
  });

  if (violations.length > 0) {
    console.error(violations.join("\n"));
    console.error(
      `\n❌ ${violations.length} 处壳配置项缺行名短名（title）——配置项短名案 D1/D6，壳无豁免账（48 条必须齐）。`,
    );
    process.exit(1);
  }
  console.log(
    `✅ 壳配置项短名齐——${TARGETS.length} 个声明文件的每条 app.*/ai.*/window.* property 都带 title（发现式断言：已扫 ${sources.length} 个 ts/tsx，无静默漏扫）。`,
  );
}

main();
