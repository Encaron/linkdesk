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
 * 退出码 0 = 锚词全齐，1 = 有处缺失（打印到 stderr）。
 * `--schema <path>` 覆盖 schema 站点（负例自测用——对一份 sed 改词的临时副本跑，验证红门禁）。
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 🔑 单点锚词——lsp.args 相对路径基准语义的唯一表述。改基准语义 = 改锚词 + 全站同步 + 单测断言，漏一处即红。 */
const ANCHOR = "插件根目录为基准";

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
  const hit = descs.find((d) => d.includes(ANCHOR));
  return hit
    ? { ok: true }
    : { ok: false, why: `无任何 args.description 含锚词「${ANCHOR}」——lsp.args 基准描述被单边改写` };
}

function checkTextFile(name, role) {
  const text = readFileSync(resolve(ROOT, name), "utf-8");
  return text.includes(ANCHOR)
    ? { ok: true }
    : { ok: false, why: `文件不含锚词「${ANCHOR}」——基准语义声明被删/改` };
}

function main() {
  const argv = process.argv.slice(2);
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
