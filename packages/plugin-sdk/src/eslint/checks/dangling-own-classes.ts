/**
 * check-css-namespace 腿·**插件域自有类名引用悬空**（E6#136 · 2026-09-20）。
 *
 * ── 这条缝是怎么被实测踩出来的 ──
 * 生态首个第三方 AI 作者（geme-tihu-bicycle）在 CSS 头注释里列 token 族时用了 `--text-` 族名＋`/` 分隔——闭合符
 * 把块注释**提前闭合**，注释后的残渣文本黏住紧随其后的 `.geme-tihu-bicycle-root` 规则，把整条规则
 * 吞掉；TSX 里引用该类名的样式**静默不生效**（PostCSS/Vite 全程零警告，靠逐条截图比对才发现）。
 * 三条既有腿都没接住（缝隙正中央）：
 *   · `dangling-names.ts`（E6#119）头注明写「**非 `ldk-` 的未定义名不计悬空**——假红比漏报更坏」
 *     ⇒ 自有前缀类名**有意宽松掉**（`notJudged`）；
 *   · `keyframe-refs.ts`（E6#112）只管关键帧；
 *   · 壳侧 `audit:plugin-dead-css`（E6#113）是反方向（定义了没人用）。
 * 本腿把「自有前缀类名引用了、本仓 CSS 里却找不到定义」这一格补上——是既有口径的**补缝**，
 * 不是第二把全能尺子。
 *
 * ── 🔴 窄口子（判据写死，不许走样）──
 *   · 射程 = 插件仓 `.ts`/`.tsx` 里 `className` 的**字符串字面量**（`classList` / `querySelector`
 *     等其他通道不进本腿——任务书判据写死 className；`ldk-*` 借用归 dangling-names、宿主保留名归
 *     reserved-classes、前缀形态归 plugin-prefix，各归各腿）；
 *   · 只判**本插件前缀**（`<pluginId>-`）的类名——非本前缀的自有名（DOM 钩子 / 第三方内联）不判；
 *   · **动态拼接一律跳过并计数**（模板插值 / `clsx(...)` / 变量 / 三元——静态读不出运行时拼出来的
 *     名字，拦就是假红；口径与 `dangling-names.ts` 逐字同源）；
 *   · 定义集 = 本仓自有 CSS（`.css` 全量）**规则选择器提及**的类名（`classTokensIn` 口径——scoped
 *     调优 `.root .item` 里的 `.item` 是合法定义，⇒ 按**提及集**收，⛔ 不用裸定义集，否则 scoped 假红）。
 *
 * ── 🔴 根因案为什么要「孤儿闭合符段剔除」──
 * 注释被提前闭合后，`stripComments` 的非贪婪匹配在**第一个闭合符**处收口 ⇒ cleaned 里残留
 * 「孤儿闭合符 ＋ 残渣文本」；残渣与紧随的规则选择器**黏成同一段**（直到 `{`）——运行时解析器把
 * 这一整段当无效选择器 ⇒ **规则整条被吞**（这正是样式丢失的机制）。若直接照抄提及集口径，黏住的
 * 类名照样被抓出来 ⇒ 假绿（根因案不红）。本腿在收提及集前先找**孤儿闭合符**（cleaned 中已无配对
 * 注释 ⇒ 任何存活的星号＋斜杠相邻对都是提前闭合的产物；字符串里的跳过）：含孤儿的选择器段**整段剔除**
 * ——与运行时「规则被吞」如实对齐。剔除的段数记进报告（`orphanSegments`，诊断读数），判红仍走
 * 「引用找不到」这一条路（⛔ 不给孤儿本身单开判红灯——判据写死引用↔定义集比对）。
 *
 * ── fail-closed ──
 * `pluginId` 读不到 ⇒ 前缀无从谈起 ⇒ 报「无法判定」（与前缀腿同一件事同一落点 `plugin.json:1`，
 * 由 lint.ts 的同点去重保证不重复报）——⛔ 不许静默当 0 处通过。
 *
 * 知情绕行 = 标准 disable 注释（`CHECK_IDS.cssNamespace`，与命名空间家族同一 id）。
 */
import {
  collectCssUnits,
  collectFiles,
  isTestOrMockRel,
  readSource,
  relPath,
  type CheckViolation,
} from "./scan.js";
import { splitSelector } from "./css-selectors.js";
import { resolve } from "node:path";
import { buildDisableIndex, isDisabled, CHECK_IDS, type DisableIndex } from "./disable.js";
import { resolvePluginIdForCss, type PluginIdResolution } from "./plugin-prefix.js";

/** 名字形态（与 dangling-names.ts `IDENT` 同款） */
const IDENT = /^-?[_a-zA-Z][\w-]*$/;

/** 偏移 → 1-based 行号 */
const lineAt = (text: string, index: number): number => text.slice(0, index).split("\n").length;

/* jscpd:ignore-start */
/* ↑ className 站点抽取与 `dangling-names.ts` `shoutSites()` 的 className 分支逐行同构——跨判据
   无法共享私有函数（那边的 literals 混入 classList/querySelector 通道，本腿射程写死只收
   className）⇒ 复制窄化为 className 单通道，口径由单测钉住。 */

/**
 * className 站点抽取（**只收 className 赋值位的字符串字面量**）：`className: "x"` / `className="x"` /
 * `className={"x"}`。模板插值（含 `${`）与非字面量（变量 / 函数调用 / 三元）一律**跳过并计数**。
 */
function ownClassNameSites(text: string): {
  literals: { name: string; line: number }[];
  skipped: { interp: number; dynamic: number };
} {
  const literals: { name: string; line: number }[] = [];
  const skipped = { interp: 0, dynamic: 0 };
  const push = (raw: string, at: number): void => {
    const line = lineAt(text, at);
    for (const tok of raw.split(/\s+/)) {
      if (IDENT.test(tok)) literals.push({ name: tok, line });
    }
  };
  // 与 dangling-names 的 scanCode 同款极简词法：跳过注释/字符串/正则，只走代码
  let i = 0;
  const regexAllowed = (prev: string): boolean =>
    prev === "" || /[([{,;:=!&|?+\-*%~^<>]/.test(prev) || prev === "return" || prev === "typeof";
  let prev = "";
  while (i < text.length) {
    const c = text[i];
    const c2 = text[i + 1];
    if (c === "/" && c2 === "/") { const e = text.indexOf("\n", i); i = e < 0 ? text.length : e + 1; continue; }
    if (c === "/" && c2 === "*") { const e = text.indexOf("*/", i + 2); i = e < 0 ? text.length : e + 2; continue; }
    if (c === '"' || c === "'") {
      // 字符串里出现的 "className" 不是站点——但要跳过整段防误入
      let j = i + 1;
      while (j < text.length) { if (text[j] === "\\") { j += 2; continue; } if (text[j] === c) break; j++; }
      i = j + 1; prev = '"'; continue;
    }
    if (c === "`") {
      // 模板：正文跳过，${} 内是代码——但 ${} 里的 className 站点极少且多伴插值，仍走一遍防漏
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === "\\") { j += 2; continue; }
        if (text[j] === "`") break;
        if (text[j] === "$" && text[j + 1] === "{") {
          let depth = 1; let k = j + 2;
          while (k < text.length && depth > 0) {
            const k2 = text[k];
            if (k2 === '"' || k2 === "'" || k2 === "`") { // 嵌套字符串/模板粗跳
              const q = k2; k++;
              while (k < text.length && text[k] !== q) { if (text[k] === "\\") k++; k++; }
              k++; continue;
            }
            if (k2 === "{") depth++;
            else if (k2 === "}") depth--;
            k++;
          }
          j = k; continue;
        }
        j++;
      }
      i = j + 1; prev = "`"; continue;
    }
    if (c === "/" && regexAllowed(prev)) {
      let j = i + 1; let inClass = false;
      while (j < text.length) {
        const r = text[j];
        if (r === "\\") { j += 2; continue; }
        if (r === "[") inClass = true;
        else if (r === "]") inClass = false;
        else if (r === "/" && !inClass) break;
        else if (r === "\n") break;
        j++;
      }
      i = j; prev = "/"; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < text.length && /[\w$]/.test(text[j])) j++;
      const word = text.slice(i, j);
      if (word === "className") {
        let k = j;
        while (k < text.length && /\s/.test(text[k])) k++;
        // 必须是赋值位（`className: "x"` / `className = "x"` / `className={"x"}`）——读法/比较/箭头不是站点
        if (text[k] === ":" || (text[k] === "=" && text[k + 1] !== "=" && text[k + 1] !== ">")) {
          k++;
          while (k < text.length && /\s/.test(text[k])) k++;
          let braced = false;
          if (text[k] === "{") { braced = true; k++; while (k < text.length && /\s/.test(text[k])) k++; }
          const ch = text[k];
          if (ch === '"' || ch === "'") {
            let e = k + 1; let raw = ""; let closed = false;
            while (e < text.length) {
              if (text[e] === "\\") { raw += text[e + 1] ?? ""; e += 2; continue; }
              if (text[e] === ch) { closed = true; break; }
              raw += text[e]; e++;
            }
            if (closed) {
              if (braced) {
                let z = e + 1;
                while (z < text.length && /\s/.test(text[z])) z++;
                if (text[z] !== "}") { skipped.dynamic++; i = j; prev = word; continue; }
              }
              push(raw, k);
              i = j; prev = word; continue;
            }
            skipped.dynamic++;
            i = j; prev = word; continue;
          }
          if (ch === "`") {
            let e = k + 1; let raw = ""; let closed = false;
            while (e < text.length) {
              if (text[e] === "\\") { raw += text[e + 1] ?? ""; e += 2; continue; }
              if (text[e] === "`") { closed = true; break; }
              raw += text[e]; e++;
            }
            if (closed && raw.includes("${")) { skipped.interp++; i = j; prev = word; continue; }
            if (closed) {
              if (braced) {
                let z = e + 1;
                while (z < text.length && /\s/.test(text[z])) z++;
                if (text[z] !== "}") { skipped.dynamic++; i = j; prev = word; continue; }
              }
              push(raw, k);
              i = j; prev = word; continue;
            }
            skipped.dynamic++;
            i = j; prev = word; continue;
          }
          skipped.dynamic++; // 变量 / clsx(...) / 三元 …… 静态读不出
          i = j; prev = word; continue;
        }
      }
      prev = word;
      i = j;
      continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return { literals, skipped };
}
/* jscpd:ignore-end */

/** 本腿扫描的扩展名（判据写死 `.ts`/`.tsx`——TSX 是 className 的主通道） */
const JS_EXTS = [".ts", ".tsx"];

/** 一个选择器里的类名（剥属性选择器后再抓 `.x`——与 dangling-names.ts 同款口径） */
const classTokensIn = (sel: string): string[] =>
  [...String(sel).replace(/\[[^\]]*\]/g, " ").matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);

/** cleaned（已剥配对注释）里的**孤儿闭合符**：任何存活的「星号＋斜杠」相邻对都是注释内容提前闭合的产物（字符串里的跳过） */
export function orphanCloseIndices(cleaned: string): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < cleaned.length) {
    const c = cleaned[i];
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < cleaned.length && cleaned[i] !== q) {
        if (cleaned[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === "*" && cleaned[i + 1] === "/") { out.push(i); i += 2; continue; }
    i++;
  }
  return out;
}

/** 一处悬空引用站点 */
export interface DanglingOwnClassSite {
  /** 工程相对路径（正斜杠） */
  file: string;
  /** 1-based */
  line: number;
  /** 被引用但本仓 CSS 定义集里没有的自有前缀类名 */
  name: string;
}

export interface DanglingOwnClassReport {
  root: string;
  pluginId: string | null;
  /** 非 null ⇒ fail-closed（身份读不到 ⇒ 「无法判定」，⛔ 不许当 0 处通过） */
  error: string | null;
  /** 自有前缀 className 引用站点数 */
  ownRefs: number;
  /** 本仓 CSS 定义集规模（提及集口径） */
  ownDefs: number;
  /** 含孤儿闭合符被整段剔除的选择器段数（根因案信号——诊断读数，不单独判红） */
  orphanSegments: number;
  /** 射程外计数（插值模板 / 动态拼接——静态读不出，⛔ 不判） */
  skipped: { interp: number; dynamic: number };
  dangling: DanglingOwnClassSite[];
  violations: CheckViolation[];
}

/** 报点文案（作者面：名字 ＋ 出处 ＋ 三种常见根因 ＋ 修法） */
function messageOf(site: DanglingOwnClassSite): string {
  return (
    `\`${site.name}\`（className 引用，本仓 ${site.file}:${site.line}）在本仓 CSS 定义集里找不到 ⇒ ` +
    `样式**静默不生效**（零报错，只有界面不对）。三种常见根因：① 类名两边拼错（TSX 与 CSS 对不上）；` +
    `② 定义它的样式文件没被 import 进入口；③ CSS 块注释里写了 \`--token-*/\` 这类文本——\`*/\` 会把` +
    `注释**提前闭合**，注释后的残渣黏住下一条规则把它整条吞掉（生态首例：一个游戏插件的根类名就是这样` +
    `丢的，靠逐条截图比对才找到）。修法：对齐两边类名 / 补 import / 把注释里的 \`*/\` 改掉（token 族名` +
    `之间用空格或顿号分开，别用 \`/\`）。知情绕行 = // eslint-disable-next-line ${CHECK_IDS.cssNamespace} -- 理由。`
  );
}

/**
 * 跑本仓自有类名引用悬空判据。⚠️ `resolution` 可注入（单测用）；缺省从工程根 plugin.json 解析。
 */
export function runDanglingOwnClassCheck(
  root: string,
  opts: { resolution?: PluginIdResolution } = {},
): DanglingOwnClassReport {
  const absRoot = resolve(root);
  const resolution = opts.resolution ?? resolvePluginIdForCss(absRoot);
  const report: DanglingOwnClassReport = {
    root: absRoot,
    pluginId: resolution.pluginId,
    error: resolution.error,
    ownRefs: 0,
    ownDefs: 0,
    orphanSegments: 0,
    skipped: { interp: 0, dynamic: 0 },
    dangling: [],
    violations: [],
  };

  // 🔴 fail-closed（不可豁免）：pluginId 读不到 ⇒ 前缀无从谈起 ⇒ 「无法判定」报红——⛔ 不许当 0 处通过
  if (resolution.error || !resolution.pluginId) {
    report.violations.push({
      file: "plugin.json",
      line: 1,
      message:
        "工程 pluginId **读不到** ⇒ 自有类名悬空判据**无法判定**（判定轴心 = `<pluginId>-` 前缀）。「0 处通过」" +
        "在这里是假绿（假绿比假红更坏：你会以为已经查过了）。修复：补好工程根 plugin.json 的 pluginId 字段。",
    });
    return report;
  }
  const prefix = `${resolution.pluginId}-`;

  // ① 本仓 CSS 定义集先**全量收齐**（提及集口径 + 孤儿 `*/` 段剔除——与 collectCssUnits 同一批站点/豁免索引）
  const cssUnits = collectCssUnits(absRoot, [CHECK_IDS.cssNamespace]);
  const ownDefs = new Set<string>();
  for (const unit of cssUnits) {
    const orphans = orphanCloseIndices(unit.cleaned);
    for (const m of unit.cleaned.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim();
      const segStart = m.index ?? 0;
      const segEnd = segStart + m[1].length;
      // 🔴 该选择器段含孤儿 `*/` ⇒ 残渣黏连、运行时已把这条规则整段吞掉 ⇒ 剔除（与运行时如实）
      let hasOrphan = false;
      for (const o of orphans) {
        if (o >= segStart && o < segEnd) { hasOrphan = true; break; }
      }
      if (hasOrphan) { report.orphanSegments++; continue; }
      if (sel.startsWith("@") || !m[2].trim()) continue;
      for (const one of splitSelector(sel.replace(/\[[^\]]*\]/g, " "))) {
        for (const n of classTokensIn(one)) ownDefs.add(n);
      }
    }
  }
  report.ownDefs = ownDefs.size;

  // ② TSX/TS 半边：className 站点（跳过测试/mock——它们不进产物）
  interface SiteWithDisable { site: { name: string; line: number }; rel: string; disabled: DisableIndex }
  const sites: SiteWithDisable[] = [];
  for (const file of collectFiles(absRoot, JS_EXTS)) {
    const rel = relPath(absRoot, file);
    if (isTestOrMockRel(rel)) continue;
    const src = readSource(file);
    const { literals, skipped } = ownClassNameSites(src);
    report.skipped.interp += skipped.interp;
    report.skipped.dynamic += skipped.dynamic;
    if (literals.length === 0) continue;
    const disabled = buildDisableIndex(src, [CHECK_IDS.cssNamespace]);
    for (const l of literals) sites.push({ site: l, rel, disabled });
  }

  // ③ 判定：自有前缀 ＋ 定义集里没有 ⇒ 悬空
  const dangling = new Map<string, DanglingOwnClassSite>();
  for (const { site, rel, disabled } of sites) {
    if (!site.name.startsWith(prefix)) continue; // 只判本插件前缀（窄口子）
    report.ownRefs++;
    if (ownDefs.has(site.name)) continue;
    if (isDisabled(disabled, site.line, CHECK_IDS.cssNamespace)) continue;
    const entry: DanglingOwnClassSite = { name: site.name, file: rel, line: site.line };
    if (!dangling.has(site.name)) dangling.set(site.name, entry);
  }
  report.dangling = [...dangling.values()].sort(
    (x, y) => x.name.localeCompare(y.name) || x.file.localeCompare(y.file) || x.line - y.line,
  );
  for (const site of report.dangling) {
    report.violations.push({ file: site.file, line: site.line, message: messageOf(site) });
  }
  return report;
}
