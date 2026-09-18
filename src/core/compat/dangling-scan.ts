/**
 * 悬空名**运行时扫描腿**——格 1 口径的 TS 移植（`E6#117` · 第 8.4 轮）。
 *
 * ── 🔴 定位：这不是第二把尺子 ──
 * 判据的**唯一真相源** = `scripts/plugin-dangling-name-audit.mjs`（格 1 · E6#114）＋ 它引用的
 * `scripts/lib/css-selectors.mjs`。本文件把**同一口径**移植成 TS（打包进 asar 的 dist-electron
 * import 不到 `scripts/*.mjs` ⇒ 运行时必须有编译内的一份），逐函数与 .mjs 同名同构：
 *   · 判定对象 = 产物 JS 喊的 `ldk-*` 名（硬约束 23：`ldk-` 整个命名空间属宿主侧，插件不得定义
 *     ⇒ 这类名字只能由宿主提供）＋ 产物 CSS `animation:`/`animation-name:` 引用的关键帧名；
 *   · 悬空 = 须判定的引用在「自身定义集 ∪ 宿主定义集」里都没有；
 *   · 误报控三件套照搬：第三方自洽（名字＋规则都在包内）不报、含插值的模板跳过并计数、
 *     非 `ldk-` 的未定义名不计悬空（自有命名空间 / DOM 钩子 / 第三方内联）。
 * 「移植不走样」由**机械对账**钉死：`dangling-scan.test.ts` 在 6 只随包 zip 上把本腿与
 * `node scripts/plugin-dangling-name-audit.mjs --json` 的悬空名集合**逐只比对**（桩 ＋ 真产物双层）。
 *
 * ── 宿主定义集 ──
 * 来自构建期生成物 `./host-css.generated.ts`（`scripts/gen-host-css-manifest.mjs` →
 * `scripts/lib/host-surface.mjs` 的 `collectHostDefs()`——与格 1/格 2 同一采集器），
 * ⛔ 不在运行时读壳自己的打包 CSS。
 *
 * ── 输入 ──
 * 已装插件是**解包目录**（`%APPDATA%/linkdesk/plugins/<id>`）⇒ 本腿只做目录输入
 * （zip 输入是格 1 脚本的职责，运行时不解包）。只读、无副作用、不写盘。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { normalizePath } from "../utils/path/pathUtils.js";
import { HOST_CSS_MANIFEST } from "./host-css.generated.js";

/** 名字形态（与格 1 的 `IDENT` 同款）——⛔ 别放宽成「像名字就行」 */
const IDENT = /^-?[_a-zA-Z][\w-]*$/;
/** 宿主/共享命名空间：硬约束 23 —— `ldk-` 整个命名空间属宿主侧，插件不得定义 */
const HOST_NAMESPACE = /^ldk-/;

/** 单类名主体——`.x` 命中、`.x.on` / `#id` / `div` 不命中（与 `css-selectors.mjs` 的 `SOLE_CLASS` 同款） */
const SOLE_CLASS = /^\.(-?[_a-zA-Z][\w-]*)$/;

/** `animation` 语法里不是关键帧名的保留字（与 `css-selectors.mjs` 同表） */
const ANIMATION_KEYWORDS = new Set([
  "none", "initial", "inherit", "unset", "revert", "revert-layer",
  "infinite", "normal", "reverse", "alternate", "alternate-reverse",
  "forwards", "backwards", "both", "running", "paused",
  "linear", "ease", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end",
  "steps", "cubic-bezier", "auto",
]);

const isIdentLike = (t: string): boolean => /^-?[_a-zA-Z][\w-]*$/.test(t);

/** 剥注释（等长替换、保留换行——与 `css-selectors.mjs` 的 `stripComments` 同款） */
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

/** 按逗号切选择器（括号深度感知）——与 `splitSelector` 同款 */
function splitSelector(sel: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of sel) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { parts.push(buf); buf = ""; } else buf += ch;
  }
  if (buf.trim()) parts.push(buf);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** 剥伪类/伪元素后取主体 compound 的最后一个 part —— 与 `subjectOf` 同款 */
function subjectOf(compound: string): string {
  const noPseudo = compound.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "");
  const parts = noPseudo.trim().split(/[\s>+~]+/);
  return parts[parts.length - 1] ?? "";
}

/** 该复合选择器是否有祖先（有 ⇒ scoped 调优，不是裸定义）——与 `hasAncestor` 同款 */
function hasAncestor(compound: string): boolean {
  const noPseudo = compound.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "").trim();
  return noPseudo.split(/[\s>+~]+/).length > 1;
}

/** 「什么算一个独立定义」——与 `soleClassOf` 同款 */
function soleClassOf(compound: string): string | null {
  const m = SOLE_CLASS.exec(subjectOf(compound));
  return m ? m[1] : null;
}

/* jscpd:ignore-start */
/* ↑ 与 scripts/plugin-dangling-name-audit.mjs 的移植重复段（对账测试钉口径，见文件头） */

/** 偏移 → 1-based 行号 */
const lineAt = (text: string, index: number): number => text.slice(0, index).split("\n").length;

/**
 * 极简 JS 词法遍历：跳过字符串 / 模板正文 / 注释 / 正则，只对**代码**里的标识符回调。
 * 模板的 `${…}` 内部仍是代码 ⇒ 递归进去（嵌套模板一并处理）。与格 1 `scanCode` 逐行同构。
 */
function scanCode(text: string, start: number, onWord: (word: string, endIndex: number) => void, stop: () => boolean = () => false): number {
  const regexAllowed = (prev: string): boolean =>
    prev === "" || /[([{,;:=!&|?+\-*%~^<>]/.test(prev) || prev === "return" || prev === "typeof";
  let i = start;
  let prev = "";
  while (i < text.length) {
    if (stop()) return i;
    const c = text[i];
    const c2 = text[i + 1];
    if (c === "/" && c2 === "/") { const e = text.indexOf("\n", i); i = e < 0 ? text.length : e + 1; continue; }
    if (c === "/" && c2 === "*") { const e = text.indexOf("*/", i + 2); i = e < 0 ? text.length : e + 2; continue; }
    if (c === '"' || c === "'") { i = skipString(text, i, c); prev = '"'; continue; }
    if (c === "`") { i = skipTemplate(text, i, onWord, stop); prev = "`"; continue; }
    if (c === "/" && regexAllowed(prev)) { i = skipRegex(text, i); prev = "/"; continue; }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < text.length && /[\w$]/.test(text[j])) j++;
      const word = text.slice(i, j);
      onWord(word, j);
      prev = word;
      i = j;
      continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return i;
}

const skipString = (text: string, i: number, quote: string): number => {
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === "\\") { j += 2; continue; }
    if (text[j] === quote) return j + 1;
    j++;
  }
  return text.length;
};

const skipTemplate = (text: string, i: number, onWord: (word: string, endIndex: number) => void, stop: () => boolean): number => {
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === "\\") { j += 2; continue; }
    if (text[j] === "`") return j + 1;
    if (text[j] === "$" && text[j + 1] === "{") { j = skipBraced(text, j + 2, onWord, stop); continue; }
    j++;
  }
  return text.length;
};

/** 从 `${` 之后扫到配对的 `}`（内部按代码处理） */
const skipBraced = (text: string, i: number, onWord: (word: string, endIndex: number) => void, stop: () => boolean): number => {
  let depth = 1;
  let j = i;
  while (j < text.length) {
    const c = text[j];
    if (c === '"' || c === "'") { j = skipString(text, j, c); continue; }
    if (c === "`") { j = skipTemplate(text, j, onWord, stop); continue; }
    if (c === "/" && text[j + 1] === "/") { const e = text.indexOf("\n", j); j = e < 0 ? text.length : e + 1; continue; }
    if (c === "/" && text[j + 1] === "*") { const e = text.indexOf("*/", j + 2); j = e < 0 ? text.length : e + 2; continue; }
    if (/[A-Za-z_$]/.test(c)) {
      let k = j;
      while (k < text.length && /[\w$]/.test(text[k])) k++;
      onWord(text.slice(j, k), k);
      j = k;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return j + 1; }
    j++;
  }
  return text.length;
};

const skipRegex = (text: string, i: number): number => {
  let j = i + 1;
  let inClass = false;
  while (j < text.length) {
    const c = text[j];
    if (c === "\\") { j += 2; continue; }
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) return j + 1;
    else if (c === "\n") return j; // 未闭合 ⇒ 当除法处理，别吞掉整段代码
    j++;
  }
  return text.length;
};

/** 命名站点（格 1 `shoutSites` 同构）：className/class 赋值位字面量 ＋ classList 族 ＋ querySelector 族字面量实参 */
interface ShoutSite { name: string; line: number; file?: string }

function shoutSites(text: string): { literals: ShoutSite[]; skipped: { interp: number; dynamic: number } } {
  const literals: ShoutSite[] = [];
  const skipped = { interp: 0, dynamic: 0 };
  const push = (raw: string, at: number): void => {
    const line = lineAt(text, at);
    for (const tok of raw.split(/\s+/)) {
      if (IDENT.test(tok)) literals.push({ name: tok, line });
    }
  };
  const literalArg = (after: number, allowSelector: boolean): { interp?: boolean; raw?: string } | null => {
    const m = /^\s*\(\s*(["'`])([\s\S]*?)\1\s*\)/.exec(text.slice(after));
    if (!m) return null;
    if (m[1] === "`" && m[2].includes("${")) return { interp: true };
    return { raw: allowSelector ? [...m[2].matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((x) => x[1]).join(" ") : m[2] };
  };
  scanCode(text, 0, (word, end) => {
    if (word === "className" || word === "class") {
      let i = end;
      while (i < text.length && /\s/.test(text[i])) i++;
      // 必须是赋值位（`className: "x"` / `className = "x"`）——读法 / 比较 / 箭头都不是站点
      if (text[i] !== ":" && text[i] !== "=") return;
      if (text[i] === "=" && (text[i + 1] === "=" || text[i + 1] === ">")) return;
      i++;
      while (i < text.length && /\s/.test(text[i])) i++;
      let braced = false;
      if (text[i] === "{") { braced = true; i++; while (i < text.length && /\s/.test(text[i])) i++; }
      const ch = text[i];
      if (ch === '"' || ch === "'" || ch === "`") {
        let j = i + 1;
        let raw = "";
        let closed = false;
        while (j < text.length) {
          if (text[j] === "\\") { raw += text[j + 1] ?? ""; j += 2; continue; }
          if (text[j] === ch) { closed = true; break; }
          raw += text[j];
          j++;
        }
        if (!closed) { skipped.dynamic++; return; }
        if (ch === "`" && raw.includes("${")) { skipped.interp++; return; } // 插值模板 ⇒ 射程外
        if (braced) {
          let k = j + 1;
          while (k < text.length && /\s/.test(text[k])) k++;
          if (text[k] !== "}") { skipped.dynamic++; return; }
        }
        push(raw, i);
        return;
      }
      skipped.dynamic++; // 变量 / 函数调用 / 三元 …… 静态读不出
      return;
    }
    if (word === "classList") {
      const m = /^\s*\.\s*(add|remove|toggle|contains)\s*\(\s*(["'])([\s\S]*?)\2/.exec(text.slice(end));
      if (m) push(m[3], end + m.index + m[0].length);
      return;
    }
    if (word === "querySelector" || word === "querySelectorAll" || word === "closest" || word === "matches") {
      const r = literalArg(end, true);
      if (r?.interp) skipped.interp++;
      else if (r?.raw != null) push(r.raw, end);
    }
  });
  return { literals, skipped };
}

/** 一个选择器里的类名（剥属性选择器后再抓 `.x`） */
const classTokensIn = (sel: string): string[] =>
  [...String(sel).replace(/\[[^\]]*\]/g, " ").matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);

/** 包内 CSS 的结构摘要（格 1 `scanArtifact` 的 CSS 半边） */
function scanCss(cleaned: string): {
  selfDefs: Set<string>; selfKeyframes: Set<string>; cssMentions: Set<string>; kfRefs: ShoutSite[];
} {
  const selfDefs = new Set<string>();
  const selfKeyframes = new Set<string>();
  const cssMentions = new Set<string>();
  const kfRefs: ShoutSite[] = [];
  for (const d of cleaned.matchAll(/@keyframes\s+([\w-]+)/g)) selfKeyframes.add(d[1]);
  for (const m of cleaned.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (sel.startsWith("@") || !m[2].trim()) continue;
    // CSS 提及集（结构性自满足，只计数/兜底）——剥属性选择器（`[class*="x"]` 里的 `.x` 是字符串字面量）
    for (const one of splitSelector(sel.replace(/\[[^\]]*\]/g, " "))) {
      for (const n of classTokensIn(one)) cssMentions.add(n);
    }
    // 裸定义集——照 `bareClassDefinitions` 原样：**不剥属性**（`.x[attr]` 的主体不是纯类名 ⇒ 不算定义）
    for (const one of splitSelector(sel)) {
      if (hasAncestor(one)) continue;
      const name = soleClassOf(one);
      if (name) selfDefs.add(name);
    }
  }
  // `animation` / `animation-name` 引用（含 -webkit- 前缀形态；自定义属性不判）
  for (const m of cleaned.matchAll(/(?:^|[;{])\s*([\w-]+)\s*:\s*([^;}]*)/g)) {
    const prop = m[1];
    if (prop.startsWith("--")) continue;
    if (!/(^|-)animation(-name)?$/.test(prop)) continue;
    const line = lineAt(cleaned, m.index + m[0].indexOf(prop));
    for (const part of m[2].split(",")) {
      for (const tok of part.trim().split(/\s+/)) {
        if (!isIdentLike(tok)) continue;
        if (ANIMATION_KEYWORDS.has(tok.toLowerCase())) continue;
        kfRefs.push({ name: tok, line });
      }
    }
  }
  return { selfDefs, selfKeyframes, cssMentions, kfRefs };
}

/* jscpd:ignore-end */

/** 一份产物的文本面（调用方从磁盘目录读出） */
interface ArtifactFile { name: string; text: string }

/** 一个产物的扫描结果（格 1 `scanArtifact` 同构） */
interface ArtifactScan {
  jsNames: ShoutSite[];
  kfRefs: ShoutSite[];
  cssMentions: Set<string>;
  selfDefs: Set<string>;
  selfKeyframes: Set<string>;
  skipped: { interp: number; dynamic: number };
  cssFiles: number;
  jsFiles: number;
}

function scanArtifact(files: ArtifactFile[]): ArtifactScan {
  const jsNames: ShoutSite[] = [];
  const kfRefs: ShoutSite[] = [];
  const cssMentions = new Set<string>();
  const selfDefs = new Set<string>();
  const selfKeyframes = new Set<string>();
  const skipped = { interp: 0, dynamic: 0 };
  let cssFiles = 0;
  let jsFiles = 0;
  for (const f of files) {
    if (f.name === "plugin.json") continue;
    if (f.name.endsWith(".css")) {
      cssFiles++;
      const css = scanCss(stripComments(f.text));
      for (const n of css.selfDefs) selfDefs.add(n);
      for (const n of css.selfKeyframes) selfKeyframes.add(n);
      for (const n of css.cssMentions) cssMentions.add(n);
      for (const r of css.kfRefs) kfRefs.push({ ...r, file: f.name });
    } else if (/\.(js|mjs|cjs|html)$/.test(f.name)) {
      jsFiles++;
      const { literals, skipped: s } = shoutSites(f.text);
      for (const l of literals) jsNames.push({ ...l, file: f.name });
      skipped.interp += s.interp;
      skipped.dynamic += s.dynamic;
    }
  }
  return { jsNames, kfRefs, cssMentions, selfDefs, selfKeyframes, skipped, cssFiles, jsFiles };
}

/** 悬空条目（名字 ＋ 出处） */
export interface DanglingName { name: string; via: "js-classname" | "css-animation"; file: string; line: number }

/**
 * 判一个产物（格 1 `judge` 同构）：须判定的引用在「自身定义集 ∪ 宿主定义集」里都没有 ⇒ 悬空。
 * `ldk-*` 只被包内自己满足的名字（borrowedLdk）**不算悬空**——那归 SDK 腿判红，与本读数无关。
 */
function judgeDangling(scan: ArtifactScan, hostClasses: ReadonlySet<string>, hostKeyframes: ReadonlySet<string>): {
  dangling: DanglingName[];
  borrowedLdk: string[];
  ldkRefs: number;
} {
  const dangling = new Map<string, DanglingName>();
  const satisfiedBySelfOnly = new Set<string>();
  let ldkRefs = 0;
  for (const r of scan.jsNames) {
    if (!HOST_NAMESPACE.test(r.name)) continue;
    ldkRefs++;
    if (hostClasses.has(r.name)) continue;
    if (scan.selfDefs.has(r.name)) { satisfiedBySelfOnly.add(r.name); continue; }
    if (!dangling.has(r.name)) dangling.set(r.name, { name: r.name, via: "js-classname", file: r.file ?? "", line: r.line });
  }
  for (const r of scan.kfRefs) {
    if (scan.selfKeyframes.has(r.name) || hostKeyframes.has(r.name)) continue;
    if (!dangling.has(r.name)) {
      dangling.set(r.name, { name: r.name, via: "css-animation", file: r.file ?? "", line: r.line });
    }
  }
  return {
    dangling: [...dangling.values()].sort((x, y) => x.name.localeCompare(y.name)),
    borrowedLdk: [...satisfiedBySelfOnly].sort(),
    ldkRefs,
  };
}

/** 递归收集目录下指定扩展名的文件（跳过 node_modules / .git——与格 1 目录输入同口径） */
function walkFiles(dir: string, exts: string[], out: string[] = []): string[] {
  if (!statSync(dir).isDirectory()) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

const ARTIFACT_EXTS = [".css", ".js", ".mjs", ".cjs", ".html"];

/** 宿主定义集（生成物 → Set；模块级构造一次） */
const HOST_CLASSES = new Set<string>(HOST_CSS_MANIFEST.classes);
const HOST_KEYFRAMES = new Set<string>(HOST_CSS_MANIFEST.keyframes);

/**
 * 扫一个**已装插件目录**的悬空名（运行时唯一入口——已装插件是解包目录，不是 zip）。
 * 读不出 / 目录不存在 ⇒ 返回 null（调用方落 `unknown`，⛔ 不当 `drifted`）。
 */
export function scanInstalledPluginDir(dir: string): { dangling: DanglingName[]; ldkRefs: number } | null {
  let files: string[];
  try {
    files = walkFiles(dir, ARTIFACT_EXTS);
  } catch {
    return null;
  }
  const artifact: ArtifactFile[] = [];
  for (const p of files) {
    try {
      artifact.push({ name: normalizePath(p.slice(dir.length + 1)), text: readFileSync(p, "utf8") });
    } catch {
      return null; // 单个文件读不动 ⇒ 读数缺失（不猜）
    }
  }
  const scan = scanArtifact(artifact);
  const judged = judgeDangling(scan, HOST_CLASSES, HOST_KEYFRAMES);
  return { dangling: judged.dangling, ldkRefs: judged.ldkRefs };
}
