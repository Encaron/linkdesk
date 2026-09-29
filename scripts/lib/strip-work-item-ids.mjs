/**
 * 去工单编号（生长格 `AI#63` 的机械腿）——把**仓库内部的工作编号**从「读者面产物」出口处剥掉。
 *
 * ── 为什么要有这一层（判据出处：`AI-执行清单.md` `AI#63`，2026-09-29 用户拍板）──
 *   随包《AI 操作手册》与 npm `@linkdesk/contracts` 的读者是**外部工程的 AI**——它手里没有本仓的
 *   `E5.7#63.5` / `AI#38.2` 台账，看见这些序号只能当噪声（用户原话：「我不认为外部其他工程文件的
 *   ai 会认识这些序号」）。⇒ 产物出口剥掉编号，**留版本号与日期**（那两样外部读者解得出）。
 *
 * ── 边界（⛔ 别越界）──
 *   ① **源文件不动**：`src/**` 注释里的编号是**仓内追溯**（谁改的、为什么改），靠它 + git blame 定位
 *      历史；删了就没得更差的重建成本。只洗**生成物**（contracts/linkdesk.d.ts）与**手写散文**（手册正文）。
 *   ② **路径/文件名里的编号不许删**：`E6_插件生态与发布/`、`03-任务档案/M4-通道.md` 里的 `E6`/`M4`
 *      不是工单号，是路径的一段——删了链接就断（`check-doc-links.mjs` 当场红）。靠 `GUARD` 负向断言拦。
 *
 * ── 接线（三个调用点 + 一把尺子）──
 *   · `scripts/generate-contract.mjs` → 契约出口（只洗注释行）
 *   · `src/core/commands/aiManualIndex.test.ts` → 手册两个生成区的单元格
 *   · `scripts/check-manual-ids.mjs` → 校验腿（复用同一个 `WORK_ITEM_RE`，两边不会走散）
 */

/** e.g. `E5.7#63.5`、`E5.8#26`、`E6#13b/c`、`E3j #75`、`E6#73`、`E5.8#50.11` */
const EID = String.raw`E\d+(?:\.\d+)?[a-z]?(?:\s*#?[0-9][\w.]*(?:-[A-Za-z0-9]+)?)?(?:\s*[/、,+＋]\s*#?[0-9][\w.]*(?:-[A-Za-z0-9]+)?)*`;
/** e.g. `#22.6`、`#57.12`、`#37.5`（省略了 E 段的裸编号） */
const BARE = String.raw`#\d+(?:\.\d+)?[a-z]?(?:-[A-Za-z0-9]+)?(?:\s*[/、,+＋]\s*#?[0-9][\w.]*(?:-[A-Za-z0-9]+)?)*`;
/** e.g. `AI#38.2`、`AI#63.5` */
const AIID = String.raw`AI#\d+(?:\.\d+)?`;
/**
 * 路径/标识符续接保护：编号后紧跟 `-` `_` `/` `\` ＋ 非空白 ⇒ 它是**路径或名字的一段**，不是工单号。
 * 反例实证（本模块第一版真踩过）：`E6_插件生态与发布` → `_插件生态与发布`、`M4-通道.md` → `-通道.md`。
 */
const GUARD = String.raw`(?![-_/\\][^\s])`;

/** 工单编号的**识别**形状——删除腿与校验腿共用这一份（改一处两边同步）。 */
export const WORK_ITEM_RE = new RegExp(
  String.raw`\`?(?:(?:M[1-5]\s*)?${AIID}|${EID}${GUARD}|${BARE}${GUARD})\`?|\bM[1-5]\b${GUARD}|Phase\s*\d+${GUARD}`,
  "g",
);

/** 括号内容剥掉编号/分隔符/数字后什么都不剩 ⇒ 这括号只为编号而存在（连括号删）。 */
const TOK = new RegExp(
  String.raw`${EID}|${AIID}|${BARE}|P-?\d+|[SGAI]\d+(\.\d+)*[a-z]?|[A-Z]\.\d+(\.\d+)*|I\d+-\d+|\d+(\.\d+)*|§[^\s，、）]*|档|段|拍板|Phase\s*\d+|[A-Z]|[、，,／/+＋·\s|｜⑦①-⑩]`,
  "g",
);
const pureParen = (inner) => inner.replace(TOK, "").trim() === "";

/** 删编号留下的悬空标点/空白清账（顺序敏感——先成对冒号、后单侧）。 */
function tidy(s) {
  return s
    .replace(/（[^（）]*）/g, (m) => (pureParen(m.slice(1, -1)) ? "" : m))
    .replace(/([\w\u4e00-\u9fa5])（\s*）(?=[\w\u4e00-\u9fa5])/g, "$1 ")
    .replace(/（\s*）/g, "")
    .replace(/：\s*[：:]/g, "：")
    .replace(/[：:]\s*：/g, "：")
    .replace(/——\s*：/g, "——")
    .replace(/\s*：\s*$/g, "")
    .replace(/——\s*。/g, "。")
    .replace(/[，、]\s*）/g, "）")
    .replace(/（\s*[：:，、]\s*/g, "（")
    .replace(/[ \t]*：\s*）/g, "）")
    .replace(/(\/\*\*)\s{2,}/g, "$1 ")
    .replace(/(^\s*\*)\s{2,}/g, "$1 ")
    .replace(/（[ \t]+/g, "（")
    .replace(/[ \t]+）/g, "）")
    .replace(/(\/\*\*|^\s*\*|^\s*\/\/)\s*[：:，]\s*/g, "$1 ")
    .replace(/@deprecated\s*——\s*/g, "@deprecated ");
}

/**
 * 单行去编号（含续接标点清账）。
 * @param {string} line
 * @returns {string} 若该行没有编号则**原样返回**（调用方可据此判「有没有改」）
 */
export function stripWorkItemIdsInLine(line) {
  const ms = [...line.matchAll(WORK_ITEM_RE)];
  if (!ms.length) return line;
  let out = line;
  for (let k = ms.length - 1; k >= 0; k--) {
    const m = ms[k];
    if (m.index === undefined) continue;
    const pre = out.slice(0, m.index);
    let post = out.slice(m.index + m[0].length);
    if (/^[：:]/.test(post)) post = post.replace(/^[：:]/, "");
    else if (/^[ \t]/.test(post)) {
      // 删除缝上的空白：左边已有空格 ⇒ 留一个；否则整段吃掉（后面紧跟 `*/` 时留一个，免得 `词*/` 粘住）
      post = /[ \t]$/.test(pre)
        ? post.replace(/^[ \t]+/, " ")
        : post.replace(/^[ \t]+/, /^\s*\*\//.test(post) ? " " : "");
    }
    out = pre + post;
  }
  return tidy(out);
}

/** 行是否处于注释上下文（块注释跨行 ＋ 行注释）——契约是 `.d.ts`，编号只该出现在注释里。 */
function commentLineFlags(lines) {
  let inBlock = false;
  return lines.map((line) => {
    const trimmed = line.trim();
    const wasInBlock = inBlock;
    const open = line.indexOf("/*");
    if (!wasInBlock && open !== -1 && line.indexOf("*/", open + 2) === -1) inBlock = true;
    else if (wasInBlock && line.includes("*/")) inBlock = false;
    return wasInBlock || inBlock || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*");
  });
}

/**
 * 代码行**尾随注释**里的编号也得剥——`.d.ts` 里 `foo: string; // 说明（E6#62b）` 这种一个不少
 * （离线实测：只按「整行是注释」判，会漏 3 处）。
 * ⚠️ 前提（`scripts/lib/contract-parse.mjs` 头已同样声明）：生成的 d.ts 里字符串字面量不含 `//` 或 `/*`。
 */
function stripInlineComment(line) {
  const slash = line.indexOf("//");
  const block = line.indexOf("/*");
  if (block !== -1 && (slash === -1 || block < slash)) {
    const close = line.indexOf("*/", block + 2);
    if (close === -1) return line;
    return line.slice(0, block) + stripWorkItemIdsInLine(line.slice(block, close + 2)) + line.slice(close + 2);
  }
  if (slash !== -1) return line.slice(0, slash) + stripWorkItemIdsInLine(line.slice(slash));
  return line;
}

/**
 * 整份文本去编号。
 * @param {string} text
 * @param {{ onlyCommentLines?: boolean }} [opts] 默认 `true`（生成物 = 代码，只洗注释，不碰代码行本身）；
 *   手写散文（手册正文）传 `false`。
 * @returns {{ text: string, hits: number }}
 */
export function stripWorkItemIds(text, opts = {}) {
  const { onlyCommentLines = true } = opts;
  const lines = text.split(/\r?\n/);
  const flags = onlyCommentLines ? commentLineFlags(lines) : null;
  let hits = 0;
  const out = lines.map((line, i) => {
    const after = !flags || flags[i] ? stripWorkItemIdsInLine(line) : stripInlineComment(line);
    if (after !== line) hits += [...line.matchAll(WORK_ITEM_RE)].length;
    return after;
  });
  return { text: out.join("\n"), hits };
}
