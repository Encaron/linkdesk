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

/** 剥**伪元素**（`:hover` / `:root` / `[data-theme=…]` 都保留） */
const stripPseudoElements = (compound: string): string => compound.replace(/::[a-zA-Z-]+(\([^)]*\))?/g, "");

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
