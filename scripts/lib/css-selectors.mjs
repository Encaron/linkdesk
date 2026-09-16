/**
 * CSS 选择器口径——**壳侧唯一一份实现**（E6#109m 抽）。
 *
 * 出处（判据先读）：`docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/11-样式命名空间审计.md`
 *   ＋ [22-收口总方案-跨方样式污染九件套.md](../../docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/22-收口总方案-跨方样式污染九件套.md) §一 层 3。
 *
 * 判据口径（**与 SDK 的 `css-selectors.ts` 逐条同源**）：
 *   裸定义 = 逗号切开后的某个 compound、**无祖先**（无空格/`>`/`+`/`~`）、主体**恰好是一个类名**
 *   （`.x.on` 这种复合不算——它不占名）。`.control-bar .combobox { }` 这类 **scoped 调优**是
 *   合法消费，不在任何一条判据的射程内。
 *
 * ── 为什么抽出成 lib（而不是各脚本各写一份）──
 * 🔴 本系列的真根因就是**尺子不止一把**（§一 层 3：错的启发式 ＋ 审计档同款错尺子互相印证）。
 * 这里已经是**第三处**要判定「什么算一个定义」了：① 静态门禁 `check-css-namespace.mjs`（源码文本）；
 * ② 运行时探针 `runtime-style-audit.mjs`（CSSOM 的 `selectorText`）；③（另一端）SDK 的
 * `css-selectors.ts`（插件仓，随 npm 包下发——**跨包，无法 import 本文件**）。
 * ⇒ 壳侧这两处 **必须** 共用一份实现：否则「静态说干净、运行时说撞车」时，**没人知道该信哪把尺子**，
 *   而这正是本系列花了十格在还的债。SDK 侧那份由 [15 号档](../../docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/15-任务-件2落地①-SDK判据腿.md) §一
 *   的纪律钉住（两边各自有自测、口径文本一致；`--self-test` 里有一条静态断言把两份正则钉在一起）。
 */

/** 单类名主体——`.x` 命中、`.x.on` / `#id` / `div` 一律不命中（不占名） */
export const SOLE_CLASS = /^\.(-?[_a-zA-Z][\w-]*)$/;

/** 剥伪类/伪元素后取主体 compound（最后一个 compound） */
export function subjectOf(compound) {
  const noPseudo = compound.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "");
  const parts = noPseudo.trim().split(/[\s>+~]+/);
  return parts[parts.length - 1] ?? "";
}

/** 该复合选择器是否有祖先（有 ⇒ scoped 调优，不是裸定义） */
export function hasAncestor(compound) {
  const noPseudo = compound.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "").trim();
  return noPseudo.split(/[\s>+~]+/).length > 1;
}

/* ══════════════════════════════════════════════════════════════════════════
   选择器形态谓词 —— E6#109o-b（轮次 1.26 · 件 7 落地）新增
   ══════════════════════════════════════════════════════════════════════════

   🔴 规则正文 = 32-任务-选择器形态轴门禁与落地.md §一（R0）/§三.1。一句话：
   **类名与 id 是「名字锚」；元素 / 通配 / 属性 / 伪类 / 伪元素不是**——后者
   **不需要与任何人同名**就能命中别人的元素（一条 `button { }` 静默改掉所有人的按钮）。

   🔴 **为什么必须新写一份、不许复用 `subjectOf()` / `hasAncestor()`（1.25 实测的 F3）**：
     · `hasAncestor(".a :focus-visible")` 回 **false**（它连伪类一起剥 ⇒ 只剩 `.a` 一个 part）
     · `subjectOf(".a :focus-visible")` 回 **".a"** ⇒ 既有「独立定义」口径把 `.x :pseudo`
       算成 `.x` 的一次顶层定义（宿主实测 2 处）。
     那是**轴 ①（类名轴）的既有偏差**，本轴**不许改它**（改它 = 动「宿主 258 ／ 共享组件 89」
     两串全系列读数 ＋ 18 仓 CI）⇒ 两条尺子在这一层**有意并存**（32 号档 §八 诚实边界 1）。
     本轴只剥**伪元素**（`::x`）、**伪类（`:x`）保留** ⇒ `.a :focus-visible` 有两个 compound
     ⇒ 判「不是顶层无锚」（否则插件写 `.my-root :focus-visible { }` 会被判成**假红**）。

   🔴 **锚词（跨包同源用）**：`纯伪类/纯伪元素主体 ⇒ 无锚（不是无主体）` ／
     `` `.a :focus-visible` 不是顶层无锚（F3 反面） `` —— 壳门禁 `--self-test` 的 `锚⑧` 用这两句
     把本文件与 SDK 的 `css-selectors.ts` 钉在一起（跨包无法 import；照 1.24 `锚⑦` 先例）。
*/

/** 剥**伪元素**（`::x` / `::x(...)`）——伪类（`:x`）与 `:root` 一律**保留**。
 *  ⚠️ **不导出**：壳侧唯一消费方是 `compoundsOf()` 与 `tokenScopeOf()`（本文件内部）；
 *  SDK 那份有一份自己的同名导出（跨包各一份）。 */
const stripPseudoElements = (compound) => String(compound).replace(/::[a-zA-Z-]+(\([^)]*\))?/g, "");

/** 一个选择器的 compound 序列（剥伪元素后按组合符切；`(...)` 内的空白不参与切分——由调用方保证选择器已切好） */
export function compoundsOf(compound) {
  return stripPseudoElements(compound).trim().split(/[\s>+~]+/).filter(Boolean);
}

/** 该 compound 有没有**名字锚**（`.x` 或 `#x`）——**`(...)` 内不算锚**（那是过滤器不是主体，R0）；
 *  属性选择器整段剥掉（`[class*=".x"]` 里的 `.x` 是**字符串字面量**，不是类选择器——与
 *  `classesInCompound()` 同款处理）。⚠️ **不导出**：壳侧只在 `formOf()` 里用。 */
function hasNameAnchor(compound) {
  return /[.#][-_a-zA-Z]/.test(String(compound).replace(/\[[^\]]*\]/g, "").replace(/\([^)]*\)/g, ""));
}

/**
 * **选择器形态谓词**——本轴判「形态」的**唯一入口**（三处机械面共用同一份口径）。
 *
 * @param {string} compound 逗号切开后的**一份**选择器（compound 序列）
 * @returns {{kind:"anchored"|"anchorless", top:boolean, purePseudo:boolean}}
 *   · `anchored`   ⇒ 有名字锚 ⇒ 归**轴 ①（类名轴）**＋ **R3**（`top` 不适用，恒 false）
 *   · `anchorless` ＋ `top`      ⇒ **A 段**（顶层无锚，如 `select` / `*` / `:root` / `::-webkit-scrollbar`）
 *   · `anchorless` ＋ `!top`     ⇒ **B 段**（限定无锚，如 `html body section`）
 *   · `purePseudo` ⇒ 剥伪元素后**没有 compound 了**（`::-webkit-scrollbar` / `::before`）——
 *     **是有意的形态站点，不是"没主体"**（1.25 的 F1 就是把它当空串静默丢了）
 */
export function formOf(compound) {
  const compounds = compoundsOf(compound);
  if (compounds.length === 0) return { kind: "anchorless", top: true, purePseudo: true };
  if (compounds.some(hasNameAnchor)) return { kind: "anchored", top: false, purePseudo: false };
  if (compounds.length === 1) return { kind: "anchorless", top: true, purePseudo: false };
  return { kind: "anchorless", top: false, purePseudo: false };
}

/** 该 compound 里有没有 **id 选择器**（`#x`）——R2/S2 对 id 与元素**同罪**（32 号档 §四）。
 *  属性选择器整段剥掉（`[href^="#"]` / `[data-x="#a"]` 不算）；`(...)` 保留（`:has(#x)` 是真提及）。
 *  ⚠️ 壳侧消费方 = 判据⑪ 的**壳内夹具面**（夹具按 R2 一视同仁，id 也禁）。 */
export function hasIdSelector(compound) {
  return /#[-_a-zA-Z]/.test(String(compound).replace(/\[[^\]]*\]/g, ""));
}

/* ⚠️ **R3（跨方命中必须自带自有命名空间）的判定体不在本文件**：壳侧不判 R3（壳内夹具没有可解析的
 *  `pluginId` 身份链 ⇒ 判不了「自有」是哪一族；32 号档 §七 的夹具那行只点 ⑪）；插件侧由 SDK 的
 *  `selector-form.ts` 自带 `mentionsLdkClass()` / `hasOwnPrefixedClass()` 两份（跨包各一份）。
 *  ⇒ 这里刻意**不留**「导出但没人用」的等价物（本项目「无死代码」纪律，1.21b §3d）。 */

/** 把 `@keyframes … { … }` **整块**换成等长空白（保留换行）——关键帧体内的
 *  `from` / `to` / `0%` **不是选择器**（32 号档 §三.2 ⚠️ 第二条：不排除它们会造出一堆假站点）。
 *  ⚠️ 用**大括号配平**扫描而不是正则：`@keyframes` 体里还可能嵌套 `@media`（罕见但合法）。
 *  ⚠️ **不导出**：壳侧唯一消费方是 `selectorFormSites()`。 */
function maskKeyframes(cleaned) {
  let out = "";
  let i = 0;
  const src = String(cleaned);
  const blank = (s) => s.replace(/[^\n]/g, " ");
  while (i < src.length) {
    const at = src.indexOf("@keyframes", i);
    if (at < 0) { out += src.slice(i); break; }
    out += src.slice(i, at);
    const brace = src.indexOf("{", at);
    if (brace < 0) { out += src.slice(at); break; }
    let depth = 0;
    let j = brace;
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") { depth--; if (depth === 0) { j++; break; } }
    }
    out += blank(src.slice(at, j));
    i = j;
  }
  return out;
}

/**
 * 列举一张样式表里的**选择器形态站点**（E6#109o-b）——判据⑦⑧⑩⑪ 与运行时镜像的**同一个遍历**。
 * 入参 = `stripComments(src)` 的输出。
 *  · **递归进 at-rule**（`@media` / `@supports` 内的规则**同样是顶层**——相对它所在的层叠上下文
 *    无祖先；32 号档 §三.2 ⚠️ 第一条）；
 *  · **跳过 `@keyframes` 体内**（`maskKeyframes()` 整块抹白 ⇒ `from`/`to`/`%` 不产出站点）；
 *  · 空规则体跳过（与 `bareClassDefinitions()` 同口径）。
 * @returns {{selector:string, line:number, form:ReturnType<typeof formOf>}[]} 同一条规则块里的多个
 *   选择器各出一份（逗号切开）；`line` = 该**规则块**选择器首个非空白字符所在行（与类名轴同款）。
 */
export function selectorFormSites(cleaned) {
  const masked = maskKeyframes(cleaned);
  const out = [];
  for (const m of masked.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (sel.startsWith("@") || !m[2].trim()) continue;
    const line = lineAt(masked, m.index + (m[1].length - m[1].trimStart().length));
    for (const one of splitSelector(sel)) out.push({ selector: one, line, form: formOf(one) });
  }
  return out;
}

/** 按逗号切选择器（括号深度感知） */
export function splitSelector(sel) {
  const parts = [];
  let depth = 0;
  let buf = "";
  for (const ch of sel) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(buf);
      buf = "";
    } else buf += ch;
  }
  if (buf.trim()) parts.push(buf);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** 剥注释（选择器/属性里不会有 // 风格注释）。
 *  ⚠️ **等长替换、且保留换行**：与 SDK 的 `stripComments` 同款（`m.replace(/[^\n]/g, " ")`），
 *  既保证 `m.index` 偏移与原文对齐，又保证**行号可映射**（`lineAt`）。
 *  🔴 E6#109n-b：原先用 `" ".repeat(m.length)` **把换行也换成空格** ⇒ 多行注释之后的
 *  行号全部上移（本文件头那句「行号可映射」当时并不成立）。token 轴要按 `文件:行` 报点，
 *  故本轮改成与 SDK 同款——顺带让两把尺子在这一层**真正**同源。
 *  CSSOM 的 `selectorText` / `cssText` 本身就无注释 ⇒ 运行时探针不需要它，但静态门禁需要。 */
export const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

/** 偏移 → 1-based 行号（cleaned 与原文等长且换行保留 ⇒ 可直接映射）——**本文件内部用**，不出射程 */
const lineAt = (text, index) => text.slice(0, index).split("\n").length;

/**
 * **一个 compound 是不是「独立定义」**——是 ⇒ 回类名；不是 ⇒ `null`（不占名）。
 * 🔴 这是「什么算一个定义」这个判据的**唯一实现**：文本层的 `bareClassDefinitions()` 与
 * 运行时探针（CSSOM 的 `selectorText`，拿不到规则体文本）都调它 ⇒ 两把尺子由构造同源。
 */
export function soleClassOf(compound) {
  const m = SOLE_CLASS.exec(subjectOf(compound));
  return m ? m[1] : null;
}

/**
 * 列举一张样式表里的**独立定义**类名（同一条规则块里的多个选择器各出一份）。
 * 入参 = 无注释的 CSS 文本（静态：`stripComments(src)` 的输出；运行时：CSSOM 的 `cssText`）。
 * ⚠️ 本文件**不产出行号**：壳侧两个消费方（静态门禁 / 运行时探针）都按**规则**报点，不按行。
 *   ——需要行号的是 SDK 的 `css-selectors.ts`（它要给 ESLint 报点），那份自带 `lineAt`；
 *   这里刻意不留一个没人消费的字段（无死代码）。
 */
export function bareClassDefinitions(cleaned) {
  const out = [];
  for (const m of cleaned.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (sel.startsWith("@") || !m[2].trim()) continue; // @media 等 at-rule 头 / 空规则体不算定义
    for (const one of splitSelector(sel)) {
      if (hasAncestor(one)) continue; // scoped 调优 = 合法消费
      const name = soleClassOf(one);
      if (!name) continue; // 复合（.x.on）或非类选择器
      out.push({ name, selector: one });
    }
  }
  return out;
}

/** 列举 `@keyframes` 名（关键帧名同样是全局标识符——第二条命名空间） */
export function keyframeDefinitions(cleaned) {
  const out = [];
  for (const m of cleaned.matchAll(/@keyframes\s+([\w-]+)/g)) out.push({ name: m[1] });
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   关键帧**引用**口径 —— E6#109o-b（轮次 1.26）判据⑧ 的输入
   ══════════════════════════════════════════════════════════════════════════

   判据⑧ = **`animation` / `animation-name` 引用的每个名字必须在同方有 `@keyframes` 定义**
   （规则正文 = 32 号档 §三.2 判据⑧）。为什么它是件 7（选择器形态轴）的一员：关键帧名与
   选择器里的名字**同一类**——都是「写错不报错、只是不动了」的静默失效（漏改引用 = 动画消失）。
   1.21／1.21b 把关键帧名全改成 `ldk-*` ⇒ 「改名忘改引用」从此有了真实发生率。
*/

/** `animation` 语法里**不是关键帧名**的保留字（时长/缓动/方向/播放态…）——判据⑧ 要跳过它们。
 *  ⚠️ 时长（`1s` / `200ms`）与数字**不是标识符**，由 `isIdent` 的形态天然排除。 */
const ANIMATION_KEYWORDS = new Set([
  "none", "initial", "inherit", "unset", "revert", "revert-layer",
  "infinite", "normal", "reverse", "alternate", "alternate-reverse",
  "forwards", "backwards", "both", "running", "paused",
  "linear", "ease", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end",
  "steps", "cubic-bezier", "auto",
]);

/** 是不是一个「像名字的」标识符（排除时长/数字/函数调用） */
const isIdentLike = (t) => /^-?[_a-zA-Z][\w-]*$/.test(t);

/**
 * 列举一张样式表里 `animation` / `animation-name` 引用的**关键帧名**。
 * 入参 = `stripComments(src)` 的输出。
 * ⚠️ 只匹配 `animation:` / `animation-name:`（`animation-timing-function` 等**不匹配**——
 *    `animation` 之后要求 `\s*:` 或 `-name:`）；`var(--x)` 这类函数**不算**名字（里面有 `(`）。
 * @returns {{name:string, line:number, decl:string}[]}
 */
export function animationRefs(cleaned) {
  const out = [];
  for (const m of cleaned.matchAll(/(?:^|[;{])\s*([\w-]+)\s*:\s*([^;}]*)/g)) {
    const prop = m[1];
    // 只认 `animation` / `animation-name`（含 `-webkit-` 前缀形态）；`--x` 自定义属性名里含
    // "animation" 的一大把（`--my-animation:`）——它的值是名字清单里根本没有的东西 ⇒ 会造出假红。
    if (prop.startsWith("--")) continue;
    if (!/(^|-)animation(-name)?$/.test(prop)) continue;
    // 行号 = **属性名**所在行（m[0] 前面还有 1 个分隔符 ＋ 空白 ⇒ 不能用 m.index）
    const line = lineAt(cleaned, m.index + m[0].indexOf(prop));
    for (const part of m[2].split(",")) {
      for (const tok of part.trim().split(/\s+/)) {
        if (!isIdentLike(tok)) continue;
        if (ANIMATION_KEYWORDS.has(tok.toLowerCase())) continue;
        out.push({ name: tok, line, decl: prop });
      }
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   token（自定义属性）作用域口径——E6#109n-b（轮次 1.24）新增
   ══════════════════════════════════════════════════════════════════════════

   🔴 规则正文 = [31-任务-token轴门禁与清账.md](../../docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/31-任务-token轴门禁与清账.md) §一。
   一句话：**作用域才是命名空间**——名字随你，**住在哪棵子树里**才是它属于谁：
     (a) 文档级（`:root`/`html`/`body`/`[data-theme=…]`/通配 `*`）**只有宿主契约块**能写
         （契约块 = **文件级**登记：`src/index.css` 的 `:root` 与 `[data-theme="light"]`；里面放什么名字**不设名单**）；
     (b) 其余定义必须挂在**自有命名空间**的子树下（宿主/共享 `.ldk-*`、插件 `.<pluginId>-*`）；
     (c) 浮层宿主根 `#ld-float-layer` 一族 = portal 面例外（id 作用域，**放宽元素归谁、不放宽名字归谁**）；
     (d) 名字层只有一句：**任何方不得定义 `ldk-` 开头的自定义属性**。

   ── 为什么判定体住这里（与类名轴同一条纪律）──
   本系列的真根因是**尺子不止一把**。token 轴要判三处：静态门禁（壳）· **运行时探针（壳）** ·
   SDK 腿（插件仓，随 npm 包下发）。前两处**同一个进程、同一份实现**（本文件）；
   第三处跨包只能各写一份（同 `css-selectors.ts` 的既有先例：口径文本一致 ＋ 门禁自测里有一条
   静态断言把**判级文案**钉在一起）。
   ⇒ `judgeTokenScope()` 是判级的**唯一实现**，三处都只给它「定义点」这一件事。
*/

/* 定义点的作用域形态（`tokenScopeOf()` 的返回值域）：`doc`（文档级）· `class`（类限定）· `id`（id 限定）·
   `other`（元素/通配/属性）——后两类本轴不判（`id` 按 (c) 放行、`other` 归件 7 的选择器形态轴）。 */

/** 文档级主体（(a)）：`:root` / `html` / `body` / `[data-theme…]` / 通配 `*`。
 *  ⚠️ 只看**主体**（最后一个 compound、且**只剥伪元素**）——`:root` 本身是**伪类**，
 *  用 `subjectOf()`（连伪类一起剥）会把 `:root` 剥成空串 ⇒ 这里单独剥 `::x` 形态。
 *  ⚠️ `* .foo` 的主体是 `.foo`（定义落在 `.foo` 上）⇒ 不是文档级；`*::before` 剥完是 `*` ⇒ 是。 */
const DOC_SUBJECT = /^(:root|html|body|\[data-theme|\*)/i;

/** 剥**伪元素**（`:hover`/`:root`/`[data-theme=…]` 都保留）——**由上面的形态谓词区定义并导出**
 *  （E6#109o-b 起它与 `formOf()` 是同一件事的一半，故上移；此处不再重复定义）。 */

/** 一个 compound 的作用域形态 */
export function tokenScopeOf(compound) {
  const subject = stripPseudoElements(String(compound)).trim().split(/[\s>+~]+/).filter(Boolean).pop() ?? "";
  if (!subject) return "doc"; // 纯伪元素形态（`::selection`）——无主体 ⇒ 文档级
  if (DOC_SUBJECT.test(subject)) return "doc";
  if (subject.startsWith("#")) return "id";
  if (subject.includes(".")) return "class";
  return "other";
}

/** compound 里的类名（剥属性选择器后再抓 `.x` —— `[class*=".x"]` 这类不算）——**内部用** */
function classesInCompound(compound) {
  const noAttr = String(compound).replace(/\[[^\]]*\]/g, "");
  return [...noAttr.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
}

/** V4/V5 的判定体：该 compound 里有没有 `${prefix}` 开头的类（宿主/共享 `ldk-`、插件 `<pluginId>-`）——**内部用** */
function hasOwnClass(compound, prefix) {
  return classesInCompound(compound).some((c) => c.startsWith(prefix));
}

/** 契约块（(a)）的**文件条件**：`src/index.css`（唯一契约块所在文件）——**内部用**
 *  ⚠️ 路径分隔符无关（Windows 的 `relative()` 回反斜杠）。 */
function isContractFile(file) {
  return /(^|\/)src\/index\.css$/i.test(String(file).replace(/\\/g, "/"));
}

/** 契约块（(a)）的**选择器条件**：`:root` 或 `[data-theme=…]`（**不设名字名单**，里面放什么键合法）——**内部用** */
function isContractSelector(selector) {
  const s = String(selector).trim();
  return /^:root\b/i.test(s) || /^\[data-theme/i.test(s);
}

/** V3 的判定体：这条文档级定义是不是落在契约块里（**文件 ∧ 选择器**双条件）——**内部用** */
function isContractBlock(file, selector) {
  return isContractFile(file) && isContractSelector(selector);
}

/**
 * 列举一张样式表里的**自定义属性定义点**（同一条规则块里的多个选择器各出一份 —— 与类名轴同款）。
 * 入参 = `stripComments(src)` 的输出。
 * 行号 = **该规则块选择器首个非空白字符**所在行（改这一块就在这一行，与类名轴报点同款）。
 */
export function tokenDefinitions(cleaned) {
  const out = [];
  for (const m of cleaned.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (sel.startsWith("@") || !m[2].trim()) continue; // @media 等 at-rule 头 / 空规则体
    const names = [];
    // `--x:` 形态；`var(--x)` 前一个字符是 `(` ⇒ 天然不命中（与运行时探针的 customPropDefs 同判）
    for (const d of m[2].matchAll(/(?:^|[;{\s])--([a-zA-Z0-9][\w-]*)\s*:/g)) names.push(d[1]);
    if (names.length === 0) continue;
    const line = lineAt(cleaned, m.index + (m[1].length - m[1].trimStart().length));
    for (const one of splitSelector(sel)) {
      const scope = tokenScopeOf(one);
      for (const name of names) out.push({ name, selector: one, line, scope });
    }
  }
  return out;
}

/* ── 判级：判定式的**唯一实现** ＋ 判级文案的**唯一出处** ──────────────────

   ⚠️ 文案为什么写在这里：31 号档 §4.3 要求**运行时探针的判级文案与门禁逐字一致**
   ——门禁与探针同进程同模块 ⇒ 由构造一致（不是靠人抄）；SDK 侧那份跨包，
   由 `check-css-namespace.mjs --self-test` 的静态断言钉住同一句话（见那里的 `锚⑥`）。

   判红逐条论证「① 本仓可答 ② 有真害」（22 号档 §10.3 硬要求）⇒ 写进 `why`，供人复核。 */

export const TOKEN_WHY = {
  V2:
    "自定义属性名以 `ldk-` 开头——`ldk-` **整个命名空间属宿主**（与类名 / 关键帧同一句，CLAUDE.md 硬约束 23 ②），" +
    "任何一方都不得定义（占名即「宿主契约名被他人改写」的入口）。",
  V1:
    "非宿主方在**文档级**（`:root` / `html` / `body` / `[data-theme=…]` / `*`）定义了**不带自有前缀**的自定义属性" +
    "——1.23 实测：宿主 94 个契约名里 **83 个只有样式表提供、引擎不写 inline**（默认主题是空兜底配方 ⇒ " +
    "差集清理把主题键全清掉）⇒ **一条 `:root` 就能全局改写宿主的颜色 / 圆角 / z-index**，" +
    "而且这个「屏蔽」随主题变化＝时好时坏（`marketplace` 那次 `--status-connected` 覆写事故正是此形态）。",
  V3:
    "宿主的文档级（`:root` / `html` / `body` / `[data-theme=…]` / `*`）自定义属性定义**越出了契约块**" +
    "——契约块 = **文件级登记**（`src/index.css` 的 `:root` 与 `[data-theme=\"light\"]`）⇒ " +
    "别处出现文档级定义 = **影子契约**（名字进了公共契约面却不在契约块 ⇒ 主题引擎与样式表两个真相源打架）。",
  V4:
    "宿主 / 共享组件的**类限定**自定义属性定义**不含任何自有命名空间类**（`.ldk-*`）" +
    "——定义落在非自有子树（宿主与共享组件共用同一个 `ldk-` 空间，判据⑥）。",
  V5:
    "插件的**类限定**自定义属性定义**不含本仓 `pluginId` 前缀的类**（`.<pluginId>-*`）" +
    "——定义落到了宿主 / 他方元素上（与件 7 的 R3「跨方命中必须有自有根类作祖先」同形）。",
  V6:
    "插件的**文档级**定义、但名字自带本仓前缀（`<pluginId>-`）——无人同吃、**近乎无害**（🟡 只报不拦，" +
    "22 号档 §10.3：判红只给「本仓可答 ＋ 有真害」），建议改挂自有根类。",
};

/**
 * 判一个 token 定义点的级别。**三处机械面共用这一个判定体**。
 *
 * @param {object} site
 * @param {"host"|"shared"|"plugin"} site.party 定义方（宿主 / 共享组件 / 插件）
 * @param {string|null} [site.pluginId] 插件方必填（前缀来源）；拿不到 ⇒ 调用方 fail-closed
 * @param {string} site.name 自定义属性名（**不含**前导 `--`）
 * @param {"doc"|"class"|"id"|"other"} site.scope 作用域形态（`tokenScopeOf()` 的输出）
 * @param {string|null} [site.compound] 该 compound 原文（V4/V5 要它判「有没有自有类」；运行时拿不到 ⇒ 传 null）
 * @param {string|null} [site.file] 定义所在文件（V3 要它判契约块；运行时传样式表来源）
 * @returns {{level:"red"|"yellow"|null, code:"V1"|"V2"|"V3"|"V4"|"V5"|"V6"|null, why:string|null}}
 *   `level === null` ⇒ **不在本轴射程内**（见 `why === null` 的那些分支：契约块内、id 的 (c) 放行、
 *   `other` 形态归件 7、运行时缺 compound 信息 ⇒ 不判 ≠ 合规，逐条写进诚实边界）。
 */
export function judgeTokenScope(site) {
  const { party, name, scope } = site;
  const pluginId = site.pluginId ?? null;
  const compound = site.compound ?? null;
  const file = site.file ?? null;
  const isPlugin = party === "plugin";
  const prefix = isPlugin ? `${pluginId}-` : "ldk-";

  // 🔴 顺序 = **先出最具体的那条**：同一站点可能同时命中两条（`src/components/shared/**` 里
  //    `:root { --ldk-x: red }` 既是 V3 又是 V2）——不重复报两行，报**对该方最可操作**的那一条。
  //    宿主/共享侧先判 V3（作用域轴的本体：定义出现在文档级），过了契约块再落到 V2（名字层）。

  // V3：宿主 / 共享组件的文档级定义只允许出现在契约块（文件 ∧ 选择器双条件）
  if (!isPlugin && scope === "doc" && !isContractBlock(file, compound)) {
    return { level: "red", code: "V3", why: TOKEN_WHY.V3 };
  }

  // V2：名字层一句话（**与作用域无关**——`--ldk-*` 无论挂在哪都不许）
  if (String(name).startsWith("ldk-")) return { level: "red", code: "V2", why: TOKEN_WHY.V2 };

  if (scope === "doc") {
    if (!isPlugin) return { level: null, code: null, why: null }; // 契约块内的任何名字都合法（配方键不设名单）
    // 插件：同一个「文档级」动作，按「名字有没有主」分两档（(a) 与 V1/V6）
    return String(name).startsWith(prefix)
      ? { level: "yellow", code: "V6", why: TOKEN_WHY.V6 }
      : { level: "red", code: "V1", why: TOKEN_WHY.V1 };
  }

  if (scope === "class") {
    // V4 / V5：类限定定义必须挂在自有命名空间的类之下。
    // ⚠️ 需要一个 compound 原文（运行时的作用域描述符只留主体、丢了祖先 ⇒ 传 null ⇒ 不判，
    //    见探针「覆盖不到」清单——**不判 ≠ 合规**）。
    if (compound === null) return { level: null, code: null, why: null };
    if (hasOwnClass(compound, prefix)) return { level: null, code: null, why: null };
    return isPlugin
      ? { level: "red", code: "V5", why: TOKEN_WHY.V5 }
      : { level: "red", code: "V4", why: TOKEN_WHY.V4 };
  }

  // id：按 (c) portal 面放行（浮层宿主根由调用方在消息里点名；本轴只判 doc/class 两类）
  // other：元素 / 通配 / 属性形态 —— 归件 7 的选择器形态轴
  return { level: null, code: null, why: null };
}

/* 🔴 (c) portal 面的浮层宿主根（`FloatingLayerHost.tsx` 渲染）：`#ld-float-layer` ＋ 其下
   `#context-menu-root` / `#quick-pick-root` / `#dialog-root` / `#floating-panel-root`。
   本轴**不为它设名单**——`id` 作用域整类按 (c) 放行（`judgeTokenScope()` 的 id 分支）：
   「浮层根是宿主所有的结构性元素」这件事由**构造**成立，列名单反而会随源码漂移。
   ⚠️ 放宽的是「元素归谁」，**不放宽名字归谁**：宿主照样用契约名/`ldk-*`，插件照样不得定义 `ldk-*`。 */
