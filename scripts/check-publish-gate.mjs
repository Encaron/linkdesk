/**
 * E6#57.15d：发布门禁——发布前机械卡死，不靠自觉（02-产品身份与版本 §2.6）。
 *
 * 它防的是一句话：「**代码更新上去了，版本号没更**」。四条判据（②的 tag 那半在 CI，见下）：
 *
 *   ① **版本号真的往前走了**——`package.json` 的 version **严格大于**本地已有的最高 release tag。
 *      没往前走 ⇒ 红。（`compareVersions` 用壳里那把**唯一权威**——`src/core/utils/plugin/
 *      semverUtils.ts`，E6#57.1c/02 §2.5 的零依赖实现；**本文件绝不另写第二份比较算法**，
 *      否则门禁的「更大」和程序的「更大」会各自漂移。）
 *   ② **两处版本号一致**——`package.json`.version === `electron/product.json`.version。
 *   ③ **CHANGELOG 里真有 `## v{version}` 段、且段不是空的**。
 *      理由不是文档洁癖，是**用户看得见**：发行说明页与 Release 正文取的都是这一段
 *      （05 §2.4）——缺段/空段 ⇒ 用户点「查看更新内容」看到一片空白。规矩 3.7.3 立的原话：
 *      「bump 了版本号就必须同笔写 `## v<新版本>` 段」。
 *   ④ **打包产物里 `electron/product.json` 真的在**——**不在本文件实现**，见下「④为什么不在这」。
 *
 * ── ④ 为什么不在这（归一化，不是漏）──
 *   ④ 已经由 `scripts/check-packaging-files.mjs --with-artifact` 实现，挂在 `npm run electron:build`
 *   尾部。本文件**刻意不重复一份**：同一个断言写两处，就会一处改了另一处没改。发布链路
 *   （scripts/publish.mjs）会照常跑 electron:build ⇒ ④ 必然被执行，不存在「漏跑」。
 *
 * ── ② 的 tag 那半为什么在 CI 而不在这（刻意的分工，不是漏）──
 *   本仓发布流程是：**先打包，人再打 tag、再推**（#42c「tag 人工打」）。⇒ 本地跑本门禁的那一刻
 *   **tag 还不存在**，在这儿断言「tag === v{version}」只能是**恒真**（比较对象是本脚本自己假定的名字）
 *   ——那正是本仓最忌的假门禁（memory `snapshot-shadows-truth-bug-class` ①：判定挂在假定值上）。
 *   故 tag 一致性放在**知道 tag 的地方**验：CI 里 `--expect-tag ${github.ref_name}`。
 *   🔴 那半**必须真的验**，不是可选项：推错 tag（tag=v0.1.47 而 package.json=0.1.49）时，
 *   CI 会打出 `linkdesk-setup-0.1.49.exe`、下载链接按 `v$version` 拼成
 *   `.../releases/download/v0.1.49/...`，而线上 Release 挂在 v0.1.47 上 ⇒ **下载链接 404**。
 *
 * ⚠️ ① 看的是**本地** tag（不联网、不动凭证）。远端有新 tag 未拉下来 ⇒ 先 `git fetch --tags`。
 *   本地一个 tag 都没有 ⇒ 判为「首次发布」放行**并出声**（新版本号无从比较，不是通过，是无可比对象）。
 * 🔴 CI 里**必须 `fetch-depth: 0`**（checkout 默认只取 1 个提交、**不带 tag**）——否则 tag 列表恒为空，
 *   ① 就退化成「每次都判首次发布」的**恒真门禁**。这一条写进 build.yml 的 checkout 注释里了。
 *
 * 用法：
 *   node scripts/check-publish-gate.mjs                      # 本地发布前 ①②③
 *   node scripts/check-publish-gate.mjs --expect-tag v0.1.50 # CI：额外断言 tag === v{package.json version}
 *   node scripts/check-publish-gate.mjs --changelog-body     # 只输出 `## v{version}` 段正文到 stdout（CI 用）
 *   node scripts/check-publish-gate.mjs --changelog-date     # 只输出段头日期到 stdout（CI 用；缺则空）
 *   node scripts/check-publish-gate.mjs --self-test
 * 退出码 0 = 全过；1 = 有红拦（打印到 stderr）。
 *
 * 📌 `--changelog-body` / `--changelog-date` 是为了**把 CI 里那段就地 bash 归一到这里**
 *    （`.github/workflows/build.yml` 原注释自陈：「#57.15d 落地后可把它接回这一步之前」）。
 *    从此「段存不存在、正文长什么样、日期从哪来」只有一处实现，CI 与本地不会各说各话。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 🔴 壳里那把唯一权威的版本比较（E6#57.1c）。Node ≥24 直接吃 .ts（类型剥离）；
//    本仓 engines 要求 node >=24 —— 若哪天类型剥离不可用，这里会**当场抛错**（不是静默降级），
//    属于可接受的失败方式：门禁宁可炸，不可假装查过。
import { compareVersions } from "../src/core/utils/plugin/semverUtils.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PKG = join(ROOT, "package.json");
const PRODUCT = join(ROOT, "electron", "product.json");
const CHANGELOG = join(ROOT, "CHANGELOG.md");

// ─────────────────────────── 纯判据（--self-test 注入输入） ───────────────────────────

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 取 CHANGELOG 里 `## v{version}` 那一段的正文（到下一个 `## ` 为止），去掉段头后的前导空行。
 * 找不到该段 → null（调用方判红，**不静默当空**）。段在但正文为空 → 返回 ""（同样判红——空段
 * 在用户眼里和缺段一样：发行说明页一片空白）。
 *
 * ⚠️ 结尾那个 `([^0-9.]|$)` 是防前缀误匹配的（v0.1.4 不该匹配到 v0.1.47 那一段）。
 *    版本里的 `.` 这里按**字面**转义（比原先 CI 里的 awk 更严——awk 的 `.` 是通配符）。
 */
function changelogSection(text, version) {
  const lines = text.split(/\r?\n/);
  const head = new RegExp(`^## v${escapeRe(version)}([^0-9.]|$)`);
  const start = lines.findIndex((l) => head.test(l));
  if (start < 0) return null;
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) break;
    body.push(lines[i]);
  }
  // 去前导空行（对标 CI 里那句 sed '/./,$!d'）
  while (body.length > 0 && body[0].trim() === "") body.shift();
  return body.join("\n");
}

/** 取段头 `## v{version}（{date}）` 里的日期。格式不对/没写 → ""（调用方回落构建日，不拦发布）。 */
function changelogDate(text, version) {
  const head = new RegExp(`^## v${escapeRe(version)}（`);
  const line = text.split(/\r?\n/).find((l) => head.test(l));
  if (!line) return "";
  const m = /（([^）]*)）/.exec(line);
  return m ? m[1] : "";
}

/**
 * 判据①：version 是否真的往前走了一步。
 *
 * **两种模式**——差别只在一件事：**看的那一刻，本次要发的那个 tag 是否已经存在**。
 *   · **本地模式**（默认，`npm run publish` 走的就是它）：此刻**还没打 tag**。若 `v{version}`
 *     已存在 ⇒ 这版早发过了（或忘了 bump 想重发同版）⇒ 红。**「忘了 bump」只有这里抓得到。**
 *   · **CI 模式**（`--expect-tag`）：tag 就是这次推送本身，**必然已存在** ⇒ 拿它自比毫无信息
 *     （每次都红），故改判「**严格大于其余所有 tag**」。
 *     ⚠️ **CI 模式抓不到「同一版本号重复发布」**——光看 tag 分不出「刚推的这个」和「上个月发的
 *     那个」，它们是同一个 ref 名。那个缺口由本地模式 + git 本身（重推已存在的 tag 会被拒）
 *     共同兜住，此处**如实记着，不假装覆盖**。
 *
 * tag 一个都没有（除自己）⇒ 判为**首次发布**，放行**并出声**（不是「通过」，是无可比对象）。
 */
function judgeVersionAdvance(version, tags, { selfTagIsThisRelease = false } = {}) {
  const self = `v${version}`;
  // CI 模式：把自己滤掉再比；本地模式：自己在列 = 红
  const others = selfTagIsThisRelease ? tags.filter((t) => t !== self) : tags;
  if (!selfTagIsThisRelease && others.includes(self)) {
    return {
      ok: false,
      msg:
        `① 版本号 —— ${self} 这个 tag 已经存在 ⇒ 这一版已经发布过（或你忘了 bump 想重发同一版）。\n` +
        `      同一版本号重复发布会让用户的版本比较失效（「已是最新」永远为真）。先 bump。`,
    };
  }
  if (others.length === 0) {
    return {
      ok: true,
      msg: selfTagIsThisRelease
        ? `① 版本号 —— 除本次推送的 ${self} 外没有任何 tag ⇒ 判为**首次发布**，无从比较（不是「通过」，是没得比）`
        : `① 版本号 —— 本地一个 tag 都没有 ⇒ 判为**首次发布**，新版本号无可比对象（不是「通过」，是没得比）`,
    };
  }
  const highest = others.reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b));
  if (compareVersions(self, highest) > 0) {
    return {
      ok: true,
      msg: selfTagIsThisRelease
        ? `① 版本号 —— 本次推送的 ${self} > 其余最高 tag ${highest}`
        : `① 版本号 —— ${self} > 上一版 ${highest}`,
    };
  }
  return {
    ok: false,
    msg: selfTagIsThisRelease
      ? `① 版本号 —— 本次推送的 tag ${self} 没有往前走：已有更高的 ${highest}。\n` +
        `      推一个旧版本号的 tag ⇒ Release 会挂到那个旧 tag 上，而产物/下载链接按 package.json 的\n` +
        `      ${self} 拼 ⇒ 更新器按版本号比较会认为用户在「降级」，更新链整条失效。`
      : `① 版本号 —— 没有往前走：当前 ${self}，已有最高 tag ${highest}。\n` +
        `      这正是「代码更新上去了，版本号没更」。先 bump（走 version-bump skill 判类别）。`,
  };
}

/** 判据②：两处版本号一致。 */
function judgeVersionMatch(pkgVersion, productText) {
  if (typeof productText !== "string") {
    return { ok: false, msg: `② 版本一致 —— 读不到 ${PRODUCT}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(productText);
  } catch (e) {
    return { ok: false, msg: `② 版本一致 —— product.json 不是合法 JSON：${e.message}` };
  }
  if (parsed.version !== pkgVersion) {
    return {
      ok: false,
      msg:
        `② 版本一致 —— product.json = ${JSON.stringify(parsed.version)}，package.json = ${pkgVersion}。\n` +
        `      发布链路里 product.json 由 scripts/write-product-json.mjs 写；手动改它 = 手抄第二份版本号（§2.3 明禁）。`,
    };
  }
  return { ok: true, msg: `② 版本一致 —— package.json === product.json === ${pkgVersion}` };
}

/** 判据②的 CI 那半：推的 tag === v{version}。 */
function judgeTagMatch(pkgVersion, tag) {
  const want = `v${pkgVersion}`;
  if (tag === want) return { ok: true, msg: `② Tag 一致 —— ${tag} === v{package.json version}` };
  return {
    ok: false,
    msg:
      `② Tag 一致 —— 推的 tag 是 ${tag}，但 package.json 的版本是 ${pkgVersion}（应为 ${want}）。\n` +
      `      不拦的话：产物叫 linkdesk-setup-${pkgVersion}.exe、下载链接按 v${pkgVersion} 拼，\n` +
      `      而 Release 挂在这个 tag 上 ⇒ **下载链接 404**。`,
  };
}

/** 判据③：段存在且非空。 */
function judgeChangelog(section) {
  if (section === null) {
    return {
      ok: false,
      msg:
        `③ CHANGELOG —— 找不到 \`## v{version}\` 段。\n` +
        `      不是文档洁癖：发行说明页与 Release 正文取的就是这一段 ⇒ 缺段 = 用户点「查看更新内容」看到一片空白。\n` +
        `      规矩（3.7.3 立）：bump 了版本号就必须同笔写 \`## v<新版本>\` 段。`,
    };
  }
  if (section.trim() === "") {
    return {
      ok: false,
      msg: `③ CHANGELOG —— \`## v{version}\` 段在，但正文是空的 ⇒ 发行说明页照样一片空白（与缺段在用户眼里无差别）`,
    };
  }
  return { ok: true, msg: `③ CHANGELOG —— \`## v{version}\` 段在位，${section.split("\n").length} 行` };
}

function fail(msg) {
  process.stderr.write(`\n🔴 ${msg}\n`);
}

// ────────────────────────────────── 自测 ──────────────────────────────────

function runSelfTest() {
  const CL = [
    "# Changelog",
    "",
    "## v0.1.49（2026-09-12）",
    "",
    "- 安装器覆盖安装方向守卫落地",
    "- 状态栏「已隐藏」提示",
    "",
    "## v0.1.48（2026-09-11）",
    "",
    "- 旧版一条",
    "",
    "## v0.1.4（2026-01-01）",
    "",
    "- 上古一条",
    "",
  ].join("\n");

  const cases = [];
  const push = (tag, result, wantOk) => cases.push([tag, result, wantOk]);

  // ①
  push("① 版本前进", judgeVersionAdvance("0.1.50", ["v0.1.49", "v0.1.48"]), true);
  push("① 忘了 bump（v{version} 已存在）", judgeVersionAdvance("0.1.49", ["v0.1.49", "v0.1.48"]), false);
  push("① 版本倒退", judgeVersionAdvance("0.1.48", ["v0.1.49", "v0.1.48"]), false);
  push("① 首次发布（无任何 tag）", judgeVersionAdvance("0.1.50", []), true);
  push("① 只有 v{version} 自己（重发同版）", judgeVersionAdvance("0.1.50", ["v0.1.50"]), false);
  push("① 相邻上一版（0.1.49 > 0.1.48）", judgeVersionAdvance("0.1.49", ["v0.1.48"]), true);
  push("① 跨次版本比较（0.2.0 > 0.1.99）", judgeVersionAdvance("0.2.0", ["v0.1.99"]), true);
  push("① 预发布小于正式（0.2.0-rc1 < 0.2.0）", judgeVersionAdvance("0.2.0-rc1", ["v0.2.0"]), false);

  // ① 的 CI 模式（--expect-tag）。**同一组输入在两种模式下结论不同**——这正是模式存在的理由，
  //    下面第 1/3 两例就是「自比 vs 与他比」的对照，证明开关不是摆设。
  const CI = { selfTagIsThisRelease: true };
  push("①[CI] 本次推送即最高（与本地模式相反：同一输入本地判红）", judgeVersionAdvance("0.1.49", ["v0.1.49", "v0.1.48"], CI), true);
  push("①[CI] 推了旧版本号的 tag（对比出倒退）", judgeVersionAdvance("0.1.48", ["v0.1.49", "v0.1.48"], CI), false);
  push("①[CI] 首次发布（除自己外没 tag）", judgeVersionAdvance("0.1.50", ["v0.1.50"], CI), true);
  push("①[CI] 跨次版本前进", judgeVersionAdvance("0.2.0", ["v0.1.99", "v0.2.0"], CI), true);

  // ②
  push("② 两处一致", judgeVersionMatch("0.1.49", JSON.stringify({ version: "0.1.49" })), true);
  push("② 两处不一致", judgeVersionMatch("0.1.50", JSON.stringify({ version: "0.1.0" })), false);
  push("② 读不到文件", judgeVersionMatch("0.1.50", null), false);
  push("② 坏 JSON", judgeVersionMatch("0.1.50", "{"), false);
  push("② Tag 一致", judgeTagMatch("0.1.50", "v0.1.50"), true);
  push("② Tag 不一致（推错 tag）", judgeTagMatch("0.1.49", "v0.1.50"), false);

  // ③
  push("③ 段存在且非空", judgeChangelog(changelogSection(CL, "0.1.49")), true);
  push("③ 段不存在", judgeChangelog(changelogSection(CL, "0.1.80")), false);
  push("③ 段是空的", judgeChangelog(changelogSection("## v0.1.50（2026-09-12）\n\n## v0.1.49（x）\n- a\n", "0.1.50")), false);
  // 前缀陷阱：v0.1.4 的段在，但查 v0.1.49 不该命中它
  push(
    "③ 前缀不误匹配（v0.1.4 段 ≠ v0.1.49 段）",
    { ok: changelogSection(CL, "0.1.49")?.includes("覆盖安装方向") === true, msg: "命中正确段" },
    true
  );
  push(
    "③ 前缀不误匹配（查不存在的 v0.1.4x）",
    { ok: changelogSection(CL, "0.1.4x") === null, msg: "应为 null" },
    true
  );
  // 段边界：不该越界到下一条
  push(
    "③ 段边界（不吞下一条）",
    { ok: changelogSection(CL, "0.1.49")?.includes("旧版一条") === false, msg: "没越界" },
    true
  );
  // 日期
  push("③ 段头日期", { ok: changelogDate(CL, "0.1.49") === "2026-09-12", msg: changelogDate(CL, "0.1.49") }, true);
  push("③ 段头无日期", { ok: changelogDate(CL, "0.1.4x") === "", msg: "" }, true);

  let bad = 0;
  for (const [tag, result, wantOk] of cases) {
    const pass = result.ok === wantOk;
    if (!pass) bad++;
    process.stdout.write(
      `${pass ? "✅" : "🔴"} ${tag} ${wantOk ? "应过" : "应红"} —— 实得 ${result.ok ? "过" : "红"}\n`
    );
    if (!pass) fail(result.msg);
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ 自测全过（${cases.length} 例：负例确实会红、正例确实会过）——门禁不是在恒绿。\n`
      : `\n🔴 自测 ${bad} 例不符。\n`
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function localVersionTags() {
  const out = execFileSync("git", ["tag", "--list", "v*"], { cwd: ROOT, encoding: "utf8" });
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const pkgVersion = JSON.parse(readFileSync(PKG, "utf8")).version;
  const changelogText = readFileSync(CHANGELOG, "utf8");

  // CI 用的两个纯输出模式（stdout 只给结果，便于 shell 捕获）
  if (process.argv.includes("--changelog-body")) {
    const section = changelogSection(changelogText, pkgVersion);
    const judged = judgeChangelog(section);
    if (!judged.ok) {
      fail(judged.msg);
      process.exit(1);
    }
    process.stdout.write(section + "\n");
    return;
  }
  if (process.argv.includes("--changelog-date")) {
    const date = changelogDate(changelogText, pkgVersion);
    if (date === "") process.stderr.write(`⚠️  段头 '## v${pkgVersion}' 没带（YYYY-MM-DD）日期\n`);
    process.stdout.write(date + "\n");
    return;
  }

  const checks = [];
  const expectIdx = process.argv.indexOf("--expect-tag");
  let expectedTag = null;
  if (expectIdx >= 0) {
    expectedTag = process.argv[expectIdx + 1];
    if (!expectedTag) {
      fail("--expect-tag 后面要跟一个 tag 名");
      process.exit(1);
    }
  }
  // 传了 --expect-tag ⇒ 这是 CI 的发布运行，此刻 tag 必然已存在（见 judgeVersionAdvance 头注）
  checks.push(judgeVersionAdvance(pkgVersion, localVersionTags(), { selfTagIsThisRelease: expectedTag !== null }));
  checks.push(judgeVersionMatch(pkgVersion, existsSync(PRODUCT) ? readFileSync(PRODUCT, "utf8") : null));
  checks.push(judgeChangelog(changelogSection(changelogText, pkgVersion)));
  if (expectedTag !== null) {
    checks.push(judgeTagMatch(pkgVersion, expectedTag));
  }

  for (const c of checks) {
    process.stdout.write(`${c.ok ? "✅" : "🔴"} ${c.msg}\n`);
  }
  process.stdout.write(
    `ℹ️  判据④（产物 asar 里真有 electron/product.json）不在此处——由 scripts/check-packaging-files.mjs ` +
      `挂在 electron:build 尾部执行，发布链路必然跑到。\n`
  );

  if (checks.some((c) => !c.ok)) {
    fail(`版本 ${pkgVersion} 未过发布门禁，拒绝发布。`);
    process.exit(1);
  }
}

main();
