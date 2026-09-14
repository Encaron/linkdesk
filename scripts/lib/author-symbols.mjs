/**
 * 内部符号（任务号）的**唯一定义处** —— 作者面禁用的那把尺子。
 *
 * 出处（唯一真源，本文不重述判据）：`docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/11-作者面文档收口.md`
 * （§〇 读者判定 + §五 内部任务号处置 + §八 两条门禁）。
 *
 * 判据一句话：**`E6#57` / `E5.8#36.5` / `E5#114d` / `E4V#48` / `E5.7#43` 这类裸任务号**，
 * 不许出现在**第三方作者会读到的任何东西**里——那是本项目内部进度坐标，对陌生作者的 AI 是
 * **无法解析的坐标**（它得先猜"E6 是什么、要不要去查"）。作者面要消灭的正是这种**追踪成本**。
 *
 * ── 为什么抽出成 lib（而不是各脚本各写一份）──
 * 两处消费它：① `check-author-docs-symbols.mjs`（扫作者面两棵文档树）；
 * ② `check-scaffold.mjs` 的断言 10（扫**脚手架生成物**——那是"作者读到的第三种东西"：
 * 不是文档，而是他打开的第一个工程）。同一把尺子两处用 ⇒ **必须同一份正则**，
 * 否则两处会各自漂移（本仓栽过的"同一个逻辑写两遍"的跟头）。
 */

/** 任务号形态（比 11 号档案原文的四种更全：把 `E5.7#` 也收进来——它同样是内部坐标） */
export const SYMBOL_RE = /\bE[0-9]+(?:\.[0-9]+)*[A-Z]?#[0-9]+(?:\.[0-9]+)*[a-z]?(?:-[0-9]+)?/g;

/** 每次新建一个 g 正则——避免调用方之间共享 `lastIndex` 状态（`matchAll`/`replace` 的经典暗礁） */
function symbolRe() {
  return new RegExp(SYMBOL_RE.source, "g");
}

/** @returns {{line:number,symbol:string}[]} 逐行找内部符号（不关心文件类型） */
export function scanText(text) {
  const hits = [];
  text.split("\n").forEach((l, i) => {
    const m = l.match(symbolRe());
    if (m) for (const s of m) hits.push({ line: i + 1, symbol: s });
  });
  return hits;
}
