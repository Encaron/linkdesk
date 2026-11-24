/**
 * 机械门禁：**同语义单实现**（G-N1 · 06 提案 §三）。
 *
 * 用法：
 *   node scripts/check-single-implementation.mjs
 *   node scripts/check-single-implementation.mjs --self-test
 * 退出码 0 = 无 error（warn 不拦）；1 = 有 error / 账本过期。
 *
 * ── 判据 ──
 *   ① **同名组件 ≥2 个文件**（error·官方强制）：一个官方仓里同名组件（Avatar/StatusTag/Badge/
 *      Media/Hero/Carousel/Collection/EmptyState/ActionBtn/MoreMenu…）只能在**一个文件**定义。
 *      两份同名实现 = 第二份必然漂移（06 §4.1 的 Hero/Collection 案例）。
 *   ② **同语义文件组 >1**（error ＋ 账本）：文件名命中同一语义（如 `Hero.tsx` + `AuthorHero.tsx`）
 *      ⇒ 必须在 `scripts/single-impl-exempt.json` 登记「有意分工」（渲染器 vs 数据适配器等）；
 *      未登记 = error。⛔ 不许用「名字不同」绕过——文件名也是语义面。
 *   ③ **共享件重造**（warn）：定义了 `@linkdesk/ui` 已导出的同名件（PluginCard/CardRow/HintCard）
 *      ⇒ 应 import 共享件，而不是再造一份。
 *
 * ── 账本纪律 ──
 *   · 键 = repo + semantic + files（排序后）；文件集合变了 = 过期 ⇒ error（逼人重判分工）；
 *   · 每条必须写 reason + owner + until；⛔ 为凑绿加行。
 *
 * ── 边界 ──
 *   · 第三方仓不扫不判；
 *   · 只查「组件/文件名」这一层——逻辑重复（同一事实两处求值）由 10 §一「逻辑归一化」的人审兜；
 *   · `Card` 不进语义集：卡型变体是插件私有表现语言（CLAUDE 硬约束 28），⛔ 强求单文件。
 */

import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverPluginRepos, officialPluginIds } from "./lib/plugin-repos.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER = join(ROOT, "scripts", "single-impl-exempt.json");
const SYNC_AGENTS = join(ROOT, "scripts", "sync-plugin-agents.mjs");
const CONTAINER = process.env.LINKDESK_PLUGIN_CONTAINER || "E:/linkdesk-plugins";

/** 语义集：只收「跨插件有统一含义」的原语；卡型变体故意不收。 */
export const SEMANTIC_RE = /(Avatar|StatusTag|Badge|Media|ActionBtn|ActionButton|MoreMenu|MoreButton|Hero|Carousel|EmptyState|Collection)/;
const SHARED_NAMES = new Set(["PluginCard", "HintCard"]); // CardRow 名字太泛（市场也有自己的 CardRow 语义），不列

const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** 组件定义名（够用即可：export/const/function/class 的 PascalCase）。 */
export function componentDefinitions(text) {
  const clean = stripComments(text);
  const out = [];
  for (const m of clean.matchAll(/(?:export\s+(?:default\s+)?(?:function|const|class)\s+|function\s+|const\s+)([A-Z][A-Za-z0-9_]*)/g)) {
    if (SEMANTIC_RE.test(m[1])) out.push(m[1]);
  }
  return [...new Set(out)];
}

/** ① 同名组件跨文件。files = Map<relPath, text>。 */
export function scanNameDuplicates(files) {
  const byName = new Map();
  for (const [file, text] of files) {
    for (const name of componentDefinitions(text)) {
      if (!byName.has(name)) byName.set(name, new Set());
      byName.get(name).add(file);
    }
  }
  return [...byName.entries()].filter(([, set]) => set.size > 1).map(([name, set]) => ({ name, files: [...set].sort() }));
}

/** ② 同语义文件组（按 basename 命中语义）。 */
export function scanFileGroups(filePaths) {
  const bySemantic = new Map();
  for (const p of filePaths) {
    const base = basename(p).replace(/\.[^.]+$/, "");
    const m = base.match(SEMANTIC_RE);
    if (!m) continue;
    if (!bySemantic.has(m[1])) bySemantic.set(m[1], new Set());
    bySemantic.get(m[1]).add(p);
  }
  return [...bySemantic.entries()].filter(([, set]) => set.size > 1).map(([semantic, set]) => ({ semantic, files: [...set].sort() }));
}

const groupKey = (repo, semantic, files) => `${repo}|${semantic}|${[...files].sort().join(",")}`;

/** 账本匹配：返回 {unregistered, matchedKeys}。 */
export function matchFileGroups(repo, groups, ledger) {
  const byKey = new Map(ledger.map((e) => [groupKey(e.repo, e.semantic, e.files), e]));
  const matchedKeys = new Set();
  const unregistered = [];
  for (const g of groups) {
    const k = groupKey(repo, g.semantic, g.files);
    if (byKey.has(k)) matchedKeys.add(k);
    else unregistered.push(g);
  }
  return { unregistered, matchedKeys };
}

/** ③ 共享件重造。 */
export function scanSharedReinvention(files) {
  const hits = [];
  for (const [file, text] of files) {
    for (const m of stripComments(text).matchAll(/(?:export\s+(?:default\s+)?(?:function|const|class)\s+|function\s+|const\s+)([A-Z][A-Za-z0-9_]*)/g)) {
      if (SHARED_NAMES.has(m[1])) hits.push({ file, name: m[1] });
    }
  }
  return hits;
}

function collectSource(dir, relBase) {
  const out = new Map();
  const rec = (d) => {
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (["node_modules", ".git", "dist", "release", "resources", "__tests__", "coverage"].includes(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) rec(p);
      else if (/\.(tsx|ts)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) {
        out.set(relative(relBase, p).split(sep).join("/"), readFileSync(p, "utf8"));
      }
    }
  };
  rec(dir);
  return out;
}

function main() {
  const ledger = JSON.parse(readFileSync(LEDGER, "utf8")).entries ?? [];
  const ledgerKeys = new Set(ledger.map((e) => groupKey(e.repo, e.semantic, e.files)));
  const matched = new Set();
  let errors = 0;
  let warns = 0;

  const scanRepo = (repoId, dir, relBase, checkShared) => {
    const files = collectSource(dir, relBase);
    const paths = [...files.keys()];
    for (const d of scanNameDuplicates(files)) {
      console.error(`[error] ${repoId} → 期望「${d.name} 只在一个文件定义」；实际「${d.files.join(" / ")}」；示例修法：合并为一个实现（保留一处、另一处 import），或改名成两个不同语义。`);
      errors++;
    }
    const groups = scanFileGroups(paths);
    if (groups.length) {
      const r = matchFileGroups(repoId, groups, ledger);
      for (const k of r.matchedKeys) matched.add(k);
      for (const g of r.unregistered) {
        console.error(`[error] ${repoId} → 期望「同语义只有一个文件，或登记 single-impl-exempt.json」；实际「${g.semantic}: ${g.files.join(" / ")}」；示例修法：合并为一个文件；确有分工（渲染器 vs 适配器）就登记 reason/owner/until。`);
        errors++;
      }
    }
    if (checkShared) for (const h of scanSharedReinvention(files)) {
      console.log(`[warn] ${repoId}/${h.file} → 期望「import @linkdesk/ui 的 ${h.name}」；实际「本地又定义了一份 ${h.name}」；示例修法：从 @linkdesk/ui 引入共享件，删除本地实现。`);
      warns++;
    }
  };

  scanRepo("shell", join(ROOT, "src"), ROOT, false); // 壳 = 共享件的**源头**，不是重造

  const official = officialPluginIds(SYNC_AGENTS);
  const repos = discoverPluginRepos(CONTAINER);
  if (!repos.length) console.log(`[info] 插件容器不在场或为空（${CONTAINER}）——只判壳域。`);
  // 账本里插件仓的条目只在“那个仓在场”时才可能匹配；容器缺席的 CI 里不能把它们判成过期
  const scanned = new Set(["shell"]);
  for (const repo of repos) {
    if (official && !official.has(repo.id)) continue; // 第三方：不扫不判
    scanned.add(repo.id);
    scanRepo(repo.id, repo.dir, repo.dir, true);
  }

  for (const k of ledgerKeys) {
    if (matched.has(k)) continue;
    if (!scanned.has(k.split("|")[0])) {
      console.log(`[info] 账本条目 ${k} 所属仓不在场——本轮不判过期（本机全量再验）`);
      continue;
    }
    console.error(`[error] scripts/single-impl-exempt.json → 期望「条目仍能在实况匹配」；实际「${k} 已找不到」；示例修法：删掉该条（分工已变/已合并），或核对 files 集合。`);
    errors++;
  }

  if (errors) {
    console.error(`\n🔴 同语义单实现门禁失败：${errors} error / ${warns} warn（判据见本脚本头注）。`);
    return 1;
  }
  console.log(`✅ 同语义单实现门禁通过（0 error / ${warns} warn；账本 ${ledgerKeys.size} 条全部在实况匹配）。`);
  return 0;
}

function selfTest() {
  const ok = (name, cond) => {
    console.log(`${cond ? "✅" : "🔴"} 自测：${name}`);
    if (!cond) process.exitCode = 1;
  };
  const dup = new Map([
    ["a/Avatar.tsx", "export function Avatar(){ return null; }"],
    ["b/AvatarBit.tsx", "export const Avatar = () => null;"],
  ]);
  ok("正控：同名 Avatar 两个文件 ⇒ 命中", scanNameDuplicates(dup).length === 1);
  const single = new Map([["a/Avatar.tsx", "export function Avatar(){ return null; }"]]);
  ok("负控：单文件单实现 ⇒ 不命中", scanNameDuplicates(single).length === 0);
  const g = scanFileGroups(["src/views/store/home/Hero.tsx", "src/views/store/AuthorHero.tsx"]);
  ok("正控：Hero.tsx + AuthorHero.tsx ⇒ 同语义组", g.length === 1 && g[0].files.length === 2);
  const ledger = [{ repo: "p", semantic: "Hero", files: ["src/views/store/AuthorHero.tsx", "src/views/store/home/Hero.tsx"] }];
  ok("账本：登记后 ⇒ 不报", matchFileGroups("p", g, ledger).unregistered.length === 0 && matchFileGroups("p", g, ledger).matchedKeys.size === 1);
  ok("账本：文件集变了 ⇒ 未登记", matchFileGroups("p", scanFileGroups(["x/Hero.tsx", "y/HeroCarousel.tsx"]), ledger).unregistered.length === 1);
  ok("③ 共享件重造 ⇒ 命中", scanSharedReinvention(new Map([["x.tsx", "export function PluginCard(){}"]])).length === 1);
  ok("负控：不同语义名不算重名（AvatarX 与 Avatar 各自单文件）", scanNameDuplicates(new Map([["a.tsx", "const AvatarX = 1"], ["b.tsx", "const Avatar = 1"]])).length === 0);

  if (process.exitCode) {
    console.error("\n🔴 check-single-implementation self-test 失败。");
    return 1;
  }
  console.log("\n✅ check-single-implementation self-test 全过（7 例：同名/文件组/账本/共享件）。");
  return 0;
}

const invokedAsCli = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedAsCli) process.exit(process.argv.includes("--self-test") ? selfTest() : main());
