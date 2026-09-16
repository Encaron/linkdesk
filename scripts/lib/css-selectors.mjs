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
 *  ⚠️ **等长替换**：与 SDK 的 `stripComments` 同款，保证 `m.index` 偏移与原文对齐（行号可映射）。
 *  CSSOM 的 `selectorText` / `cssText` 本身就无注释 ⇒ 运行时探针不需要它，但静态门禁需要。 */
export const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));

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
