/**
 * E6#15l：lsp.args 基准语义单点权威门禁——「相对路径以插件根目录为基准解析」的锚词对齐。
 *
 * 背景（2026-09-06 #15e 收官立案）：lsp.args 的「相对基准 = 插件根」语义散在多处表述——
 *   behavior（electron/plugins/lsp-arg-resolve.ts：path.resolve(pluginDir, arg)）
 *   schema ×3（live public/schemas + 作者文档区 + SDK 包内，check-plugin-schema-sync 只保三份互同）
 *   SDK includeLspRuntimePackages（packages/plugin-sdk/src/vite-config.ts 按 args 把包随 zip）
 *   check-lsp-deps.mjs（构建期哨兵按插件目录基准）
 * 无机械对齐链——改语义漏一处 = v2.6 同源多版本 bug（描述与行为分叉，作者照文档写、实际跑另一套）。
 *
 * 机制：锚词 ANCHOR（"插件根目录为基准"）必须同时出现在所有声明处——
 *   - schema：langDefs[].lsp.args 的 description（JSON 解析后精确取 args 对象的 description 串）；
 *   - 代码/文档：lsp-arg-resolve.ts（行为 + 契约）、其单测（行为钉子）、SDK vite-config（随包注释）、
 *     check-lsp-deps.mjs（构建哨兵注释）——整文件含锚词即认为该处声明与 schema 同一基准。
 * 任一处丢失锚词（基准语义被单边改写/删词）→ 红门禁。基准真要大改 → 全部处 + 单测断言一起改才绿。
 *
 * 用法：node scripts/check-lsp-args-base.mjs [--schema <path>]（已挂 npm run check，check-lsp-deps 后）
 *       node scripts/check-lsp-args-base.mjs --self-test
 * 退出码 0 = 锚词全齐，1 = 有处缺失（打印到 stderr）。
 * `--schema <path>` 覆盖 schema 站点（负例自测用——对一份 sed 改词的临时副本跑，验证红门禁）。
 *
 * ── 🔴 E6#109p-b（1.28）补上 `--self-test`（件 8 修复）──
 *   本脚本自 1.26 起就带着上面那个 `--schema` 负例口，**但一直没有自测** ⇒ 「它能红」只被人工验过一次。
 *   现在把它接进自测：**每次 `npm run check` 都真跑一遍「删掉锚词 ⇒ 必须红 / 原样 ⇒ 必须过」**。
 *   自测用 `os.tmpdir()` 造临时 schema 副本，**不碰仓库**（照 check-lsp-smoke.mjs 的 mkdtemp 先例）。
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 🔑 单点锚词——lsp.args 相对路径基准语义的唯一表述。改基准语义 = 改锚词 + 全站同步 + 单测断言，漏一处即红。 */
const ANCHORS = ["插件根目录为基准", "resolve against the plugin root"];
const ANCHOR = ANCHORS[0]; // 报错文案用
// ⚠️ E6#105n（2026-09-14 作者面英文化）：同一语义现有中/英两个语言变体——
//    内部注释（代码/单测/SDK/构建哨兵）用中文变体，作者面 schema description 用英文变体。
//    每处命中任一变体即算「与 schema 同一基准」；两个变体都必须列在这里，
//    少一个就会把"只改了语言"误判成"基准被单边改写"。

/** schema 站点：live 权威 + 两份字节拷贝（check-plugin-schema-sync 已保互同；此处三份都查，standalone 也稳） */
const SCHEMA_FILES = [
  { name: "public/schemas/plugin.schema.json", role: "live（权威）" },
  { name: "docs/03-插件制造/plugin.schema.json", role: "作者文档区拷贝" },
  { name: "packages/plugin-sdk/schemas/plugin.schema.json", role: "SDK 包内拷贝" },
];

/** 代码/文档声明处——整文件须含锚词（各文件皆 lsp.args 专责，锚词只可能出现在基准语义声明处） */
const TEXT_FILES = [
  { name: "electron/plugins/lsp-arg-resolve.ts", role: "行为（注册处绝对化）+ 契约" },
  { name: "electron/plugins/lsp-arg-resolve.test.ts", role: "行为钉子（单测）" },
  { name: "packages/plugin-sdk/src/vite-config.ts", role: "SDK includeLspRuntimePackages（随包注释）" },
  { name: "scripts/check-lsp-deps.mjs", role: "构建期哨兵（插件目录基准）" },
];

/** 递归收集对象里所有键为 `args`、值为对象且带 description 字符串的 description——钉 schema 的 lsp.args.description */
function collectArgsDescriptions(node) {
  const out = [];
  (function walk(o) {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (k === "args" && v && typeof v === "object" && typeof v.description === "string") {
        out.push(v.description);
      }
      walk(v);
    }
  })(node);
  return out;
}

/** schema 站检查：至少一个 args.description 含锚词（lsp.args 的 description 是唯一带此锚词的 args） */
function checkSchema(file, role) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf-8"));
  } catch (e) {
    return { ok: false, why: `JSON 解析失败: ${e.message}` };
  }
  const descs = collectArgsDescriptions(parsed);
  if (descs.length === 0) return { ok: false, why: "找不到 args.description（schema 结构变了？）" };
  const hit = descs.find((d) => ANCHORS.some((a) => d.includes(a)));
  return hit
    ? { ok: true }
    : { ok: false, why: `无任何 args.description 含锚词「${ANCHORS.join("」/「")}」——lsp.args 基准描述被单边改写` };
}

/** 文本站判定（纯函数——自测直接注入字符串，不碰盘）：命中**任一语言变体**锚词即算同基准 */
export function checkText(text) {
  return ANCHORS.some((a) => text.includes(a));
}

function checkTextFile(name, role) {
  const text = readFileSync(resolve(ROOT, name), "utf-8");
  return checkText(text)
    ? { ok: true }
    : { ok: false, why: `文件不含锚词「${ANCHORS.join("」/「")}」——基准语义声明被删/改` };
}

// ────────────────────────────────── 自测 ──────────────────────────────────

/**
 * 🔴 负例必须**真的会红**。本脚本的判据是**字面包含**（不是语义）——所以自测的职责就是证明
 * 「字面被动过 ⇒ 红，字面没动 ⇒ 过」，并把这个形状**钉在链里**（此前只被人手验过一次）。
 * 全部夹具住 `os.tmpdir()`，`finally` 里清掉。
 */
function runSelfTest() {
  const tmp = mkdtempSync(join(tmpdir(), "ldk-lsp-args-"));
  const liveAbs = resolve(ROOT, SCHEMA_FILES[0].name);
  const liveJson = JSON.parse(readFileSync(liveAbs, "utf-8"));

  /** 造一份「锚词被改掉」的 schema 副本（把两个变体都换掉） */
  const stripped = JSON.stringify(liveJson)
    .split(ANCHORS[0]).join("（基准语义已被单边改写）")
    .split(ANCHORS[1]).join("(baseline semantics rewritten)");
  const strippedPath = join(tmp, "schema-anchor-stripped.json");
  writeFileSync(strippedPath, stripped, "utf-8");

  /** 造一份「结构变了」的 schema（恒空：连 args.description 都没有） */
  const noArgsPath = join(tmp, "schema-no-args.json");
  writeFileSync(noArgsPath, JSON.stringify({ type: "object", properties: {} }), "utf-8");

  /** 造一份「英文变体独有」的 schema（证明英文化后的双变体都被认） */
  const enOnlyPath = join(tmp, "schema-en-only.json");
  writeFileSync(enOnlyPath, JSON.stringify(liveJson).split(ANCHORS[0]).join("(the plugin root)"), "utf-8");

  const cases = [
    // ── 正控：原样必须过 ──
    ["正控①：live schema 原样 ⇒ 含锚词（过）", checkSchema(liveAbs, "live"), true],
    [
      "正控②：schema 只留**英文**变体 ⇒ 仍算同基准（过）——英文化后两个变体都必须被认",
      checkSchema(enOnlyPath, "en-only"),
      true,
    ],
    ["正控③：文本站含锚词的字符串 ⇒ 过（纯函数，注入字符串）", { ok: checkText(`// 相对路径以${ANCHORS[0]}解析`) }, true],
    [
      "正控④：文本站只含英文变体 ⇒ 也过（同锚词的另一语言）",
      { ok: checkText(`// relative paths resolve against the plugin root`) },
      true,
    ],
    // ── 负控：动过字面必须红 ──
    [
      "🔴 负控①：schema 的锚词被改写 ⇒ 红（本用例等价于 `--schema` 那条人工负例）",
      checkSchema(strippedPath, "stripped"),
      false,
    ],
    [
      "🔴 负控②：schema 结构变了（找不到任何一个 args.description）⇒ 红（不是静默放行）",
      checkSchema(noArgsPath, "no-args"),
      false,
    ],
    ["🔴 负控③：文本站两个变体都不含 ⇒ 红", { ok: checkText("// 基准语义声明被删") }, false],
    [
      "🔴 负控④：不存在的 schema 路径 ⇒ 读失败 ⇒ 红（fail-closed，不当作通过）",
      checkSchema(join(tmp, "__missing__.json"), "missing"),
      false,
    ],
  ];

  let bad = 0;
  try {
    for (const [tag, res, wantOk] of cases) {
      const pass = res.ok === wantOk;
      if (!pass) bad++;
      process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} 应${wantOk ? "过" : "红"} —— 实得 ${res.ok ? "过" : "红"}\n`);
      if (!pass && res.why) process.stderr.write(`      ← ${res.why}\n`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ check-lsp-args-base self-test 全过（${cases.length} 例：正控绿 / 负控红）——尺子不是在恒绿。\n`
      : `\n🔴 check-lsp-args-base self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) return runSelfTest();
  const schemaOverride = argv.includes("--schema")
    ? argv[argv.indexOf("--schema") + 1]
    : null;

  const results = [];
  if (schemaOverride) {
    results.push({ site: `--schema ${schemaOverride}`, role: "override（负例自测）", ...checkSchema(resolve(schemaOverride), "override") });
  } else {
    for (const { name, role } of SCHEMA_FILES) {
      results.push({ site: name, role, ...checkSchema(resolve(ROOT, name), role) });
    }
    for (const { name, role } of TEXT_FILES) {
      results.push({ site: name, role, ...checkTextFile(name, role) });
    }
  }

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    if (r.ok) {
      console.log(`  ✓ ${r.site}（${r.role}）含锚词「${ANCHOR}」`);
    } else {
      console.error(`❌ ${r.site}（${r.role}）——${r.why}`);
    }
  }
  if (failed.length > 0) {
    console.error(`\n[lsp-args-base] 红门禁——${failed.length} 处丢失基准锚词「${ANCHOR}」。lsp.args 相对路径基准语义（以插件根目录为基准解析）必须在 schema description / 行为 / 单测 / SDK / 构建哨兵全站同文——改基准语义漏一处 = 同源多版本 bug。`);
    process.exit(1);
  }
  console.log(`\n[lsp-args-base] ✓ 锚词「${ANCHOR}」全站 ${results.length} 处齐——lsp.args 基准语义单点权威（schema↔行为机械对齐）。`);
}

main();
