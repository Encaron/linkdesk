#!/usr/bin/env node
/**
 * 作者面文档门禁 ① —— **无内部符号**（E6#105m）。
 *
 * 出处（唯一真源，本文不重述判据）：`docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/11-作者面文档收口.md`
 * （§〇 读者判定 + §五 内部任务号处置 + §八 两条门禁）。
 *
 * 判据一句话：**`docs/03-插件制造/**` 的作者面 markdown 里，不许出现裸任务号**——
 *   `E6#57` / `E5.8#36.5` / `E5#114d` / `E4V#48` / `E5.7#43` 这类形态一律红。
 *
 * 为什么（同族教训见 memory `ai-friendliness-three-layers`）：这些号是**本项目内部进度坐标**，
 * 对本项目的 AI 有用，对一个**陌生作者的 AI** 是**无法解析的坐标**——它得先猜"E6 是什么、
 * 要不要去查"。作者面要消灭的正是这种**追踪成本**。
 *
 * ## 为什么"先立尺、后清账"（L3.6 做法）
 * 立起来那天实测 155 处 ⇒ **立刻红**。那不是尺子严，是**尺子对**：账清完才该绿。
 * 清账记录见 11 号档案（甲＝剥离；正文里删除坐标，要保留"为什么"就写成人话）。
 *
 * ## 扫描域与边界（🔴 读之前先看这段）
 *  - **扫**：`docs/03-插件制造/**` 下的 `*.md`（**含子夹**，如 `主题/`）。
 *  - **不扫**：`plugin.schema.json`。**这不是漏，是判断**——它是「三份必须字节相等」的
 *    拷贝之一（`check-plugin-schema-sync` 守，另两份是 `public/schemas/` 与 SDK 包内），
 *    单独剥离某一份 = 当场红；三份一起剥 = SDK 包内容漂移 ⇒ 必须发一次 `@linkdesk/plugin-sdk`
 *    （而本轮明确不动 SDK 的版本轴）。⇒ 该文件里现存的任务号**记在案上**（11 号档案 §账），
 *    等 SDK 下次因别的原因发版时同笔收掉。**别为了让它绿而把这条尺子放宽。**
 *  - **不扫**：裸 `#NN` 形态（如 `（#41.18）`）——与十六进制颜色（`#0078d4`）无法用一条规则
 *    安全区分，误报代价高于收益。本轮已把作者面能清的人手清过一遍，剩余记账。
 *
 * 用法：
 *   node scripts/check-author-docs-symbols.mjs              # 扫 docs/03-插件制造（挂 npm run check）
 *   node scripts/check-author-docs-symbols.mjs --self-test  # 负控：含任务号 ⇒ 红；干净 ⇒ 绿
 * 退出码 0 = 干净，1 = 有内部符号（打印到 stderr）。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DOCS_ROOT = join(ROOT, "docs", "03-插件制造");

/** 任务号形态（比 11 号档案原文的四种更全：把 `E5.7#` 也收进来——它同样是内部坐标） */
export const SYMBOL_RE = /\bE[0-9]+(?:\.[0-9]+)*[A-Z]?#[0-9]+(?:\.[0-9]+)*[a-z]?(?:-[0-9]+)?/g;

/** 递归列 .md */
function listMarkdown(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listMarkdown(p));
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

/** @returns {{file:string,line:number,symbol:string}[]} */
export function scanText(text) {
  const hits = [];
  text.split("\n").forEach((l, i) => {
    const m = l.match(SYMBOL_RE);
    if (m) for (const s of m) hits.push({ line: i + 1, symbol: s });
  });
  return hits;
}

export function checkAuthorDocsSymbols(docsRoot = DOCS_ROOT) {
  const reds = [];
  let files = 0;
  for (const file of listMarkdown(docsRoot)) {
    files++;
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    for (const h of scanText(readFileSync(file, "utf8"))) reds.push({ file: rel, ...h });
  }
  return { files, reds };
}

function main() {
  const { files, reds } = checkAuthorDocsSymbols();
  if (reds.length > 0) {
    console.error(`\n❌ [author-docs-symbols] 作者面文档里出现裸任务号（${reds.length} 处）：\n`);
    for (const r of reds) console.error(`  ${r.file}:${r.line} → ${r.symbol}`);
    console.error(
      "\n  判据与处置口径 → docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/11-作者面文档收口.md §五" +
        "\n  （甲＝剥离：删掉坐标；要保留「为什么」就写成**人话**，别写 `E6#xx`。）\n",
    );
    process.exit(1);
  }
  console.log(`✅ [author-docs-symbols] ${files} 篇作者面文档，零内部任务号。`);
}

function selfTest() {
  const dirty = "# 标题\n\n> 本页 2026-09-06 核对（E6#58 对账）——见 E5.7#43 与 E4V#48。\n";
  const clean = "# 标题\n\n> 本页 2026-09-06 与实现对齐核对。十六进制颜色 `#0078d4` 与锚点 [x](#api-速查表) 不算内部符号。\n";
  const dirtyHits = scanText(dirty).length;
  const cleanHits = scanText(clean).length;
  const ok = dirtyHits === 3 && cleanHits === 0;
  console.log(
    `[author-docs-symbols] self-test: 含符号样本命中=${dirtyHits}（期望 3）· 干净样本命中=${cleanHits}（期望 0）`,
  );
  console.log(`[author-docs-symbols] self-test 判定：${ok ? "✓ 负控会红、正控会绿" : "✗ FAIL"}`);
  return ok ? 0 : 1;
}

if (process.argv.slice(2).includes("--self-test")) process.exit(selfTest());
main();
