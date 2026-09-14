#!/usr/bin/env node
/**
 * pull-all——把本地容器里的插件工程**拉到最新**（E6#103 · L7 第 7.6 轮）。
 *
 * 🔴 **只拉不推**：本脚本只有 `git pull --ff-only` 一条动作，**没有** commit / push / reset /
 *    stash / checkout 任何路径。「一键 commit/push 全部」正是 memory `push-wait-for-user` 红线要
 *    拦的东西——推送必须用户本人点头且带代理，工具不许代劳。
 *    `--ff-only` 也是刻意的：拉不动就**报错**，绝不自动合并、绝不产生合并提交。
 *
 * 为什么要有：几十个仓之后「挨个 `git pull`」是真实的体力活（07-脚手架与工作区 §二）。
 *
 * 用法：
 *   npm run pull:plugins                          # 扫 <容器>\official 与 <容器>\third-party
 *   node scripts/pull-all.mjs --dry-run           # 只列找到的工程，不拉（先看它会动谁）
 *   node scripts/pull-all.mjs <目录>...            # 只拉指定的若干插件工程
 *   LINKDESK_PLUGIN_ROOT=<容器>  …                # 换容器（默认 E:\linkdesk-plugins）
 *   HTTPS_PROXY=http://127.0.0.1:7890 …          # 本机需要代理时（也认 --proxy <url>）
 *
 * 🔴 顺手当一次**红线哨兵**：容器本身（或 `official/` `third-party/` 这一级）若被 `git init`，
 *    本脚本会红着喊出来——那是「每只插件都变成子目录」的起点（07 §一 红线）。
 */
import { existsSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CONTAINER = process.env.LINKDESK_PLUGIN_ROOT || "E:\\linkdesk-plugins";
/** 容器下的两夹——按**归属**分（D6），不是按功能分类 */
const SUBDIRS = ["official", "third-party"];

const argv = process.argv.slice(2);
const flagged = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const proxyArg = flagged("--proxy");
const explicit = argv.filter((a) => !a.startsWith("-") && a !== proxyArg);
const proxy =
  proxyArg || process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || "";
/** 本机 git 没配代理，出网要靠显式传入（与推插件仓那条命令同一个口径） */
const PROXY_ARGS = proxy ? ["-c", `http.proxy=${proxy}`, "-c", `https.proxy=${proxy}`] : [];

const git = (cwd, args) => spawnSync("git", [...PROXY_ARGS, ...args], { cwd, encoding: "utf8" });
const isRepo = (dir) => existsSync(join(dir, ".git"));
const why = (r) => ((r.stderr || r.stdout || "").trim().split("\n").filter(Boolean).slice(0, 2).join(" / ")) || "（无输出）";

if (!existsSync(CONTAINER) && explicit.length === 0) {
  console.error(`❌ 容器不存在：${CONTAINER}（用 LINKDESK_PLUGIN_ROOT 指定，或直接传目录）`);
  process.exit(1);
}

// ── 收集目标：显式目录 / 默认容器——都靠"是仓就算一只、继续下钻找" ──

const targets = [];
/** 下钻时跳过的目录名——插件工程自己的 `.git` 由 isRepo 判定，这里只管不往这些里面翻 */
const SKIP = new Set(["node_modules", "dist", ".git"]);
const roots = explicit.length > 0 ? explicit.map((t) => resolve(t)) : [CONTAINER];

/**
 * 🔴 红线哨兵：**扫描根自己与它的直接子目录**若是一个 git 仓 ⇒ 容器被建仓了。
 *    （正常形态：容器 / `official` / `third-party` 三级都**不是**仓，仓在插件工程那一级。）
 *    判到就喊，并且**不把它当插件工程去拉**——它是「每只插件都变成子目录」的起点。
 */
const trespass = [];
for (const root of roots) {
  if (!existsSync(root)) continue;
  if (isRepo(root)) trespass.push(root);
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory() || SKIP.has(e.name)) continue;
    if (isRepo(join(root, e.name))) trespass.push(join(root, e.name));
  }
}

/** 找插件工程：是仓就算一个；不是仓（或那层是误建的容器仓）就继续往下找 */
function collect(dir, depth = 0) {
  if (!existsSync(dir) || depth > 3) return;
  if (isRepo(dir) && !trespass.includes(dir)) {
    targets.push(dir);
    return;
  }
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || SKIP.has(e.name)) continue;
    collect(join(dir, e.name), depth + 1);
  }
}

for (const root of roots) collect(root);
targets.sort();

if (trespass.length > 0) {
  console.error("🔴 容器链上出现了 git 仓——这是**必须马上处理**的误操作（07 §一 红线）：\n");
  for (const t of trespass) console.error(`   · ${t}\\.git`);
  console.error(
    "\n   后果：里面的插件工程全变成「仓里的仓」（父仓记成 gitlink、改动既不跟踪也不显示），\n" +
      "   而且脚手架的「已在 git 仓内 ⇒ 不 init」会让**新插件都不建自己的仓**——正是要避开的 monorepo。\n" +
      "   处理：确认那层仓里没有你想要的东西后，删掉该级 `.git`（**不是**删插件工程自己的 `.git`）。\n",
  );
}

if (targets.length === 0) {
  console.log(`（${explicit.length > 0 ? explicit.join("、") : CONTAINER} 下没有找到插件工程）`);
  process.exit(trespass.length > 0 ? 1 : 0);
}

if (argv.includes("--dry-run")) {
  console.log(`${roots.join("、")}——找到 ${targets.length} 只工程（--dry-run：一个都没拉）：`);
  for (const t of targets) console.log(`  · ${t.startsWith(CONTAINER) ? t.slice(CONTAINER.length + 1) : t}`);
  process.exit(trespass.length > 0 ? 1 : 0);
}

// ── 逐个 `git pull --ff-only` ──

const rows = [];
for (const dir of targets) {
  const shown = dir.startsWith(CONTAINER) ? dir.slice(CONTAINER.length + 1) : basename(dir);
  const branch = ((git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]).stdout || "").trim() || "?").replace(/\r?\n.*/, "");
  const dirty = ((git(dir, ["status", "--porcelain"]).stdout || "").trim().split("\n").filter(Boolean)).length;
  const before = (git(dir, ["rev-parse", "HEAD"]).stdout || "").trim();
  const r = git(dir, ["pull", "--ff-only"]);
  const after = (git(dir, ["rev-parse", "HEAD"]).stdout || "").trim();

  let kind = "clean";
  let detail = "";
  if (r.status !== 0) {
    kind = "fail";
    detail = why(r);
  } else if (before && after && before !== after) {
    kind = "updated";
    const n = (git(dir, ["rev-list", "--count", `${before}..${after}`]).stdout || "").trim();
    detail = `${before.slice(0, 7)}..${after.slice(0, 7)}${n ? `  +${n} 笔` : ""}`;
  }
  rows.push({ shown, branch, dirty, kind, detail });
}

const MARK = { updated: "✔ 已更新", clean: "· 无更新", fail: "✖ 失败  " };
console.log(`${roots.join("、")}（${targets.length} 只工程${proxy ? `，走代理 ${proxy}` : ""}）`);
for (const r of rows) {
  const dirty = r.dirty > 0 ? ` ｜ ⚠️ 有本地改动 ${r.dirty} 个文件（未动它）` : "";
  const tail = r.detail ? `  ${r.detail}` : "";
  console.log(`  ${MARK[r.kind]}  ${r.shown.padEnd(28)} [${r.branch}]${tail}${dirty}`);
}

const by = (k) => rows.filter((r) => r.kind === k).length;
console.log(`\n${rows.length} 只：${by("updated")} 只更新 / ${by("clean")} 只无更新 / ${by("fail")} 只失败。`);
if (by("fail") > 0) {
  console.log("   失败常是两类：① 本地有改动挡住了快进 ② 出网不通——本机需要代理时：");
  console.log(`   HTTPS_PROXY=http://127.0.0.1:7890 npm run pull:plugins`);
}
console.log("\n🔴 本脚本**只拉不推**：没有任何 commit / push。要推得你自己来，且等用户点头 + 带代理。");
// 容器被建仓是红线事故——不该因为「拉取都成功」就安静退出
process.exit(by("fail") > 0 || trespass.length > 0 ? 1 : 0);
