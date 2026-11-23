/**
 * 机械门禁：**token 越界**（G-N2 · 磨砂 / 辉光 / 圆角）——官方强制、第三方只引导。
 *
 * 用法：
 *   node scripts/check-token-boundary.mjs
 *   node scripts/check-token-boundary.mjs --self-test
 * 退出码 0 = 无 error（warn 打印不拦）；1 = 有 error / 过期账本。
 *
 * ── 判据 ──
 *   ① **圆角复写**（error）：`border-radius` 里的 px 若恰好等于宿主档位（2/4/6/8/16/999）
 *      ⇒ 必须写 `var(--radius-xs|sm|md|lg|2xl|pill)`。⛔ 同一语义的第二份裸值。
 *   ② **圆角偏门值**（warn ＋ 账本）：px 不在宿主档位（如 3/10）⇒ 登记在
 *      `scripts/token-boundary-exempt.json`（有主/有理由/有收口条件）；未登记 = warn。
 *   ③ **自写磨砂**（warn ＋ 账本）：`backdrop-filter` 里出现 `blur()/saturate()` 且不吃 `var()`
 *      ⇒ 第二套玻璃。正解 = `--surface-blur` / 壳玻璃域 / `#ld-float-layer`；零视觉步内只挂账。
 *   ④ **裸辉光**（warn ＋ 账本）：`box-shadow` 以数字开头且不吃 `var()` ⇒ 未走 `--shadow-*` /
 *      `--surface-glow`。
 *
 * ── 账本纪律（照 check-spacing-grid 的 REGISTERED 先例）──
 *   · 条目按 `repo + rule + file + value` 匹配（⛔ 不钉行号——行号会漂）；
 *   · **过期条目 = error**：文件里已找不到该值 ⇒ 逼人清账（账本跟着实况走）；
 *   · 新增条目必须写 reason + owner + until；⛔ 为凑绿加行。
 *
 * ── 边界 ──
 *   · 第三方仓不扫不判（SDK lint 侧 WARN 是引导面）；
 *   · 只看声明值，不判断「这个值好不好看」；
 *   · `var(--radius-*, 4px)` 这类 fallback 不算复写（合规形态）。
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverPluginRepos, officialPluginIds } from "./lib/plugin-repos.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER = join(ROOT, "scripts", "token-boundary-exempt.json");
const SYNC_AGENTS = join(ROOT, "scripts", "sync-plugin-agents.mjs");
const CONTAINER = process.env.LINKDESK_PLUGIN_CONTAINER || "E:/linkdesk-plugins";

export const RADIUS_TOKEN_VALUES = new Set(["2px", "4px", "6px", "8px", "16px", "999px"]);
const PX_RE = /\b(\d+(?:\.\d+)?px)\b/g;

export const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, " ");

/** 扫描一段 CSS 的越界（纯函数）。 */
export function scanTokenBoundary(cssText) {
  const lines = stripComments(cssText).split("\n");
  const hits = [];
  lines.forEach((line, i) => {
    const n = i + 1;
    const radius = line.match(/border-radius\s*:\s*([^;]+);/);
    if (radius && !/var\(/.test(radius[1])) {
      const px = [...radius[1].matchAll(PX_RE)].map((m) => m[1]);
      for (const v of px) hits.push({ rule: RADIUS_TOKEN_VALUES.has(v) ? "radius-token-value" : "radius-bespoke", value: v, line: n });
    }
    const blur = line.match(/(?:-webkit-)?backdrop-filter\s*:\s*([^;]+);/);
    if (blur && !blur[1].includes("var(") && /blur\(|saturate\(/i.test(blur[1])) {
      hits.push({ rule: "blur-raw", value: blur[1].trim(), line: n });
    }
    const shadow = line.match(/box-shadow\s*:\s*([^;]+);/);
    if (shadow && !shadow[1].includes("var(") && /^\s*\d/.test(shadow[1])) {
      hits.push({ rule: "shadow-raw", value: shadow[1].trim(), line: n });
    }
  });
  return hits;
}

const keyOf = (repo, rule, file, value) => `${repo}|${rule}|${file}|${value}`;

/** 账本匹配：返回 {unregistered, matchedKeys}。 */
export function classifyHits(repo, file, hits, ledger) {
  const byKey = new Map(ledger.map((e) => [keyOf(e.repo, e.rule, e.file, e.value), e]));
  const matchedKeys = new Set();
  const unregistered = [];
  for (const h of hits) {
    const k = keyOf(repo, h.rule, file, h.value);
    if (byKey.has(k)) matchedKeys.add(k);
    else unregistered.push(h);
  }
  return { unregistered, matchedKeys };
}

function collectCss(dir) {
  const out = [];
  const rec = (d) => {
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (["node_modules", ".git", "dist", "release", "resources", "coverage"].includes(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) rec(p);
      else if (e.name.endsWith(".css")) out.push(p);
    }
  };
  rec(dir);
  return out.sort();
}

const rel = (base, p) => relative(base, p).split(sep).join("/");

function main() {
  const ledger = JSON.parse(readFileSync(LEDGER, "utf8")).entries ?? [];
  const ledgerKeys = new Set(ledger.map((e) => keyOf(e.repo, e.rule, e.file, e.value)));
  const matched = new Set();
  let errors = 0;
  let warns = 0;

  const scanRepo = (repoId, dir, relBase = dir) => {
    for (const file of collectCss(dir)) {
      const relFile = rel(relBase, file);
      const hits = scanTokenBoundary(readFileSync(file, "utf8"));
      if (!hits.length) continue;
      const { unregistered, matchedKeys } = classifyHits(repoId, relFile, hits, ledger);
      for (const k of matchedKeys) matched.add(k);
      for (const h of unregistered) {
        const where = `${repoId}/${relFile}:${h.line}`;
        if (h.rule === "radius-token-value") {
          console.error(`[error] ${where} → 期望「border-radius: var(--radius-*)」；实际「${h.value}」；示例修法：把 ${h.value} 换成对应宿主档位变量（值相同，零视觉）。`);
          errors++;
        } else {
          console.log(`[warn] ${where} → 期望「走 token 或登记 scripts/token-boundary-exempt.json」；实际「${h.rule}: ${h.value}」；示例修法：${h.rule === "radius-bespoke" ? "登记偏门圆角（reason/owner/until），或视觉轮归并到最近档。" : h.rule === "blur-raw" ? "换 --surface-blur / 壳玻璃域；浮层进 #ld-float-layer。" : "换 --shadow-* / --surface-glow。"}`);
          warns++;
        }
      }
    }
  };

  scanRepo("shell", join(ROOT, "src"), ROOT);

  const official = officialPluginIds(SYNC_AGENTS);
  const repos = discoverPluginRepos(CONTAINER);
  if (!repos.length) console.log(`[info] 插件容器不在场或为空（${CONTAINER}）——只判壳域。`);
  for (const repo of repos) {
    if (official && !official.has(repo.id)) continue; // 第三方：不扫不判
    scanRepo(repo.id, repo.dir);
  }

  // 过期账本：条目在实况里已匹配不到 ⇒ 红（账本跟着实况走）
  for (const k of ledgerKeys) {
    if (matched.has(k)) continue;
    console.error(`[error] scripts/token-boundary-exempt.json → 期望「条目仍能在实况匹配」；实际「${k} 已找不到」；示例修法：删掉该条（修好了就清账），或核对 repo/file/value 是否已改名。`);
    errors++;
  }

  if (errors) {
    console.error(`\n🔴 token 越界门禁失败：${errors} error / ${warns} warn（判据见本脚本头注）。`);
    return 1;
  }
  console.log(`✅ token 越界门禁通过（0 error / ${warns} warn；账本 ${ledgerKeys.size} 条全部在实况匹配）。`);
  return 0;
}

function selfTest() {
  const ok = (name, cond) => {
    console.log(`${cond ? "✅" : "🔴"} 自测：${name}`);
    if (!cond) process.exitCode = 1;
  };
  ok("正控：圆角 4px（宿主档位）⇒ radius-token-value", scanTokenBoundary(".x { border-radius: 4px; }").some((h) => h.rule === "radius-token-value"));
  ok("正控：多值圆角含 4px ⇒ 命中", scanTokenBoundary(".x { border-radius: 0 4px 4px 0; }").some((h) => h.rule === "radius-token-value"));
  ok("正控：圆角 3px（偏门）⇒ radius-bespoke", scanTokenBoundary(".x { border-radius: 3px; }").some((h) => h.rule === "radius-bespoke"));
  ok("负控：var(--radius-md) ⇒ 不命中", scanTokenBoundary(".x { border-radius: var(--radius-md); }").length === 0);
  ok("正控：裸 blur ⇒ blur-raw", scanTokenBoundary(".x { backdrop-filter: blur(12px); }").some((h) => h.rule === "blur-raw"));
  ok("负控：var(--surface-blur) ⇒ 不命中", scanTokenBoundary(".x { backdrop-filter: var(--surface-blur); }").length === 0);
  ok("正控：裸 box-shadow ⇒ shadow-raw", scanTokenBoundary(".x { box-shadow: 0 4px 12px rgba(0,0,0,.3); }").some((h) => h.rule === "shadow-raw"));
  ok("负控：var(--shadow-pop) ⇒ 不命中", scanTokenBoundary(".x { box-shadow: var(--shadow-pop); }").length === 0);
  const ledger = [{ repo: "p", rule: "radius-bespoke", file: "a.css", value: "3px" }];
  const r = classifyHits("p", "a.css", [{ rule: "radius-bespoke", value: "3px", line: 1 }], ledger);
  ok("账本：同键命中 ⇒ 不报", r.unregistered.length === 0 && r.matchedKeys.size === 1);
  const r2 = classifyHits("p", "a.css", [{ rule: "radius-bespoke", value: "10px", line: 1 }], ledger);
  ok("账本：不同值 ⇒ 未登记", r2.unregistered.length === 1);

  if (process.exitCode) {
    console.error("\n🔴 check-token-boundary self-test 失败。");
    return 1;
  }
  console.log("\n✅ check-token-boundary self-test 全过（10 例：圆角/磨砂/辉光 ＋ 账本匹配）。");
  return 0;
}

const invokedAsCli = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedAsCli) process.exit(process.argv.includes("--self-test") ? selfTest() : main());
