#!/usr/bin/env node
/**
 * 手册/契约这两份**读者面产物**不许出现：① **工单编号**（`AI#63`）② **陈旧发货状态措辞**（`AI#61`）
 * ——一个脚本两条规则，共用「扫同一批文件、各自给判据、负控自证」的骨架。
 *
 * ══ 规则① 工单编号（判据出处：`AI-执行清单.md` `AI#63`，2026-09-29 用户拍板）══
 *   两份产物的读者是**本仓以外的人/AI**：随安装包发货的《AI 操作手册》与 npm `@linkdesk/contracts`
 *   的 `.d.ts`。他们手里没有本仓台账（`E5.x#NN` / `AI#NN` 是「第几期第几号任务」），看到只能当噪声。
 *   用户原话：「我不认为外部其他工程文件的 ai 会认识这些序号」。⇒ **编号只留在仓内**
 *   （源注释 + git blame），产物出口剥掉——剥的实现与形状定义**共用一个模块**
 *   `scripts/lib/strip-work-item-ids.mjs`（本文件只做**发现**，删除腿在生成器出口）。
 *
 * ══ 规则② 陈旧发货状态措辞（判据出处：`AI-执行清单.md` `AI#61`）══
 *   病是**复发型**：同一个事实在导航层（`00-README`）、入口章（`01`）、专章（`07`）三处说法不一——
 *   `AI#15` 回填只扫了 `07` 一章 ⇒ 另两层把**已发货的正门**写成「未发货 / 形态先写 / 归 M4」，
 *   而 `00-README` 正是 AI 读的第一页（外部 AI 报告原话：一开始以为只能走 CDP 绕行）。
 *   ⛔ 只改字不加尺 = 下次还漂（本系列两次复发已证）。⇒ 判据：**这类措辞必须带一个可核对的指针**
 *   （同一行里写 `判据`，如「⛔ 未发货（判据：`linkdeskctl --help` 里没有这条子命令）」）——
 *   要么它已经过期（那就删掉/改写），要么它当场可核。⛔ 不设「历史叙述」豁免：追溯靠 git blame，
 *   读者面不留过时措辞（AI#63 同一条纪律）。
 *
 * ══ 规则③ 运行期文案的工单编号（判据出处：`AI-执行清单.md` `AI#65`，2026-09-29）══
 *   `hint` / 错误文案 / `--help` 自省行 / MCP 工具描述是**比手册更硬的出口**：它们在**运行期**原样回给外部 AI
 *   （`linkdeskctl --json` 的 `hint`、MCP `tools/list` 的描述…），而用途恰恰是「告诉 AI 下一步照做什么」——
 *   里面夹一个仓外读不懂的坐标（`AI#NN` / `E5.x#NN`），要么被忽略、要么被当成该遵守的约定去猜。
 *   ⇒ **字符串字面量里零编号**；⛔ **代码注释保持原样**（仓内追溯要留：谁改的、为什么改）。
 *   本腿**只扫字面量**——于是「注释里留着编号、运行期文案里没有」这件事由机器守，不靠人记得。
 *
 * ── 域（扫什么 / 不扫什么）──
 *   扫：`docs/07-AI操作手册/**\/\*.md`（手写散文 ＋ 两个生成区）＋ `contracts/linkdesk.d.ts`（作者面契约）
 *      ＋ `cli/**\/*.mjs` 的**字符串字面量**（规则③；注释不算）。
 *   不扫：`src/**` 的源注释——那是**仓内追溯**（谁改的、为什么改，靠它 + git blame 定位历史），
 *        删了才是真的丢东西。手册正文若引用了源注释里的编号，那是**引用事故**，本门禁照样拦。
 *
 * ── 负控（本文件自证「真会红」）──
 *   `--self-test`：① 合成串里的 `E5.7#63.5` / `AI#38.2` / `M1` / `Phase 4` 必须被判出；
 *   ② **路径不误伤**——`E6_插件生态与发布/`、`03-任务档案/M4-通道.md` 必须 0 命中（实证过：第一版
 *   真把目录名 `E6_…` 削成了 `_…`，`check-doc-links.mjs` 当场红）；③ 干净串必须 0 命中。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { WORK_ITEM_RE } from "./lib/strip-work-item-ids.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELF_TEST = process.argv.includes("--self-test");
const SCAN_DIRS = ["docs/07-AI操作手册"];
const SCAN_FILES = ["contracts/linkdesk.d.ts"];
/** 规则③ 的扫描域（运行期文案） */
const CLI_DIR = "cli";

/**
 * 规则②的触发词——**每一条都是历史实例**（`AI#61` 逐条核过原文的真实措辞）：
 *   `未发货` / `尚未发货`：把已发货的正门说成不存在（01 章门表、00 章导航行都曾如此）；
 *   `形态先写`：`07` 章的旧口径被抄进导航层；
 *   `归 M4`：把已完成的工作挂到未来阶段；
 *   `＋M2`：设计文档的「待补」记号混进手册状态格；
 *   `CDP 绕行`：劝 AI 走绕行路（正门已可用）。
 */
const STALE_STATUS = ["未发货", "尚未发货", "形态先写", "归 M4", "＋M2", "CDP 绕行"];
/** 逃生口——同一行里给了可核对的指针（写 `判据`）就不算空口陈旧。 */
const POINTER = "判据";

/** 在文本里找工单编号——返回 `{ line, col, id }` 列表（行号 1-based）。 */
export function findIds(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(WORK_ITEM_RE)) hits.push({ line: i + 1, col: (m.index ?? 0) + 1, id: m[0] });
  });
  return hits;
}

/** 在文本里找陈旧发货措辞——同一行带 `判据` 指针的放行（见规则②）。 */
export function findStaleStatus(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes(POINTER)) return;
    for (const token of STALE_STATUS) {
      const at = line.indexOf(token);
      if (at !== -1) hits.push({ line: i + 1, col: at + 1, id: token });
    }
  });
  return hits;
}

/**
 * 剥注释、只留**字符串字面量**——返回 `{ text, line }` 列表（line = 字面量起始行，1-based）。
 * 状态机：code / 行注释 / 块注释 / `'` / `"` / `` ` ``（模板串也算字面量：它同样会回给外部 AI）。
 * ⚠️ 正则字面量（`/…/`）没建模——本腿的用途是**找运行期散文**，`/…/` 里出现工单编号不是缺陷；
 *    万一日后真有，那是漏报（不会误报），改法明摆着（把编号挪出正则）。
 */
export function stringLiterals(src) {
  const out = [];
  let line = 1;
  let i = 0;
  let state = "code"; // code | line | block
  let quote = null;
  let start = 0;
  let startLine = 1;
  while (i < src.length) {
    const c = src[i];
    const c2 = src[i + 1];
    if (state === "line") {
      if (c === "\n") {
        line++;
        state = "code";
      }
      i++;
      continue;
    }
    if (state === "block") {
      if (c === "\n") line++;
      else if (c === "*" && c2 === "/") {
        state = "code";
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (quote) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === quote) {
        out.push({ text: src.slice(start, i), line: startLine });
        quote = null;
        i++;
        continue;
      }
      if (c === "\n") line++;
      i++;
      continue;
    }
    if (c === "/" && c2 === "/") {
      state = "line";
      i += 2;
      continue;
    }
    if (c === "/" && c2 === "*") {
      state = "block";
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      start = i + 1;
      startLine = line;
      i++;
      continue;
    }
    if (c === "\n") line++;
    i++;
  }
  return out;
}

/** 在**字符串字面量**里找工单编号（规则③）——返回 `{ line, col, id }`（行号 1-based，col 相对该行）。 */
export function findIdsInLiterals(src) {
  const hits = [];
  for (const lit of stringLiterals(src)) {
    for (const m of lit.text.matchAll(WORK_ITEM_RE)) {
      const idx = m.index ?? 0;
      // 字面量内部可能跨行：把「字面量内偏移」折回源文件的行号/列号
      const before = lit.text.slice(0, idx);
      const lines = before.split("\n");
      hits.push({
        line: lit.line + lines.length - 1,
        col: (lines.length === 1 ? 0 : lines[lines.length - 1].length) + 1,
        id: m[0],
      });
    }
  }
  return hits;
}

function collectFiles() {
  const out = [...SCAN_FILES];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (name.endsWith(".md")) out.push(relative(ROOT, abs).replace(/\\/g, "/"));
    }
  };
  for (const d of SCAN_DIRS) walk(resolve(ROOT, d));
  return out;
}

/**
 * 规则③ 的扫描域：`cli/**` 下的 `.mjs`（运行期文案就住在这些文件的字面量里）。
 * ⛔ 排除 `*.test.mjs`——测试的 `describe`/`it` 标题是**仓内追溯**（与源注释同理：这条钉子为谁而立），
 *    它们不会被任何外部 AI 读到；本腿的射程是「**会原样回给外部 AI 的运行期文案**」。
 */
function collectCliFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (name.endsWith(".mjs") && !name.endsWith(".test.mjs")) out.push(relative(ROOT, abs).replace(/\\/g, "/"));
    }
  };
  walk(resolve(ROOT, CLI_DIR));
  return out.sort();
}

function main() {
  const files = collectFiles();
  const cliFiles = collectCliFiles();
  const bad = [];
  const stale = [];
  const literals = [];
  for (const rel of files) {
    const txt = readFileSync(resolve(ROOT, rel), "utf8");
    for (const hit of findIds(txt)) bad.push({ rel, ...hit });
    for (const hit of findStaleStatus(txt)) stale.push({ rel, ...hit });
  }
  for (const rel of cliFiles) {
    const txt = readFileSync(resolve(ROOT, rel), "utf8");
    for (const hit of findIdsInLiterals(txt)) literals.push({ rel, ...hit });
  }
  if (stale.length) {
    console.error(`✗ 手册里有 ${stale.length} 处**陈旧发货措辞**——凡是发货状态都得当场可核（或删掉）：`);
    for (const h of stale.slice(0, 40)) {
      const line = readFileSync(resolve(ROOT, h.rel), "utf8").split(/\r?\n/)[h.line - 1] ?? "";
      console.error(`  · ${h.rel}:${h.line}:${h.col}  \`${h.id}\`  ←  ${line.trim().slice(0, 110)}`);
    }
    console.error("");
    console.error("  怎么修：① 已发货 ⇒ 直接改成实话（「✅ 今天可用」＋可核对的一步，如 `linkdeskctl --help`）；");
    console.error("         ② 确实还没发 ⇒ 同一行给一个可核对的指针（写 `判据`：拿什么一条命令/一处界面核）。");
    process.exit(1);
  }
  if (bad.length) {
    console.error(`✗ 读者面产物里出现了 ${bad.length} 处**工单编号**——外部工程的 AI 认不出它们：`);
    for (const h of bad.slice(0, 40)) {
      const line = readFileSync(resolve(ROOT, h.rel), "utf8").split(/\r?\n/)[h.line - 1] ?? "";
      console.error(`  · ${h.rel}:${h.line}:${h.col}  \`${h.id}\`  ←  ${line.trim().slice(0, 110)}`);
    }
    if (bad.length > 40) console.error(`  …另有 ${bad.length - 40} 处`);
    console.error("");
    console.error("  怎么修：删掉编号本身，**留住冒号后的正文**；有日期可留的留日期（谁改的、为什么改 → git blame + 源注释）。");
    console.error("  ⛔ 别把 `E6_插件生态与发布/`、`M4-通道.md` 这类**路径里的编号**当工单号删——那是文件/目录名的一部分。");
    console.error("  生成区（02 章）不用手改：编号在生成器出口就被剥了（`npm run manual:build`）。");
    process.exit(1);
  }
  if (literals.length) {
    console.error(`✗ cli/** 的 ${literals.length} 处**运行期文案**（字符串字面量）里有工单编号——它们会原样回给外部 AI：`);
    for (const h of literals.slice(0, 40)) {
      const line = readFileSync(resolve(ROOT, h.rel), "utf8").split(/\r?\n/)[h.line - 1] ?? "";
      console.error(`  · ${h.rel}:${h.line}:${h.col}  \`${h.id}\`  ←  ${line.trim().slice(0, 110)}`);
    }
    if (literals.length > 40) console.error(`  …另有 ${literals.length - 40} 处`);
    console.error("");
    console.error("  怎么修：删掉编号本身，换成人话 ＋ 一个**可核对的动作**（设置页路径 / 命令 / 配置键）——");
    console.error("         这段文字的用途就是告诉 AI 下一步照做什么，编号对它只是噪声。");
    console.error("  ⛔ 注释不用改：本腿只扫字符串字面量，仓内追溯（谁改的、为什么改）留在源码注释里。");
    process.exit(1);
  }
  console.log(
    `✅ 读者面干净——已扫 ${files.length} 个文件（手册 ${SCAN_DIRS[0]} ＋ ${SCAN_FILES.join(" ")}）`
      + ` ＋ cli/** ${cliFiles.length} 个文件的字符串字面量：`
      + "无工单编号 · 发货措辞都带可核对指针。",
  );
}

function selfTest() {
  const eq = (name, got, want) => {
    const ok = got === want;
    console.log(`${ok ? "✓" : "✗"} ${name}（${JSON.stringify(got)}）`);
    if (!ok) process.exitCode = 1;
  };
  // ① 正控：该报的真报
  eq("正控：`E5.7#63.5` 命中", findIds("/** E5.7#63.5：说明 */").length, 1);
  eq("正控：`AI#38.2` 命中", findIds("见 AI#38.2 的收尾实测").length, 1);
  eq("正控：`M1` 命中", findIds("（元数据出处 = M1 的约定）").length, 1);
  eq("正控：`Phase 4` 命中", findIds("Phase 4 之后新增的通道").length, 1);
  // ② 负控：路径里的编号**不**误伤（第一版真踩过：削掉目录名 ⇒ 断链）
  eq("负控：目录名 `E6_插件生态与发布/` 不报", findIds("../02-Electron架构/E6_插件生态与发布/01-x.md").length, 0);
  eq("负控：文件名 `M4-通道.md` 不报", findIds("`03-任务档案/M4-通道.md`").length, 0);
  // ③ 干净串不报（否则门禁恒红）
  eq("负控：干净串 0 命中", findIds("设置页「AI 接入 → 通道 → CLI 通道」一键开（2026-09-28）").length, 0);
  // ④ 反例对照：把编号换成路径后**同一句话不再报**——证明保护来自 GUARD 而不是别的巧合
  eq("对照：同一句加编号就报", findIds("见/E5.7#63.5 的实测").length, 1);
  // ⑤ 规则②：陈旧的发货措辞该报（`AI#61` 的四处真实形态逐条给例）
  eq("正控②：`⛔ 未发货` 命中", findStaleStatus("| ③ CLI / MCP | … | ⛔ 未发货 |").length, 1);
  eq("正控②：`形态先写` 命中", findStaleStatus("07 章：形态先写（旧口径）").length, 1);
  eq("正控②：`CDP 绕行` 命中", findStaleStatus("今天走 CDP 绕行").length, 1);
  eq("正控②：`＋M2` 命中", findStaleStatus("| 3 | 添加市场源 | ⛔ ＋M2 |").length, 1);
  // 负控②：带了可核对指针 ⇒ 放行（这是逃生口，必须能通）
  eq("负控②：带 `判据` 指针不报", findStaleStatus("⛔ 未发货（判据：`linkdeskctl --help` 里没有它）").length, 0);
  eq("负控②：干净句不报", findStaleStatus("✅ 今天可用（设置页「AI 接入」一键开）").length, 0);
  // ⑥ 规则③：只扫**字符串字面量**——注释里留着编号是合法的（仓内追溯），运行期文案里不合法
  eq("正控③：双引号串里的 `AI#38.3` 命中", findIdsInLiterals('const h = "去开「AI#38.3」那个开关";').length, 1);
  eq("正控③：模板串里的 `AI#29` 命中", findIdsInLiterals("const h = `不点头 = EUSERDENIED（AI#29）`;").length, 1);
  eq("正控③：跨行模板串里的编号行号正确", findIdsInLiterals("const h = `第一行\n第二行 AI#65 在这`;")[0]?.line, 2);
  eq("负控③：行注释里的 `AI#38.3` 不报", findIdsInLiterals("// 出处 AI#38.3 的实测\nconst x = 1;").length, 0);
  eq("负控③：块注释里的 `E5.7#63.5` 不报", findIdsInLiterals("/** E5.7#63.5：说明 */\nconst x = 1;").length, 0);
  eq("负控③：干净串不报", findIdsInLiterals('const h = "去设置页开「AI 接入」（ai.cli.enabled）";').length, 0);
}

if (SELF_TEST) {
  console.log("── check-manual-surface --self-test ──");
  selfTest();
  if (!process.exitCode) console.log("✅ 自测通过：正控会红、路径不误伤、干净串不报。");
} else {
  main();
}
