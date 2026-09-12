/**
 * 机械检查：**软件版本号必须在 CHANGELOG.md 里有对应的一段**（E6#57.15e · 红灯）。
 *
 * 一句话：把 3.7.3 那条死规矩从**发布那一下**提到**每次 `npm run check`**。
 *
 * ── 它补的洞（实测，不是推测）──
 *   「`package.json` 的 version ↔ `CHANGELOG.md` 的 `## v{version}` 段」这条断言**早就存在**，
 *   但只长在 `scripts/check-publish-gate.mjs`（E6#57.15d③）里，**只在发布时跑**。
 *   于是「bump 了版本号却没写段」这件事，从**改动那一笔**到**发布那一下**之间，
 *   **没有任何门禁看得见**——中间可以隔着任意多个提交。等发布门禁红的时候，改动早已入库。
 *   本脚本就是那段空窗期的哨兵。（`npm run check` 的 30 道检查此前一条都不读 CHANGELOG。）
 *
 * ── 判据（可证伪，见 --self-test）──
 *   `package.json`.version ⇒ 取 `CHANGELOG.md` 的 `## v{version}` 段：
 *     · 找不到该段        → 🔴 红
 *     · 段在但正文是空的  → 🔴 红（空段在用户眼里与缺段无差别：发行说明页一片空白）
 *     · 段在且非空        → ✅ 绿
 *   ⚠️ **日期不在此判**——缺 `（YYYY-MM-DD）` 只 warning、不拦（沿用 #57.15d③ 既有行为，
 *      见 `check-publish-gate.mjs --changelog-date`；本脚本**不改那条决定**）。
 *
 * ── 切段规则从哪来 ──
 *   `scripts/lib/changelog-section.mjs`——与发布门禁**共用同一份**，本文件**不复述第二个正则**
 *   （`check-scaffold.mjs` 闸 3：解析规则是别人的实现，从源码现场抽，绝不手抄第二份）。
 *
 * ── 这条尺子落地后的真实代价（写在这里，免得下一个人以为是 bug）──
 *   **改 `package.json` 版本号的那一笔提交，必须同笔把 `## v<新版本>` 段写进 CHANGELOG.md**，
 *   否则 `npm run check` 红。这正是 3.7.3 想要的形状。
 *
 * ── 与 commit 类别前缀那条的关系 ──
 *   两条尺子防的是同一件事的两半：`scripts/check-version-bump.mjs` 管**提交消息写得对不对**
 *   （lefthook `commit-msg` 硬拦），本脚本管**版本账记得全不全**（`npm run check` 红灯）。
 *
 * 用法：node scripts/check-changelog-section.mjs
 *       node scripts/check-changelog-section.mjs --self-test
 * 退出码 0 = 过；1 = 有红拦（打印到 stderr）。
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { changelogSection } from "./lib/changelog-section.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PKG = join(ROOT, "package.json");
const CHANGELOG = join(ROOT, "CHANGELOG.md");

/**
 * 纯判据（`--self-test` 注入输入）。返回 `{ ok, msg }`。
 *
 * `section` 的三种取值都必须**各自成例**：`null`（缺段）/ `""`（空段）/ 非空（过）。
 * ⚠️ 别把 `null` 和 `""` 合并成一句「没内容」——它们在用户眼里一样，在**给维护者的提示**里
 *    不一样：一个是「忘了写段」，一个是「写了段但没填」。提示指错方向 = 白跑一趟。
 */
export function judgeChangelogSection(version, section) {
  if (section === null) {
    return {
      ok: false,
      msg:
        `找不到 \`## v${version}\` 段（CHANGELOG.md）。\n` +
        `      规矩（3.7.3 立）：bump 了版本号就必须**同笔**写下 \`## v${version}（YYYY-MM-DD）\` 段。\n` +
        `      不补的后果不是文档洁癖——发行说明页与 GitHub Release 正文取的都是这一段，\n` +
        `      缺段 ⇒ 用户点「查看更新内容」看到一片空白。`,
    };
  }
  if (section.trim() === "") {
    return {
      ok: false,
      msg:
        `\`## v${version}\` 段在，但正文是**空的**（CHANGELOG.md）。\n` +
        `      段头写了、条款没写 ⇒ 发行说明页照样一片空白（与缺段在用户眼里无差别）。\n` +
        `      补上这一版的 feat/fix/breaking 条款。`,
    };
  }
  return { ok: true, msg: `\`## v${version}\` 段在位，${section.split("\n").length} 行` };
}

function fail(msg) {
  process.stderr.write(`\n🔴 ${msg}\n`);
}

// ────────────────────────────────── 自测 ──────────────────────────────────

/**
 * 负例必须**真的会红**——只写不断言「应该红」是假门禁的常见死法。
 * 这里每一例都是「换个输入 ⇒ 结论必须翻面」，跑一遍就知道尺子还在不在。
 */
function runSelfTest() {
  const CL = [
    "# Changelog",
    "",
    "## v0.1.56（2026-09-13）",
    "",
    "- 发行说明标签页",
    "",
    "## v0.1.55（2026-09-13）",
    "",
    "- 取数腿",
    "",
    "## v0.1.4（2026-01-01）",
    "",
    "- 上古一条",
    "",
  ].join("\n");

  const missMsg = judgeChangelogSection("0.1.99", null).msg;
  const emptyMsg = judgeChangelogSection("0.1.99", "").msg;

  const cases = [
    ["段在位且非空（当前版本）", judgeChangelogSection("0.1.56", changelogSection(CL, "0.1.56")), true],
    ["段缺失（bump 了没写段）", judgeChangelogSection("0.1.99", changelogSection(CL, "0.1.99")), false],
    [
      "段是空的（写了段头没填条款）",
      judgeChangelogSection("0.1.56", changelogSection("## v0.1.56（2026-09-13）\n\n## v0.1.55（x）\n- a\n", "0.1.56")),
      false,
    ],
    // 缺段 / 空段 的提示文案必须是**两句不同的话**（合并 = 给维护者指错方向）
    [
      "缺段与空段给的提示不同（合并即指错方向）",
      { ok: missMsg !== emptyMsg && missMsg.includes("找不到") && emptyMsg.includes("空的"), msg: "两句不同" },
      true,
    ],
    // 前缀陷阱：v0.1.5 的段不该被 v0.1.56 那一段冒充（这条守的是共享模块的正则）
    [
      "前缀不误匹配（查 v0.1.5 不得命中 v0.1.56 段）",
      { ok: changelogSection(CL, "0.1.5") === null, msg: "应为 null（无 v0.1.5 段）" },
      true,
    ],
    [
      "前缀不误匹配（查 v0.1.56 不得命中 v0.1.4 段）",
      { ok: changelogSection(CL, "0.1.56")?.includes("发行说明标签页") === true, msg: "命中正确段" },
      true,
    ],
    // 段边界：切段不得吞掉下一条
    [
      "段边界（不吞下一条）",
      { ok: changelogSection(CL, "0.1.56")?.includes("取数腿") === false, msg: "没越界" },
      true,
    ],
  ];

  let bad = 0;
  for (const [tag, result, wantOk] of cases) {
    const pass = result.ok === wantOk;
    if (!pass) bad++;
    process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} 应${wantOk ? "过" : "红"} —— 实得 ${result.ok ? "过" : "红"}\n`);
    if (!pass) fail(result.msg);
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ 自测全过（${cases.length} 例：负例确实会红、正例确实会过）——尺子不是在恒绿。\n`
      : `\n🔴 自测 ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  let version;
  let changelogText;
  try {
    version = JSON.parse(readFileSync(PKG, "utf8")).version;
  } catch (e) {
    fail(`读不到 package.json 的 version：${e.message}`);
    process.exit(1);
  }
  try {
    changelogText = readFileSync(CHANGELOG, "utf8");
  } catch (e) {
    fail(
      `读不到 CHANGELOG.md：${e.message}\n` +
        `      它是软件轴发行说明的唯一来源（发行说明页 / Release 正文都取这里）——不是可选文件。`,
    );
    process.exit(1);
  }
  if (typeof version !== "string" || version.trim() === "") {
    fail(`package.json 的 version 不是非空字符串：${JSON.stringify(version)}`);
    process.exit(1);
  }

  const judged = judgeChangelogSection(version, changelogSection(changelogText, version));
  if (!judged.ok) {
    fail(`软件 ${version} 的 CHANGELOG 段没过：${judged.msg}`);
    process.exit(1);
  }
  process.stdout.write(`✅ CHANGELOG 段 —— ${judged.msg}\n`);
}

main();
