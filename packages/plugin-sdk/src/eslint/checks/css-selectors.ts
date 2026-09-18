/**
 * CSS 选择器原语——插件侧两条命名空间判据的**共用底座**（E6#109h-b①）。
 *
 * ── 为什么单独一个文件 ──
 * 「什么算**裸定义**」这件事只允许有**一份**实现（详案 15 §一：不许另写一个近似版）。
 * 两条判据（`reserved-classes.ts` 的宿主保留名 / `plugin-prefix.ts` 的本仓前缀）都用
 * `bareClassDefinitions()` 这一个遍历产出候选，再各自接上自己的裁决——于是「口径漂移」
 * 这件事由构造不可能发生（两条腿读同一份候选，只是裁决条件不同）。
 *
 * 🔴 入参口径：`cleaned` 必须是 `stripComments(src)` 的输出（**等长**替换 ⇒ m.index 偏移与原文
 *    对齐 ⇒ 行号可直接映射）。传原文会让注释里的 `{ }` 参与解析、且行号漂移。
 *
 * 判据口径（与壳仓 `scripts/check-css-namespace.mjs` 同源，见 11-样式命名空间审计.md）：
 *   裸定义 = 逗号切开后的某个 compound、**无祖先**（无空格/`>`/`+`/`~`）、主体**恰好是一个类名**
 *   （`.x.on` 这种复合不算——它不占名）。`.control-bar .combobox { }` 这类 **scoped 调优**是
 *   合法消费，不在任何一条判据的射程内。
 */
/** 一个「裸定义」的类名（占名行为的单位） */export interface BareClassDefinition {
  /** 类名（不含前导点） */
  name: string;
  /** 1-based；= **该规则块选择器首个非空白字符**所在行（多选择器块里各条共享这一行） */
  line: number;
  /** 逗号切开后的那一份选择器文本（保留原文，供报点回显） */
  selector: string;
}

/** 一个 `@keyframes <name>` 的定义点 */
export interface KeyframeDefinition {
  name: string;
  /** 1-based；= `@keyframes` 关键字所在行 */
  line: number;
}

/** 剥伪类/伪元素后取主体 compound */
export function subjectOf(compound: string): string {
  const noPseudo = compound.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "");
  const parts = noPseudo.trim().split(/[\s>+~]+/);
  return parts[parts.length - 1] ?? "";
}

/** 该复合选择器是否有祖先（有 ⇒ scoped 调优，不是裸定义） */
export function hasAncestor(compound: string): boolean {
  const noPseudo = compound.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "").trim();
  return noPseudo.split(/[\s>+~]+/).length > 1;
}

/** 按逗号切选择器（括号深度感知） */
export function splitSelector(sel: string): string[] {
  const parts: string[] = [];
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

/** 偏移 → 1-based 行号（cleaned 与原文等长，行号可直接映射） */
export const lineAt = (text: string, index: number): number => text.slice(0, index).split("\n").length;

/** 单类名主体——`.x` 命中、`.x.on` / `#id` / `div` 一律不命中（不占名） */
const SOLE_CLASS = /^\.(-?[_a-zA-Z][\w-]*)$/;

/**
 * 列举一张样式表里的**裸定义**类名（同一条规则块里的多个选择器各出一份，共享块首行）。
 * 入参 = `stripComments(src)` 的输出。
 */
export function bareClassDefinitions(cleaned: string): BareClassDefinition[] {
  const out: BareClassDefinition[] = [];
  for (const m of cleaned.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (sel.startsWith("@") || !m[2].trim()) continue; // @media 等 at-rule 头 / 空规则体不算定义
    // 行号 = 选择器**第一个非空白字符**所在行（m.index 落在前导空白上——注释被等长替换成空格后
    // 尤其明显；用 m.index 会把行号算到注释那一行 ⇒ disable 注释永远差一行）
    const selStart = m.index + (m[1].length - m[1].trimStart().length);
    const line = lineAt(cleaned, selStart);
    for (const one of splitSelector(sel)) {
      if (hasAncestor(one)) continue; // scoped 调优 = 合法消费
      const cls = SOLE_CLASS.exec(subjectOf(one));
      if (!cls) continue; // 复合（.x.on）或非类选择器
      out.push({ name: cls[1], line, selector: one });
    }
  }
  return out;
}

/** 列举 `@keyframes` 名（关键帧名同样是全局标识符——第二条命名空间） */
export function keyframeDefinitions(cleaned: string): KeyframeDefinition[] {
  const out: KeyframeDefinition[] = [];
  for (const m of cleaned.matchAll(/@keyframes\s+([\w-]+)/g)) {
    out.push({ name: m[1], line: lineAt(cleaned, m.index) });
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   选择器形态谓词 —— E6#109o-b（轮次 1.26 · 件 7 落地）新增
   ══════════════════════════════════════════════════════════════════════════

   🔴 与壳仓 `scripts/lib/css-selectors.mjs` **同源**（口径文本一致；那边 `formOf()` 是同一套
   判定式，壳门禁与运行时探针共用它）。跨包无法 import ⇒ 各写一份，由壳门禁 `--self-test`
   的 `锚⑧` 用**锚词**把两份钉在一起。
   规则正文 = 32-任务-选择器形态轴门禁与落地.md §一（R0）/§三.1。一句话：
   **类名与 id 是「名字锚」；元素 / 通配 / 属性 / 伪类 / 伪元素不是**——后者
   **不需要与任何人同名**就能命中别人的元素（一条 `button { }` 静默改掉所有人的按钮）。

   🔴 **为什么不复用 `subjectOf()` / `hasAncestor()`（1.25 实测的 F3）**：
     · `hasAncestor(".a :focus-visible")` 回 **false**（它连伪类一起剥 ⇒ 只剩 `.a` 一个 part）
     · `subjectOf(".a :focus-visible")` 回 **".a"** ⇒ 既有「独立定义」口径把 `.x :pseudo`
       算成 `.x` 的一次顶层定义。那是**轴 ① 的既有偏差，本轴不许改它**（改它 = 动「宿主 258 ／
       共享组件 89」两串全系列读数 ＋ 18 仓 CI）⇒ 两条尺子在这一层**有意并存**。
     本轴只剥**伪元素**（`::x`）、**伪类（`:x`）保留** ⇒ `.a :focus-visible` 有两个 compound
     ⇒ 判「不是顶层无锚」（否则插件写 `.my-root :focus-visible { }` 会被判成**假红**）。

   🔴 **锚词（跨包同源用）**：`纯伪类/纯伪元素主体 ⇒ 无锚（不是无主体）` ／
     `` `.a :focus-visible` 不是顶层无锚（F3 反面） `` —— 壳门禁 `--self-test` 的 `锚⑧` 用这两句
     把本文件与壳的 `lib/css-selectors.mjs` 钉在一起（照 1.24 `锚⑦` 先例）。
*/

/** 剥**伪元素**（`::x` / `::x(...)`）——伪类（`:x`）与 `:root` 一律**保留** */
export const stripPseudoElements = (compound: string): string => String(compound).replace(/::[a-zA-Z-]+(\([^)]*\))?/g, "");

/** 一个选择器的 compound 序列（剥伪元素后按组合符切） */
export function compoundsOf(compound: string): string[] {
  return stripPseudoElements(compound).trim().split(/[\s>+~]+/).filter(Boolean);
}

/** 该 compound 有没有**名字锚**（`.x` 或 `#x`）——**`(...)` 内不算锚**（那是过滤器不是主体，R0）；
 *  属性选择器整段剥掉（`[class*=".x"]` 里的 `.x` 是**字符串字面量**，不是类选择器）。 */
export function hasNameAnchor(compound: string): boolean {
  return /[.#][-_a-zA-Z]/.test(String(compound).replace(/\[[^\]]*\]/g, "").replace(/\([^)]*\)/g, ""));
}

/** 选择器形态（`formOf()` 的返回值域） */
export interface SelectorForm {
  kind: "anchored" | "anchorless";
  /** `anchorless` 时有效：true = **A 段**（顶层无锚）· false = **B 段**（限定无锚）；带锚恒 false */
  top: boolean;
  /** 剥伪元素后**没有 compound 了**（`::-webkit-scrollbar` / `::before`）——**是有意的形态站点** */
  purePseudo: boolean;
}

/**
 * **选择器形态谓词**——本轴判「形态」的**唯一入口**（S2/S3 共用同一份口径）。
 * @param compound 逗号切开后的**一份**选择器（compound 序列）
 */
export function formOf(compound: string): SelectorForm {
  const compounds = compoundsOf(compound);
  if (compounds.length === 0) return { kind: "anchorless", top: true, purePseudo: true };
  if (compounds.some(hasNameAnchor)) return { kind: "anchored", top: false, purePseudo: false };
  if (compounds.length === 1) return { kind: "anchorless", top: true, purePseudo: false };
  return { kind: "anchorless", top: false, purePseudo: false };
}

/** 该 compound 里有没有 **id 选择器**（`#x`）——R2/S2 对 id 与元素**同罪**（32 号档 §四）。
 *  属性选择器整段剥掉（`[href^="#"]` 不算）；`(...)` 保留（`:has(#x)` 是真提及）。 */
export function hasIdSelector(compound: string): boolean {
  return /#[-_a-zA-Z]/.test(String(compound).replace(/\[[^\]]*\]/g, ""));
}

/** 该选择器（**含 `(...)` 内容**）里有没有 `ldk-*` 类——**R3 的「提及」口径**（`:has(.ldk-x)` 也算） */
export function mentionsLdkClass(selector: string): boolean {
  return /\.ldk-[\w-]*/.test(String(selector));
}

/** 该选择器（含 `(...)`）里有没有 `<prefix>` 开头的类——R3 的「自带自有命名空间」那一半 */
export function hasOwnPrefixedClass(selector: string, prefix: string): boolean {
  const p = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\.${p}[\\w-]*`).test(String(selector));
}

/** 把 `@keyframes … { … }` **整块**换成等长空白（保留换行）——关键帧体内的 `from` / `to` / `0%`
 *  **不是选择器**（不排除它们会造出一堆假站点）。用**大括号配平**扫描而不是正则。 */
export function maskKeyframes(cleaned: string): string {
  let out = "";
  let i = 0;
  const src = String(cleaned);
  const blank = (s: string): string => s.replace(/[^\n]/g, " ");
  while (i < src.length) {
    const at = src.indexOf("@keyframes", i);
    if (at < 0) {
      out += src.slice(i);
      break;
    }
    out += src.slice(i, at);
    const brace = src.indexOf("{", at);
    if (brace < 0) {
      out += src.slice(at);
      break;
    }
    let depth = 0;
    let j = brace;
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    out += blank(src.slice(at, j));
    i = j;
  }
  return out;
}

/** 一处**选择器形态站点**（同一条规则块里的多个选择器各出一份） */
export interface SelectorFormSite {
  /** 逗号切开后的那一份选择器文本（compound 序列） */
  selector: string;
  /** 1-based；= 该规则块选择器首个非空白字符所在行 */
  line: number;
  form: SelectorForm;
}

/**
 * 列举一张样式表里的**选择器形态站点**——判据 S2/S3 的**同一个遍历**（与壳门禁同源）。
 * 入参 = `stripComments(src)` 的输出。
 *  · **递归进 at-rule**（`@media` / `@supports` 内的规则**同样是顶层**）；
 *  · **跳过 `@keyframes` 体内**（`maskKeyframes()` 整块抹白）；
 *  · 空规则体跳过（与 `bareClassDefinitions()` 同口径）。
 */
export function selectorFormSites(cleaned: string): SelectorFormSite[] {
  const masked = maskKeyframes(cleaned);
  const out: SelectorFormSite[] = [];
  for (const m of masked.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (sel.startsWith("@") || !m[2].trim()) continue;
    const line = lineAt(masked, m.index + (m[1].length - m[1].trimStart().length));
    for (const one of splitSelector(sel)) out.push({ selector: one, line, form: formOf(one) });
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   token（自定义属性）作用域原语——E6#109n-b（轮次 1.24）新增
   ══════════════════════════════════════════════════════════════════════════

   🔴 与壳仓 `scripts/lib/css-selectors.mjs` **同源**（口径文本一致；那边 `judgeTokenScope()` 是
   同一套判定式，壳门禁与运行时探针共用它）。跨包无法 import ⇒ 各写一份，由壳门禁 `--self-test`
   的静态断言把**判级文案**钉在一起（见该脚本的 `锚⑦`）。
   规则正文 = 31-任务-token轴门禁与清账.md §一：**作用域才是命名空间**。
*/

/** 定义点的作用域形态：`doc`（文档级）· `class`（类限定）· `id`（id 限定）· `other`（元素/通配/属性） */
export type TokenScope = "doc" | "class" | "id" | "other";

/** 文档级主体（(a)）：`:root` / `html` / `body` / `[data-theme…]` / 通配 `*`。
 *  ⚠️ 只看**主体**（最后一个 compound、且**只剥伪元素**）——`:root` 本身是**伪类**，
 *  用 `subjectOf()`（连伪类一起剥）会把 `:root` 剥成空串 ⇒ 这里单独剥 `::x` 形态。
 *  ⚠️ `* .foo` 的主体是 `.foo`（定义落在 `.foo` 上）⇒ 不是文档级；`*::before` 剥完是 `*` ⇒ 是。 */
const DOC_SUBJECT = /^(:root|html|body|\[data-theme|\*)/i;

/** 剥**伪元素**（`:hover` / `:root` / `[data-theme=…]` 都保留）——**由上面的形态谓词区定义并导出**
 *  （E6#109o-b 起它与 `formOf()` 是同一件事的一半，故上移；此处不再重复定义）。 */

/** 一个 compound 的作用域形态 */
export function tokenScopeOf(compound: string): TokenScope {
  const subject = stripPseudoElements(String(compound)).trim().split(/[\s>+~]+/).filter(Boolean).pop() ?? "";
  if (!subject) return "doc"; // 纯伪元素形态（`::selection`）——无主体 ⇒ 文档级
  if (DOC_SUBJECT.test(subject)) return "doc";
  if (subject.startsWith("#")) return "id";
  if (subject.includes(".")) return "class";
  return "other";
}

/** compound 里的类名（剥属性选择器后再抓 `.x` —— `[class*=".x"]` 这类不算） */
export function classesInCompound(compound: string): string[] {
  const noAttr = String(compound).replace(/\[[^\]]*\]/g, "");
  return [...noAttr.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
}

/** V5 的判定体：该 compound 里有没有 `${prefix}` 开头的类（本仓前缀 = `<pluginId>-`） */
export function hasOwnClass(compound: string, prefix: string): boolean {
  return classesInCompound(compound).some((c) => c.startsWith(prefix));
}

/** 一个自定义属性（token）的定义点 */
export interface TokenDefinition {
  /** 名字（**不含**前导 `--`） */
  name: string;
  /** 1-based；= 该规则块选择器首个非空白字符所在行（与 `BareClassDefinition.line` 同款） */
  line: number;
  /** 逗号切开后的那一份选择器文本（compound 原文，供报点回显与 V5 判「有没有自有类」） */
  selector: string;
  scope: TokenScope;
}

/**
 * 列举一张样式表里的**自定义属性定义点**（同一条规则块里的多个选择器各出一份 —— 与类名轴同款）。
 * 入参 = `stripComments(src)` 的输出。`var(--x)` 前一个字符是 `(` ⇒ 天然不命中「定义」。
 */
export function tokenDefinitions(cleaned: string): TokenDefinition[] {
  const out: TokenDefinition[] = [];
  for (const m of cleaned.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (sel.startsWith("@") || !m[2].trim()) continue; // @media 等 at-rule 头 / 空规则体
    const names: string[] = [];
    for (const d of m[2].matchAll(/(?:^|[;{\s])--([a-zA-Z0-9][\w-]*)\s*:/g)) names.push(d[1]);
    if (names.length === 0) continue;
    const line = lineAt(cleaned, m.index + (m[1].length - m[1].trimStart().length));
    for (const one of splitSelector(sel)) {
      const scope = tokenScopeOf(one);
      for (const name of names) out.push({ name, line, selector: one, scope });
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   关键帧引用口径 —— E6#112（2026-09-18）新增
   ══════════════════════════════════════════════════════════════════════════

   🔴 与壳仓 `scripts/lib/css-selectors.mjs` 的 `animationRefs()`／`ANIMATION_KEYWORDS`
   **同源**（口径文本一致；那边由 `scripts/check-css-namespace.mjs` 判据⑧ 消费——域是
   **宿主域 ＋ 共享组件域**，本包这份服务的正是**插件域那一半**）。跨包无法 import ⇒
   各写一份，由壳门禁 `--self-test` 的 `锚⑨` 用**锚词**把两份钉在一起（照 1.24 锚⑦ /
   1.26 锚⑧ 先例：改一边不改另一边 ⇒ 自测当场红）。
   规则正文 = docs/02-Electron架构/E6_插件生态与发布/插件规范化层/08-任务-插件域关键帧引用判据.md
*/

/** `animation` 值里**不是名字**的关键字（时长/缓动/方向/播放态…）——照壳侧逐字同源 */
const ANIMATION_KEYWORDS = new Set([
  "none", "initial", "inherit", "unset", "revert", "revert-layer",
  "infinite", "normal", "reverse", "alternate", "alternate-reverse",
  "forwards", "backwards", "both", "running", "paused",
  "linear", "ease", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end",
  "steps", "cubic-bezier", "auto",
]);

/** 是不是一个「像名字的」标识符（排除时长/数字/函数调用） */
const isIdentLike = (t: string): boolean => /^-?[_a-zA-Z][\w-]*$/.test(t);

/** `animation` / `animation-name` 引用的一个关键帧名 */
export interface AnimationRef {
  name: string;
  /** 1-based；= **属性名**所在行 */
  line: number;
  /** 属性名原文（`animation` / `animation-name` / `-webkit-animation`…，供报点回显） */
  decl: string;
}

/**
 * 列举一张样式表里 `animation` / `animation-name` 引用的**关键帧名**。
 * 入参 = `stripComments(src)` 的输出。
 * ⚠️ 只匹配 `animation:` / `animation-name:`（`animation-timing-function` 等**不匹配**——
 *    `animation` 之后要求 `\s*:` 或 `-name:`）；`var(--x)` 这类函数**不算**名字（里面有 `(`）。
 */
export function animationRefs(cleaned: string): AnimationRef[] {
  const out: AnimationRef[] = [];
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
