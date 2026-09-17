/**
 * 非样式命名空间 · **四条归属腿的容器读数**（E6#111k／1.49 立）。
 *
 * ## 它是干什么的（与 `audit-plugin-scope.mjs` 什么关系）
 *
 * `audit-plugin-scope.mjs` 是**壳侧独立推导**：它自己读各仓的 manifest / 主题文件，自己判一遍
 * （「两条腿互相不看」是本轴的定案，那道脚本就是第二条腿）。
 * 本脚本**不自己判**——它把 **SDK 的四条归属腿**（命令 id / 配置键 / 外观族 id / 上下文旗子，
 * `packages/plugin-sdk/src/eslint/checks/*.ts`）**原样跑遍一个容器**，把**判据本人的裁决**打成一张表。
 *
 * 为什么要有它：四条腿的判据在 **1.49 收紧为红**（此前判据②/①/③ 只在插件仓 CI 里是黄灯），
 * 而「收紧的前提 = 官方 18 仓需改处 0」这句话**必须每次都能被重跑证明**，不能靠引用某一格的读数。
 * 1.50（本轴收口复核）的「残留判据全 0」也吃这一条命令。
 *
 * ## 用法
 *
 * ```bash
 * npm run build --prefix packages/plugin-sdk     # 前置：本脚本读编译产物（见下）
 * npm run audit:plugin-ownership                 # 默认容器 = LDK_PLUGINS_DIR / E:/linkdesk-plugins/official
 * npm run audit:plugin-ownership -- --names      # 附每仓「名数」读数（口径：名数，非站点数）
 * npm run audit:plugin-ownership -- --json       # 机读（一行一仓）
 * node scripts/audit-plugin-ownership.mjs <容器目录>
 * ```
 *
 * ## 口径与边界（别跨口径引用）
 *
 * · **红** = 进 `violations`（插件仓 CI 的严格腿据此判红）；**黄** = 进 `advisories`（只打印不拦）。
 *   ⚠️ **1.49 起**命令腿/配置腿/外观腿/旗子腿的「不带本仓归属」也都进**红** ⇒ 黄栏在多数仓里恒空。
 *   唯一例外：外观腿的判据③（同插件跨配方重复配色）**仍是黄＋登记**（1.36 §三③ 的独立判据，不在本格射程）。
 * · **名数**口径 = 去重后的名字个数（合规的也在），与「站点数」不是一回事。
 * · 🔴 本脚本**只读**：不写任何插件文件、不进 `npm run check`（它需要外部插件容器，别的机器/CI 上没有）。
 *   它在收口清单里的位置 = 「有环境时的可复跑读数」，不是门禁。
 *
 * ## 🔴 为什么读编译产物、以及那道新鲜度自守
 *
 * 判据的**权威**是 `packages/plugin-sdk/src/**`（TS 源码），而 Node 直接 import 不了 TS。
 * 三条路：① 读 `dist/`（本脚本选的）② 起一个 vitest 进程 ③ 让本文件变成 `.ts` 由 `tsx` 跑。
 * 选 ① 的理由：`dist/` 正是**随 npm 包下发给插件仓**的那一份（插件仓 CI 判红用的就是编译后的实现），
 *   读它 = 读「消费者会拿到的判据」，比读源码更贴近判据面。
 * ⚠️ 代价 = **可能读到旧编译产物**（改了 src 忘了 build ⇒ 读数陈旧且看不出来，与「假绿」同族）。
 *   ⇒ 本脚本开跑先比 `src` 与 `dist` 的最新 mtime，**dist 更旧就拒绝出读数**并让你去 build
 *   （宁可不出数，不可出一份看不出陈旧的数）。
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SDK = path.join(ROOT, "packages/plugin-sdk");
const DIST = path.join(SDK, "dist/eslint/checks");
const OFFICIAL = process.env.LDK_PLUGINS_DIR || "E:/linkdesk-plugins/official";
const JSON_OUT = process.argv.includes("--json");
const WITH_NAMES = process.argv.includes("--names");
/** 显式容器目录（第一个非 `--` 开头的参数；缺省 = LDK_PLUGINS_DIR / 官方容器） */
const CONTAINER = process.argv.slice(2).find((a) => !a.startsWith("--")) || OFFICIAL;

/** 递归取最大 mtime（只 stat，不读内容——目录可能很大） */
function newestMtime(dir) {
  let newest = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) newest = Math.max(newest, newestMtime(p));
    else newest = Math.max(newest, fs.statSync(p).mtimeMs);
  }
  return newest;
}

/* ── 新鲜度自守（见文件头）——dist 不在 git 里，所以「没有」与「陈旧」分开报 ── */
if (!fs.existsSync(DIST)) {
  console.error(
    `🔴 [ownership] 编译产物不存在：${path.relative(ROOT, DIST)}。\n` +
      `   本脚本读的是随包下发的那一份实现（见文件头）。请先跑：npm run build --prefix packages/plugin-sdk`,
  );
  process.exit(2);
}
const srcNewest = newestMtime(path.join(SDK, "src"));
const distNewest = newestMtime(path.join(SDK, "dist"));
if (srcNewest > distNewest) {
  console.error(
    `🔴 [ownership] 编译产物**比源码旧**（src ${new Date(srcNewest).toISOString()} > dist ${new Date(distNewest).toISOString()}）。\n` +
      `   读数会是一份**看不出陈旧**的旧判据——本轴最恨的假绿。请先跑：npm run build --prefix packages/plugin-sdk`,
  );
  process.exit(2);
}

const load = (name) => import(pathToFileURL(path.join(DIST, name)).href);
const [cmd, cfg, app, ctx] = await Promise.all([
  load("command-ownership.js"),
  load("config-ownership.js"),
  load("appearance-ownership.js"),
  load("context-ownership.js"),
]);

const repos = fs
  .readdirSync(CONTAINER, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(CONTAINER, d.name, "plugin.json")))
  .map((d) => d.name)
  .sort();

if (repos.length === 0) {
  console.error(`🔴 [ownership] 容器里一个插件都没有（${CONTAINER}）——别把它读成「全部合规」。`);
  process.exit(2);
}

const rows = [];
let totalRed = 0;
let totalYellow = 0;

for (const repo of repos) {
  const root = path.join(CONTAINER, repo);
  const c = cmd.runCommandOwnershipCheck(root);
  const g = cfg.runConfigOwnershipCheck(root);
  const a = app.runAppearanceOwnershipCheck(root);
  const x = ctx.runContextOwnershipCheck(root);
  const red = c.violations.length + g.violations.length + a.violations.length + x.violations.length;
  // ⚠️ 命令腿**没有** advisories 字段（它的判据从来就全进 violations，见 `command-ownership.ts` 文件头）⇒ 用可选链
  const yellow =
    (c.advisories?.length ?? 0) + g.advisories.length + a.advisories.length + x.advisories.length;
  totalRed += red;
  totalYellow += yellow;
  const row = {
    repo,
    red,
    yellow,
    redByLeg: { command: c.violations.length, config: g.violations.length, appearance: a.violations.length, context: x.violations.length },
    names: {
      command: c.declaredIds.length + c.runtimeIds.length + c.protocolIds.length,
      configDeclared: g.declaredKeys.length,
      configDefaults: g.defaultsKeys.length,
      recipe: a.declaredRecipeIds.length + a.themeFileRecipeIds.length,
      colorway: a.themeFileColorwayIds.length,
      iconTheme: a.declaredIconThemeIds.length,
      sharedIcon: a.declaredSharedIconIds.length,
      contextKey: x.keys.length,
      contextPublicFace: x.publicFace.length,
    },
  };
  rows.push(row);

  const sites = [
    ...c.violations.map((v) => ["命令", v]),
    ...g.violations.map((v) => ["配置", v]),
    ...a.violations.map((v) => ["外观", v]),
    ...x.violations.map((v) => ["旗子", v]),
  ];
  if (!JSON_OUT) {
    const flag = red > 0 ? "🔴" : yellow > 0 ? "🟡" : "✅";
    console.log(
      `${flag} ${repo.padEnd(24)} 红=${String(red).padStart(2)} 黄=${String(yellow).padStart(2)}` +
        `  [命令 ${c.violations.length} / 配置 ${g.violations.length} / 外观 ${a.violations.length} / 旗子 ${x.violations.length}]`,
    );
    if (WITH_NAMES) {
      console.log(
        `     名称读数：命令 ${row.names.command} / 配置键 ${g.declaredKeys.length}＋弱默认 ${g.defaultsKeys.length}` +
          ` / 配方 ${row.names.recipe} 配色 ${row.names.colorway} 图标主题 ${row.names.iconTheme} 共享图标 ${row.names.sharedIcon}` +
          ` / 旗子 ${row.names.contextKey}（其中约定面写点 ${x.publicFace.length}）`,
      );
    }
    for (const [leg, v] of sites) console.log(`     🔴 ${leg} ${v.file}:${v.line} ${String(v.message).slice(0, 120)}`);
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ container: CONTAINER, totalRed, totalYellow, repos: rows }, null, 2));
} else {
  const worst = rows.slice().sort((p, q) => q.red - p.red);
  console.log(`\n[ownership] 容器 ${CONTAINER} · ${rows.length} 仓`);
  console.log(`[ownership] 合计：红 ${totalRed} 处 / 黄 ${totalYellow} 处（1.49 收紧后口径）`);
  console.log(`[ownership] 明细（按红降序）：${worst.map((r) => `${r.repo}:${r.red}`).join("  ")}`);
  console.log(
    totalRed === 0
      ? "[ownership] ✅ 全部零红——「官方仓需改处 0」这个前提此刻成立。"
      : "[ownership] 🔴 还有红站点：见上面的逐条报点（收紧的前提是 0，先清账再看别的）。",
  );
}

process.exit(totalRed === 0 ? 0 : 1);
