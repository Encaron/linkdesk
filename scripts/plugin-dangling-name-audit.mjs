#!/usr/bin/env node
/**
 * 插件**悬空名**核验（`E6#114` · 第 8.1 轮）——产物喊的名字，宿主里还有没有。
 *
 * ── 一句话 ──
 * 插件产物是**冻结的快照**：发布那一刻的名字被烘进 bundle，之后宿主改名/删除它不会知道
 * （实证：`.ldk-input` 那一路，`settings` v1.0.12 → v1.0.13 输入框丢底色/边框/圆角，**零报错**）。
 * 本工具是那把尺子：**产物喊了一个「属于宿主」的名字，而它自己没定义、当前宿主也没有 ⇒ 报悬空**。
 * 详案 = `docs/02-Electron架构/E6_插件生态与发布/插件兼容机械化/01-任务-悬空名核验.md`。
 *
 * ── 🔴 定位：读数，不是门禁 ──
 * **只报不拦、不进 `npm run check`、退出码不随悬空数变**（同 `scripts/runtime-style-audit.mjs` 的先例）。
 * 理由：静态尺子**结构性地**读不出运行时拼出来的名字（`` className={`x-${v}`} ``）——拦就会假红。
 * ⇒ 动态拼接一律**跳过并计数**（`skipped.*`），不做「疑似」猜测。
 *
 * ── 🔴 判据：只判「**不属于它自己**的名字」──
 * 这是本工具最要紧的一条裁（第一版按「所有喊过的名字」判，实测 editor 一次报出 **1029** 个假红）：
 *   ① **须判定的引用** = ⓐ 产物 JS 喊的 **`ldk-*`** 名（`ldk-` 整个命名空间属宿主侧，硬约束 23
 *      ——插件**不得**定义 `ldk-*` ⇒ 这类名字**只能**由宿主提供）
 *      ＋ ⓑ 产物 CSS 里 `animation:` / `animation-name:` 引用的**关键帧名**（引用方与定义方分离，
 *      与 SDK 0.1.37 那条 `check-css-namespace` 腿**同口径**）。
 *   ② **自身定义集** = 该包内 CSS 的**裸定义**类名（`bareClassDefinitions`）＋ 包内 `@keyframes` 名
 *      ＋ 包内 CSS **提及**过的类名（见下条「为什么 CSS 侧不产出读数」）。
 *   ③ **悬空** = 须判定的引用，在「自身定义集 ∪ 当前宿主定义集」里都没有 ⇒ 逐条报（名字 ＋ `文件:行`）。
 *
 * ── 为什么 **CSS 选择器里的类名不产出读数**（如实写，免得下一棒以为是漏了）──
 * 一个类名只要出现在**包内 CSS 的选择器**里，它的样式语义就由**这份包内样式表自己**承载
 * （`.monaco-workbench .action-label{…}` 这条规则本身就是 `action-label` 的完整定义，不欠任何人）。
 * ⇒ CSS 侧的自引用**结构性自满足**，判它只会造出假红（Monaco 一次 1029 个）。CSS 侧真正跨文件的是
 * **关键帧引用**（`animation:` 指的名字定义在别处的 `@keyframes`）——那一条留判（见 ①ⓑ）。
 *
 * ── 🔴 误报控是首要判据（假红比漏报更坏）──
 * `editor` 产物里 `monaco-workbench` 978 处 / `monaco-editor` 789 处、`.badge` 26 / `.button` 16 /
 * `.input` 10 / `.slider` 8 全是 **Monaco / VS Code 自带的**，**一条都不许报**。挡住它的不是白名单，
 * 是**结构**：第三方库是自洽的（名字＋规则都在它随包注进来的 CSS 里）＋ 判据只认 `ldk-*` 与关键帧。
 * ⛔ 本工具**不设任何名单/阈值**（禁区：不许引白名单/棘轮）。非 `ldk-` 的未定义名**逐类计数、不报**。
 *
 * ── 宿主定义集口径（**E6#114 的裁，格 4/格 6 照此，别再推倒重来**）──
 *   ① 壳源码树里的全部 `*.css`（`src/**\/*.css`，含 `src/components/shared/**` = **共享组件 CSS 的单一源码**；
 *      今天宿主 348 个裸定义**全部** `ldk-*` ⇒ `ldk-*` 就是宿主侧的完整类名面）；
 *   ② 宿主**实际加载**的第三方样式表——由 `src/**\/*.{ts,tsx,css}` 的 CSS import 图机械解析到 node_modules
 *      （今天只有 `@vscode/codicons/dist/codicon.css` 一条）⇒ `codicon-*` 不算悬空（宿主确实在跑它）；
 *   ③ `packages/plugin-sdk/schemas/reserved-class-names.json` 的 `keyframes` 8 条（宿主保留关键帧账）。
 *   ⛔ **不重复计入** `packages/linkdesk-ui/dist/index.css`：它是 ① 里 `src/components/shared/**` 的
 *      **构建产物**（`packages/linkdesk-ui/scripts/build.mjs` 聚合），且 dist 是 gitignored ⇒ 干净检出上
 *      可能不存在——计入它的唯一后果是让读数随「有没有跑过 build」漂移。
 *
 * ── 抽取库：⛔ 不新造第二把尺子 ──
 * 「什么算一个定义」这件事**只有一份实现** = `scripts/lib/css-selectors.mjs`（`bareClassDefinitions` /
 * `keyframeDefinitions` / `animationRefs` / `stripComments` / `splitSelector` / `soleClassOf`）。
 * 本工具只做「两个输入面 ＋ 判悬空」，不重写规则。
 *
 * ── 为什么要一个 JS 词法扫描（第一版实测教训）──
 * 不做词法时 `className` 会命中**字符串内部**（生成式代码 `'… className="' + x`）⇒ 报出来的「名字」
 * 里出现 `!==` / `+` / `'` / `${u}` 这类东西。`codeSites()` 只收**代码上下文**里的站点；字符串/注释/
 * 模板正文一律跳过（模板里 `${}` 内的代码仍扫）。
 *
 * ── 产物在哪（两种输入，同一把尺子）──
 *   · **zip**（随包种子 6 只 / 官方仓根目录 `<id>.linkdesk-plugin`）：中央目录 + `zlib.inflateRawSync` 解条目。
 *     🔴 **不许 grep 原始字节**（zip 是压缩的，grep 得到全 0，那不是读数）。用内置 zlib 而不是外挂 `unzip`：
 *     命令要能在任何机器上复跑，不赌 PATH 里有没有 `unzip`。
 *   · **目录**（已装插件 `%APPDATA%\linkdesk\plugins\<id>`、官方仓 `dist/<id>.linkdesk-plugin` 解包态）：直接读文件。
 *
 * ── 用法 ──
 *   node scripts/plugin-dangling-name-audit.mjs                 # 随包 6 只 ＋ 官方 18 仓（默认）
 *   node scripts/plugin-dangling-name-audit.mjs <产物…>         # 只跑指定 zip/目录
 *   node scripts/plugin-dangling-name-audit.mjs --json          # 机读（格 4 读数用）
 *   node scripts/plugin-dangling-name-audit.mjs --quotas        # 只打宿主定义集读数（对账用）
 *   node scripts/plugin-dangling-name-audit.mjs --self-test     # 正控 ＋ 负控（不动真产物）
 * 退出码：0 = 跑完了（**悬空数不影响退出码**）；2 = 工具自己出错（宿主 CSS 缺失 / 产物打不开）。
 */
import { existsSync, readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, dirname, relative, sep, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { inflateRawSync } from "node:zlib";
import {
  bareClassDefinitions,
  keyframeDefinitions,
  animationRefs,
  stripComments,
  splitSelector,
  soleClassOf,
} from "./lib/css-selectors.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DEFAULT_BUNDLED = join(ROOT, "bundled-plugins");
const DEFAULT_CONTAINER = process.env.LINKDESK_PLUGIN_CONTAINER || "E:\\linkdesk-plugins\\official";
const RESERVED_KEYFRAMES = join(ROOT, "packages", "plugin-sdk", "schemas", "reserved-class-names.json");
/** 名字形态（与 `css-selectors.mjs` 的 `isIdentLike` 同款）——⛔ 别放宽成「像名字就行」 */
const IDENT = /^-?[_a-zA-Z][\w-]*$/;
/** 宿主/共享命名空间：硬约束 23 —— `ldk-` 整个命名空间属宿主侧，插件不得定义 */
const HOST_NAMESPACE = /^ldk-/;

/* ══════════════════════════════════════════════════════════════════════════
   一、宿主定义集
   ══════════════════════════════════════════════════════════════════════════ */

/** 递归列举目录下全部文件（按扩展名过滤）；`node_modules` / `.git` 不进 */
function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

/** 偏移 → 1-based 行号（与 `stripComments` 的等长替换配套：偏移可直接映射） */
const lineAt = (text, index) => text.slice(0, index).split("\n").length;

/**
 * 宿主**实际加载**的第三方样式表——从 `src/**\/*.{ts,tsx,css}` 的 CSS import 图机械解析。
 * 只收「非相对路径」（`@scope/pkg/x.css` 这类包名路径）；解析不到的**如实登记**，不静默丢。
 */
function loadedExternalCss() {
  const files = new Set();
  const unresolved = new Set();
  for (const f of walk(join(ROOT, "src"), [".ts", ".tsx", ".css"])) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/(?:import|@import)\s*\(?\s*["']([^"']+\.css)["']/g)) {
      const spec = m[1];
      if (spec.startsWith(".") || spec.startsWith("/")) continue;
      const cand = join(ROOT, "node_modules", ...spec.split("/"));
      if (existsSync(cand)) files.add(cand);
      else unresolved.add(spec);
    }
  }
  return { files: [...files], unresolved: [...unresolved] };
}

/** 一张样式表里**选择器**提到（含定义与 scoped 调优）的类名 */
function classesInStylesheet(cleaned) {
  const out = [];
  for (const m of cleaned.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (sel.startsWith("@") || !m[2].trim()) continue; // @media 等 at-rule 头 / 空规则体（与裸定义同口径）
    // 属性选择器里的 `.x` 是字符串字面量（`[class*="ldk-"]`）不是类选择器 ⇒ 整段剥掉
    const noAttr = sel.replace(/\[[^\]]*\]/g, " ");
    for (const one of splitSelector(noAttr)) {
      for (const t of one.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) out.push(t[1]);
    }
  }
  return out;
}

/** 收集宿主定义集（类名提及集 ＋ 裸定义集 ＋ 关键帧名集） */
function collectHostDefs() {
  const srcCss = walk(join(ROOT, "src"), [".css"]);
  const sharedCss = walk(join(ROOT, "src", "components", "shared"), [".css"]);
  const ext = loadedExternalCss();
  const files = [...srcCss, ...ext.files];
  const classes = new Set();
  const bareDefs = new Set();
  const srcBareDefs = new Set();
  const keyframes = new Set();
  for (const f of files) {
    const cleaned = stripComments(readFileSync(f, "utf8"));
    for (const n of classesInStylesheet(cleaned)) classes.add(n);
    for (const d of bareClassDefinitions(cleaned)) {
      bareDefs.add(d.name);
      if (!ext.files.includes(f)) srcBareDefs.add(d.name);
    }
    for (const k of keyframeDefinitions(cleaned)) keyframes.add(k.name);
  }
  let reserved = [];
  if (existsSync(RESERVED_KEYFRAMES)) {
    reserved = JSON.parse(readFileSync(RESERVED_KEYFRAMES, "utf8")).keyframes.map((k) => k.name);
    for (const n of reserved) keyframes.add(n);
  }
  return {
    cssFiles: files,
    srcCssCount: srcCss.length,
    sharedCssCount: sharedCss.length,
    externalCss: ext.files.map((f) => relative(ROOT, f).split(sep).join("/")),
    externalUnresolved: ext.unresolved,
    classes,
    bareDefs,
    srcBareDefs,
    keyframes,
    reservedKeyframes: reserved,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   二、读产物——zip（内置 zlib）与目录两种输入
   ══════════════════════════════════════════════════════════════════════════ */

/** 读 zip 中央目录：`Map<条目名, {method, compSize, localOffset}>` */
function zipIndex(buf) {
  let eocd = -1;
  const floor = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("不是 zip（找不到 EOCD）");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`中央目录第 ${n} 条签名不对（zip64 未支持）`);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (!name.endsWith("/")) entries.set(name, { method, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { buf, entries };
}

/** 解一条 zip 条目为文本（method 0 = stored / 8 = deflate） */
function zipEntryText(zi, name) {
  const e = zi.entries.get(name);
  if (!e) return null;
  const lo = e.localOffset;
  if (zi.buf.readUInt32LE(lo) !== 0x04034b50) throw new Error(`条目 ${name} 的 local header 签名不对`);
  const nameLen = zi.buf.readUInt16LE(lo + 26);
  const extraLen = zi.buf.readUInt16LE(lo + 28);
  const start = lo + 30 + nameLen + extraLen;
  const raw = zi.buf.subarray(start, start + e.compSize);
  if (e.method === 0) return raw.toString("utf8");
  if (e.method === 8) return inflateRawSync(raw).toString("utf8");
  throw new Error(`条目 ${name} 用了不支持的压缩方式 ${e.method}`);
}

const TEXT_ENTRY = (n) => /\.(css|js|mjs|cjs|html)$/i.test(n) || n === "plugin.json";

/** 打开一个产物（zip 或目录）⇒ `{source, kind, list, read}` */
function openArtifact(p) {
  if (statSync(p).isDirectory()) {
    const files = walk(p, [".css", ".js", ".mjs", ".cjs", ".html", ".json"]);
    const map = new Map(files.map((f) => [relative(p, f).split(sep).join("/"), f]));
    return {
      source: p, kind: "dir", list: [...map.keys()],
      read: (name) => (map.has(name) ? readFileSync(map.get(name), "utf8") : null),
    };
  }
  const zi = zipIndex(readFileSync(p));
  return { source: p, kind: "zip", list: [...zi.entries.keys()].filter(TEXT_ENTRY), read: (n) => zipEntryText(zi, n) };
}

/** 从产物取 pluginId（取不到 ⇒ 目录名兜底并如实标注） */
function pluginIdOf(a) {
  const text = a.list.includes("plugin.json") ? a.read("plugin.json") : null;
  if (text) {
    try {
      const id = JSON.parse(text).pluginId;
      if (id) return { id, from: "plugin.json" };
    } catch { /* 坏 plugin.json ⇒ 走兜底并如实标注 */ }
  }
  return { id: basename(a.source).replace(/\.linkdesk-plugin$/, ""), from: "目录名（兜底）" };
}

/* ══════════════════════════════════════════════════════════════════════════
   三、JS 词法扫描——只收**代码上下文**里的 `className` / `class` 站点
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * 极简 JS 词法遍历：跳过字符串 / 模板正文 / 注释 / 正则，只对**代码**里的标识符回调。
 * 模板的 `${…}` 内部仍是代码 ⇒ 递归进去（嵌套模板一并处理）。
 * @param {(word:string, endIndex:number)=>void} onWord 每遇到一个标识符回调（`endIndex` = 名字之后）
 * @returns {number} 停下的下标（`stop` 为真时提前返回）
 */
function scanCode(text, start, onWord, stop = () => false) {
  const regexAllowed = (prev) =>
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

const skipString = (text, i, quote) => {
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === "\\") { j += 2; continue; }
    if (text[j] === quote) return j + 1;
    j++;
  }
  return text.length;
};

const skipTemplate = (text, i, onWord, stop) => {
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === "\\") { j += 2; continue; }
    if (text[j] === "`") return j + 1;
    if (text[j] === "$" && text[j + 1] === "{") { j = skipBraced(text, j + 2, onWord, stop); continue; }
    j++;
  }
  return text.length;
};

/** 从 `${` 之后扫到配对的 `}`（内部按代码处理：字符串/模板/嵌套括号都过一遍） */
const skipBraced = (text, i, onWord, stop) => {
  let depth = 1;
  let j = i;
  while (j < text.length) {
    const c = text[j];
    if (c === '"' || c === "'") { j = skipString(text, j, c); continue; }
    if (c === "`") { j = skipTemplate(text, j, onWord, stop); continue; }
    if (c === "//") { const e = text.indexOf("\n", j); j = e < 0 ? text.length : e + 1; continue; }
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

const skipRegex = (text, i) => {
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

/* ══════════════════════════════════════════════════════════════════════════
   四、抽取产物「喊的名字」
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * 从一段 JS/HTML 文本抽 `className` / `class` 的字面量值（代码上下文；插值模板跳过并计数）。
 * 额外收 `classList.add/remove/toggle/contains("x")` 与 `querySelector*` / `closest` / `matches`
 * 的**字面量选择器实参**里的类名——同一个「喊」的语义，少收就漏报。
 * @returns {{literals:{name:string,line:number}[], skipped:{interp:number,dynamic:number}}}
 */
function shoutSites(text) {
  const literals = [];
  const skipped = { interp: 0, dynamic: 0 };
  const push = (raw, at) => {
    const line = lineAt(text, at);
    for (const tok of raw.split(/\s+/)) {
      if (IDENT.test(tok)) literals.push({ name: tok, line });
    }
  };
  /** `word` 之后紧跟的实参是不是字面量（`(` 可选 + 引号） */
  const literalArg = (after, allowSelector) => {
    const m = /^\s*\(\s*(["'`])([\s\S]*?)\1\s*\)/.exec(text.slice(after));
    if (!m) return null;
    if (m[1] === "`" && m[2].includes("${")) return { interp: true };
    return { raw: allowSelector ? [...m[2].matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((x) => x[1]).join(" ") : m[2] };
  };
  scanCode(text, 0, (word, end) => {
    if (word === "className" || word === "class") {
      let i = end;
      while (i < text.length && /\s/.test(text[i])) i++;
      // 必须是赋值位（`className: "x"` / `className = "x"`）——`{className}` 简写、`props.className`
      // 这类**读**法不是站点；`===` / `=>` 也不是（`x.className === "y"` 是比较，不是赋值）
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
      else if (r) push(r.raw, end);
    }
  });
  return { literals, skipped };
}

/** 一个选择器里的类名（含 `:not(.x)` 实参；属性选择器里的字符串已剥） */
const classTokensIn = (sel) =>
  [...String(sel).replace(/\[[^\]]*\]/g, " ").matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);

/** 该选择器有没有祖先（与 lib 的 `hasAncestor` 同判据；本文件只此一处用，故内联） */
const hasAncestorOf = (one) => one.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "").trim().split(/[\s>+~]+/).length > 1;

/** 汇总一个产物：喊的名字（JS 字面量）＋ CSS 提及/定义/关键帧 ＋ 跳过计数 */
function scanArtifact(a) {
  const jsNames = [];      // {name, file, line} —— 判据①ⓐ 的输入面
  const kfRefs = [];       // {name, file, line} —— 判据①ⓑ 的输入面
  const cssMentions = new Set(); // 包内 CSS 提及过的类名（结构性自满足，只计数）
  const selfDefs = new Set();    // 包内裸定义类名
  const selfKeyframes = new Set();
  const skipped = { interp: 0, dynamic: 0 };
  let cssFiles = 0;
  let jsFiles = 0;
  for (const name of a.list) {
    if (name === "plugin.json") continue;
    const text = a.read(name);
    if (text == null) continue;
    if (name.endsWith(".css")) {
      cssFiles++;
      const cleaned = stripComments(text);
      for (const d of bareClassDefinitions(cleaned)) selfDefs.add(d.name);
      for (const k of keyframeDefinitions(cleaned)) selfKeyframes.add(k.name);
      for (const m of cleaned.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const sel = m[1].trim();
        if (sel.startsWith("@") || !m[2].trim()) continue;
        for (const one of splitSelector(sel.replace(/\[[^\]]*\]/g, " "))) {
          for (const n of classTokensIn(one)) cssMentions.add(n);
        }
      }
      for (const r of animationRefs(cleaned)) kfRefs.push({ name: r.name, file: name, line: r.line });
    } else if (/\.(js|mjs|cjs|html)$/.test(name)) {
      jsFiles++;
      const { literals, skipped: s } = shoutSites(text);
      for (const l of literals) jsNames.push({ ...l, file: name });
      skipped.interp += s.interp;
      skipped.dynamic += s.dynamic;
    }
  }
  return { jsNames, kfRefs, cssMentions, selfDefs, selfKeyframes, skipped, cssFiles, jsFiles };
}

/* ══════════════════════════════════════════════════════════════════════════
   五、判定 + 报告
   ══════════════════════════════════════════════════════════════════════════ */

/** 判一个产物：须判定的引用（`ldk-*` JS 名 / 关键帧名）在两个定义集里都没有 ⇒ 悬空 */
function judge(artifact, host) {
  const { id, from } = pluginIdOf(artifact);
  const s = scanArtifact(artifact);
  const dangling = new Map();
  const satisfiedBySelfOnly = new Set(); // ldk-* 只被包内自己满足（借用宿主命名空间 ⇒ 归 SDK 腿判红）
  let ldkRefs = 0;

  for (const r of s.jsNames) {
    if (!HOST_NAMESPACE.test(r.name)) continue;
    ldkRefs++;
    if (host.classes.has(r.name)) continue;
    if (s.selfDefs.has(r.name)) { satisfiedBySelfOnly.add(r.name); continue; }
    if (!dangling.has(r.name)) dangling.set(r.name, { ...r, via: "js-classname" });
  }
  for (const r of s.kfRefs) {
    if (s.selfKeyframes.has(r.name) || host.keyframes.has(r.name)) continue;
    if (!dangling.has(r.name)) dangling.set(r.name, { ...r, via: "css-animation" });
  }
  // 非 ldk- 的 JS 名：**不计悬空**（自有命名空间 / DOM 钩子 / 第三方内联）——误报控，只计数
  const notJudged = new Map();
  for (const r of s.jsNames) {
    if (HOST_NAMESPACE.test(r.name)) continue;
    if (s.selfDefs.has(r.name) || s.cssMentions.has(r.name) || host.classes.has(r.name)) continue;
    if (!notJudged.has(r.name)) notJudged.set(r.name, `${r.file}:${r.line}`);
  }
  return {
    id, idFrom: from,
    source: relative(ROOT, artifact.source).split(sep).join("/"),
    kind: artifact.kind,
    cssFiles: s.cssFiles, jsFiles: s.jsFiles,
    ldkRefs,
    kfRefs: s.kfRefs.length,
    cssMentions: s.cssMentions.size,
    selfDefCount: s.selfDefs.size,
    skipped: s.skipped,
    borrowedLdk: [...satisfiedBySelfOnly].sort(),
    notJudged: [...notJudged].sort(),
    dangling: [...dangling.values()].sort((x, y) => x.name.localeCompare(y.name) || x.file.localeCompare(y.file)),
  };
}

/**
 * 各产物「非 ldk- 未定义名」的**去重并集**——`report()` 与 `--json` 的唯一算法落点。
 * ⚠️ `r.notJudged` 是**条目数组** `[[名字, 出处], …]`，**不是 Map**：曾经这里写作
 *    `[...r.notJudged.keys()]`（数组的 `.keys()` 给的是**下标**）⇒ 「去重的名字数」被算成
 *    「最长那一份的条数」（实测 74 是 editor 一份的条数，真并集更大）。自测「负控F」钉住它。
 */
function uniqueNotJudged(results) {
  return new Set(results.flatMap((r) => r.notJudged.map(([name]) => name)));
}

function report(host, results, missing) {
  console.log("插件悬空名核验（只读审计 · 只报不拦 · 不进 npm run check）—— E6#114\n");
  console.log(`宿主定义集：壳 CSS ${host.srcCssCount} 个（含共享组件单一源码 ${host.sharedCssCount} 个）`
    + ` ＋ 宿主加载的第三方 CSS ${host.externalCss.length} 个${host.externalCss.length ? `（${host.externalCss.join(" / ")}）` : ""}`
    + ` ＋ 保留关键帧账 ${host.reservedKeyframes.length} 条`);
  if (host.externalUnresolved.length) console.log(`  ⚠️ 未解析的第三方 CSS 引用：${host.externalUnresolved.join(" / ")}`);
  console.log(`  ⇒ 宿主类名 ${host.classes.size} 个（裸定义 ${host.bareDefs.size} 个 = 壳 ${host.srcBareDefs.size} 个`
    + `（全部 ldk-*）＋ 宿主加载的字体图标 ${host.bareDefs.size - host.srcBareDefs.size} 个 codicon-*）`
    + ` · 宿主关键帧名 ${host.keyframes.size} 个`);
  console.log("判据：产物 JS 喊的 `ldk-*` 名 ＋ 产物 CSS `animation:` 引用的关键帧名，两个定义集都没有 ⇒ 悬空。");
  console.log("      非 ldk- 的类名引用不计悬空（自有命名空间 / DOM 钩子 / 第三方内联）——见末行计数。\n");

  const w = Math.max(12, ...results.map((r) => r.id.length));
  console.log(`${"产物".padEnd(w)}  ${"悬空".padStart(4)} ${"ldk喊".padStart(6)} ${"关键帧引".padStart(8)} `
    + `${"模板跳过".padStart(8)} ${"动态跳过".padStart(8)} ${"CSS提及".padStart(8)}  出处`);
  for (const r of results) {
    console.log(`${r.id.padEnd(w)}  ${String(r.dangling.length).padStart(4)} ${String(r.ldkRefs).padStart(6)} `
      + `${String(r.kfRefs).padStart(8)} ${String(r.skipped.interp).padStart(8)} ${String(r.skipped.dynamic).padStart(8)} `
      + `${String(r.cssMentions).padStart(8)}  ${r.source}`);
  }
  const total = results.reduce((sum, r) => sum + r.dangling.length, 0);
  // ⚠️ `r.notJudged` 是**条目数组** `[[名字, 出处], …]`（judge() 的产物）——不是 Map，
  //    所以这里不许 `.keys()`（那会取到下标，把「去重名字数」算成「最长那份的条数」）。
  const notJudged = uniqueNotJudged(results);
  console.log(`\n合计悬空：${total}（产物 ${results.length} 个）`);
  console.log(`另：非 ldk- 且两个定义集都没有的类名 ${notJudged.size} 个（自有命名空间/DOM 钩子/第三方）——`
    + `**不计悬空**（不是宿主契约；假红比漏报更坏）`);
  const borrowed = new Set(results.flatMap((r) => r.borrowedLdk));
  if (borrowed.size) console.log(`⚠️ ldk-* 名只被包内自己满足的：${[...borrowed].join(" · ")}（借用宿主命名空间 ⇒ 归 SDK 腿判红，本工具不判）`);
  if (missing.length) {
    // 🔴 不许静默跳过：没产物的仓逐条列名（本工具**不替它们构建**）
    console.log(`未构建（跳过并计数，共 ${missing.length} 个仓）：${missing.map((m) => m.id).join(" · ")}`);
  }
  for (const r of results) {
    if (!r.dangling.length) continue;
    console.log(`\n── ${r.id}（${r.source}）悬空明细 ──`);
    for (const d of r.dangling) console.log(`  · ${d.name}  ← ${d.via} ${d.file}:${d.line}`);
  }
  console.log("\n射程外（如实登记，不是「没问题」）：含插值的模板 ＝ 跳过并计数（上表）；运行时拼出来的名字静态读不出"
    + " ⇒ 这也是本工具只报不拦的原因。");
}

/* ══════════════════════════════════════════════════════════════════════════
   六、自测（正控 ＋ 负控 · 只碰临时目录，不动真产物）
   ══════════════════════════════════════════════════════════════════════════ */

/** 极简 zip 写盘（stored，无压缩）——只为让自测覆盖 zip 读取路径，不是通用打包器（crc32 留 0，本工具不校验） */
function writeStoredZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const data = Buffer.from(text, "utf8");
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cdBuf, eocd]);
}

function selfTest() {
  const host = collectHostDefs();
  const dir = mkdtempSync(join(tmpdir(), "ldk-dangling-"));
  const cases = [];
  const mk = (name, files) => {
    const d = join(dir, name);
    for (const [f, text] of files) {
      mkdirSync(dirname(join(d, f)), { recursive: true });
      writeFileSync(join(d, f), text);
    }
    return d;
  };
  const run = (label, target, expectDangling, expectNames) => {
    const r = judge(openArtifact(target), host);
    const names = r.dangling.map((d) => d.name);
    const ok = expectNames ? JSON.stringify(names) === JSON.stringify(expectNames) : r.dangling.length === expectDangling;
    cases.push({ label, ok, got: expectNames ? names : names.length, expect: expectNames ?? expectDangling });
    return r;
  };
  const stub = (id, js, css) => [
    ["plugin.json", JSON.stringify({ pluginId: id })],
    ["index.bundle.js", js],
    ...(css ? [["index.bundle.css", css]] : []),
  ];

  // 正控：喊宿主没有、自己也么有的 ldk-* 名 ⇒ 必须报
  run("正控：喊了双方都没有的 ldk-* 名", mk("positive", stub("stub-plugin",
    'jsx("div",{className:"ldk-ghost-widget ldk-ghost-aux"});')), 2, ["ldk-ghost-aux", "ldk-ghost-widget"]);

  // 负控 A：第三方自洽（名字＋规则都在自己包里）⇒ 不报 —— Monaco 那一类的结构
  run("负控A：第三方名在自己包 CSS 里有定义 ⇒ 不报", mk("negative-a", stub("stub-plugin",
    'jsx("div",{className:"monaco-workbench stub-own"});',
    ".monaco-workbench{color:red}.stub-own{padding:0}")), 0);

  // 负控 B：含插值的模板 ⇒ 跳过 ＋ 计数（不许报、也不许当字面量拆）
  const rb = run("负控B：插值模板 ⇒ 跳过", mk("negative-b", stub("stub-plugin",
    "jsx(\"div\",{className:`ldk-badge ldk-badge--${kind}`});")), 0);
  cases.push({ label: "负控B-计数：模板跳过 = 1", ok: rb.skipped.interp === 1, got: rb.skipped.interp, expect: 1 });

  // 负控 C：宿主定义集能兜住 ⇒ 不报
  run("负控C：宿主定义集能兜住 ⇒ 不报", mk("negative-c", stub("stub-plugin",
    'jsx("div",{className:"ldk-toggle ldk-input"});',
    ".stub-root .ldk-toggle{opacity:1}\n.stub-anim{animation:ldk-selectbox-in .1s}")), 0);

  // 负控 D：自有命名空间里的无名引用（DOM 钩子）⇒ 不报，只计数
  const rd = run("负控D：自有/DOM 钩子名未定义 ⇒ 不报", mk("negative-d", stub("stub-plugin",
    'jsx("div",{className:"stub-hook stub-other"});')), 0);
  cases.push({
    label: "负控D-计数：非 ldk- 未定义名 = 2", ok: rd.notJudged.length === 2,
    got: rd.notJudged.map(([name]) => name), expect: ["stub-hook", "stub-other"],
  });

  // 负控 E：字符串/注释里的 `className=`（生成式代码）⇒ 不是站点
  run("负控E：字符串里的 className= ⇒ 不报", mk("negative-e", stub("stub-plugin",
    'const html = \'<div className="ldk-ghost-from-string">\';\n// jsx("div",{className:"ldk-ghost-from-comment"});')), 0);

  // 负控 F：跨产物**并集去重**（同名的未判名只算一个）——钉住 `uniqueNotJudged()` 那个
  //  `.keys()` 缺陷（数组 `.keys()` 给下标 ⇒ 去重数被算成「最长一份的条数」）
  const rf1 = run("负控F-1：两份产物共享一个未判名（甲）", mk("negative-f1", stub("stub-plugin",
    'jsx("div",{className:"stub-shared stub-only-a"});')), 0);
  const rf2 = run("负控F-2：两份产物共享一个未判名（乙）", mk("negative-f2", stub("stub-plugin",
    'jsx("div",{className:"stub-shared stub-only-b"});')), 0);
  cases.push({
    label: "负控F-并集去重：3 个（不是两份相加 4，也不是最大一份 2）",
    ok: uniqueNotJudged([rf1, rf2]).size === 3,
    got: [...uniqueNotJudged([rf1, rf2])].sort(), expect: ["stub-only-a", "stub-only-b", "stub-shared"],
  });

  // 正控（zip 路径）：同一份桩打进 zip ⇒ 解出的真名字照样报
  const zipPath = join(dir, "stub-zip.linkdesk-plugin");
  writeFileSync(zipPath, writeStoredZip([
    ...stub("stub-zip-plugin", 'jsx("div",{className:"ldk-ghost-in-zip"});', ".stub-zip-root{padding:0}"),
  ]));
  run("正控(zip)：解条目后的真名字照样报", zipPath, 1, ["ldk-ghost-in-zip"]);

  // 正控（关键帧轴）：`animation:` 引了没人定义的关键帧 ⇒ 报
  run("正控(关键帧)：引了双方都没有的关键帧名", mk("positive-kf", stub("stub-plugin",
    'jsx("div",{className:"stub-own"});',
    ".stub-own{animation:stub-ghost-anim .2s}")), 1, ["stub-ghost-anim"]);

  rmSync(dir, { recursive: true, force: true });
  let bad = 0;
  for (const c of cases) {
    if (!c.ok) bad++;
    console.log(`${c.ok ? "✅" : "❌"} ${c.label}${c.ok ? "" : `（实得 ${JSON.stringify(c.got)}，期望 ${JSON.stringify(c.expect)}）`}`);
  }
  console.log(`\n自测：${cases.length - bad}/${cases.length} 通过`);
  return bad === 0 ? 0 : 1;
}

/* ══════════════════════════════════════════════════════════════════════════
   七、入口
   ══════════════════════════════════════════════════════════════════════════ */

/** 默认输入面：随包 6 只（zip）＋ 官方 18 仓产物（没产物 ⇒ 记「未构建」，⛔ 不静默跳过） */
function defaultTargets() {
  const bundled = existsSync(DEFAULT_BUNDLED)
    ? readdirSync(DEFAULT_BUNDLED).filter((f) => f.endsWith(".linkdesk-plugin")).sort()
      .map((f) => ({ id: f.replace(/\.linkdesk-plugin$/, ""), path: join(DEFAULT_BUNDLED, f), group: "随包种子" }))
    : [];
  const official = [];
  const missing = [];
  if (existsSync(DEFAULT_CONTAINER)) {
    for (const id of readdirSync(DEFAULT_CONTAINER).sort()) {
      const repo = join(DEFAULT_CONTAINER, id);
      if (!statSync(repo).isDirectory()) continue;
      const rootArtifact = join(repo, `${id}.linkdesk-plugin`);
      const distArtifact = join(repo, "dist", `${id}.linkdesk-plugin`);
      if (existsSync(rootArtifact)) official.push({ id, path: rootArtifact, group: "官方仓" });
      else if (existsSync(distArtifact)) official.push({ id, path: distArtifact, group: "官方仓" });
      else missing.push({ id, group: "官方仓" });
    }
  }
  return { bundled, official, missing };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) process.exit(selfTest());
  const host = collectHostDefs();
  if (argv.includes("--quotas")) {
    console.log(JSON.stringify({
      srcCssCount: host.srcCssCount,
      sharedCssCount: host.sharedCssCount,
      externalCss: host.externalCss,
      externalUnresolved: host.externalUnresolved,
      classCount: host.classes.size,
      bareDefCount: host.bareDefs.size,
      nonLdkBareDefs: [...host.bareDefs].filter((n) => !HOST_NAMESPACE.test(n)),
      keyframes: [...host.keyframes].sort(),
      reservedKeyframes: host.reservedKeyframes,
    }, null, 2));
    process.exit(0);
  }
  const explicit = argv.filter((a) => !a.startsWith("--"));
  let targets = [];
  let missing = [];
  if (explicit.length) {
    targets = explicit.map((p) => ({ id: basename(p).replace(/\.linkdesk-plugin$/, ""), path: resolve(p), group: "指定" }));
  } else {
    const t = defaultTargets();
    targets = [...t.bundled, ...t.official];
    missing = t.missing;
  }
  const results = [];
  for (const t of targets) {
    try {
      results.push({ ...judge(openArtifact(t.path), host), group: t.group });
    } catch (e) {
      console.error(`✗ ${t.id}（${t.path}）读不动：${e.message}`);
      process.exit(2);
    }
  }
  if (argv.includes("--json")) {
    console.log(JSON.stringify({
      host: {
        srcCssCount: host.srcCssCount, sharedCssCount: host.sharedCssCount,
        externalCss: host.externalCss, externalUnresolved: host.externalUnresolved,
        classCount: host.classes.size, bareDefCount: host.bareDefs.size,
        keyframeCount: host.keyframes.size, reservedKeyframes: host.reservedKeyframes,
      },
      artifacts: results.map((r) => ({
        id: r.id, group: r.group, idFrom: r.idFrom, source: r.source, kind: r.kind,
        cssFiles: r.cssFiles, jsFiles: r.jsFiles,
        ldkRefs: r.ldkRefs, kfRefs: r.kfRefs, cssMentions: r.cssMentions,
        selfDefCount: r.selfDefCount, skipped: r.skipped,
        borrowedLdk: r.borrowedLdk,
        notJudged: r.notJudged.map(([name, at]) => ({ name, at })),
        dangling: r.dangling.map((d) => ({ name: d.name, via: d.via, at: `${d.file}:${d.line}` })),
      })),
      missing,
      totalDangling: results.reduce((sum, r) => sum + r.dangling.length, 0),
    }, null, 2));
    process.exit(0);
  }
  report(host, results, missing);
  process.exit(0); // 🔴 退出码不随悬空数变（读数不是门禁）；工具自身出错才 2（见上面的 catch）
}

main();
