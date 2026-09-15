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
