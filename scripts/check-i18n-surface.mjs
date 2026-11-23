/**
 * 机械门禁：**i18n 契约**（官方强制 · 第三方只引导）。
 *
 * 用法：
 *   node scripts/check-i18n-surface.mjs
 *   node scripts/check-i18n-surface.mjs --self-test
 *
 * ── 为什么要有它（2026-11-23 用户实机）──
 *   市场里出现过「英文界面混中文」「作者卡硬编码中文」「主题/合集标题不翻译」「rail 作者竖排」——
 *   根因不是翻译没做，而是 i18n 没有单一契约、门禁只覆盖了「t() key 是否在自有字典」这一小角且是黄灯。
 *   本腿把四件事变成红：
 *     ① **字典齐平**：plugin.json `contributes.i18n` 声明的每种语言，键集必须完全相等；
 *     ② **t() 覆盖**：源码里的 `t("key")` 必须在**每一种**声明语言里存在（⛔ 靠 app-level 字典兜底不算）；
 *     ③ **硬编码 UI 中文**：views/components 的 JSX 文本与 UI 属性（aria-label/title/placeholder/…）
 *        不得出现裸中文（注释除外）；
 *     ④ **官方目录 locale**：官方目录条目的 name/description、合集 title/hint 必须有 zh + en；
 *        第三方条目只提示不判红。
 *   外加 **rail 布局不变量**（marketplace compact 行 nowrap/省略/点不溢出）——布局回归也走机械尺。
 *
 * ── 边界 ──
 *   · 第三方仓不扫不判（SDK lint 侧是 WARN 引导）；
 *   · 「硬编码中文」只扫 views/components 的 JSX 文本与 UI 属性（服务层的数据/错误文案不在本腿射程，
 *     避免把「中文数据」误当 UI 文案）；注释/块注释一律跳过；
 *   · 目录 locale 是**作者数据**：官方目录强制 zh+en；第三方条目未提供只打提示。
 *
 * ── 自测 ──
 *   正控：字典缺键 / t key 缺失 / JSX 裸中文 / UI 属性裸中文 / 官方目录缺 en / rail 规则缺失 ⇒ 命中；
 *   负控：齐平字典 / t() 包裹 / 注释里的中文 / 非官方条目缺 locale / rail 规则齐全 ⇒ 不命中。
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as jsonc from "jsonc-parser";
import { discoverPluginRepos, officialPluginIds } from "./lib/plugin-repos.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.LINKDESK_PLUGIN_CONTAINER || "E:/linkdesk-plugins";
const CATALOG_REPO = process.env.LINKDESK_CATALOG_REPO || join(CONTAINER, "linkdesk-marketplace");
const I18N_EXEMPT = join(ROOT, "scripts", "i18n-surface-exempt.json");
const AGENTS_SCRIPT = join(ROOT, "scripts", "sync-plugin-agents.mjs");
const CJK = /[\u4e00-\u9fa5]/;

const rel = (base, p) => relative(base, p).split(sep).join("/");

function walk(dir, exts, relBase = dir) {
  const out = [];
  const rec = (d) => {
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (["node_modules", ".git", "dist", "release", "resources", "__tests__", "coverage"].includes(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) rec(p);
      else if (exts.some((x) => e.name.endsWith(x)) && !/\.(test|spec)\./.test(e.name)) out.push({ abs: p, rel: rel(relBase, p) });
    }
  };
  rec(dir);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

/** JS 字符串字面量反转义（键比较用；够用即可）。 */
export function unescapeJs(s) {
  return s.replace(/\\(.)/g, (_, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c === "r" ? "\r" : c));
}

/** 源码里的 t("key") / t('key') 键集（模板串不算；空键忽略）。 */
export function extractTKeys(text) {
  const keys = new Set();
  for (const m of text.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"\s*[,)]/g)) {
    const k = unescapeJs(m[1]);
    if (k.trim()) keys.add(k);
  }
  for (const m of text.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'\s*[,)]/g)) {
    const k = unescapeJs(m[1]);
    if (k.trim()) keys.add(k);
  }
  return keys;
}

/** 字典齐平：返回 { lang: missingKeys[] }。 */
export function dictParity(dicts) {
  const union = new Set(Object.values(dicts).flatMap((d) => Object.keys(d)));
  const out = {};
  for (const [lang, dict] of Object.entries(dicts)) {
    out[lang] = [...union].filter((k) => !(k in dict));
  }
  return out;
}

/** t() key 在每一种声明语言里都必须存在。 */
export function missingTKeys(keys, dicts) {
  const langs = Object.keys(dicts);
  return [...keys].filter((k) => k.trim() && langs.some((l) => !(k in dicts[l])));
}

/** 硬编码 UI 中文：views/components 的 JSX 文本与 UI 属性（注释行跳过）。 */
export function hardcodedUiChinese(text) {
  const hits = [];
  let inBlock = false;
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const t = line.trim();
    if (inBlock) {
      if (t.includes("*/")) inBlock = false;
      return;
    }
    if (t.startsWith("/*") && !t.includes("*/")) {
      inBlock = true;
      return;
    }
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/")) return;
    for (const m of line.matchAll(/(aria-label|title|placeholder|data-hint|alt)="([^"]*[\u4e00-\u9fa5][^"]*)"/g)) {
      hits.push({ line: i + 1, kind: "attr", text: m[2] });
    }
    for (const m of line.matchAll(/>\s*([^<>{}]*[\u4e00-\u9fa5][^<>{}]*)\s*</g)) {
      const s = m[1].trim();
      if (s) hits.push({ line: i + 1, kind: "text", text: s });
    }
  });
  return hits;
}

/** 官方目录 locale 缺口：条目 name/description、合集 title/hint 必须有 zh + en。 */
export function catalogLocaleGaps(catalog, officialIds) {
  const gaps = [];
  const need = (obj, fields, where, official) => {
    if (!official) return;
    for (const field of fields) {
      if (!obj[field]) continue;
      for (const lang of ["zh", "en"]) {
        if (typeof obj.locales?.[lang]?.[field] === "string" && obj.locales[lang][field].trim()) continue;
        gaps.push({ where, lang, field });
      }
    }
  };
  for (const p of catalog.plugins ?? []) {
    need(p, ["name", "description"], `plugin:${p.id}`, officialIds ? officialIds.has(p.id) : true);
  }
  for (const c of catalog.collections ?? []) {
    if (typeof c === "string") continue;
    need(c, ["title", "hint"], `collection:${c.id}`, true);
  }
  return gaps;
}

/** rail compact 布局不变量（marketplace 插件）。 */
export function railLayoutGaps(css) {
  const gaps = [];
  const block = (sel) => {
    const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  };
  const compact = block(".marketplace-store-rail-item.is-compact");
  if (!/flex-wrap:\s*nowrap/.test(compact)) gaps.push("compact 行缺 flex-wrap: nowrap");
  if (!/white-space:\s*nowrap/.test(compact)) gaps.push("compact 行缺 white-space: nowrap");
  const text = block(".marketplace-store-rail-item.is-compact .marketplace-store-rail-text");
  if (!/min-width:\s*0/.test(text)) gaps.push("rail 标签缺 min-width: 0");
  if (!/text-overflow:\s*ellipsis/.test(text)) gaps.push("rail 标签缺 text-overflow: ellipsis");
  const dot = block(".marketplace-store-rail-item.is-compact .marketplace-store-rail-dot");
  if (!/position:\s*static/.test(dot)) gaps.push("compact 点未改成 static");
  if (!/flex:\s*none/.test(dot)) gaps.push("compact 点缺 flex: none");
  return gaps;
}

function main() {
  const official = officialPluginIds(AGENTS_SCRIPT);
  const repos = discoverPluginRepos(CONTAINER);
  let errors = 0;
  let warns = 0;
  const seen = new Set();

  for (const repo of repos) {
    if (official && !official.has(repo.id)) continue; // 第三方：不扫不判
    let manifest;
    try {
      manifest = jsonc.parse(readFileSync(join(repo.dir, "plugin.json"), "utf8"), [], { allowTrailingComma: true });
    } catch (e) {
      console.error(`[error] ${repo.id}/plugin.json → 期望「可解析」；实际「${e.message ?? e}」`);
      errors++;
      continue;
    }
    const i18n = manifest?.contributes?.i18n;
    if (!i18n || typeof i18n !== "object" || Array.isArray(i18n)) continue;
    seen.add(repo.id);
    const dicts = {};
    for (const [lang, relPath] of Object.entries(i18n)) {
      try {
        dicts[lang] = JSON.parse(readFileSync(join(repo.dir, String(relPath)), "utf8"));
      } catch (e) {
        console.error(`[error] ${repo.id}/${relPath} → 期望「可解析的字典」；实际「${e.message ?? e}」`);
        errors++;
      }
    }
    if (!Object.keys(dicts).length) continue;

    // ① 字典齐平
    for (const [lang, missing] of Object.entries(dictParity(dicts))) {
      if (!missing.length) continue;
      console.error(`[error] ${repo.id}/i18n → 期望「${lang} 与其它语言键集相等」；实际缺 ${missing.length} 键：${missing.slice(0, 5).join(" / ")}${missing.length > 5 ? " …" : ""}；示例修法：补齐缺失键（值=该语言译文；中文键可填 key 本身）。`);
      errors++;
    }

    // ② t() 覆盖
    const keys = new Set();
    for (const f of walk(join(repo.dir, "src"), [".ts", ".tsx"])) {
      for (const k of extractTKeys(readFileSync(f.abs, "utf8"))) keys.add(k);
    }
    const missing = missingTKeys(keys, dicts);
    if (missing.length) {
      console.error(`[error] ${repo.id} → 期望「每个 t() key 在全部声明语言里有译文」；实际缺 ${missing.length}：${missing.slice(0, 5).map((k) => JSON.stringify(k)).join(" / ")}；示例修法：在 ${Object.keys(dicts).join(" / ")} 里补键（英文给译文，中文可填 key）。`);
      errors++;
    }

    // ③ 硬编码 UI 中文（views/components）
    for (const sub of ["views", "components"]) {
      for (const f of walk(join(repo.dir, "src", sub), [".tsx"], repo.dir)) {
        for (const h of hardcodedUiChinese(readFileSync(f.abs, "utf8"))) {
          console.error(`[error] ${repo.id}/${f.rel}:${h.line} → 期望「UI 文案走 t()」；实际「${h.kind === "attr" ? "属性" : "JSX 文本"}：${h.text}」；示例修法：改成 t("中文 key") 并补字典。`);
          errors++;
        }
      }
    }
  }

  // ④ 官方目录 locale（官方默认要求；中文专用等例外在 scripts/i18n-surface-exempt.json 显式登记）
  try {
    const catalog = JSON.parse(readFileSync(join(CATALOG_REPO, "marketplace.json"), "utf8"));
    let exemptEntries = [];
    try {
      exemptEntries = JSON.parse(readFileSync(I18N_EXEMPT, "utf8")).catalogLocales ?? [];
    } catch {
      exemptEntries = [];
    }
    const exemptMap = new Map(exemptEntries.map((e) => [`${e.where}|${e.lang}|${e.field}`, e]));
    const matchedExempt = new Set();
    for (const g of catalogLocaleGaps(catalog, official)) {
      const key = `${g.where}|${g.lang}|${g.field}`;
      if (exemptMap.has(key)) {
        matchedExempt.add(key);
        console.log(`[exempt] official catalog ${key} —— ${exemptMap.get(key).reason}`);
        continue;
      }
      console.error(`[error] official catalog → 期望「${g.where} 的 ${g.field} 有 ${g.lang} locale」；实际缺；示例修法：在条目/合集里补 locales.${g.lang}.${g.field}（base 字段保留兜底）；若该官方件有意只做一种语言，登记 scripts/i18n-surface-exempt.json。`);
      errors++;
    }
    for (const e of exemptEntries) {
      const key = `${e.where}|${e.lang}|${e.field}`;
      if (matchedExempt.has(key)) continue;
      console.error(`[error] scripts/i18n-surface-exempt.json → 期望「${key} 仍能匹配实况」；实际找不到；示例修法：删掉该条（已补齐/已下架），或核对 where/lang/field。`);
      errors++;
    }
    for (const p of catalog.plugins ?? []) {
      if (official?.has(p.id)) continue;
      const lack = ["name", "description"].filter((f) => p[f] && !p.locales?.zh?.[f]);
      if (lack.length) {
        console.log(`[warn] official catalog → 非官方条目 ${p.id} 未提供 zh locale（${lack.join("/")}）——只提示不判红。`);
        warns++;
      }
    }
  } catch (e) {
    console.log(`[info] 官方目录仓不在场或不可读（${CATALOG_REPO}）——跳过目录 locale 腿。`);
  }

  // ⑤ rail 布局不变量
  const mkt = repos.find((r) => r.id === "marketplace");
  if (mkt) {
    try {
      const css = readFileSync(join(mkt.dir, "src/styles/store/store-shell.css"), "utf8");
      for (const g of railLayoutGaps(css)) {
        console.error(`[error] marketplace/store-shell.css → 期望「${g}」；实际缺失；示例修法：恢复 compact 行 nowrap/标签省略/点 flex:none 三条不变量。`);
        errors++;
      }
    } catch {
      console.log("[info] marketplace store-shell.css 不在场——跳过 rail 布局腿。");
    }
  }

  if (errors) {
    console.error(`\n🔴 i18n 契约门禁失败：${errors} error / ${warns} warn（判据见本脚本头注）。`);
    return 1;
  }
  console.log(`✅ i18n 契约门禁通过（0 error / ${warns} warn；字典域 ${seen.size} 只官方插件）。`);
  return 0;
}

function selfTest() {
  const ok = (name, cond) => {
    console.log(`${cond ? "✅" : "🔴"} 自测：${name}`);
    if (!cond) process.exitCode = 1;
  };
  const dicts = { en: { "打开": "Open", "关闭": "Close" }, zh: { "打开": "打开" } };
  ok("正控：字典缺键 ⇒ zh 缺 1", dictParity(dicts).zh.length === 1);
  ok("负控：齐平字典 ⇒ 0", dictParity({ en: { a: "A" }, zh: { a: "a" } }).en.length === 0);
  ok("正控：t key 缺失 ⇒ 命中", missingTKeys(new Set(["打开", "缺失"]), dicts).length === 1);
  ok("正控：JSX 裸中文 ⇒ 命中", hardcodedUiChinese(`<span>你好</span>`).length === 1);
  ok("正控：UI 属性裸中文 ⇒ 命中", hardcodedUiChinese(`<button aria-label="关闭" />`).length === 1);
  ok("负控：t() 包裹 ⇒ 不命中", hardcodedUiChinese(`<span>{t("你好")}</span>`).length === 0);
  ok("负控：注释里的中文 ⇒ 不命中", hardcodedUiChinese(`// 这是注释\nconst a = 1;`).length === 0);
  const cat = { plugins: [
    { id: "official", name: "官方", description: "d", locales: { zh: { name: "官方", description: "d" }, en: { name: "Official", description: "d" } } },
    { id: "third", name: "Third", locales: {} },
  ], collections: [{ id: "c", title: "合集", locales: { zh: { title: "合集" }, en: { title: "Collection" } } }] };
  const officialIds = new Set(["official"]);
  ok("负控：官方条目 zh+en 齐全 ⇒ 0", catalogLocaleGaps(cat, officialIds).length === 0);
  const cat2 = { plugins: [{ id: "official", name: "官方", description: "d", locales: { zh: { name: "官方" } } }], collections: [] };
  ok("正控：官方条目缺 en ⇒ 命中", catalogLocaleGaps(cat2, officialIds).length > 0);
  const css = `.marketplace-store-rail-item.is-compact { flex-wrap: nowrap; white-space: nowrap; }\n.marketplace-store-rail-item.is-compact .marketplace-store-rail-text { min-width: 0; text-overflow: ellipsis; }\n.marketplace-store-rail-item.is-compact .marketplace-store-rail-dot { position: static; flex: none; }`;
  ok("负控：rail 三不变量齐全 ⇒ 0", railLayoutGaps(css).length === 0);
  ok("正控：rail 缺 nowrap ⇒ 命中", railLayoutGaps(".marketplace-store-rail-item.is-compact { }").length > 0);
  ok("负控：转义 key 反转义（E:\\\\tools ⇒ E:\\tools）", unescapeJs("E:\\\\tools") === "E:\\tools");

  if (process.exitCode) {
    console.error("\n🔴 check-i18n-surface self-test 失败。");
    return 1;
  }
  console.log("\n✅ check-i18n-surface self-test 全过（13 例：字典/t 覆盖/硬编码/目录 locale/rail）。");
  return 0;
}

const invokedAsCli = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedAsCli) process.exit(process.argv.includes("--self-test") ? selfTest() : main());
