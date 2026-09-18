/**
 * check-css-namespace 腿·**插件域悬空名判据**（E6#119 · 2026-09-19）。
 *
 * ── 规则一句话 ──
 * 插件产物是**冻结的快照**：发布那一刻的名字被烘进 bundle，之后宿主改名/删除它不会知道
 * （实证：`.ldk-input` 那一路，`settings` v1.0.12 → v1.0.13 输入框丢底色/边框/圆角，**零报错**）。
 * 本腿把格 1 那把尺子（壳仓 `scripts/plugin-dangling-name-audit.mjs`，E6#114）搬到**作者自己的仓里**：
 * 作者在他自己的 CI / 本地就能跑出红黄，不必来问维护者——「让第三方插件作者自由制造插件」的机械兑现。
 * 规则正文 = `docs/02-Electron架构/E6_插件生态与发布/插件兼容机械化/06-任务-判据铺开.md`。
 *
 * ── 🔴 这不是第二把尺子（三份同口径）──
 * 判据口径的唯一真相源 = 壳仓 `scripts/plugin-dangling-name-audit.mjs`（格 1 尺子）。三份实现同口径：
 *   ① 壳尺子（产物层只读审计）② 壳运行时腿 `src/core/compat/dangling-scan.ts`（格 4，**已与格 1 在
 *   随包 6 zip 上对账逐只相等**，对账测试常驻壳 check）③ **本腿**（作者侧，本文件）。
 * 跨包无法 import ⇒ 照 E6#112 `锚⑨` 先例用**锚词**把口径钉住：壳尺子 `--self-test` 的 `锚⑩`
 * 与本包单测各断言一遍（下方「口径锚词」块 ＋ 壳尺子 §判据 的原句逐字同源——改一边不改另一边必红）。
 *
 * ── 口径锚词（与格 1 尺子逐字同源——`锚⑩` 断言的另一半）──
 *   · 🔴 判据：只判「**不属于它自己**的名字」；
 *   · **悬空** = 须判定的引用，在「自身定义集 ∪ 当前宿主定义集」里都没有；
 *   · 动态拼接一律**跳过并计数**（静态读不出运行时拼出来的名字，拦就假红）；
 *   · 非 `ldk-` 的未定义名**不计悬空**（自有命名空间 / DOM 钩子 / 第三方内联）——假红比漏报更坏；
 *   · `ldk-*` 名只被包内自己满足 ⇒ borrowedLdk（归本包前缀腿判红，本腿不判悬空）；
 *   · 产物 CSS 里 `animation:` / `animation-name:` 引用的**关键帧名**（引用方与定义方分离）。
 *
 * ── 域差异（如实写，不是漏了）──
 * 格 1 尺子扫**产物**（构建后的 bundle），本腿扫**作者源码**（src 树，`scan.ts` 的 SKIP_DIRS 已排
 * node_modules/dist）——域不同、判定口径同一份。测试/mock 文件不进产物 ⇒ 本腿照既有各腿口径跳过
 * （`isTestOrMockRel`），否则夹具里的假名字当场假红。
 *
 * ── 宿主定义集（作者侧拿不到壳源码 ⇒ 随包下发）──
 * `schemas/host-css-names.json`（本格新增的随包 schema）——壳侧 `scripts/gen-host-css-manifest.mjs`
 * 从 `collectHostDefs()`（格 1/格 2 同一采集器）生成，与壳运行时清单 `host-css.generated.ts`
 * **同一生成器同一次采集**（⛔ 两份口径不会分叉）。🔴 **保底（fail-closed）**：宿主定义集读不到
 * ⇒ 报「**未核验**」违规——⛔ **不许当成 0 处通过**（假绿比假红更坏：作者会以为已经查过了）。
 *
 * ── 明确不做的三件（防越界）──
 *   ⛔ 不判「该不该退役 / 老不老」（时间不设阈值——本层红线③）；
 *   ⛔ 不判**前缀**（「裸定义必须 `<pluginId>-` 开头」是 `plugin-prefix.ts` 的活；自己定义的 `ldk-*`
 *      归它判红，本腿只把它从悬空里排除）；
 *   ⛔ 不做退役名提示（那是 `retired-names.ts` 的活，且**永远只是提示、不是拒绝**）。
 *
 * 知情绕行 = 标准 disable 注释（`CHECK_IDS.cssNamespace`，与类名／关键帧／token／形态同一 id）。
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectCssUnits,
  collectFiles,
  isTestOrMockRel,
  relPath,
  type CheckViolation,
} from "./scan.js";
import {
  bareClassDefinitions,
  keyframeDefinitions,
  animationRefs,
  splitSelector,
} from "./css-selectors.js";
import { buildDisableIndex, isDisabled, CHECK_IDS, type DisableIndex } from "./disable.js";
import { resolvePluginIdForCss, type PluginIdResolution } from "./plugin-prefix.js";

/** 判级文案——作者面（00 总纲 §〇d：这一面允许「名字 ＋ 文件:行 ＋ 两步修法」） */
export const DANGLING_NAME_WHY = {
  jsClassname:
    "它喊的名字宿主已经没有、自己也没定义 ⇒ 发布后**静默丢样式**（零报错）。「宿主改一个类名，" +
    "插件侧要升依赖＋重打包两件、少任何一件就静默失样」是这条判据的真实发生率来源。",
  cssAnimation:
    "`animation` 引用的关键帧在本方没有 `@keyframes` 定义 ⇒ **动画静默消失**（不报错、只是不动）。",
} as const;

/** 随包下发的宿主 CSS 定义集（`schemas/host-css-names.json`，与壳运行时清单同一生成器） */
export interface HostCssNames {
  version: number;
  generatedFrom: string;
  /** 宿主定义/提及的类名全集（裸定义全 ldk-* ＋ 宿主加载的第三方 CSS 名） */
  classes: string[];
  /** 宿主关键帧名全集（@keyframes 定义 ＋ 保留关键帧账） */
  keyframes: string[];
  reservedKeyframeCount: number;
}

/**
 * 包内宿主 CSS 定义集定位（dist/eslint/checks/x.js → ../../../schemas = 包根/schemas；src 直跑同样命中）。
 * 🔴 路径式 resolve（`reserved-classes.ts` 同款）——`new URL(<字面量>, import.meta.url)` 会被 Vite 改写。
 */
const HOST_CSS_NAMES_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../schemas/host-css-names.json",
);

/** 读随包宿主定义集；缺失/坏 ⇒ null（调用方 fail-closed 报「未核验」，⛔ 不许当 0 处通过） */
export function loadHostCssNames(file: string = HOST_CSS_NAMES_FILE): HostCssNames | null {
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<HostCssNames>;
    if (!Array.isArray(raw.classes) || !Array.isArray(raw.keyframes)) return null;
    return {
      version: raw.version ?? 0,
      generatedFrom: raw.generatedFrom ?? "",
      classes: raw.classes,
      keyframes: raw.keyframes,
      reservedKeyframeCount: raw.reservedKeyframeCount ?? 0,
    };
  } catch {
    return null;
  }
}

/** 名字形态（与格 1 尺子 `IDENT` 同款）——⛔ 别放宽成「像名字就行」 */
const IDENT = /^-?[_a-zA-Z][\w-]*$/;
/** 宿主/共享命名空间：硬约束 23 —— `ldk-` 整个命名空间属宿主侧，插件不得定义 */
const HOST_NAMESPACE = /^ldk-/;

/** 偏移 → 1-based 行号 */
const lineAt = (text: string, index: number): number => text.slice(0, index).split("\n").length;

/* jscpd:ignore-start */
/* ↑ 与壳仓两份移植（scripts/plugin-dangling-name-audit.mjs / src/core/compat/dangling-scan.ts）的
   JS 词法段逐行同构——跨包无法 import；口径由 `锚⑩`（锚词）＋ 单测钉住，见文件头。 */

/**
 * 极简 JS 词法遍历：跳过字符串 / 模板正文 / 注释 / 正则，只对**代码**里的标识符回调。
 * 模板的 `${…}` 内部仍是代码 ⇒ 递归进去（嵌套模板一并处理）。与格 1 `scanCode` 逐行同构。
 */
function scanCode(text: string, start: number, onWord: (word: string, endIndex: number) => void): number {
  const regexAllowed = (prev: string): boolean =>
    prev === "" || /[([{,;:=!&|?+\-*%~^<>]/.test(prev) || prev === "return" || prev === "typeof";
  let i = start;
  let prev = "";
  while (i < text.length) {
    const c = text[i];
    const c2 = text[i + 1];
    if (c === "/" && c2 === "/") { const e = text.indexOf("\n", i); i = e < 0 ? text.length : e + 1; continue; }
    if (c === "/" && c2 === "*") { const e = text.indexOf("*/", i + 2); i = e < 0 ? text.length : e + 2; continue; }
    if (c === '"' || c === "'") { i = skipString(text, i, c); prev = '"'; continue; }
    if (c === "`") { i = skipTemplate(text, i, onWord); prev = "`"; continue; }
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

const skipTemplate = (text: string, i: number, onWord: (word: string, endIndex: number) => void): number => {
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === "\\") { j += 2; continue; }
    if (text[j] === "`") return j + 1;
    if (text[j] === "$" && text[j + 1] === "{") { j = skipBraced(text, j + 2, onWord); continue; }
    j++;
  }
  return text.length;
};

/** 从 `${` 之后扫到配对的 `}`（内部按代码处理：字符串/模板/嵌套括号都过一遍） */
const skipBraced = (text: string, i: number, onWord: (word: string, endIndex: number) => void): number => {
  let depth = 1;
  let j = i;
  while (j < text.length) {
    const c = text[j];
    if (c === '"' || c === "'") { j = skipString(text, j, c); continue; }
    if (c === "`") { j = skipTemplate(text, j, onWord); continue; }
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
interface ShoutSite { name: string; line: number }

function shoutSites(text: string): { literals: ShoutSite[]; skipped: { interp: number; dynamic: number } } {
  const literals: ShoutSite[] = [];
  const skipped = { interp: 0, dynamic: 0 };
  const push = (raw: string, at: number): void => {
    const line = lineAt(text, at);
    for (const tok of raw.split(/\s+/)) {
      if (IDENT.test(tok)) literals.push({ name: tok, line });
    }
  };
  /** `word` 之后紧跟的实参是不是字面量（`(` 可选 + 引号） */
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

/* jscpd:ignore-end */

/** 本腿扫描的 JS 族扩展名（作者源码域——格 1 尺子在产物域只见到 bundle 后的 .js/.html） */
const JS_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".html"];

/** 一个选择器里的类名（剥属性选择器后再抓 `.x`） */
const classTokensIn = (sel: string): string[] =>
  [...String(sel).replace(/\[[^\]]*\]/g, " ").matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);

/** 一处悬空引用站点 */
export interface DanglingNameSite {
  /** 工程相对路径（正斜杠） */
  file: string;
  /** 1-based */
  line: number;
  /** 被引用但两个定义集里都没有的名字 */
  name: string;
  /** 引用通道：JS className 字面量 / CSS animation 引用 */
  via: "js-classname" | "css-animation";
}

export interface DanglingNameReport {
  root: string;
  pluginId: string | null;
  /** 非 null ⇒ fail-closed（宿主定义集读不到 ⇒ 「未核验」，⛔ 不许当 0 处通过） */
  error: string | null;
  /** 宿主定义集规模（审计读数用；error 非 null 时为 0） */
  hostClassCount: number;
  hostKeyframeCount: number;
  /** 产物/源码 JS 喊的 `ldk-*` 名站点数 */
  ldkRefs: number;
  /** CSS `animation:` 引用点数 */
  kfRefs: number;
  /** 射程外计数（含插值的模板 / 动态拼接——静态读不出，⛔ 不判） */
  skipped: { interp: number; dynamic: number };
  /** 非 `ldk-` 且两个定义集都没有的未判名数（自有命名空间 / DOM 钩子 / 第三方内联） */
  notJudgedCount: number;
  /** `ldk-*` 名只被包内自己满足（归 `plugin-prefix.ts` 前缀腿判红，本腿不判悬空） */
  borrowedLdk: string[];
  /** 悬空站点 */
  dangling: DanglingNameSite[];
  /** 腿报点 = fail-closed ＋ 悬空 */
  violations: CheckViolation[];
}

/** 一处悬空引用的报点文案（作者面：名字 ＋ 出处 ＋ 两步修法） */
function messageOf(site: DanglingNameSite, hostClassCount: number): string {
  const channel = site.via === "js-classname" ? "JS className" : "CSS `animation:`";
  return (
    `\`${site.name}\`（${channel} 引用，本仓 ${site.file}:${site.line}）在本仓 CSS 与宿主定义集` +
    `（${hostClassCount} 个类名）里都找不到 ⇒ ${site.via === "js-classname" ? DANGLING_NAME_WHY.jsClassname : DANGLING_NAME_WHY.cssAnimation} ` +
    `修法两步：① 换成宿主真实存在的名字，或在本仓补定义（自有类名须以 \`<pluginId>-\` 开头；` +
    `\`ldk-*\` 只许宿主定义）；② 重新打包发版。知情绕行 = // eslint-disable-next-line ${CHECK_IDS.cssNamespace} -- 理由。`
  );
}

/**
 * 跑本仓悬空名判据（作者侧唯一入口）。返回结构化报告——**同一份实现，没有第二条判据路径**。
 * ⚠️ `host` / `resolution` 可注入（单测用）；缺省读随包 `schemas/host-css-names.json`。
 */
export function runDanglingNameCheck(
  root: string,
  opts: { host?: HostCssNames | null; resolution?: PluginIdResolution } = {},
): DanglingNameReport {
  const absRoot = resolve(root);
  const host = opts.host !== undefined ? opts.host : loadHostCssNames();
  const resolution = opts.resolution ?? resolvePluginIdForCss(absRoot);
  const report: DanglingNameReport = {
    root: absRoot,
    pluginId: resolution.pluginId,
    error: resolution.error,
    hostClassCount: host?.classes.length ?? 0,
    hostKeyframeCount: host?.keyframes.length ?? 0,
    ldkRefs: 0,
    kfRefs: 0,
    skipped: { interp: 0, dynamic: 0 },
    notJudgedCount: 0,
    borrowedLdk: [],
    dangling: [],
    violations: [],
  };

  // 🔴 保底（fail-closed，不可豁免）：宿主定义集读不到 ⇒ 「未核验」报红——⛔ 不许静默当 0 处通过
  if (!host) {
    report.error = report.error ?? "宿主定义集读不到";
    report.violations.push({
      file: "plugin.json",
      line: 1,
      message:
        "宿主 CSS 定义集（@linkdesk/plugin-sdk 的 schemas/host-css-names.json）**读不到** ⇒ 本腿**未核验**。" +
        "「0 处通过」在这里是假绿（假绿比假红更坏：你会以为已经查过了）。修复：重装 @linkdesk/plugin-sdk（包不完整）。",
    });
    return report;
  }
  if (resolution.error || !resolution.pluginId) {
    // 身份读不到时前缀腿已 fail-closed 报同一件事 ⇒ 本腿不重复报，但照常跑判定（判定不依赖身份）
    report.error = resolution.error;
  }

  const hostClasses = new Set(host.classes);
  const hostKeyframes = new Set(host.keyframes);

  // ① 自身定义集先**全量收齐**（CSS 半边——collectCssUnits 与前几条判据同一批站点、同一豁免索引）
  const cssUnits = collectCssUnits(absRoot, [CHECK_IDS.cssNamespace]);
  const selfDefs = new Set<string>();
  const selfKeyframes = new Set<string>();
  const cssMentions = new Set<string>();
  for (const unit of cssUnits) {
    for (const d of bareClassDefinitions(unit.cleaned)) selfDefs.add(d.name);
    for (const k of keyframeDefinitions(unit.cleaned)) selfKeyframes.add(k.name);
    for (const m of unit.cleaned.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim();
      if (sel.startsWith("@") || !m[2].trim()) continue;
      for (const one of splitSelector(sel.replace(/\[[^\]]*\]/g, " "))) {
        for (const n of classTokensIn(one)) cssMentions.add(n);
      }
    }
  }

  // ② JS 半边：代码上下文里的命名站点（跳过测试/mock——它们不进产物）。
  //    定义先全量收齐再判（①的 CSS 集在这里也要兜底）⇒ 站点连同豁免索引先收、判定放在 ③。
  interface JsWithDisable { site: ShoutSite; rel: string; disabled: DisableIndex }
  const jsSites: JsWithDisable[] = [];
  const notJudged = new Set<string>();
  for (const file of collectFiles(absRoot, JS_EXTS)) {
    const rel = relPath(absRoot, file);
    if (isTestOrMockRel(rel)) continue;
    const src = readSource(file);
    const { literals, skipped } = shoutSites(src);
    report.skipped.interp += skipped.interp;
    report.skipped.dynamic += skipped.dynamic;
    if (literals.length === 0) continue;
    const disabled = buildDisableIndex(src, [CHECK_IDS.cssNamespace]);
    for (const l of literals) jsSites.push({ site: l, rel, disabled });
  }

  // ③ 判定：须判定的引用，在「自身定义集 ∪ 宿主定义集」里都没有 ⇒ 悬空
  const dangling = new Map<string, DanglingNameSite>();
  const satisfiedBySelfOnly = new Set<string>();
  for (const { site, rel, disabled } of jsSites) {
    if (!HOST_NAMESPACE.test(site.name)) {
      // 非 ldk- 的未定义名不计悬空（自有命名空间 / DOM 钩子 / 第三方内联）——误报控，只计数
      if (!selfDefs.has(site.name) && !cssMentions.has(site.name) && !hostClasses.has(site.name)) {
        notJudged.add(site.name);
      }
      continue;
    }
    report.ldkRefs++;
    if (hostClasses.has(site.name)) continue;
    if (selfDefs.has(site.name)) { satisfiedBySelfOnly.add(site.name); continue; }
    if (isDisabled(disabled, site.line, CHECK_IDS.cssNamespace)) continue;
    const entry: DanglingNameSite = { name: site.name, via: "js-classname", file: rel, line: site.line };
    if (!dangling.has(site.name)) dangling.set(site.name, entry);
  }
  for (const unit of cssUnits) {
    for (const ref of animationRefs(unit.cleaned)) {
      report.kfRefs++;
      if (selfKeyframes.has(ref.name) || hostKeyframes.has(ref.name)) continue;
      if (isDisabled(unit.disabled, ref.line, CHECK_IDS.cssNamespace)) continue;
      const entry: DanglingNameSite = { name: ref.name, via: "css-animation", file: unit.rel, line: ref.line };
      if (!dangling.has(ref.name)) dangling.set(ref.name, entry);
    }
  }
  report.notJudgedCount = notJudged.size;
  report.borrowedLdk = [...satisfiedBySelfOnly].sort();
  report.dangling = [...dangling.values()].sort(
    (x, y) => x.name.localeCompare(y.name) || x.file.localeCompare(y.file) || x.line - y.line,
  );
  for (const site of report.dangling) {
    report.violations.push({ file: site.file, line: site.line, message: messageOf(site, report.hostClassCount) });
  }
  return report;
}

function readSource(abs: string): string {
  return readFileSync(abs, "utf8");
}
