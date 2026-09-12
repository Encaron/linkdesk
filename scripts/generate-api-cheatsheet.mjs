/**
 * API 速查表生成器 + 漂移门禁（E6#41a）。
 *
 * ## 为什么必须机械生成
 *
 * 插件作者看 `@linkdesk/plugin-sdk` 的 npm 页面时，只有 `README.md` 会渲染。
 * 「有哪些命名空间、各有哪些方法」如果手写在 README 里，就等于**第二份真相源**——
 * 而第二份真相源必然漂移：实证见 `docs/02-Electron架构/E5.8_归一化基建/契约生成/命名空间矩阵.md`
 * （手维护，2026-08-20 停更；截至 2026-09-12 已漏 `appearance`/`floatingPanelHost`/`panel`/
 * `settings`/`factorySlots`/`app` 六个命名空间，且仍留着已从契约删除的 `config` 别名与 `toast`）。
 * 人读的清单一旦过期，作者就会照着不存在的面写代码。
 *
 * ⇒ 本脚本从 **`contracts/linkdesk.d.ts`** 现读现生成，一个字节都不手写。
 * 选 d.ts 而非源码：d.ts 正是作者从 npm 拿到的那个文件（@linkdesk/contracts），
 * 且 `npm run contracts:check` 已保证它与 `src/core/api/linkdesk-api/*.ts` 字节一致
 * （契约生成器 #21）——所以读 d.ts 既贴作者视角，又不引入新的漂移面。
 *
 * ## 与 check-api-contracts.mjs 的分工
 *
 * 那个脚本从**源码**加载命名空间全集，管「文档引用的 `linkdesk.X` 是不是假命名空间」（反向漂移）；
 * 本脚本从 **d.ts** 生成**清单本身**（正向漂移）。两者读不同文件、管不同方向，缺一不可。
 * ⚠️ 已知差异：那边的正则 `[a-zA-Z][a-zA-Z]*` 匹配不了带数字的命名空间（`p2p`）——
 * 本脚本用 `\w` 遮盖，那边是它的既有洞，不在本次改动范围内。
 *
 * ## 扫描形状（d.ts 顶层命名空间有四种写法，缺一即漏）
 *
 *   1. `    name: { ... }`               —— 绝大多数（块式）
 *   2. `    name?: { ... }`              —— 可选面 `bridge`（真壳独有）/ `hotExit`（池侧独有）
 *   3. `    name: XxxAPI["yyy"];`        —— 类型引用别名 `config` = `configuration`（@deprecated）
 *   4. `    name: (a) => b;`             —— 函数属性 `getFilePath`（webUtils 直取，无子方法）
 *
 * 方法 = 块式命名空间内 8 空格缩进的成员；`_` 前缀为内部面，不面向作者，剔除。
 *
 * ## 两个判定坑（都踩过，都有实测）
 *
 * - **多行签名的续行也是 8 空格**（`registerCommand(commandId: string,` 的下一行 `handler: (…)`）——
 *   只认缩进会把参数名 `handler` 收成方法。⇒ 必须靠**括号深度归零**判定新成员。
 * - **`?` 成员不能漏**：`syncToMainProcess?(…)` / `readdir?(…)` / `notifyManifestChanged?(…)` 等 22 个
 *   带 `?`，早期正则 `(\w+)\s*[(<:]` 卡在 `?` 上，静默少登 22 个方法。
 *   ⇒ 必须覆盖，且**标注**而不是剔除（剔除 = 又一次静默遗漏）——契约标 `?` 的语义是「只在一侧注入」。
 *
 * ## 独立验证（不是自证）
 *
 * 本脚本用正则解析；**正确性由 TypeScript 编译器 AST 独立对照过**（`ts.createSourceFile` 走真实语法树，
 * 与正则是两套完全不同的机制）：14 接口 / 45 命名空间 / 242 方法，逐命名空间方法名集合一致。
 * 改动本文件的解析逻辑后，请重跑该对照——自己验自己等于没验。
 *
 * ## 输出与门禁
 *
 * 产出写进 `packages/plugin-sdk/README.md` 的 `<!-- BEGIN/END API-CHEATSHEET -->` 标记之间
 * （仅此一处——`01-插件API契约.md` 有意指针式，方法明细不手写）。
 * `--check` 模式不写盘，只比对新生成的内容与盘上是否一致（门禁用，已挂 `npm run check`）。
 *
 * 用法：node scripts/generate-api-cheatsheet.mjs          # 生成/刷新
 *       node scripts/generate-api-cheatsheet.mjs --check  # 只校验漂移
 * 退出码 0 = 一致/已写入，退出码 1 = `--check` 下检测到漂移（打印到 stderr）。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DTS = "contracts/linkdesk.d.ts";
const README = "packages/plugin-sdk/README.md";
const BEGIN = "<!-- BEGIN API-CHEATSHEET -->";
const END = "<!-- END API-CHEATSHEET -->";

/**
 * 剥掉一行里的注释，返回纯代码部分（供缩进/括号判定）。
 * 块注释跨行，`state.inBlock` 在调用之间保持。
 *
 * ⚠️ 前提：d.ts 里字符串字面量不含 `//` 或 `/*`（生成的类型声明文件里没有这种内容）。
 */
function stripComment(line, state) {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (state.inBlock) {
      const end = line.indexOf("*/", i);
      if (end === -1) return out;
      state.inBlock = false;
      i = end + 2;
      continue;
    }
    if (line.startsWith("//", i)) break;
    if (line.startsWith("/*", i)) {
      state.inBlock = true;
      i += 2;
      continue;
    }
    out += line[i];
    i++;
  }
  return out;
}

/** 一行的括号净深度增量（`<` `>` 不计——泛型参数不改变结构层级）。 */
function depthDelta(code) {
  let d = 0;
  for (const ch of code) {
    if (ch === "(" || ch === "{" || ch === "[") d++;
    else if (ch === ")" || ch === "}" || ch === "]") d--;
  }
  return d;
}

/**
 * 解析 d.ts，产出命名空间清单。
 *
 * 🔴 判定新成员必须靠**括号深度归零**，不能只看缩进——多行签名（如 `registerCommand`）的
 * 续行同样是 8 空格（`handler: (...args) => ...`），只认缩进会把参数名收成方法名。
 * @returns {{namespaces: Map<string, object>, interfaces: string[]}}
 */
function parseContract() {
  const lines = readFileSync(resolve(ROOT, DTS), "utf-8").split(/\r?\n/);
  const namespaces = new Map();
  const interfaces = [];
  const state = { inBlock: false };
  let iface = null;
  let ns = null; // 当前块式命名空间名
  let depth = 0; // 当前命名空间成员层级内的括号深度
  let docBuf = []; // 紧邻上方累积的注释行

  for (const raw of lines) {
    const inCommentAtStart = state.inBlock;
    const code = stripComment(raw, state);
    const isCommentLine = inCommentAtStart || /^\s*(\/\*|\*|\/\/)/.test(raw);
    if (isCommentLine) {
      docBuf.push(raw);
      continue;
    }

    const ifaceMatch = /^export interface (\w+API) \{/.exec(code);
    if (ifaceMatch) {
      iface = ifaceMatch[1];
      interfaces.push(iface);
      ns = null;
      depth = 0;
      docBuf = [];
      continue;
    }
    if (/^\}/.test(code)) {
      iface = null;
      ns = null;
      depth = 0;
      docBuf = [];
      continue;
    }
    if (!iface || code.trim() === "") {
      docBuf = [];
      continue;
    }

    if (ns === null) {
      // 顶层命名空间：块式 `name: {` / `name?: {`
      const block = /^ {4}(\w+)(\?)?: \{$/.exec(code);
      if (block) {
        namespaces.set(block[1], {
          iface,
          methods: [],
          optionalMethods: [],
          doc: firstDocLine(docBuf),
          optional: Boolean(block[2]),
          signature: null,
        });
        ns = block[1];
        depth = 0;
        docBuf = [];
        continue;
      }
      // 顶层命名空间：类型引用别名 `name: XxxAPI["yyy"];`（如 config = configuration）
      const alias = /^ {4}(\w+)(\?)?: (\w+API)\["(\w+)"\];$/.exec(code);
      if (alias) {
        namespaces.set(alias[1], {
          iface,
          methods: [],
          doc: firstDocLine(docBuf),
          optional: Boolean(alias[2]),
          signature: null,
          aliasOf: alias[4],
        });
        docBuf = [];
        continue;
      }
      // 顶层命名空间：函数属性 `name: (...) => ...;`（无子方法，直接调用）
      const fn = /^ {4}(\w+)(\?)?: \(/.exec(code);
      if (fn) {
        namespaces.set(fn[1], {
          iface,
          methods: [],
          doc: firstDocLine(docBuf),
          optional: Boolean(fn[2]),
          signature: code.trim(),
        });
      }
      docBuf = [];
      continue;
    }

    // 命名空间内部：深度归零的行才是成员声明
    if (depth === 0) {
      if (/^ {4}\};?$/.test(code)) {
        ns = null;
        docBuf = [];
        continue;
      }
      // 成员名允许 `?`（`syncToMainProcess?(…)`）——契约标 `?` = 仅一侧 preload 注入
      const member = /^ {8}(\w+)(\?)?\s*[(<:]/.exec(code);
      if (member && !member[1].startsWith("_")) {
        const entry = namespaces.get(ns);
        if (!entry.methods.includes(member[1])) {
          entry.methods.push(member[1]); // 去重：overload 只登一次
          if (member[2]) entry.optionalMethods.push(member[1]);
        }
      }
    }
    depth += depthDelta(code);
    docBuf = [];
  }

  // 剔除内部命名空间
  for (const key of [...namespaces.keys()]) {
    if (key.startsWith("_")) namespaces.delete(key);
  }
  // 别名行继承目标命名空间的方法面（config = configuration）——方法数不能显示成 0
  for (const [, v] of namespaces) {
    if (!v.aliasOf) continue;
    const target = namespaces.get(v.aliasOf);
    if (target) v.methods = [...target.methods];
  }
  return { namespaces, interfaces };
}

/** 从 JSDoc 块取首行正文（多行注释时跳过孤零零的 `/**`）。 */
function firstDocLine(buf) {
  for (const raw of buf) {
    const text = raw
      .replace(/^\s*\/\*\*/, "")
      .replace(/\*\/\s*$/, "")
      .replace(/^\s*\*\s?/, "")
      .replace(/\s*\*\s*$/, "")
      .trim();
    if (text) return text;
  }
  return "";
}

/** 说明列压到一句话：顿号/句号截断 + 去除会撑破表格的竖线。 */
function brief(doc) {
  if (!doc) return "——";
  const cut = doc.split(/[。；;]/)[0].trim();
  const text = cut.length > 0 ? cut : doc;
  const safe = text.replace(/\|/g, "\\|");
  return safe.length > 60 ? `${safe.slice(0, 59)}…` : safe;
}

function render() {
  const { namespaces, interfaces } = parseContract();
  const rows = [...namespaces.entries()];
  // 别名行的方法面继承自目标命名空间——不重复计入总数
  const total = rows.reduce((n, [, v]) => n + (v.aliasOf ? 0 : v.methods.length), 0);
  const aliases = rows.filter(([, v]) => v.aliasOf).map(([n]) => `\`${n}\``);

  const out = [];
  out.push(BEGIN);
  out.push("");
  out.push(
    `> 自动生成，**勿手改**——由 \`scripts/generate-api-cheatsheet.mjs\` 从 \`@linkdesk/contracts\` 的 \`linkdesk.d.ts\` 现读产出，`,
  );
  out.push(
    `> \`npm run check\` 机械盯漂。完整签名与逐方法说明见 \`linkdesk.d.ts\` 本体（IDE 里可直接跳转）。`,
  );
  out.push("");
  out.push(
    `**${interfaces.length} 个域接口 → ${rows.length} 个命名空间 / ${total} 个方法**，全部经 \`window.linkdesk.<命名空间>.<方法>\` 调用。` +
      (aliases.length ? `（另含 ${aliases.length} 个废弃别名 ${aliases.join(" ")}，方法不重复计入）` : ""),
  );
  out.push("");
  out.push("| 命名空间 | 方法数 | 方法 | 说明 |");
  out.push("|:--|:--:|:--|:--|");
  for (const [name, v] of rows) {
    let cell;
    if (v.aliasOf) {
      cell = `（废弃别名 → \`${v.aliasOf}\`）`;
    } else if (v.methods.length) {
      // `°` = 契约标 `?` 的成员：仅一侧 preload 注入（多为壳侧独有），池里调用前先判存在
      cell = v.methods
        .map((m) => `\`${m}\`${(v.optionalMethods ?? []).includes(m) ? "°" : ""}`)
        .join(" ");
    } else {
      // 顶层函数属性命名空间（如 getFilePath）无子方法——直接展示签名形状
      cell = `（顶层函数）\`${(v.signature ?? "").replace(/\|/g, "\\|")}\``;
    }
    const mark = v.optional ? " ⚠️" : "";
    out.push(`| \`${name}\`${mark} | ${v.methods.length} | ${cell} | ${brief(v.doc)} |`);
  }
  const optional = rows.filter(([, v]) => v.optional).map(([n]) => `\`${n}\``);
  const anyOptionalMember = rows.some(([, v]) => (v.optionalMethods ?? []).length > 0);
  if (optional.length || anyOptionalMember) {
    out.push("");
    if (optional.length) {
      out.push(
        `⚠️ = 契约可选命名空间（只在一侧注入）：${optional.join(" ")}——调用前先判断是否存在，另一侧为 \`undefined\`。`,
      );
    }
    if (anyOptionalMember) {
      out.push(
        "° = 契约标 `?` 的成员：只在一侧 preload 注入（绝大多数是壳侧独有），**插件跑在池里**——调用前先判存在。",
      );
    }
  }
  out.push("");
  out.push(END);
  return out.join("\n");
}

function main() {
  const check = process.argv.includes("--check");
  const generated = render();
  const readmePath = resolve(ROOT, README);
  const readme = readFileSync(readmePath, "utf-8");

  const beginAt = readme.indexOf(BEGIN);
  const endAt = readme.indexOf(END);
  if (beginAt === -1 || endAt === -1) {
    console.error(`❌ ${README} 缺少速查表标记。`);
    console.error(`   修法：在 README 里加上 ${BEGIN} 与 ${END} 两行（生成器只替换这两行之间的内容）。`);
    process.exit(1);
  }

  const current = readme.slice(beginAt, endAt + END.length);
  if (current === generated) {
    console.log(`✅ API 速查表是最新的（${README}）`);
    return;
  }

  if (check) {
    console.error(`❌ API 速查表与 ${DTS} 不一致——契约变了，README 没跟上。`);
    console.error(`   修法：node scripts/generate-api-cheatsheet.mjs（然后连同契约改动一起提交）。`);
    console.error(`   差异预览：`);
    const curLines = current.split("\n");
    const newLines = generated.split("\n");
    let shown = 0;
    for (let i = 0; i < Math.max(curLines.length, newLines.length) && shown < 8; i++) {
      if (curLines[i] !== newLines[i]) {
        console.error(`     盘上: ${(curLines[i] ?? "(无)").slice(0, 100)}`);
        console.error(`     应为: ${(newLines[i] ?? "(无)").slice(0, 100)}`);
        shown++;
      }
    }
    process.exit(1);
  }

  writeFileSync(
    readmePath,
    readme.slice(0, beginAt) + generated + readme.slice(endAt + END.length),
    "utf-8",
  );
  console.log(`✅ API 速查表已刷新（${README}）`);
}

main();
