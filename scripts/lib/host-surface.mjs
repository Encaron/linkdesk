/**
 * 宿主「定义集」采集库——**单一生成器**（E6#115 抽出，2026-09-18）。
 *
 * 为什么必须是一个库而不是两份代码：`E6#114`（尺子）与 `E6#115`（面快照第 ③ 栏）量的是
 * **同一个东西**（「宿主今天定义了哪些类名 / 哪些保留关键帧」）。两处各写一份 ⇒ 迟早出现
 * 「快照说缺、尺子说没悬空」这种自相矛盾的读数——那正是本系列花了两轮在还的债
 * （见 `01-任务-悬空名核验.md` §8.2⑤）。
 *
 * 口径（**动之前先读** `01-任务-悬空名核验.md` §8.2，那是本文件的裁）：
 *   ① 壳自己的 CSS = `src/**\/*.css`（含共享组件单一源码 `src/components/shared/**`——`@linkdesk/ui`
 *      的 `dist/` 由它构建，**不是**另一个真源）；② 宿主**实际 import** 的第三方 CSS（从
 *      `src/**` 的 CSS import 图机械解析，解析不到的如实登记不静默丢）；③ 保留关键帧账 =
 *      `packages/plugin-sdk/schemas/reserved-class-names.json` 的 8 条。
 * ⛔ 不读 `packages/linkdesk-ui/dist/index.css`（**派生 ＋ gitignored**，读它 = 同一批定义读两遍）；
 * ⛔ 不读 `node_modules` 全库 CSS（会凭空多出「宿主其实没加载」的名字）；⛔ 不读插件仓源码。
 *
 * 本文件是纯采集（`fs` ＋ `css-selectors.mjs`），**不做任何判定、不设退出码、不进 check 链**。
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { bareClassDefinitions, keyframeDefinitions, stripComments, splitSelector } from "./css-selectors.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
/** 仓库根（本文件住 `scripts/lib/`） */
export const ROOT = resolve(HERE, "..", "..");

/** 保留关键帧账（唯一真相源——SDK 随包下发的那份） */
const RESERVED_KEYFRAMES = join(ROOT, "packages", "plugin-sdk", "schemas", "reserved-class-names.json");

/**
 * 递归列举目录下全部文件（按扩展名过滤）；`node_modules` / `.git` 不进。
 * ⚠️ 名门禁（`check-gate-health`）域外的通用工具——`plugin-dangling-name-audit.mjs` 与
 * 本库共用同一份（读产物目录那条路也用它）。
 */
export function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

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
export function collectHostDefs() {
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
