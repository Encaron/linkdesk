#!/usr/bin/env node
/**
 * 手册/契约不许出现**工单编号**——`AI#63` 的校验腿（把「对外读者认不出 `E5.7#63.5`」这件事变成门禁）。
 *
 * ── 为什么要有这把尺子（判据出处：`AI-执行清单.md` `AI#63`，2026-09-29 用户拍板）──
 *   两份产物的读者是**本仓以外的人/AI**：随安装包发货的《AI 操作手册》与 npm `@linkdesk/contracts`
 *   的 `.d.ts`。他们手里没有本仓台账（`E5.x#NN` / `AI#NN` 是「第几期第几号任务」），看到只能当噪声。
 *   用户原话：「我不认为外部其他工程文件的 ai 会认识这些序号」。⇒ **编号只留在仓内**
 *   （源注释 + git blame），产物出口剥掉——剥的实现与形状定义**共用一个模块**
 *   `scripts/lib/strip-work-item-ids.mjs`（本文件只做**发现**，删除腿在生成器出口）。
 *
 * ── 域（扫什么 / 不扫什么）──
 *   扫：`docs/07-AI操作手册/**\/\*.md`（手写散文 ＋ 两个生成区）＋ `contracts/linkdesk.d.ts`（作者面契约）。
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

/** 在文本里找工单编号——返回 `{ line, col, id }` 列表（行号 1-based）。 */
export function findIds(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(WORK_ITEM_RE)) hits.push({ line: i + 1, col: (m.index ?? 0) + 1, id: m[0] });
  });
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

function main() {
  const files = collectFiles();
  const bad = [];
  for (const rel of files) {
    for (const hit of findIds(readFileSync(resolve(ROOT, rel), "utf8"))) {
      bad.push({ rel, ...hit });
    }
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
  console.log(`✅ 无工单编号——已扫 ${files.length} 个读者面文件（手册 ${SCAN_DIRS[0]} ＋ ${SCAN_FILES.join(" ")}）。`);
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
}

if (SELF_TEST) {
  console.log("── check-manual-ids --self-test ──");
  selfTest();
  if (!process.exitCode) console.log("✅ 自测通过：正控会红、路径不误伤、干净串不报。");
} else {
  main();
}
