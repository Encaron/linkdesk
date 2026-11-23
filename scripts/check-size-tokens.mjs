/**
 * 机械门禁：**尺寸 token 越界 / 单出处**（G-N2 扩展 · 尺寸域第七域）。
 *
 * 用法：
 *   node scripts/check-size-tokens.mjs
 *   node scripts/check-size-tokens.mjs --self-test
 * 退出码 0 = 无 error（warn 会打印但不拦）；1 = 有 error。
 *
 * ── 规格源 ──
 *   `06-归一化与AI友好化-本次复盘门禁提案.md` G-N2 ＋ 2026-11-23 用户拍板：
 *   尺寸域 = 控件高度 / 图标 / 图标块 / 媒体框比例，面向**所有插件**发放；
 *   官方范围强制、第三方只引导（本腿不扫第三方仓；SDK lint 那边是 WARN）。
 *   机器可读规格表 = `scripts/ui-size-spec.json`（键 / 值 / 语义 / 类别 / 消费方）。
 *
 * ── 三条判据（error/warn 的分界写在这里，免得下一棒猜）──
 *   ① **规格表 ↔ 宿主 token 零漂移**（always error）：
 *      `scripts/ui-size-spec.json` 的每个宿主 token 必须在 `src/index.css` 有同值定义；
 *      反之 `src/index.css` 里每个 `--size-*` 也必须在规格表里登记（⛔ 私造 token）。
 *   ② **token 复写**（壳 = error；官方插件 = enforced 名单内 error、名单外 warn）：
 *      值恰好等于某个尺寸 token、且选择器落在该类别（control/icon/glyph/media）⇒
 *      必须写 `var(--size-*)`，⛔ 再写裸 px。用例：`height: 28px` 在 `*-btn` 上。
 *   ③ **独家几何单出处**（declaredGeometry 文件 = error）：
 *      卡/媒体/图标块的 `width / height / min-* / max-* / flex-basis` 必须是 `var()/calc()/%/auto/…`；
 *      裸 px 必须先在插件内声明成 `--marketplace-*` 并在规格表登记。
 *      ⚠️ 这条只对**已登记文件**生效——未登记插件先走 ② 的 warn，等 step 5 全仓迁移再收紧。
 *
 * ── 边界 ──
 *   · 第三方仓**不扫、不判**（硬约束 10：按现场数据认，⛔ 写名单）；
 *   · 本腿不判断「值选得对不对」——只判断「同一语义有没有第二份散值」。
 *   · 失败信息一律 `文件:行 → 期望 → 实际 → 示例修法`（06 §六「可被 AI 用」）。
 *
 * ── 自测（`--self-test`）──
 *   正控：token 复写 / 媒体裸比例 / 独家几何裸 px / 规格漂移 / 未知 --size-* 引用 ⇒ 各自命中；
 *   负控：同类别但非 token 值（27px / 22px）、已用 var()/100%、干净片段 ⇒ 0 命中。
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverPluginRepos, officialPluginIds } from "./lib/plugin-repos.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_PATH = join(ROOT, "scripts", "ui-size-spec.json");
const INDEX_CSS = join(ROOT, "src", "index.css");
const SYNC_AGENTS = join(ROOT, "scripts", "sync-plugin-agents.mjs");
const PLUGIN_CONTAINER = process.env.LINKDESK_PLUGIN_CONTAINER || "E:/linkdesk-plugins";

const BARE_PX_RE = /^-?\d+(?:\.\d+)?px$/i;
const BARE_RATIO_RE = /^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/;
const GEOMETRY_PROPS = new Set([
  "width", "height", "min-width", "min-height", "max-width", "max-height", "flex-basis",
]);
const ALLOWED_VALUE_RE = /^(?:var|calc|min|max|clamp)\(|%$|^(?:auto|none|fit-content|min-content|max-content|inherit|initial|unset|revert)$/i;
const DECLARED_SELECTOR_RE = /card|art|media|tile|glyph|hero|cover|thumb|icon/i;

export const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, " ");

/** 归一化值：压空白 + 去掉 `/` 两侧空白（`3 / 2` 与 `3/2` 等价）。 */
export function norm(value) {
  return String(value).trim().replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").toLowerCase();
}

/** 解析 CSS 规则（够用即可：跳过 @ 规则外壳，取内层选择器 + 声明 + 行号）。 */
export function parseRules(text) {
  const clean = stripComments(text);
  const rules = [];
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, " ");
    if (!selector || selector.startsWith("@")) continue;
    const line = clean.slice(0, m.index).split("\n").length;
    const decls = [];
    for (const d of m[2].split(";")) {
      const i = d.indexOf(":");
      if (i < 0) continue;
      decls.push({ prop: d.slice(0, i).trim().toLowerCase(), value: d.slice(i + 1).trim() });
    }
    if (decls.length) rules.push({ selector, decls, line });
  }
  return rules;
}

/** 选择器命中的类别（可多命中；control 优先于 icon，避免 icon-btn 被误判）。 */
export function categoriesOf(selector) {
  const s = selector.toLowerCase();
  const out = [];
  if (/(^|[-_])(btn|button|tbtn|sbtn|input|select|toolbar)($|[-_])/.test(s)) out.push("control");
  if (/tile|glyph|avatar/.test(s)) out.push("glyph");
  if (/icon/.test(s)) out.push("icon");
  return [...new Set(out)];
}

function tokensByCategory(spec) {
  const map = new Map();
  for (const t of spec.tokens) {
    if (!map.has(t.category)) map.set(t.category, []);
    map.get(t.category).push(t);
  }
  return map;
}

/** 判据②：值等于 token ⇒ 必须用 var()。 */
export function scanTokenRetyping(cssText, spec) {
  const byCat = tokensByCategory(spec);
  const hits = [];
  for (const rule of parseRules(cssText)) {
    const cats = new Set(categoriesOf(rule.selector));
    cats.add("media"); // 媒体比例不靠选择器语义：任何 `aspect-ratio: 3 / 2` 都算越界
    for (const d of rule.decls) {
      for (const cat of cats) {
        const def = (spec.categories[cat] ?? {});
        if (!(def.properties ?? []).includes(d.prop)) continue;
        const candidates = byCat.get(cat) ?? [];
        if (cat === "media") {
          if (d.prop !== "aspect-ratio" || !BARE_RATIO_RE.test(d.value)) continue;
        } else if (!BARE_PX_RE.test(d.value)) continue;
        const token = candidates.find((t) => norm(t.value) === norm(d.value));
        if (token) {
          hits.push({ line: rule.line, selector: rule.selector, prop: d.prop, value: d.value, token: token.name, category: cat });
          break;
        }
      }
    }
  }
  return hits;
}

/** 判据③：已登记文件的卡/媒体/图标块几何必须是变量。 */
export function scanDeclaredGeometry(cssText) {
  const hits = [];
  for (const rule of parseRules(cssText)) {
    if (!DECLARED_SELECTOR_RE.test(rule.selector)) continue;
    for (const d of rule.decls) {
      if (!GEOMETRY_PROPS.has(d.prop)) continue;
      if (!BARE_PX_RE.test(d.value)) continue;
      if (ALLOWED_VALUE_RE.test(d.value)) continue;
      hits.push({ line: rule.line, selector: rule.selector, prop: d.prop, value: d.value });
    }
  }
  return hits;
}

/** 规格表 ↔ index.css 漂移（纯函数，便于自测）。 */
export function checkSpecDrift(indexCss, spec) {
  const errors = [];
  const defs = new Map();
  for (const m of stripComments(indexCss).matchAll(/(--size-[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    defs.set(m[1], m[2].trim());
  }
  for (const t of spec.tokens) {
    if (!defs.has(t.name)) {
      errors.push({ file: "src/index.css", line: 0, expected: `${t.name}: ${t.value}`, actual: "未定义", token: t.name });
    } else if (norm(defs.get(t.name)) !== norm(t.value)) {
      errors.push({ file: "src/index.css", line: 0, expected: `${t.name}: ${t.value}`, actual: defs.get(t.name), token: t.name });
    }
  }
  const specNames = new Set(spec.tokens.map((t) => t.name));
  for (const name of defs.keys()) {
    if (!specNames.has(name)) {
      errors.push({ file: "scripts/ui-size-spec.json", line: 0, expected: `登记 ${name}（键/值/语义/类别）`, actual: "index.css 有定义但规格表没有", token: name });
    }
  }
  return errors;
}

/** 插件里引用未知 --size-*（防拼写错误）。 */
export function scanUnknownSizeRefs(cssText, spec) {
  const known = new Set(spec.tokens.map((t) => t.name));
  const hits = [];
  for (const m of stripComments(cssText).matchAll(/var\(\s*(--size-[a-z0-9-]+)/gi)) {
    if (!known.has(m[1])) {
      const line = cssText.slice(0, m.index).split("\n").length;
      hits.push({ line, token: m[1] });
    }
  }
  return hits;
}

export function checkDeclaredTokens(fileText, declared) {
  const errors = [];
  for (const [name, value] of Object.entries(declared.tokens)) {
    const m = stripComments(fileText).match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
    if (!m) {
      errors.push({ expected: `${name}: ${value}`, actual: "未在 tokenFile 声明", token: name });
    } else if (norm(m[1]) !== norm(value)) {
      errors.push({ expected: `${name}: ${value}`, actual: m[1].trim(), token: name });
    }
  }
  return errors;
}

function collectCss(dir) {
  const out = [];
  const walk = (d) => {
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".git" || e.name === "dist" || e.name === "release" || e.name === "resources") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".css")) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

const rel = (p) => p.split(sep).join("/").replace(ROOT.split(sep).join("/") + "/", "");

function report(kind, file, hit, fix) {
  const where = hit.line ? `${file}:${hit.line}` : file;
  const line = `[${kind}] ${where} → 期望「${hit.expected ?? "见下"}」；实际「${hit.actual ?? `${hit.prop}: ${hit.value}`}」；示例修法：${fix}`;
  if (kind === "error") console.error(line);
  else console.log(line);
}

function main() {
  const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
  let errors = 0;
  let warns = 0;

  // ① 规格漂移
  for (const e of checkSpecDrift(readFileSync(INDEX_CSS, "utf8"), spec)) {
    console.error(`[error] ${e.file} → 期望「${e.expected}」；实际「${e.actual}」；示例修法：宿主 token 与规格表必须同值同键（改一边同笔改另一边）。`);
    errors++;
  }

  // ② 壳
  for (const file of collectCss(join(ROOT, "src"))) {
    const text = readFileSync(file, "utf8");
    for (const h of scanTokenRetyping(text, spec)) {
      report("error", rel(file), { line: h.line, expected: `用 var(${h.token})`, actual: `${h.prop}: ${h.value}`, prop: h.prop, value: h.value }, `把 ${h.prop}: ${h.value} 换成 ${h.prop}: var(${h.token})（值相同，零视觉）。`);
      errors++;
    }
    for (const h of scanUnknownSizeRefs(text, spec)) {
      report("error", rel(file), { line: h.line, expected: "规格表里已登记的 --size-* token", actual: h.token }, `改成规格表里的键（见 scripts/ui-size-spec.json）；不存在就先去 src/index.css 定义并登记。`);
      errors++;
    }
  }

  // ②③ 官方插件仓（第三方不扫）
  const official = officialPluginIds(SYNC_AGENTS);
  const repos = discoverPluginRepos(PLUGIN_CONTAINER);
  if (!repos.length) console.log(`[info] 插件容器不在场或为空（${PLUGIN_CONTAINER}）——只判壳域。`);
  const enforced = new Set(spec.enforcedPlugins ?? []); // 兼容旧规格表；官方名单优先
  for (const repo of repos) {
    if (official && !official.has(repo.id)) continue; // 第三方：不扫不判
    // 强制面 = 官方 FACTS 全量（⛔ 不再靠手工名单——名单漏一个仓就静默降级成 warn）
    const isEnforced = official ? official.has(repo.id) : enforced.has(repo.id);
    for (const file of collectCss(repo.dir)) {
      const text = readFileSync(file, "utf8");
      const relFile = file.split(sep).join("/").replace(repo.dir.split(sep).join("/") + "/", "");
      for (const h of scanTokenRetyping(text, spec)) {
        const kind = isEnforced ? "error" : "warn";
        report(kind, `${repo.id}/${relFile}`, { line: h.line, expected: `用 var(${h.token})`, actual: `${h.prop}: ${h.value}`, prop: h.prop, value: h.value }, `把 ${h.prop}: ${h.value} 换成 ${h.prop}: var(${h.token})（老壳加 fallback：var(${h.token}, ${h.value})）。`);
        kind === "error" ? errors++ : warns++;
      }
      for (const h of scanUnknownSizeRefs(text, spec)) {
        const kind = isEnforced ? "error" : "warn";
        report(kind, `${repo.id}/${relFile}`, { line: h.line, expected: "规格表里已登记的 --size-* token", actual: h.token }, `改成规格表里的键（scripts/ui-size-spec.json）。`);
        kind === "error" ? errors++ : warns++;
      }
    }
    const declared = spec.declaredGeometry?.[repo.id];
    if (!declared) continue;
    const tokenFile = join(repo.dir, declared.tokenFile);
    for (const e of checkDeclaredTokens(readFileSync(tokenFile, "utf8"), declared)) {
      report("error", `${repo.id}/${declared.tokenFile}`, { expected: e.expected, actual: e.actual }, "在插件 token 块里补/改同名变量；规格表与 CSS 必须同值。");
      errors++;
    }
    for (const relPath of declared.files) {
      const file = join(repo.dir, relPath);
      let text = "";
      try { text = readFileSync(file, "utf8"); } catch { continue; }
      for (const h of scanDeclaredGeometry(text)) {
        report("error", `${repo.id}/${relPath}`, { line: h.line, expected: "var(--marketplace-*)/calc()/%/auto", actual: `${h.prop}: ${h.value}`, prop: h.prop, value: h.value }, `先在插件 token 块声明 --marketplace-*（并在 scripts/ui-size-spec.json 登记），这里写 ${h.prop}: var(--…)。`);
        errors++;
      }
    }
  }

  if (errors) {
    console.error(`\n🔴 尺寸 token 门禁失败：${errors} error / ${warns} warn。`);
    console.error("判据与示例修法见 scripts/check-size-tokens.mjs 头注；规格表 = scripts/ui-size-spec.json。");
    return 1;
  }
  console.log(`✅ 尺寸 token 门禁通过（0 error / ${warns} warn）。`);
  return 0;
}

/* ── 自测（纯函数；不碰外部仓）── */
function selfTest() {
  const spec = {
    tokens: [
      { name: "--size-control-md", value: "28px", category: "control" },
      { name: "--size-control-sm", value: "24px", category: "control" },
      { name: "--size-icon-lg", value: "24px", category: "icon" },
      { name: "--size-icon-sm", value: "16px", category: "icon" },
      { name: "--size-glyph-md", value: "40px", category: "glyph" },
      { name: "--size-ratio-card", value: "3 / 2", category: "media" },
    ],
    categories: {
      control: { properties: ["height", "min-height"] },
      icon: { properties: ["width", "height"] },
      glyph: { properties: ["width", "height"] },
      media: { properties: ["aspect-ratio"] },
    },
  };
  const ok = (name, cond) => {
    console.log(`${cond ? "✅" : "🔴"} 自测：${name}`);
    if (!cond) process.exitCode = 1;
  };

  ok("正控：control 复写 28px ⇒ 命中", scanTokenRetyping(".x-btn { height: 28px; }", spec).length === 1);
  ok("负控：control 非 token 值 27px ⇒ 不命中", scanTokenRetyping(".x-btn { height: 27px; }", spec).length === 0);
  ok("正控：icon 复写 24px ⇒ 命中", scanTokenRetyping(".x-icon { width: 24px; }", spec).length === 1);
  ok("负控：icon 非 token 值 22px ⇒ 不命中", scanTokenRetyping(".x-icon { width: 22px; }", spec).length === 0);
  ok("正控：glyph 复写 40px ⇒ 命中", scanTokenRetyping(".x-tile { width: 40px; }", spec).length === 1);
  ok("正控：媒体裸比例 3 / 2 ⇒ 命中", scanTokenRetyping(".x { aspect-ratio: 3 / 2; }", spec).length === 1);
  ok("负控：媒体已走 var() ⇒ 不命中", scanTokenRetyping(".x { aspect-ratio: var(--size-ratio-card); }", spec).length === 0);
  ok("正控：独家几何裸 px ⇒ 命中", scanDeclaredGeometry(".x-card { width: 312px; }").length === 1);
  ok("负控：独家几何已走 var() ⇒ 不命中", scanDeclaredGeometry(".x-card { width: var(--x); }").length === 0);
  ok("负控：独家几何 100% ⇒ 不命中", scanDeclaredGeometry(".x-card { width: 100%; }").length === 0);
  ok("正控：规格漂移（28 → 29）⇒ 命中", checkSpecDrift(":root { --size-control-md: 29px; }", spec).some((e) => e.token === "--size-control-md" && e.actual === "29px"));
  ok("负控：规格同值 ⇒ 不命中", checkSpecDrift(":root { --size-control-md: 28px; --size-control-sm: 24px; --size-icon-lg: 24px; --size-icon-sm: 16px; --size-glyph-md: 40px; --size-ratio-card: 3 / 2; }", spec).length === 0);
  ok("正控：未知 --size-* 引用 ⇒ 命中", scanUnknownSizeRefs(".x { width: var(--size-glyph-mdx); }", spec).length === 1);
  ok("负控：干净片段 ⇒ 0 命中", scanTokenRetyping(".x { color: var(--text-primary); }", spec).length === 0);

  if (process.exitCode) {
    console.error("\n🔴 check-size-tokens self-test 失败。");
    return 1;
  }
  console.log("\n✅ check-size-tokens self-test 全过（14 例：正控命中 / 负控不命中）。");
  return 0;
}

process.exit(process.argv.includes("--self-test") ? selfTest() : main());
