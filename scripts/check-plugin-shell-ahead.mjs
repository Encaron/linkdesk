#!/usr/bin/env node
/**
 * G5 · 第一方流程腿——「插件跑到壳前面」在源头出现一次就报（「插件最低壳版本门禁」2026-10-06）。
 *
 * ── 为什么是第一方特有（案卷 04 §2.1）──
 *   第三方只下**已发布壳**，结构上不会依赖未发布的壳；只有我们手上同时有「未发布的 dev 壳」和
 *   「1–2 分钟就能发的插件」⇒ 本次事故（settings 1.0.35 依赖 PluginCard，而最新已发布壳是 v0.2.41）
 *   的成因。⇒ 这条检查属于**我们的发布链**，落壳仓；⛔ **不进 SDK／作者面**（污染第三方契约、
 *   「最新已发布壳」是作者侧不该有的信息——案卷 00 §三推论 3）。
 *
 * 判据（案卷 04 §2.2）：**地板_实际（G1 账本 ＋ G2 同一算法）vs 最新已发布壳（git tag 里最新的 v*）**
 *   ⇒ 地板 > 最新已发布壳 ⇒ 🟡 黄灯：「这只插件要求一个还没发布的壳——用户装不上，或者装上就崩」。
 *   软硬已定（案卷 00 §十 D3）：**黄灯提示 ＋ 人工确认，但必须让人看见（⛔ 不许静默）**——
 *   「插件先于壳」在 dev 攒批节奏里可能是故意的，硬红会天天误伤（先例：发行说明累计跳版）。
 *
 * ── 归一化：判据本体不在本文件 ──
 *   · 地板计算 = SDK `ui-min-app-version` 腿的同一批导出（`loadUiSurfaceLedger` / `collectUiImportNames` /
 *     `computeUiFloor`，从 dist 取——`check-scaffold.mjs` 同款先例）：**地板公式唯一算点在 SDK**（案卷 06 §九
 *     9.2 冻结项），本脚本⛔不算第二份；
 *   · 黄灯判定 ＋ 「最新已发布壳」取数 = `scripts/lib/plugin-shell-ahead.mjs`（收录链
 *     `sync-official-catalog.mjs` 的声明轴与 `check-npm-release.mjs` 的 npm 轴护栏共用同一份）。
 *
 * ── 时点（什么「源头」）──
 *   插件发布走各插件仓的 SDK CLI（壳拦不到），壳侧看得见的两个源头是**官方目录收录**与**npm/mark**：
 *   · 收录链（`sync-official-catalog.mjs`）每次跑都会带上本判据的**声明轴**（条目里现成的 minAppVersion）；
 *   · 本脚本是**源码轴主腿**（声明低于实际的存量只有扫源码才抓得住——本事故形态），收录前
 *     `npm run check:plugin-shell-ahead` 跑一遍；自测挂 `npm run check` 链（判据有自测＋已接线，05 §三）。
 *   ⚠️ 黄灯**永不拦**（exit 0）；只有「**未核验**」（账本读不到／SDK dist 拿不到／manifest 读不了／
 *   导入名账本不认识）才 exit 1——那是「判不了」，不是「判过」，照 fail-closed 纪律红着喊。
 *
 * 用法：
 *   node scripts/check-plugin-shell-ahead.mjs                    # 扫容器下全部插件仓（缺省 official）
 *   node scripts/check-plugin-shell-ahead.mjs --root <dir>       # 指定容器（缺省 $LDK_PLUGINS_DIR 或 E:/linkdesk-plugins/official）
 *   node scripts/check-plugin-shell-ahead.mjs --plugin <dir> ... # 显式给插件仓目录（可多个）
 *   node scripts/check-plugin-shell-ahead.mjs --self-test        # 判据自测（纯函数注入，不碰盘不碰 git 不碰 dist）
 *
 * 退出码：0 = 跑完（黄灯只是出声）；1 = 有「未核验」——判据没有依据，**不许当通过**。
 */

import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseJsonc } from "jsonc-parser";

import { exportsAheadOfShell, flattenLedger, judgeShellAhead, latestPublishedShell } from "./lib/plugin-shell-ahead.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
const SDK_DIR = join(ROOT, "packages", "plugin-sdk");
/** 断言判据模块——与作者跑 `lint` / `build` 是**同一个函数**（check-scaffold.mjs 同款先例） */
const SDK_FLOOR_MODULE = join(SDK_DIR, "dist", "eslint", "checks", "ui-min-app-version.js");
const SDK_SRC_DIR = join(SDK_DIR, "src");
/** 缺省容器——与 audit-nonnaming / audit-plugin-dead-css 同一口径（env 可覆写；dev 工具件，邻居仓不是本仓） */
const DEFAULT_CONTAINER = process.env.LDK_PLUGINS_DIR || "E:/linkdesk-plugins/official";

/* ── 「最新已发布壳」的取数（判据本体在 lib；这里只管 git）────────────────── */

function localShellTags() {
  const out = execFileSync("git", ["tag", "--list", "v*"], { cwd: ROOT, encoding: "utf8" });
  return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

/* ── SDK dist 判据函数的懒加载（落后于 src ⇒ 先构建一次；拿不到 ⇒ null，主流程 fail-closed）── */

function newestMtime(dir) {
  let newest = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    newest = Math.max(newest, e.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs);
  }
  return newest;
}

function ensureSdkFloorModule() {
  if (existsSync(SDK_FLOOR_MODULE)) {
    const stale =
      existsSync(SDK_SRC_DIR) && newestMtime(SDK_SRC_DIR) > statSync(SDK_FLOOR_MODULE).mtimeMs;
    if (!stale) return true;
  }
  // Windows 上 npm 只能经 shell 启动（check-scaffold 同款；两个值都是固定字面量，无外部输入）
  const r = spawnSync(`npm run --prefix "${SDK_DIR}" build`, { cwd: ROOT, encoding: "utf8", shell: true });
  return existsSync(SDK_FLOOR_MODULE) && r.status === 0;
}

function loadFloorApi() {
  if (!ensureSdkFloorModule()) return { api: null, why: `拿不到 SDK 的判据模块（${SDK_FLOOR_MODULE}）——先 \`npm run --prefix packages/plugin-sdk build\`` };
  const req = createRequire(import.meta.url);
  const mod = req(SDK_FLOOR_MODULE);
  for (const fn of ["loadUiSurfaceLedger", "collectUiImportNames", "computeUiFloor"]) {
    if (typeof mod[fn] !== "function") return { api: null, why: `SDK dist 的 ui-min-app-version 少了导出 ${fn}——dist 与源码不同步` };
  }
  return { api: mod, why: null };
}

/* ── 插件仓发现 ── */

function parseArgs(argv) {
  const o = { root: null, plugins: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") o.root = argv[++i];
    else if (a === "--plugin") o.plugins.push(argv[++i]);
  }
  return o;
}

function discoverPluginDirs({ root, plugins }) {
  if (plugins.length > 0) return plugins.map((p) => resolve(p));
  const base = resolve(root ?? DEFAULT_CONTAINER);
  if (!existsSync(base)) return { error: `容器目录不存在：${base}（用 --root / --plugin 指定，或设 LDK_PLUGINS_DIR）` };
  const dirs = readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(base, e.name))
    .filter((d) => existsSync(join(d, "plugin.json")))
    .sort();
  return { dirs };
}

/* ── 主流程 ── */

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const tags = localShellTags();
  const latestShell = latestPublishedShell(tags);
  if (latestShell === null) {
    process.stdout.write(`ℹ️  本地一个 release tag 都没有——「最新已发布壳」无可比对象，本判据不判（不是通过，是没得比）。\n`);
    return 0;
  }
  process.stdout.write(`[plugin-shell-ahead] 最新已发布壳：v${latestShell}（本地 git tag，共 ${tags.length} 个）\n`);

  const { api, why } = loadFloorApi();
  if (!api) {
    process.stderr.write(`🔴 [plugin-shell-ahead] 未核验：${why}\n`);
    return 1;
  }
  const ledger = api.loadUiSurfaceLedger();
  if (ledger === null) {
    process.stderr.write(`🔴 [plugin-shell-ahead] 未核验：读不到 SDK 随包账本（packages/plugin-sdk/schemas/ui-surface.json）——判据没有依据\n`);
    return 1;
  }

  const found = discoverPluginDirs(parseArgs(process.argv.slice(2)));
  if (found.error) {
    process.stderr.write(`🔴 [plugin-shell-ahead] 未核验：${found.error}\n`);
    return 1;
  }
  if (found.dirs.length === 0) {
    process.stderr.write(`🔴 [plugin-shell-ahead] 未核验：容器下一个插件仓都没发现（要 <仓>/plugin.json 在场）\n`);
    return 1;
  }

  const warns = [];
  const unverifiable = [];
  let okCount = 0;

  for (const dir of found.dirs) {
    const name = dir.split(/[\\/]/).pop();
    const manifestPath = join(dir, "plugin.json");
    let declared = null;
    const jsonErrors = [];
    try {
      const parsed = parseJsonc(readFileSync(manifestPath, "utf8"), jsonErrors, { allowTrailingComma: true });
      if (jsonErrors.length > 0) {
        unverifiable.push(`${name}：plugin.json 不是合法 JSONC——地板的「声明」半边判不了`);
        continue;
      }
      declared = typeof parsed?.minAppVersion === "string" ? parsed.minAppVersion : null;
    } catch (e) {
      unverifiable.push(`${name}：plugin.json 读不了（${e instanceof Error ? e.message : String(e)}）`);
      continue;
    }

    const imports = api.collectUiImportNames(dir);
    const floor = api.computeUiFloor(ledger, imports.map((i) => i.name));
    if (floor.missing.length > 0) {
      // 账本不认识的导出 ⇒ 地板可能被低估 ⇒ 漏黄灯方向——按「未核验」处理（照 G2 fail-closed 同理）
      unverifiable.push(`${name}：源码导入了账本里没有的导出（${floor.missing.join("、")}）——账本落后或拼错，地板判不了`);
      continue;
    }

    const verdict = judgeShellAhead({ declared, actualFloor: floor.floor, latestShell });
    const driver = floor.driver ? `${floor.driver.name}@${floor.driver.since}` : `基线 ${floor.baseline}`;
    if (verdict.level === "warn") {
      warns.push({ name, verdict, driver });
      process.stdout.write(`⚠️  ${name} —— ${verdict.msg}\n      地板出处：${driver}（导入 ${imports.map((i) => i.name).join("、") || "无"}）\n`);
    } else if (verdict.level === "unknown") {
      process.stdout.write(`ℹ️  ${name} —— ${verdict.msg}\n`);
    } else {
      okCount++;
    }
  }

  if (warns.length > 0) {
    process.stdout.write(
      `\n🟡 [plugin-shell-ahead] 黄灯（G5 · 不拦，但必须让人看见）：${warns.length} 只插件要求一个还没发布的壳\n` +
        `   ${warns.map((w) => w.name).join("、")}\n` +
        `   ⇒ 这些插件的目录收录／发布若是有意抢先（dev 攒批节奏）请知悉；否则先发壳。\n`,
    );
  }
  process.stdout.write(`[plugin-shell-ahead] ${found.dirs.length} 仓扫完：⚠️ ${warns.length} · ✅ ${okCount} · 未核验 ${unverifiable.length}\n`);

  if (unverifiable.length > 0) {
    process.stderr.write(
      `\n🔴 [plugin-shell-ahead] 未核验 ${unverifiable.length} 处（**未核验 ≠ 通过**，不许静默放过）：\n` +
        unverifiable.map((u) => `   · ${u}`).join("\n") + "\n",
    );
    return 1;
  }
  return 0;
}

/* ── 自测（纯函数注入——不碰盘、不碰 git、不碰 SDK dist；check 链里真跑的就是这份）── */

function runSelfTest() {
  const cases = [];
  const push = (tag, pass, got) => cases.push({ tag, pass: Boolean(pass), got: String(got) });
  const eq = (got, want) => JSON.stringify(got ?? null) === JSON.stringify(want ?? null);

  // latestPublishedShell：取最高、剥 v、只认 x.y.z
  push("tag 取最高（乱序 ＋ 逐位比较 0.2.100 > 0.2.41）", eq(latestPublishedShell(["v0.2.41", "v0.2.9", "v0.2.100"]), "0.2.100"), latestPublishedShell(["v0.2.41", "v0.2.9", "v0.2.100"]));
  push("预发布 tag 不算「已发布壳」", eq(latestPublishedShell(["v0.2.41", "v0.2.42-rc1"]), "0.2.41"), latestPublishedShell(["v0.2.41", "v0.2.42-rc1"]));
  push("无 tag ⇒ null（首次发布，无可比对象）", eq(latestPublishedShell([]), null), "null");
  push("非 v 前缀的杂 tag 不影响", eq(latestPublishedShell(["v0.2.41", "something-else"]), "0.2.41"), latestPublishedShell(["v0.2.41", "something-else"]));

  // judgeShellAhead：本事故正控（案卷 04 §2.2：0.2.48 > 0.2.41 ⇒ 当场报）
  const incident = judgeShellAhead({ declared: "0.2.32", actualFloor: "0.2.48", latestShell: "0.2.41" });
  push("🔴 事故正控：声明 0.2.32 被实际 0.2.48 顶上来 > v0.2.41 ⇒ 黄灯", incident.level === "warn", incident.level);
  push("黄灯报文带两个号 ＋ 事故原话（要的 ＋ 已发布的）", /还没发布的壳/.test(incident.msg) && /0\.2\.48/.test(incident.msg) && /0\.2\.41/.test(incident.msg), incident.msg);
  // 边界：地板 == 已发布壳 ⇒ 不报（≤ 不算越界，05 §二负控 6 同口径）
  push("边界相等（0.2.41 vs v0.2.41）⇒ ok", judgeShellAhead({ declared: "0.2.41", actualFloor: null, latestShell: "0.2.41" }).level === "ok", "ok");
  push("地板低于已发布壳 ⇒ ok", judgeShellAhead({ declared: "0.2.13", actualFloor: "0.2.20", latestShell: "0.2.41" }).level === "ok", "ok");
  // 声明轴单独也能报（作者手写了未来号／收录链只有条目声明可判）
  push("仅声明超壳（无 ui 消费）⇒ 黄灯", judgeShellAhead({ declared: "0.2.50", actualFloor: null, latestShell: "0.2.41" }).level === "warn", "warn");
  // 取 max：声明比实际还高 ⇒ 按高的报
  push("地板取 max（声明 0.2.50 > 实际 0.2.48）", eq(judgeShellAhead({ declared: "0.2.50", actualFloor: "0.2.48", latestShell: "0.2.41" }).combined, "0.2.50"), "0.2.50");
  // 无 tag ⇒ unknown（出声不判，不是通过）
  push("无 tag ⇒ unknown", judgeShellAhead({ declared: "0.2.50", actualFloor: null, latestShell: null }).level === "unknown", "unknown");
  // 无地板（未声明 ＋ 未消费 ui）⇒ ok 静默
  push("无可判地板 ⇒ ok", judgeShellAhead({ declared: null, actualFloor: null, latestShell: "0.2.41" }).level === "ok", "ok");

  // exportsAheadOfShell：npm 轴护栏（04 §2.3）
  const LED = { PluginCard: "0.2.48", Button: "0.2.13", OpenWithPicker: "0.2.49" };
  push("npm 轴：since 高于已发布壳的导出清单（升序）", eq(exportsAheadOfShell(LED, "0.2.41"), [{ name: "PluginCard", since: "0.2.48" }, { name: "OpenWithPicker", since: "0.2.49" }]), JSON.stringify(exportsAheadOfShell(LED, "0.2.41")));
  push("npm 轴：壳追上 ⇒ 空表", eq(exportsAheadOfShell(LED, "0.2.49"), []), "[]");
  push("npm 轴：无已发布壳 ⇒ 空表（不判）", eq(exportsAheadOfShell(LED, null), []), "[]");

  // flattenLedger：四栏拍平 ＋ 半份账本 ⇒ null（未核验口径与 SDK loadUiSurfaceLedger 一致）
  push("账本拍平（四栏 → 一张表）", flattenLedger({ components: { A: { since: "0.2.13" } }, hooks: { B: { since: "0.2.20" } }, helpers: {}, types: {} })?.A === "0.2.13", "0.2.13");
  push("半份账本（缺栏）⇒ null", flattenLedger({ components: { A: { since: "0.2.13" } } }) === null, "null");
  push("账本条目没有合法 since ⇒ null", flattenLedger({ components: { A: { since: "dev" } }, hooks: {}, helpers: {}, types: {} }) === null, "null");

  let bad = 0;
  for (const c of cases) {
    if (!c.pass) bad++;
    process.stdout.write(`${c.pass ? "✅" : "🔴"} ${c.tag} —— 实得 ${c.got}\n`);
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ check-plugin-shell-ahead self-test 全过（${cases.length} 例：事故正控当场黄、边界不误伤、无 tag 不假判）。\n`
      : `\n🔴 check-plugin-shell-ahead self-test ${bad} 例不符。\n`,
  );
  return bad === 0 ? 0 : 1;
}

process.exit(main());
