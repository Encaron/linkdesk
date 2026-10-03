#!/usr/bin/env node
/**
 * 机械检查：**token 全链对账**（主题系统五刀 · 第 0 刀的安全网；`E5.8` 断链类伤疤 B56 的机械化）。
 *
 * ── 它守的是哪句话 ──
 *   bug-atlas **B56**：「用了 `var(--x)` 必须在主题中定义——**未定义＝透明**，肉眼不可见但功能全毁」。
 *   本尺把「一个 token 的一生」拆成**三个方向**逐段对账（三方向口径见
 *   [06-总纲-刀序路线 §三](../../docs/04-软件更新/待抉择池/主题系统-前景可读性适配/06-总纲-刀序路线.md)）：
 *
 *   | 方向 | 判据 | 治什么 |
 *   |:--|:--|:--|
 *   | ① **消费→定义** | 壳内每个**无 fallback** 的 `var(--x)` 必须有定义处（CSS 声明 / 引擎发射清单 / 主题 colorway 直通键） | B56 本尊：`var` 了没人定义 ⇒ 静默透明 |
 *   | ② **定义→消费** | `index.css` `:root`/`[data-theme]` 声明的键 ＋ 仓内主题 colorway 键——**零消费者即报警** | 死键（`--icon-active` 那类：作者写了没人读） |
 *   | ③ **引擎→消费** | `MANAGED_TOKEN_KEYS` 每键必须有消费 | 引擎发死键（写了没人读，且占了广播带宽） |
 *
 * ── 数据来源（⛔ 全部**不耦合外部仓**）──
 *   · **引擎发射清单**：用 esbuild 就地打包 `src/core/services/ui/ThemeEngine/constants.ts` 取**真身**
 *     `MANAGED_TOKEN_KEYS`——⛔ 不重抄一份键表（尺子只有一把；抄一份＝将来两把尺子）。
 *   · **定义**：壳内 `src/**` ＋ `packages/**`（排除 `dist`）＋ 仓内 `plugins/**` 的 `*.css` 声明。
 *   · **colorway 直通键**：仓内主题 JSON（`dev-fixtures` 下 `themes` 目录等）的 `colorways[].colors` 键并集——
 *     主题写了 `--x` 就等于定义了 `--x`（引擎逐键直通）。
 *   · 🔴 **外部主题仓/插件仓路径一律不读**（硬约束：壳仓与主题仓零耦合）；外部插件消费的宿主 token
 *     走下面的**豁免登记**（人写、带理由），⛔ 不靠扫外部路径。
 *
 * ── 消费判定 ──
 *   一个键「被消费」＝在壳内源码出现 `var(--键)`（CSS / TS 模板串皆算；**注释先剥掉**）——
 *   注释里写 `var(--x)` 不算消费（这是本尺第一版实测踩到的假阴性：`var(--token)` 出现在注释里）。
 *
 * 用法：node scripts/check-token-audit.mjs
 *       node scripts/check-token-audit.mjs --self-test
 * 退出码 0 = 全链对账通过；1 = 有断链/死键（打印到 stderr）。
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SRC = resolve(ROOT, "src");
const PACKAGES = resolve(ROOT, "packages");
const PLUGINS = resolve(ROOT, "plugins");
const DEV_FIXTURES = resolve(ROOT, "dev-fixtures");
const INDEX_CSS = resolve(SRC, "index.css");
const ENGINE_CONSTANTS = resolve(SRC, "core/services/ui/ThemeEngine/constants.ts");

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".vite"]);

/* ════════════════════════════ 纯判据（自测与 main 共用同一个函数） ════════════════════════════ */

/** 剥注释——CSS 只剥块注释；TS/JS 另剥行注释与块注释。
 *  ⚠️ 只做「够用」的剥离（不写完整词法器）：本尺的量是 `var(--x)`，注释里的引用必须排除——
 *  字符串字面量里的**真** `var()` 仍要保留（TS 里有 `"--x"` 字符串键与 `` `var(--${k})` `` 模板）。 */
export function stripComments(text, isCss) {
  let out = text.replace(/\/\*[\s\S]*?\*\//g, " ");
  if (!isCss) {
    // 行注释：剥 `//` 到行尾（避开 `://` 协议串——本项目 TS 里 url("linkdesk://…") 常见）
    out = out
      .split("\n")
      .map((ln) => {
        const i = ln.indexOf("//");
        if (i === -1) return ln;
        if (ln[i - 1] === ":" || ln[i - 1] === "/") return ln; // 协议 / 老式注释不作处理
        return ln.slice(0, i);
      })
      .join("\n");
  }
  return out;
}

/** 扫一段文本里的 CSS 变量引用 → `[{ token, hasFallback }]`。
 *  · `var(--x)` ⇒ hasFallback=false（**要账的**：无定义即静默透明）；
 *  · `var(--x, …)` ⇒ hasFallback=true（有兜底，安全）；
 *  · `var(--${…})` / `var(--)` ⇒ token 为空，跳过（动态名，静态不可判）。 */
export function collectVarRefs(text) {
  const refs = [];
  const re = /var\(\s*--([A-Za-z0-9_-]+)?\s*(,)?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!m[1]) continue; // 动态/空名
    refs.push({ token: m[1], hasFallback: Boolean(m[2]) });
  }
  return refs;
}

/** 扫一段 **TS/JS** 文本里的「字符串键引用」——引擎/pool 侧按键名字符串读 token
 *  （如 `tokens["surface-bg-zones"]`）＝**消费**，只是没走 `var()`。只收**带连字符的键**
 *  （`"surface-bg-zones"`）——单段小写词（`"accent"`）在代码里太容易撞，收了反而制造假阴性。 */
export function collectStringKeyRefs(text) {
  const keys = new Set();
  const re = /["'`]([a-z][a-z0-9]*-[a-z0-9-]+)["'`]/g;
  let m;
  while ((m = re.exec(text)) !== null) keys.add(m[1]);
  return keys;
}

/** 收集一段 **CSS** 里所有 `--x:` 声明键（含组件局部自定义属性）。 */
export function collectDeclaredKeys(cssText) {
  const keys = new Set();
  const re = /--([A-Za-z0-9_-]+)\s*:/g;
  let m;
  while ((m = re.exec(cssText)) !== null) keys.add(m[1]);
  return keys;
}

/** 收集 CSS 里 **`:root` / `[data-theme…]` 作用域块**内的声明键——这些是**壳的公共 token 契约**，
 *  「定义了没人读」才是死键。组件局部自定义属性（`.foo { --bar: … }`）不进本表。 */
export function collectRootScopeKeys(cssText) {
  const keys = new Set();
  const lines = cssText.split("\n");
  let depth = 0;
  let scoped = false;
  for (const ln of lines) {
    if (depth === 0) {
      if (/^\s*(:root|\[data-theme)/.test(ln) && ln.includes("{")) {
        scoped = true;
        depth = 1;
        if (/^\s*(:root|\[data-theme)[^{]*\{[^}]*\}/.test(ln)) { // 单行块
          for (const k of collectDeclaredKeys(ln)) keys.add(k);
          depth = 0;
          scoped = false;
        }
        continue;
      }
      // 其它选择器开块——跳过（不追踪）
      const open = (ln.match(/\{/g) || []).length;
      const close = (ln.match(/\}/g) || []).length;
      depth = Math.max(0, depth + open - close);
      if (depth > 0) depth = 0; // 非目标块：本尺不嵌套追踪
      continue;
    }
    if (scoped) {
      for (const k of collectDeclaredKeys(ln)) keys.add(k);
      const close = (ln.match(/\}/g) || []).length;
      const open = (ln.match(/\{/g) || []).length;
      depth += open - close;
      if (depth <= 0) {
        depth = 0;
        scoped = false;
      }
    }
  }
  return keys;
}

/** 收集主题 JSON 的 colorway 键并集（`colorways[].colors` 的键）。吃**已解析**对象，不碰文件系统。 */
export function colorwayKeysOf(themes) {
  const keys = new Set();
  for (const t of themes) {
    if (!t || typeof t !== "object") continue;
    for (const cw of Array.isArray(t.colorways) ? t.colorways : []) {
      const colors = cw && typeof cw === "object" ? cw.colors : null;
      if (colors && typeof colors === "object") for (const k of Object.keys(colors)) keys.add(k);
    }
  }
  return keys;
}

/** 动态前缀（`var(--font-size-${…})` 那类）折算——前缀以 `-` 结尾时，只要**任一已知键以它开头**即算有定义。 */
function prefixResolvable(prefix, universe) {
  if (!prefix.endsWith("-")) return false;
  for (const k of universe) if (k.startsWith(prefix)) return true;
  return false;
}

/** 纯判据（`--self-test` 与 main() 用的是**同一个函数**）。吃已采集好的数据，返回三方向的违规清单。
 *
 *  @param {object} data
 *  @param {string[]} data.engineKeys     引擎发射清单（MANAGED_TOKEN_KEYS）
 *  @param {Set<string>} data.definedKeys 壳内全部 CSS 声明键 ∪ colorway 键（＝「有定义处」域）
 *  @param {Set<string>} data.rootKeys    `:root`/`[data-theme]` 作用域声明键
 *  @param {Set<string>} data.colorwayKeys 仓内主题 colorway 键
 *  @param {Array<{token:string,hasFallback:boolean,file:string}>} data.refs 壳内全部 var 引用
 *  @param {Set<string>} [data.stringKeys] 壳内字符串键引用（`tokens["x-y"]` 那类）＝也算消费
 *  @param {Map<string,string>} data.exempt 豁免登记（键 → 理由）
 *  @returns {{missing:Array, dead:Array, engineDead:Array}}
 */
export function auditTokens(data) {
  const { engineKeys, definedKeys, rootKeys, colorwayKeys, refs, exempt } = data;
  const stringKeys = data.stringKeys ?? new Set();
  const defined = new Set([...definedKeys, ...engineKeys]);
  const consumed = new Set([...refs.map((r) => r.token), ...stringKeys]);

  // ① 消费→定义：无 fallback 且无定义处（动态前缀可解析则放过）
  const missing = [];
  const seen = new Set();
  for (const r of refs) {
    if (r.hasFallback) continue;
    if (defined.has(r.token) || prefixResolvable(r.token, defined)) continue;
    if (exempt.has(r.token)) continue;
    const key = `${r.token}\u0000${r.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    missing.push({ token: r.token, file: r.file });
  }

  // ② 定义→消费：壳公共契约键（:root/[data-theme] ∪ colorway），零消费即死键
  const dead = [];
  const candidates2 = new Set([...rootKeys, ...colorwayKeys]);
  for (const k of candidates2) {
    if (consumed.has(k)) continue;
    if (exempt.has(k)) continue;
    dead.push({ token: k, source: rootKeys.has(k) ? "index.css" : "colorway" });
  }

  // ③ 引擎→消费：引擎发出的键必须有人读
  const engineDead = [];
  for (const k of engineKeys) {
    if (consumed.has(k)) continue;
    if (exempt.has(k)) continue;
    engineDead.push({ token: k });
  }
  return { missing, dead, engineDead };
}

/* ════════════════════════════ 豁免登记（首跑定案） ════════════════════════════ */

/**
 * 豁免登记——**按「类」登记，每条必带一句理由**。
 * 🔴 纪律：**手写条目**超过 ~5 即回来复盘链本身；⛔ 不许为了绿灯默默加行。
 *   本尺把可机械推导的两类**不写死**（见 `buildExempt`），只留下两类**必须人写**的：
 *
 *   · A · **插件面契约键**——宿主发布、**消费方在插件仓**（壳仓硬约束不读外部路径，故此登记）。
 *   · D · **真死键（待清）**——三仓（壳 + 官方插件仓 + 本仓夹具）**全无消费**。壳内不声明者壳无法退休
 *     （定义在主题 colorway / 引擎常量），清理落点：**主题仓 5 键归第 2 刀 7.1**；`--drag-preview-shadow`
 *     的壳内声明可随第 1 刀顺手删（本刀 0 行产品代码，暂只登记）。
 *
 *   · B · **引擎标尺档位**（推导：`^(radius|font-size)-`）——引擎六档/九档标尺之一，壳表面暂无消费
 *     （口径：[外观主题化/02-变量契约 §2.2 注]「属引擎标尺档位而非壳默认 token」）。
 *   · C · **引擎组合键族**（推导：`-solid` 结尾）——引擎玻璃合成器按 `<表面键>-solid` 动态组合出
 *     `--<键>` 的 CSS 值（`tokens.ts` 写回 `color-mix(... var(--<键>-solid) ...)`），静态不可见引用。
 */

/** A · 插件面契约键（消费者在官方插件仓——壳仓不读外部路径，故人写登记） */
export const PLUGIN_SURFACE = new Map([
  ["tone-surface-deep", "A · 设置插件「文字极性预览」取样底色（官方仓 SettingsView-rows.css var 消费）"],
  ["tone-ink-on-deep", "A · 同上（深底墨色，极性预览）"],
  ["tone-surface-light", "A · 同上（浅底底色，极性预览）"],
  ["tone-ink-on-light", "A · 同上（浅底墨色，极性预览）"],
  ["system-log", "A · 终端监视插件的会话色（官方仓 3 处 var 消费）"],
  ["sent-echo", "A · AI 会话插件的已发送色（官方仓 2 处 var 消费）"],
  ["status-disconnected", "A · 终端监视插件的断连色（官方仓 2 处 var 消费）"],
  ["cm-timestamp", "A · CodeMirror 会话面的时间戳色（官方仓 2 处 var 消费）"],
]);

/** D · 真死键（三仓全无消费；清理落点见上注） */
export const DEAD_PENDING = new Map([
  ["icon-active", "D · 死键——壳不消费（D7）；主题仓清理归第 2 刀。**定案：`--icon-active` 退休**"],
  ["bg-status", "D · 死键——状态栏表面实走 `--bg-window`；主题仓清理归第 2 刀"],
  ["drop-indicator", "D · 死键——拖拽指示实走类名 `.ldk-icon-drop-indicator`，非色 token；主题仓清理归第 2 刀"],
  ["received", "D · 死键——三仓零消费；主题仓清理归第 2 刀"],
  ["drag-preview-shadow", "D · 死键——拖影实走 `--context-menu-shadow`；壳内 index.css 两处声明零消费（清理未排刀），主题仓清理归第 2 刀"],
]);

/** 推导 B（引擎标尺档位）/ C（引擎组合键族）——机械可判者不手写。 */
const SCALE_STEP_RE = /^(radius|font-size)-/;
const isEngineScaleStep = (k) => SCALE_STEP_RE.test(k);
const isComposedSolid = (k) => k.endsWith("-solid");

/** 合成最终豁免表：手写两类 ＋ 机械推导两类。 */
export function buildExempt() {
  const m = new Map([...PLUGIN_SURFACE, ...DEAD_PENDING]);
  return {
    has: (k) => m.has(k) || isEngineScaleStep(k) || isComposedSolid(k),
    get: (k) => m.get(k) ?? (isEngineScaleStep(k) ? "B · 引擎标尺档位" : isComposedSolid(k) ? "C · 引擎组合键族" : undefined),
    size: m.size,
  };
}

/* ════════════════════════════ 采集（真实文件系统） ════════════════════════════ */

function walkFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

function readEngineKeys() {
  // esbuild 就地打包引擎常量模块 → 取真身 MANAGED_TOKEN_KEYS（⛔ 不重抄键表）
  return build({
    entryPoints: [ENGINE_CONSTANTS],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
  }).then(async (r) => {
    const code = r.outputFiles[0].text;
    const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    return mod.MANAGED_TOKEN_KEYS;
  });
}

function collect() {
  const codeFiles = [];
  for (const root of [SRC, PACKAGES, PLUGINS]) codeFiles.push(...walkFiles(root));
  const srcFiles = codeFiles.filter((f) => /\.(css|ts|tsx|js|jsx|mts|cts)$/.test(f));

  // ① 方向只扫**产品源码**——测试与规则源码里满是**故意的**负夹具（`var(--xxx)`），
  //    扫它们＝永远红灯。排除口径见 `collect()` 里的 `isFixture`。

  const definedKeys = new Set();
  const refs = [];
  const stringKeys = new Set();
  for (const f of srcFiles) {
    const isCss = f.endsWith(".css");
    const rel = f.slice(ROOT.length + 1).split(sep).join("/");
    const isFixture = /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel) || rel.includes("plugin-sdk/src/eslint/");
    if (isFixture) continue; // 负夹具里满是故意的 `var(--xxx)` 与示例串——⛔ 一个都不入账
    const text = stripComments(readFileSync(f, "utf8"), isCss);
    if (isCss) {
      for (const k of collectDeclaredKeys(text)) definedKeys.add(k);
    } else {
      for (const k of collectStringKeyRefs(text)) stringKeys.add(k);
    }
    for (const r of collectVarRefs(text)) refs.push({ ...r, file: rel });
  }

  // 主题 colorway 键（仓内主题 JSON：dev-fixtures / plugins）
  const themes = [];
  const themeJsons = [];
  for (const root of [DEV_FIXTURES, PLUGINS]) {
    for (const f of walkFiles(root)) {
      if (f.endsWith(".json") && f.split(sep).slice(0, -1).includes("themes")) themeJsons.push(f);
    }
  }
  for (const f of themeJsons) {
    try {
      themes.push(JSON.parse(readFileSync(f, "utf8")));
    } catch {
      /* 非 JSON / 坏 JSON ⇒ 跳过（schema 门禁另有专责） */
    }
  }
  const colorwayKeys = colorwayKeysOf(themes);
  for (const k of colorwayKeys) definedKeys.add(k);

  const indexText = stripComments(readFileSync(INDEX_CSS, "utf8"), true);
  const rootKeys = collectRootScopeKeys(indexText);
  for (const k of collectDeclaredKeys(indexText)) definedKeys.add(k);

  return { definedKeys, refs, stringKeys, colorwayKeys, rootKeys };
}

/* ════════════════════════════ main / self-test ════════════════════════════ */

function printSection(title, rows, fmt) {
  if (rows.length === 0) {
    console.log(`  ✅ ${title}：0`);
    return;
  }
  console.error(`  🔴 ${title}：${rows.length}`);
  for (const r of rows) console.error(`     · ${fmt(r)}`);
}

async function runSelfTest() {
  const fail = (msg) => {
    console.error(`🔴 self-test 失败：${msg}`);
    process.exit(1);
  };
  const ok = (cond, msg) => {
    if (!cond) fail(msg);
  };

  // 夹具：引擎键两条、colorway 一条、:root 声明一条
  const engineKeys = ["glass-blur", "bg-window-solid"];
  const base = {
    engineKeys,
    definedKeys: new Set(["glass-blur", "bg-window-solid", "accent", "custom-local"]),
    rootKeys: new Set(["accent", "glass-blur"]),
    colorwayKeys: new Set(["accent", "icon-active"]),
    exempt: new Map([["bg-window-solid", "C · 测试夹具"]]),
    refs: [
      { token: "glass-blur", hasFallback: false, file: "a.css" }, // 已定义 ⇒ 不报
      { token: "accent", hasFallback: false, file: "a.css" }, // 已定义 ⇒ 不报
      { token: "ghost-token", hasFallback: false, file: "a.css" }, // 无定义无 fallback ⇒ ① 报
      { token: "safe-with-fallback", hasFallback: true, file: "a.css" }, // 有 fallback ⇒ ① 不报
      { token: "font-size-", hasFallback: false, file: "a.css" }, // 动态前缀（无匹配）⇒ ① 报
    ],
  };

  // 正控①（负夹具）：ghost-token / font-size- 被抓；glass-blur / accent / fallback 不抓
  const r1 = auditTokens(base);
  ok(
    r1.missing.map((m) => m.token).sort().join(",") === "font-size-,ghost-token",
    `方向① 期望抓到 font-size-,ghost-token，实得 [${r1.missing.map((m) => m.token).join(",")}]`,
  );

  // 动态前缀可解析 ⇒ 放过：定义域里加一个 font-size-sm，则 `font-size-` 不再报
  const r1b = auditTokens({
    ...base,
    definedKeys: new Set([...base.definedKeys, "font-size-sm"]),
    refs: [{ token: "font-size-", hasFallback: false, file: "a.css" }],
  });
  ok(r1b.missing.length === 0, "方向① 动态前缀应可解析（font-size- ⇒ 有 font-size-sm）");

  // 正控②：colorway 键 icon-active 无消费 ⇒ 报
  const r2 = auditTokens(base);
  ok(
    r2.dead.some((d) => d.token === "icon-active"),
    "方向② 期望抓到零消费者的 colorway 键 icon-active",
  );

  // 负控②：给 icon-active 一个消费引用 ⇒ 不报
  const r2b = auditTokens({
    ...base,
    refs: [...base.refs, { token: "icon-active", hasFallback: false, file: "b.css" }],
  });
  ok(!r2b.dead.some((d) => d.token === "icon-active"), "方向② icon-active 有消费后不应再报");

  // 正控③：引擎键无消费 ⇒ 报；豁免项（bg-window-solid）不报
  const r3 = auditTokens({ ...base, engineKeys: ["glass-blur", "dead-engine-key", "bg-window-solid"] });
  ok(
    r3.engineDead.map((e) => e.token).join(",") === "dead-engine-key",
    `方向③ 期望只抓 dead-engine-key，实得 [${r3.engineDead.map((e) => e.token).join(",")}]`,
  );

  // 剥注释：注释里的 var() 不算消费
  const stripped = stripComments("/* var(--ghost) */\na{color:var(--real)}", true);
  ok(!collectVarRefs(stripped).some((r) => r.token === "ghost"), "剥注释后注释里的 var() 不应入账");
  ok(collectVarRefs(stripped).some((r) => r.token === "real"), "剥注释后真 var() 仍应入账");

  // 字符串键引用：带连字符的键入账；单段小写词不入账（太易撞）
  const sk = collectStringKeyRefs('tokens["surface-bg-zones"]; const x = "accent"; const y = `no`;');
  ok(sk.has("surface-bg-zones"), "带连字符的字符串键应入账");
  ok(!sk.has("accent"), "单段小写字符串不应入账");

  // 字符串键引用也算消费（方向③ 不报 surface-bg-zones）
  const r4 = auditTokens({
    engineKeys: ["surface-bg-zones"],
    definedKeys: new Set(),
    rootKeys: new Set(),
    colorwayKeys: new Set(),
    refs: [],
    stringKeys: new Set(["surface-bg-zones"]),
    exempt: new Map(),
  });
  ok(r4.engineDead.length === 0, "字符串键引用应算消费（引擎键不再报死）");

  // :root 作用域收集：组件局部的自定义属性不进公共契约表
  const rootKeys = collectRootScopeKeys(":root {\n --accent: red;\n --bg-window: #fff;\n}\n.foo { --local-x: 1px; }");
  ok(rootKeys.has("accent") && rootKeys.has("bg-window"), ":root 块内声明应入表");
  ok(!rootKeys.has("local-x"), "组件局部自定义属性不应进 :root 契约表");

  console.log("✅ check-token-audit --self-test：全部通过");
}

async function main() {
  const engineKeys = await readEngineKeys();
  const { definedKeys, refs, stringKeys, colorwayKeys, rootKeys } = collect();
  const exempt = buildExempt();
  const result = auditTokens({ engineKeys, definedKeys, rootKeys, colorwayKeys, refs, stringKeys, exempt });

  console.log(
    `token 对账：引擎键 ${engineKeys.length} · 壳内 var 引用 ${refs.length} · 字符串键引用 ${stringKeys.size} · 公共契约键 ${rootKeys.size} · colorway 键 ${colorwayKeys.size} · 豁免 ${exempt.size} 键（＋B/C 推导）`,
  );
  printSection("① 消费→定义（无 fallback 且无定义）", result.missing, (r) => `--${r.token}  ← ${r.file}`);
  printSection("② 定义→消费（公共契约键零消费者）", result.dead, (r) => `--${r.token}  〔${r.source}〕`);
  printSection("③ 引擎→消费（引擎发死键）", result.engineDead, (r) => `--${r.token}`);

  const total = result.missing.length + result.dead.length + result.engineDead.length;
  if (total > 0) {
    console.error(`\n🔴 token 全链对账失败：${total} 处。二选一——**接进链路** 或 **在 EXEMPT 显式豁免＋一句理由**。`);
    process.exit(1);
  }
  console.log("✅ token 全链对账通过");
}

if (process.argv.includes("--self-test")) {
  await runSelfTest();
} else {
  await main();
}
