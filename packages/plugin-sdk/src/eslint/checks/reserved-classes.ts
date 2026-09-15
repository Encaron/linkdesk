/**
 * check-css-namespace 腿（E6#109e）——插件 CSS **不得裸定义宿主保留名**。
 *
 * 🔴 判据（与壳仓 `scripts/check-css-namespace.mjs` 同源，见 11-样式命名空间审计.md）：
 *   插件视图的一张样式表里**同时装着宿主 CSS + 共享组件 CSS + 所有已加载插件的 CSS**（实机读数：
 *   池文档 8 张样式表）⇒ 裸类名（`.badge` / `.toggle` / `.input` …）是**全局标识符**：一方「定义」、
 *   他方「渲染」，两边样式就落到同一个元素上——**不报错、只是长得不对**（真案：主题卡片徽标文字
 *   被自己的背景吞掉，看着是「一块纯色」）。
 *
 *   本腿只管「**裸定义**」（选择器主体就是这个类名本身、无祖先，如 `.badge { }`）——占名行为。
 *   **scoped 调优**（`.control-bar .combobox { }`）是合法消费，不在本腿管辖。
 *
 * 保留名清单 = 包内 `schemas/reserved-class-names.json`（**单一真相源**，壳仓门禁读同一份）；
 * 清单里没有的名字随便用——但请给自有元素带插件前缀（作者面纪律见 05-插件UI写法规约 §12）。
 *
 * 知情绕行 = 标准 disable 注释（`CHECK_IDS.cssNamespace`），与另三条腿同一套机制。
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectFiles, relPath, readSource, stripComments, isTestOrMockRel, type CheckViolation } from "./scan.js";
import { buildDisableIndex, isDisabled, CHECK_IDS } from "./disable.js";

const EXT_CSS = [".css"];

/**
 * 包内保留名清单定位（dist/eslint/checks/x.js → ../../../schemas = 包根/schemas；src 直跑同样命中）。
 * 🔴 写法必须是「路径式」（resolve + fileURLToPath）——`new URL(<字面量>, import.meta.url)` 是
 * Vite 的资产 URL 惯用式，本模块一旦被 Vite 处理会被改写成构建期资产引用（validate.ts 同款坑，E6#91e）。
 */
const RESERVED_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../schemas/reserved-class-names.json");

interface ReservedEntry {
  name: string;
  owner?: string;
  why: string;
}

export interface ReservedNames {
  classes: ReservedEntry[];
  keyframes: ReservedEntry[];
}

/** 读保留名清单（classes 两组合并 + keyframes）；文件缺失 ⇒ 空表（本腿静默，validate 侧另有存在性门禁） */
export function loadReservedNames(file: string = RESERVED_FILE): ReservedNames {
  if (!existsSync(file)) return { classes: [], keyframes: [] };
  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    classes?: { shared?: ReservedEntry[]; host?: ReservedEntry[] };
    keyframes?: ReservedEntry[];
  };
  return {
    classes: [...(raw.classes?.shared ?? []), ...(raw.classes?.host ?? [])],
    keyframes: raw.keyframes ?? [],
  };
}

/** 剥伪类/伪元素后取主体 compound */
function subjectOf(compound: string): string {
  const noPseudo = compound.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "");
  const parts = noPseudo.trim().split(/[\s>+~]+/);
  return parts[parts.length - 1] ?? "";
}

/** 该复合选择器是否有祖先（有 ⇒ scoped 调优，不是裸定义） */
function hasAncestor(compound: string): boolean {
  const noPseudo = compound.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "").trim();
  return noPseudo.split(/[\s>+~]+/).length > 1;
}

/** 按逗号切选择器（括号深度感知） */
function splitSelector(sel: string): string[] {
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
const lineAt = (text: string, index: number): number => text.slice(0, index).split("\n").length;

export function runReservedClassCheck(root: string, reserved: ReservedNames = loadReservedNames()): CheckViolation[] {
  const violations: CheckViolation[] = [];
  if (!reserved.classes.length && !reserved.keyframes.length) return violations;

  const classMap = new Map(reserved.classes.map((c) => [c.name, c]));
  const kfMap = new Map(reserved.keyframes.map((k) => [k.name, k]));

  for (const file of collectFiles(root, EXT_CSS)) {
    const rel = relPath(root, file);
    if (isTestOrMockRel(rel)) continue;
    const src = readSource(file);
    const cleaned = stripComments(src); // 等长替换 ⇒ 偏移与原文对齐
    const disabled = buildDisableIndex(src, [CHECK_IDS.cssNamespace]);
    const push = (line: number, message: string): void => {
      if (isDisabled(disabled, line, CHECK_IDS.cssNamespace)) return;
      violations.push({ file: rel, line, message });
    };

    // ① 裸定义宿主保留类名
    for (const m of cleaned.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim();
      if (sel.startsWith("@") || !m[2].trim()) continue;
      // 行号 = 选择器**第一个非空白字符**所在行（m.index 落在前导空白上——注释被等长替换成空格后
      // 尤其明显；用 m.index 会把行号算到注释那一行 ⇒ disable 注释永远差一行）
      const selStart = m.index + (m[1].length - m[1].trimStart().length);
      for (const one of splitSelector(sel)) {
        if (hasAncestor(one)) continue; // scoped 调优 = 合法消费
        const subject = subjectOf(one);
        const cls = subject.match(/^\.(-?[_a-zA-Z][\w-]*)$/);
        if (!cls) continue; // 复合（.x.on）或非类选择器
        const entry = classMap.get(cls[1]);
        if (!entry) continue;
        push(
          lineAt(cleaned, selStart),
          `${sel}  ← 裸定义宿主保留名 .${entry.name}（${entry.why}）——插件视图里宿主、共享组件与` +
            `所有插件同表，这个名字会命中别的元素。给自有元素改用插件前缀类名（如 .<你的插件>-…）；` +
            `要那个样子就直接用对应组件（@linkdesk/ui）`
        );
      }
    }

    // ② 关键帧名撞宿主（@keyframes 同样是全局的）
    for (const m of cleaned.matchAll(/@keyframes\s+([\w-]+)/g)) {
      const entry = kfMap.get(m[1]);
      if (!entry) continue;
      push(
        lineAt(cleaned, m.index),
        `@keyframes ${m[1]}  ← 与宿主关键帧同名（${entry.why}）——先加载者/后定义者互相覆盖。` +
          `改用插件前缀名（如 <你的插件>-${m[1]}）`
      );
    }
  }

  return violations;
}
