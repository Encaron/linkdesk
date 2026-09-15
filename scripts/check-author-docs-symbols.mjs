#!/usr/bin/env node
/**
 * 作者面文档门禁 ① —— **无内部符号**（E6#105m 立、E6#109k-b 加判据 ②）。
 *
 * 出处（唯一真源，本文不重述判据）：`docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/11-作者面文档收口.md`
 * （§〇 读者判定 + §五 内部任务号处置 + §八 两条门禁）
 * ＋ 样式命名空间归一化 [19 号档 §第 1.19 轮](../../docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/19-任务-收口批-遗留账与系列收口.md)。
 *
 * 判据一句话：**`docs/03-插件制造/**` 与 `docs/03-plugin-authoring/**` 的作者面 markdown 里，
 * 不许出现「本项目内部坐标」**——两条判据：
 *   ① **裸任务号**（`E6#57` / `E5.8#36.5` / `E5#114d` / `E4V#48` / `E5.7#43` 形态）一律红（E6#105m 立）；
 *   ② **正文里的裸 `#` 坐标**（`#20` / `#21` / `#55` / `#57.5` / `#17d` / `#180`）一律红（E6#109k-b 立）。
 *
 * 为什么（同族教训见 memory `ai-friendliness-three-layers`）：这些号是**本项目内部进度坐标**，
 * 对本项目的 AI 有用，对一个**陌生作者的 AI** 是**无法解析的坐标**——它得先猜"E6 是什么、
 * 要不要去查"。作者面要消灭的正是这种**追踪成本**。
 *
 * ## 为什么"先立尺、后清账"（L3.6 做法）
 * 判据 ① 立起来那天实测 155 处 ⇒ **立刻红**。那不是尺子严，是**尺子对**：账清完才该绿。
 * 清账记录见 11 号档案（甲＝剥离；正文里删除坐标，要保留"为什么"就写成人话）。
 *
 * ## 扫描域与边界（🔴 读之前先看这段）
 *  - **扫**：`docs/03-插件制造/**` 与 `docs/03-plugin-authoring/**` 下的 `*.md`（**含子夹**，如 `主题/` / `themes/`）。
 *  - **不扫**：`plugin.schema.json`。**这不是漏，是判断**——它是「三份必须字节相等」的
 *    拷贝之一（`check-plugin-schema-sync` 守，另两份是 `public/schemas/` 与 SDK 包内），
 *    单独剥离某一份 = 当场红；三份一起剥 = SDK 包内容漂移 ⇒ 必须发一次 `@linkdesk/plugin-sdk`
 *    （而本轮明确不动 SDK 的版本轴）。⇒ 该文件里现存的任务号**记在案上**（11 号档案 §账），
 *    等 SDK 下次因别的原因发版时同笔收掉。**别为了让它绿而把这条尺子放宽。**
 *  - **不扫**：判据 ① 不管 `（#41.18）` 这类裸 `#NN`——那是**判据 ② 的活**（见下）。
 *
 * ## 判据 ② 的口径（`#` 坐标）——写在这里，别靠猜
 *
 * **判据**：**剥掉代码与链接目标之后，正文里出现 `#` + 数字 ⇒ 红。**
 *
 * 当年（7.8 轮）把裸 `#NN` 判成「无法用一条规则安全区分」的理由是**形态冲突**：
 * `#180` 和 `#fff` 都是「`#` + 3 位十六进制」。换个维度就分得开——**颜色永远在代码里**
 * （行内代码 / 栅栏块 / JSON 示例），**坐标永远在散文里**。⇒ 判据按「在不在代码里」分，
 * 不按「几位十六进制」分。实测在清账后的两棵树（46 篇）**零误报**。
 *
 * **不误伤正文数字的三条排除**（都是"代码/链接"而非"内容"）：
 *  - 栅栏代码块（``` / ~~~）内的整段；
 *  - 行内代码 `` `…` `` 内的内容；
 *  - markdown 链接目标 `](…)` 与自动链接 `<…>`（`…/命名空间矩阵.md#2-命名空间--四面覆盖矩阵` 这种锚点在这里被剥掉）。
 *
 * ## 🔴 判据 ② 为什么**不**住 `lib/author-symbols.mjs`（与判据 ① 分家）
 * 那份 lib 是**两处共用**的：另一处是 `check-scaffold.mjs` 断言 10，扫的是**脚手架生成物**
 * （`.css`/`.ts`/`.json`）。在那里 `#` + 数字**合法地就是颜色**（`background: #fff`）⇒
 * 把判据 ② 塞进共用 lib = 断言 10 当场误伤它自己生成的模板。**判据 ② 只归文档面。**
 *
 * ## 仍然**没加**的判据（口径写在这里，免得下一棒再想一遍——实测读数在 19 号档）
 *  - **裸 `NNx`（`54b` / `70a`）**：与正文里的**计量单位**完全同形（`2s` 轮询 / `10s` 超时，
 *    清账前后都真实存在）。没有一条不误伤的正则；而本系列禁区「不引白名单／基线／棘轮」⇒
 *    **容忍、人工清**（今天两棵树读数 **0 处**）。
 *  - **单字母决策标签（`D1` / `N1` / `G4` / `I8-2` / `B54`）**：与正文里的**正经缩写**同形
 *    （`E3` 阶段 / `F2` 按键 / `CM6` 库 / `T1` 篇目），且多数是句内枚举标签。清它是一次**内容改写**
 *    （每处要重写句子、保住「这里有一条已归档的教训／决策」的意思），不是剥坐标 ⇒
 *    **另开一轮、另要一次拍板**（读数与建议见 19 号档 §账）。
 *
 * 用法：
 *   node scripts/check-author-docs-symbols.mjs              # 扫作者面两棵树（挂 npm run check）
 *   node scripts/check-author-docs-symbols.mjs --self-test  # 负控：含坐标 ⇒ 红；干净（含代码里的颜色）⇒ 绿
 * 退出码 0 = 干净，1 = 有内部符号（打印到 stderr）。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
/** 🔴 判据 ① 的尺子在 lib 里（单一真相源）——`check-scaffold.mjs` 的断言 10 用的是**同一份正则** */
import { SYMBOL_RE, scanText } from "./lib/author-symbols.mjs";

export { SYMBOL_RE, scanText };

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
/** 🔴 E6#105n：作者面是**两棵树**——中文（维护者面）＋ 英文（作者面主显）。两棵都要扫。 */
const DOCS_ROOTS = [join(ROOT, "docs", "03-插件制造"), join(ROOT, "docs", "03-plugin-authoring")];

/* ── 判据 ②：正文里的裸 `#` 坐标（口径见文件头） ─────────────────────── */

/** 栅栏代码块的围栏行（``` 或 ~~~，可带语言标记） */
const FENCE_RE = /^\s*(?:```|~~~)/;
/** 非正文片段——剥掉它们之后剩下的才叫「正文」 */
const NON_PROSE_INLINE = [
  /`[^`]*`/g, // 行内代码
  /\]\([^)]*\)/g, // markdown 链接目标 ](…)
  /<[^>\s]+>/g, // 自动链接 <…>
];
/** 正文里的 `#` + 数字，连后面的 token 一起取出来（给人看的报点） */
const HASH_COORD_RE = /#[0-9][\w.]*/g;

/**
 * 逐行扫「正文里的裸 `#` 坐标」。
 * @returns {{line:number,symbol:string}[]}
 */
export function scanHashCoords(text) {
  const hits = [];
  let inFence = false;
  text.split("\n").forEach((raw, i) => {
    if (FENCE_RE.test(raw)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    let s = raw;
    for (const re of NON_PROSE_INLINE) s = s.replace(re, " ");
    for (const m of s.matchAll(HASH_COORD_RE)) hits.push({ line: i + 1, symbol: m[0] });
  });
  return hits;
}

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

export function checkAuthorDocsSymbols(docsRoots = DOCS_ROOTS) {
  const reds = [];
  let files = 0;
  for (const root of Array.isArray(docsRoots) ? docsRoots : [docsRoots]) {
    for (const file of listMarkdown(root)) {
      files++;
      const rel = relative(ROOT, file).replaceAll("\\", "/");
      const text = readFileSync(file, "utf8");
      for (const h of scanText(text)) reds.push({ file: rel, kind: "task-number", ...h });
      for (const h of scanHashCoords(text)) reds.push({ file: rel, kind: "hash-coord", ...h });
    }
  }
  return { files, reds };
}

const KIND_LABEL = { "task-number": "裸任务号", "hash-coord": "正文里的裸 `#` 坐标" };

function main() {
  const { files, reds } = checkAuthorDocsSymbols();
  if (reds.length > 0) {
    console.error(`\n❌ [author-docs-symbols] 作者面文档里出现内部坐标（${reds.length} 处）：\n`);
    for (const r of reds) console.error(`  [${KIND_LABEL[r.kind]}] ${r.file}:${r.line} → ${r.symbol}`);
    console.error(
      "\n  判据与处置口径 → docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/11-作者面文档收口.md §五" +
        "\n  （甲＝剥离：删掉坐标；要保留「为什么」就写成**人话**，别写 `E6#xx`。判据 ② 的口径在本脚本文件头。）\n",
    );
    process.exit(1);
  }
  console.log(`✅ [author-docs-symbols] ${files} 篇作者面文档，零内部坐标（裸任务号 ＋ 正文里的裸 \`#\` 坐标）。`);
}

function selfTest() {
  const cases = [];
  const T = (name, ok) => cases.push([name, ok]);

  /* ── 判据 ①（裸任务号）── */
  const dirty = "# 标题\n\n> 本页 2026-09-06 核对（E6#58 对账）——见 E5.7#43 与 E4V#48。\n";
  const clean = "# 标题\n\n> 本页 2026-09-06 与实现对齐核对。十六进制颜色 `#0078d4` 与锚点 [x](#api-速查表) 不算内部符号。\n";
  const dirtyHits = scanText(dirty).length;
  const cleanHits = scanText(clean).length;
  T(`判据① 负控：含任务号样本命中=${dirtyHits}（期望 3）`, dirtyHits === 3);
  T(`判据① 正控：干净样本命中=${cleanHits}（期望 0）`, cleanHits === 0);

  /* ── 判据 ②（正文里的裸 `#` 坐标）——正控 ── */
  T(
    "判据② 正控：散文里的 `#180`（3 位十六进制形态也不放过——这就是判据 ② 存在的理由）",
    scanHashCoords("| 字号 | 禁止裸 px（#180 门禁，见 §10） |\n").length === 1,
  );
  T("判据② 正控：`——#20 全补实现`／`（#21）`／`（#41.18）` 各 1 处",
    scanHashCoords("——#20 全补实现，无 `?` 降级。\n（#21）与（#41.18）同族。\n").length === 3);
  T("判据② 正控：行尾的 `#55` 也命中（不靠括号包围）", scanHashCoords("JSONC 解析（#55）\n").length === 1);

  /* ── 判据 ② 的「不误伤」三条排除 —— 每条都是本仓真实形态 ── */
  T(
    "判据② 负控：行内代码里的颜色不算（`#0078d4` / `#555` / `#fff`）",
    scanHashCoords("**❌ 禁止：** 硬编码 `#0078d4` / `#1e1e1e` / `#ffffff`。\n").length === 0,
  );
  T(
    "判据② 负控：栅栏代码块里的颜色不算",
    scanHashCoords('```json\n{ "colors": { "bg-window": "#0E0B16", "accent": "#8B5CF6" } }\n```\n').length === 0,
  );
  T(
    "判据② 负控：链接目标里的锚点不算（`…命名空间矩阵.md#2-命名空间--四面覆盖矩阵`）",
    scanHashCoords("[命名空间矩阵 §2](../02-Electron架构/E5.8_归一化基建/契约生成/命名空间矩阵.md#2-命名空间--四面覆盖矩阵)\n").length === 0,
  );
  T(
    "判据② 负控：正文里的时间/数量数字不算（`2s` 轮询 / `10s` 超时 / `8 字段`）",
    scanHashCoords("每 2s 轮询 `listDirs`；每次 invoke 有 10s 超时；关于页 8 字段。\n").length === 0,
  );
  T(`判据② 正控：干净的样本（判据① 用的同一份）命中=0`, scanHashCoords(clean).length === 0);

  let bad = 0;
  for (const [name, ok] of cases) {
    if (!ok) bad++;
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
  }
  console.log(
    `[author-docs-symbols] self-test ${bad === 0 ? "✔️ 全部符合预期（正控绿 / 负控红）" : `❌ 有 ${bad} 条不符预期`}（${cases.length} 例）`,
  );
  return bad === 0 ? 0 : 1;
}

if (process.argv.slice(2).includes("--self-test")) process.exit(selfTest());
main();
