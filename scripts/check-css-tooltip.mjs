/**
 * 机械检查：**CSS 伪元素提示条**判红（04「悬停提示系统」收编面 · 门禁腿 3）。
 *
 * ── 为什么有这条腿（出处：2026-09-27 用户实机 ＋ 当场收编）──
 * 用户实机挑出：悬浮面板标题栏的 □ / ✕ 悬停出来的提示**没有气泡尖角、字号偏小**。
 * 查得这不是旧版、也不是缓存——是**第三套提示机制**：`FloatingPanel.css` 里
 *   `.ldk-floating-panel-act.tip::after { content: attr(data-tip); }`
 * 一个纯 CSS 伪元素方框（12px / 3×8），与 `HintTip`（13px / 5×12 ＋ 尖角 ＋ 键帽）**必然分叉**
 * ——「两把尺子必然漂移」（memory `two-rulers-one-caliber`）。
 *
 * 🔴 **本腿存在的真正理由：前两条腿只认写法，不认机制。**
 * 腿 1（`check-native-title.mjs`）判 `title=` 的**新增**，腿 2（`native-title-baseline.json`）记
 * `title=` 的**存量**——两者判据物都是「**JSX 开标签上的 `title=`**」。这一处从来不用 `title=`，
 * 于是收编把账清到 0、腿 1 全绿，**提示面仍漏着一整套**。教训一句话：
 * **判据物必须覆盖到「机制」，不能只覆盖到「写法」。**
 *
 * ── 判据（一档，文本级）──
 *   域内任何 `content: attr(<名>)` 判红。理由三条：
 *   ① 长相不可控——CSS 造的提示不跟主题/字号缩放/`--ui-scale`（与 `title=` 同一宗罪）；
 *   ② 文案第二份——同一句话在 TSX 里写一遍、CSS 再取一遍，两处会漂；
 *   ③ 无延时/翻面/夹紧/尖角/键帽——用户看到的就是"小一号的另一种东西"。
 *   正解：元素挂 `data-hint`（**走 `hintAttrs.ts` 的 `HINT_ATTR` 常量**，⛔ 别写字面量），
 *   文案与长相全归 `HintTipRenderer`；要带快捷键用 `data-hint-command`。
 *   豁免口：在命中行的**上一行**或**同行**写注释，内含
 *   `eslint-disable-next-line linkdesk/no-css-tooltip -- 理由` / `eslint-disable-line … -- 理由`，
 *   **理由必填**（本腿按 CSS 的块注释形态读，见 `exemptReasonAt`）。⚠️ CSS 里没有 eslint 在跑——
 *   注释里的这个腿 id 是**本腿认的记号**，取这个形状只为全仓"豁免长什么样"只有一种写法（照腿 1 的形态）。
 *
 * ── ⛔ 不设白名单账（与腿 2 的有意差异）──
 *   腿 2 有账，是因为落地当天存量 43 处、全判红没人能提交。本腿开盘即 **0 处**——唯一那一处
 *   （悬浮面板）随本腿同笔收编。⇒ 只判新增，不留账。
 *   🔴 **别为「以后可能多」先建账**：空账会腐烂成假门禁（腿 2 的方向性核对与
 *   `check-gate-health.mjs` 的反向核对都是在治这件事）。真出现第二处并有正当理由时，
 *   用豁免注释逐条挂账，而不是开一本新账。
 *
 * ── 自测 ──
 *   每例**真跑判据**并断言实得（正控真红、负控真绿），含：注释掉的规则不判、非 `content` 属性不判、
 *   豁免注释带理由放行／缺理由报红、行号 1-based 且按原始文件行对齐。
 *
 * ── 残余风险（诚实边界）──
 *   1. 文本级判据（不引 CSS 解析器，与壳其余 check 同口径）：`content` 与 `attr(` 之间被塞注释
 *      或折行到读不出形状 ⇒ 漏报。窄射程宁可漏，不猜。
 *   2. 域 = 本仓 `src/` ＋ `plugins/` 的 `.css`。把提示写进 TSX 内联 style / CSS-in-JS 不在域内
 *      （本仓无此写法）；插件仓（`E:/linkdesk-plugins`）也不在域内——那侧由 SDK 腿与插件自身门禁管。
 *   3. CSS 里**写死的非空字符串**（`content: "关闭"`）同样不是 HintTip，但**不在域内**：
 *      本仓实得 0 处（全是 `""`/`''` 装饰），出现时另立一件，⛔ 别顺手塞进本腿扩大射程。
 *
 * 用法：node scripts/check-css-tooltip.mjs（已挂 npm run check）
 *       node scripts/check-css-tooltip.mjs --self-test
 * 退出码 0 = 无违规；1 = 有违规（打印到 stderr）。
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// 域 = 壳侧样式（池层 ＋ 共享件）＋ 仓内开发夹具（照 check-native-title 的 SCAN_DIRS 口径）
const SCAN_DIRS = ["src", "plugins"];
const SKIP_DIRS = new Set(["node_modules", "dist", "dist-electron", ".git", ".vite", "coverage", "out"]);
const EXT_RE = /\.css$/;

/** 与腿 1 同名形态的腿 id（同一种豁免写法，全仓只此一种） */
export const LEG_ID = "linkdesk/no-css-tooltip";
const MTAG = `eslint-disable-next-line ${LEG_ID}`;
const STAG = `eslint-disable-line ${LEG_ID}`;

/** 注脚里的正解（报错即文档） */
export const CSS_TOOLTIP_WHY =
  "CSS 不许用 content: attr() 造提示——它不跟主题/字号缩放，文案还是第二份（同一句话 TSX 写一遍、CSS 再取一遍）。" +
  "正解：把 `data-tip` 换成 `data-hint`（走 hintAttrs.ts 的 HINT_ATTR 常量），延时/翻面/尖角/键帽全归 HintTip；" +
  "确需 CSS 造提示（渲染器够不到的形态）= /* " +
  `${MTAG} -- 理由 */（理由必填）。`;

/** 块注释等长空格替换 ⇒ 行号不漂移；CSS 只有这一种注释形态 */
export function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/** `content: attr(<名>…)`——名取到第一个非标识符字符为止（`attr( data-tip )` 带空格也认） */
const CONTENT_ATTR_RE = /content\s*:\s*attr\(\s*([A-Za-z_][\w-]*)/g;

function countNewlines(s) {
  let c = 0;
  for (const ch of s) if (ch === "\n") c++;
  return c;
}

/** 命中处所属规则的选择器（报错给人看：只回退到最近的 `{`，足够定位） */
function selectorAt(cleaned, idx) {
  const open = cleaned.lastIndexOf("{", idx);
  if (open === -1) return "";
  const close = cleaned.lastIndexOf("}", open);
  return cleaned.slice(close + 1, open).trim().replace(/\s+/g, " ").slice(0, 80);
}

/** 豁免注释是否覆盖第 line 行（1-based）——上一行 next-line 形 ／ 同行 line 形；**理由必填** */
function exemptReasonAt(rawLines, line) {
  const candidates = [rawLines[line - 1], rawLines[line - 2]];
  const tags = [STAG, MTAG];
  for (let k = 0; k < candidates.length; k++) {
    const text = candidates[k];
    if (!text) continue;
    const at = text.indexOf(tags[k]);
    if (at === -1) continue;
    const rest = text.slice(at + tags[k].length);
    const reason = /^\s*--\s*(\S.*?)\s*\*\/\s*$/.exec(rest) ?? /^\s*--\s*(\S.*)$/.exec(rest);
    return { ok: Boolean(reason), reason: reason ? reason[1].trim() : "" };
  }
  return null;
}

/**
 * 纯判据：一段 CSS 里的伪元素提示站点（不读盘 ⇒ `--self-test` 可注入）。
 * 返回 `[{ line, attr, selector, exempt, noReason }]`。
 */
export function findSites(css, rel = "<inline>") {
  const cleaned = stripComments(css);
  const rawLines = css.split("\n");
  const out = [];
  const re = new RegExp(CONTENT_ATTR_RE.source, "g");
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    const line = countNewlines(cleaned.slice(0, m.index)) + 1;
    const ex = exemptReasonAt(rawLines, line);
    out.push({
      rel,
      line,
      attr: m[1],
      selector: selectorAt(cleaned, m.index),
      exempt: Boolean(ex && ex.ok),
      noReason: Boolean(ex && !ex.ok),
    });
  }
  return out;
}

/** 纯判据：站点 ⇒ 违规列表（豁免的不算；缺理由的单独报） */
export function judge(sites) {
  const violations = [];
  for (const s of sites) {
    if (s.noReason) {
      violations.push(
        `  ${s.rel}:${s.line}  豁免注释缺理由——\`/* ${MTAG} -- <为什么这里必须是 CSS 造的提示> */\`（理由必填）`,
      );
    }
  }
  const real = sites.filter((s) => !s.exempt && !s.noReason);
  if (real.length > 0) {
    const head = real.map((s) => `${s.rel}:${s.line}  ${s.selector} → content: attr(${s.attr})`).join("\n");
    violations.push(`CSS 伪元素提示 ${real.length} 处（提示面第二把尺子）：\n${head}\n  ${CSS_TOOLTIP_WHY}`);
  }
  return violations;
}

/** 递归收集域内 `.css` */
function collectCss(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectCss(full, out);
    } else if (entry.isFile() && EXT_RE.test(entry.name)) {
      out.push(full.replace(ROOT + sep, "").split(sep).join("/"));
    }
  }
  return out;
}

// ────────────────────────────────── 自测 ──────────────────────────────────

/**
 * 🔴 每例都**真跑判据**并断言实得——负控必须真的绿、正控必须真的红（只写不断言 = 假门禁）。
 */
function runSelfTest() {
  const eq = (got, want, label) => {
    const g = JSON.stringify(got);
    const w = JSON.stringify(want);
    if (g !== w) {
      console.error(`[check-css-tooltip] ✗ 自测失败：${label}\n    want ${w}\n    got  ${g}`);
      process.exitCode = 1;
      return false;
    }
    return true;
  };

  let ok = true;

  // 正控①：最朴素的伪元素提示
  ok = eq(findSites(`.a::after { content: attr(data-tip); }`).map((s) => [s.line, s.attr]), [[1, "data-tip"]], "正控① data-tip") && ok;

  // 正控②：属性名带空格 / 带 fallback / 换行到第二行 ⇒ 行号必须对
  const two =
    `.a::before {\n  content: attr( data-count );\n}\n` +
    `.b::after { content: attr(data-label, ""); }`;
  ok = eq(findSites(two).map((s) => [s.line, s.attr]), [[2, "data-count"], [4, "data-label"]], "正控② 空格/fallback/行号") && ok;

  // 负控①：装饰性空串（本仓最常见的合法形态）
  ok = eq(findSites(`.a::after { content: ""; } .b::before { content: ''; }`).length, 0, "负控① 空串装饰") && ok;

  // 负控②：counter / 字符串字面量——不是 attr
  ok = eq(findSites(`.a::after { content: counter(x); } .b::after { content: "|"; }`).length, 0, "负控② counter/字面量") && ok;

  // 负控③：注释掉的不是活代码
  ok = eq(findSites(`/* .a::after { content: attr(data-tip); } */\n.b::after { content: ""; }`).length, 0, "负控③ 注释内不判") && ok;

  // 负控④：非 content 属性上的 attr()（width / height 之类）不判——判据只认 content
  ok = eq(findSites(`.a { width: attr(data-w); }`).length, 0, "负控④ 非 content 属性") && ok;

  // 豁免①：上一行 next-line 形 ＋ 理由 ⇒ 放行、且不计"缺理由"
  const exNext = findSites(`/* ${MTAG} -- 渲染器够不到的形态 */\n.a::after { content: attr(data-tip); }`);
  ok = eq([exNext.length, exNext[0]?.exempt, exNext[0]?.noReason], [1, true, false], "豁免① next-line＋理由") && ok;
  ok = eq(judge(exNext), [], "豁免① judge 放行") && ok;

  // 豁免②：同行 line 形 ＋ 理由 ⇒ 放行
  const exSame = findSites(`.a::after { content: attr(data-tip); /* ${STAG} -- 理由 */ }`);
  ok = eq([exSame[0]?.exempt, judge(exSame).length], [true, 0], "豁免② 同行＋理由") && ok;

  // 豁免③：缺理由 ⇒ 单报（这是判据唯一"红"的形态之外的红）
  const noReason = findSites(`/* ${MTAG} */\n.a::after { content: attr(data-tip); }`);
  ok = eq([noReason[0]?.noReason, judge(noReason).length], [true, 1], "豁免③ 缺理由报红") && ok;

  // 选择器回填（报错可定位）
  ok = eq(findSites(`.ldk-x .y::after { content: attr(data-tip); }`)[0]?.selector, ".ldk-x .y::after", "选择器回填") && ok;

  if (!ok) return false;
  console.log("[check-css-tooltip] ✓ 自测通过（正控 5 / 负控 4 / 豁免 3 / 选择器 1）");
  return true;
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) {
    const ok = runSelfTest();
    if (!ok) process.exit(1);
    return;
  }

  const files = SCAN_DIRS.flatMap((d) => collectCss(resolve(ROOT, d))).sort();
  const sites = [];
  for (const rel of files) sites.push(...findSites(readFileSync(resolve(ROOT, rel), "utf8"), rel));

  const violations = judge(sites);
  if (violations.length > 0) {
    console.error(`[check-css-tooltip] ✗ 发现 ${violations.length} 类问题：`);
    for (const v of violations) console.error(v);
    process.exit(1);
  }
  console.log(`✅ CSS 无伪元素提示（content: attr(…)）——已扫 ${files.length} 个 .css`);
}

main();
