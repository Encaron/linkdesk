/**
 * 机械检查：**软件侧变更必须分类**（E6#57.15e · **硬拦**）。
 *
 * 用户担心「AI 忘调 version-bump skill 判版本」→ 本脚本做机械兜底。
 * 核心洞察：机械上检测不到「AI 调没调 skill」，但能检测「commit message 带没带类别前缀」——
 * 类别前缀（feat:/fix:/breaking:）= 版本判定的输出物，强制分类 ≈ 强制过版本判定。
 *
 * ── 触发点：lefthook `commit-msg`，不是 Claude 的 PreToolUse（2026-09-13 迁移）──
 *   🔴 迁移理由（用户 2026-09-13 拍板）：旧的 PreToolUse 钩子（`.claude/settings.json`）
 *   只覆盖**一条路**——「Claude 用 Bash 工具敲 `git commit`」。用户本人在终端手敲、CI、
 *   其他 AI 工具**统统不经过它**。这是覆盖面缺口，不是风格问题。
 *   `commit-msg` 由 **git 自己**在每个提交上触发 ⇒ 无论谁提交、用什么方式提交都过这道闸。
 *
 * ── 为什么必须读「消息文件」而不是解析命令行（这是迁移的第二个理由）──
 *   旧实现用正则从命令行里扒 `-m "…"`。**`git commit -F 文件` / 用编辑器写消息 / heredoc
 *   全都扒不到** ⇒ 静默放行 = 假门禁。`commit-msg` 钩子拿到的**本来就是消息文件路径**（`{1}`），
 *   直接读文件即可覆盖全部提交方式。
 *
 * ── 档位：硬拦（原「警告档」，2026-09-13 用户拍板升级）──
 *   不带类别前缀 ⇒ **退出码 1，提交被 git 拒绝**。判据 = CLAUDE.md 硬约束 22 原文
 *   「违反=红灯」，且 `npm run check` 全仓是硬拦哲学（无「基线接受」）。
 *   ⚠️ **逃生口仍在**：`git commit --no-verify` 跳过全部 git 钩子。这是 git 的机制，不是本脚本
 *   的漏洞——**如实记着，不假装覆盖**。它保证闸坏了也不至于把人锁死。
 *
 * ── 判定（判据可证伪，见 --self-test）──
 *   ① staged 含**仓根**软件侧代码（**仓根** `src/` 或 `electron/` 的 .ts/.tsx，排除
 *      `*.test.*` / `*.spec.*`）→ 提交消息**首行（subject）**必须以 feat:/fix:/breaking: 打头 → 否则红
 *      ⚠️ **只看首行**：「前缀」的语义就是打头。扫全文会让 `-m "闲聊" -m "feat: x"`
 *         这种把类别藏在第二行的写法蒙混过关。
 *      ⚠️ **只有仓根**：`packages/**`（作者轴）不算——npm 发版 ≠ 软件 bump，见下方 `SOFTWARE_CODE_RE`。
 *   ② 纯文档（docs/ *.md）/ 配置（*.json）/ 测试 / scripts / .claude → 放行
 *   ③ `Merge …` 开头的合并提交 → **放行并出声**。理由：合并提交的内容是**已分类的**那些
 *      被合入的提交，自己没有新改动可分类；拦它只会把人逼去 `--no-verify`（反而削弱闸的权威）。
 *      ⚠️ 这是**唯一**的豁免，且**不静默**（每次放行都打印一行说明）。
 *   ④ **注释-only 改动 → 放行并出声**（2026-09-29 会话 22 新增，实测逼出）：staged 的仓根
 *      `src/`/`electron/` 文件里，若**本次每一处改动都是注释行**（行首 `//` · JSDoc 续行 `*` ·
 *      块注释起止 · JSX 注释 `{/*`），该文件不算软件侧代码。理由：硬约束 22 管的是**行为改动**，
 *      version-bump skill 明文「仅文档 / 注释 / 内部重构零行为变化 ⇒ 可不 bump」；而「档案搬家后
 *      改指注释里的路径」这种**文档搬笔**过去会被逼挂一个假 `fix:`（`docs:` 被拒 ⇒ 要么撒谎、
 *      要么 `--no-verify` 绕过全部钩子），两条路都比判据本身更坏。
 *      🔴 **判定一律偏保守（认不出就当代码，仍拦）**：行形态不认识 ⇒ 不算注释；新增文件
 *      （`new file mode`）⇒ 不适用本豁免；diff 读不到 / 为空 ⇒ 不豁免。注释不执行 ⇒ 豁免
 *      不可能放进行为改动（真改动行不是注释形态，照拦）。
 *
 * 用法（由 lefthook 调用，勿手改调用形式）：
 *   node scripts/check-version-bump.mjs .git/COMMIT_EDITMSG   # lefthook commit-msg: run ... {1}
 *   node scripts/check-version-bump.mjs --self-test
 * 退出码 0 = 放行；1 = 违规硬拦（打印到 stderr）。
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, ".."); // 代码根（package.json 所在）

/**
 * 软件侧代码判定：**仓根** `src/` 或 `electron/` 的 .ts/.tsx，排除测试文件与文档/依赖目录。
 *
 * 🔴 **必须锚定仓根（2026-09-14 E6#108f 实测修正）**：原来的 `/(^|\/)(src|electron)\/…/`
 *   会连 **`packages/**\/src/…`** 一起命中——而 `packages/`（`@linkdesk/plugin-sdk` /
 *   `linkdesk-ui` / `create-linkdesk-plugin/template/src/index.tsx` …）是**作者轴**，
 *   不是软件轴：**npm 发版 ≠ 软件 bump**（memory `version-axes-separated`，本仓明文模型）。
 *   误报的实际代价：改一句脚手架模板注释，也会被逼着给提交挂 `fix:` —— 而那一侧根本不该
 *   触发软件版本判定。**触发本闸的只有壳自己的 `src/` 与 `electron/`。**
 */
const SOFTWARE_CODE_RE = /^(src|electron)\/.*\.tsx?$/;
const TEST_FILE_RE = /\.(test|spec)\./;

/** 类别前缀判定：feat:/fix:/breaking:（E6#57.15e 约定，可含 E6#编号） */
const CATEGORY_RE = /^\s*(feat|fix|breaking):/i;

/** 合并提交（git 自己生成的 subject 形态）——唯一的豁免，见头注 ③ */
const MERGE_RE = /^Merge\b/;

// ─────────────────────────── 纯判据（--self-test 注入输入） ───────────────────────────

/** staged 里的软件侧代码文件（git commit 前 staged 已存在） */
function softwareSideFiles(paths) {
  return paths.filter((p) => SOFTWARE_CODE_RE.test(p) && !TEST_FILE_RE.test(p));
}

/**
 * 单行是否为「注释行」形态（去首尾空白后判）。**认不出的一律 false = 当代码**（见头注 ④ 的保守口径）。
 * 只认不会与代码混淆的形态：行首 `//` · 块注释起止 · JSDoc 续行 `*` · JSX 注释 `{/*` · 空行。
 * ⚠️ 故意**不认** `#`——TS 里 `#x` 是私有字段，不是注释（`.mjs` 的 `#` 也不在本闸射程内）。
 */
function isCommentLine(rawLine) {
  const t = rawLine.trim();
  if (t === "") return true; // 纯空行（缩进/换行整理）
  return (
    t.startsWith("//") ||
    t.startsWith("/*") ||
    t.startsWith("*/") ||
    t.startsWith("*") || // JSDoc 块内续行
    t.startsWith("{/*") // JSX 注释
  );
}

/**
 * 一份 `git diff --cached -U0` 文本是否为**注释-only**改动（纯判据，可证伪）。
 * 保守三则：① 新增文件 ⇒ false（文件本身是新的，性质不止「改注释」）；
 *           ② 没有任何 +/- 内容行 ⇒ false（读不到就不算查过）；
 *           ③ 任意一行内容不是注释形态 ⇒ false。
 */
function isCommentOnlyDiff(diffText) {
  if (typeof diffText !== "string" || diffText === "") return false;
  if (diffText.includes("new file mode")) return false;

  let sawContent = false;
  for (const line of diffText.split(/\r?\n/)) {
    // 文件头（`--- a/x` / `+++ b/x` / `/dev/null`）与 hunk 头 `@@` 不算内容行
    if (/^(---|\+\+\+) [ab]\//.test(line) || /^(---|\+\+\+) \/dev\/null$/.test(line)) continue;
    if (line.startsWith("@@") || line.startsWith("diff --git") || line.startsWith("index ")) continue;
    if (line.startsWith("---") || line.startsWith("+++")) continue; // 其余文件头形态（`--no-prefix` 等）
    if (!line.startsWith("+") && !line.startsWith("-")) continue; // `\ No newline` 等
    sawContent = true;
    if (!isCommentLine(line.slice(1))) return false;
  }
  return sawContent;
}

/**
 * 从 staged 里挑出「本次改动全是注释」的仓根软件文件（返回 Set）。**任何异常 ⇒ 不加入**（当代码，从严）。
 * 只做 `-U0`（不带上下文行 ⇒ 看到的每一行都是真改动，上下文行不会来捣乱）。
 */
function commentOnlyStagedFiles(files) {
  const out = new Set();
  for (const p of files) {
    try {
      const diff = execSync(`git diff --cached -U0 -- "${p}"`, { cwd: ROOT, encoding: "utf-8" });
      if (isCommentOnlyDiff(diff)) out.add(p);
    } catch {
      /* 读不到 ⇒ 不豁免（从严） */
    }
  }
  return out;
}

/**
 * 取提交消息的 **subject**（首个非空、非注释行）。
 * `#` 行是 git 给编辑器用的模板注释（`-m` 提交不带），判定前必须剔掉——
 * 否则「模板里恰好有一行像类别前缀的注释」就能蒙混过关。
 */
function extractSubject(messageText) {
  for (const line of messageText.split(/\r?\n/)) {
    const t = line.trim();
    if (t === "" || t.startsWith("#")) continue;
    return t;
  }
  return "";
}

/**
 * 判据主体。`paths` = staged 文件路径；`messageText` = 提交消息原文；`commentOnly` = 「本次改动
 * 全是注释」的仓根软件文件集合（见 `commentOnlyStagedFiles`，默认空 ⇒ 等同旧行为）。
 * 返回 `{ ok, msg }`。
 * 传入非法/空消息（如消息文件读不到）⇒ 红——**读不到就不算查过**（不为「查不了」放行）。
 */
function judge(paths, messageText, commentOnly = new Set()) {
  const all = softwareSideFiles(paths);
  const exempt = all.filter((p) => commentOnly.has(p));
  const files = all.filter((p) => !commentOnly.has(p));
  if (files.length === 0) {
    if (exempt.length > 0) {
      return {
        ok: true,
        msg:
          `软件侧文件本次**改动全是注释**（${exempt.join(", ")}）——零行为改动，免版本判定（放行，出声）。`,
      };
    }
    return { ok: true, msg: "无软件侧代码 staged（纯文档/配置/测试/scripts）——放行。" };
  }

  const subject = extractSubject(messageText ?? "");
  const shown = files.slice(0, 3).join(", ") + (files.length > 3 ? "…" : "");

  if (subject === "") {
    return {
      ok: false,
      msg:
        `本次提交含软件侧代码（${shown}），但**读不到提交消息**——无法判定类别。\n` +
        `      （消息文件为空或路径没传进来。lefthook 的调用形式必须是\n` +
        `       \`node scripts/check-version-bump.mjs {1}\`。）`,
    };
  }
  if (MERGE_RE.test(subject)) {
    return { ok: true, msg: `合并提交（\`${subject.slice(0, 40)}\`）——内容是被合入的已分类提交，免分类。` };
  }
  if (CATEGORY_RE.test(subject)) {
    return { ok: true, msg: `已带类别前缀——\`${subject.slice(0, 60)}\`` };
  }
  return {
    ok: false,
    msg:
      `本次提交含软件侧代码（${shown}），但提交消息首行没带类别前缀。\n` +
      (exempt.length > 0
        ? `      （另有 ${exempt.length} 个文件本次改动**全是注释**、已免分类：${exempt.join(", ")}——它们不是拦你的原因。）\n`
        : "") +
      `      首行是：\`${subject.slice(0, 80)}\`\n` +
      `      先调用 version-bump skill 判定本次变更类别（新功能=feat / 修复=fix / 破坏=breaking），\n` +
      `      再把前缀加到**首行**，如 \`feat:E6#xxx …\`。\n` +
      `      为什么拦：CLAUDE.md 硬约束 22——「代码更新上去了版本号没更」是红灯。\n` +
      `      （确需跳过：git commit --no-verify，但它跳过的是**全部** git 钩子。）`,
  };
}

function fail(msg) {
  process.stderr.write(`\n🔴 版本号判定门禁：${msg}\n`);
}

// ────────────────────────────────── 自测 ──────────────────────────────────

function runSelfTest() {
  const SRC = ["src/core/foo.ts", "electron/main.ts"];
  const cases = [
    ["无软件侧代码（纯文档）→ 放行", judge(["docs/a.md", "README.md"], "随便写"), true],
    ["无软件侧代码（纯测试）→ 放行", judge(["src/core/foo.test.ts"], "没前缀"), true],
    ["无软件侧代码（scripts）→ 放行", judge(["scripts/x.mjs"], "没前缀"), true],
    ["软件侧 + feat 前缀 → 放行", judge(SRC, "feat:E6#57.15e 立尺子"), true],
    ["软件侧 + fix 前缀 → 放行", judge(SRC, "fix: 修 X"), true],
    ["软件侧 + BREAKING 大写 → 放行", judge(SRC, "BREAKING: 改契约"), true],
    ["软件侧 + 无前缀 → 硬拦", judge(SRC, "更新了一些东西"), false],
    ["软件侧 + 空消息 → 硬拦（读不到就不算查过）", judge(SRC, ""), false],
    ["软件侧 + 消息为 null → 硬拦", judge(SRC, null), false],
    // 🔴 漏法 1：类别藏在第二行（旧实现扫全文会放行）
    ["软件侧 + 前缀在第二行 → 硬拦（只看首行）", judge(SRC, "更新了一些东西\n\nfeat: 藏在第二行"), false],
    // 🔴 漏法 2：注释行伪装（git 编辑器模板里的 `#` 行）
    ["软件侧 + 前缀只在注释行 → 硬拦", judge(SRC, "# feat: 这是模板注释\n真的改动"), false],
    // 豁免：合并提交
    ["软件侧 + Merge 提交 → 放行（唯一豁免）", judge(SRC, "Merge branch 'x' into e6"), true],
    // 前缀必须在**行首**，不能藏在句中
    ["软件侧 + 前缀不在行首 → 硬拦", judge(SRC, "这次 feat: 只是句中提到"), false],
    // 测试文件不算软件侧代码（即使同批混着真代码，真代码那半仍要前缀）
    ["混批：真代码 + 测试，无前缀 → 硬拦", judge(["src/a.ts", "src/a.test.ts"], "无前缀"), false],
    ["混批：真代码 + 测试，有前缀 → 放行", judge(["src/a.ts", "src/a.test.ts"], "fix: 修"), true],
    // 🔴 作者轴包**不算**软件侧代码（E6#108f 修正）：npm 发版 ≠ 软件 bump。
    //    这三例过去会被误拦。
    ["作者轴包 src（plugin-sdk）→ 放行", judge(["packages/plugin-sdk/src/index.ts"], "chore: 改 SDK 注释"), true],
    ["作者轴包 src（ui）→ 放行", judge(["packages/linkdesk-ui/src/x.tsx"], "没前缀"), true],
    ["脚手架模板 src（作者打开的第一个文件）→ 放行", judge(["packages/create-linkdesk-plugin/template/src/index.tsx"], "没前缀"), true],
    // 但**根** src/electron 一个不少，仍必须带前缀（防「顺手把锚点放宽成不带根」）
    ["根 src 仍须前缀 → 硬拦", judge(["src/App.tsx"], "没前缀"), false],
    ["根 electron 仍须前缀 → 硬拦", judge(["electron/main.ts"], "没前缀"), false],
    // ④ 注释-only 豁免（2026-09-29 会话 22）：档案搬笔改注释里的路径 ⇒ 不该逼挂假 fix:
    ["软件侧 + 改动全是注释 → 放行（免分类）", judge(["src/a.ts"], "docs: 改注释里的路径", new Set(["src/a.ts"])), true],
    ["注释豁免也认不出类别时仍放行（豁免在前）", judge(["src/a.ts"], "随便写", new Set(["src/a.ts"])), true],
    [
      "混批：注释文件豁免 + 真代码 → 仍拦",
      judge(["src/a.ts", "electron/b.ts"], "docs: 改注释", new Set(["src/a.ts"])),
      false,
    ],
    [
      "混批：注释文件豁免 + 真代码 + 有前缀 → 放行",
      judge(["src/a.ts", "electron/b.ts"], "fix: 修", new Set(["src/a.ts"])),
      true,
    ],
    ["豁免集合里的文件本来就不是软件侧（docs）→ 无影响", judge(["docs/a.md"], "没前缀", new Set(["docs/a.md"])), true],
  ];

  // ④ 的**行形态判据**单测（`isCommentOnlyDiff` 是纯函数，直接喂 diff 文本）
  const JSDOC_DIFF = [
    "diff --git a/src/a.ts b/src/a.ts",
    "index 1111111..2222222 100644",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -4 +4 @@",
    "- * 判据（出处：`docs/04-软件更新/待抉择池/X/AI-执行清单.md`）",
    "+ * 判据（出处：`docs/04-软件更新/已落地/X/AI-执行清单.md`）",
  ].join("\n");
  const CODE_DIFF = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -4 +4 @@",
    "- const x = 1;",
    "+ const x = 2;",
  ].join("\n");
  const MIXED_DIFF = JSDOC_DIFF + "\n@@ -9 +9 @@\n- const y = 1;\n+ const y = 2;";
  const NEWFILE_DIFF = [
    "diff --git a/src/new.ts b/src/new.ts",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/src/new.ts",
    "@@ -0,0 +1 @@",
    "+ // 新文件，只有一行注释",
  ].join("\n");
  const diffCases = [
    ["注释-only diff（JSDoc 改路径）→ true", JSDOC_DIFF, true],
    ["注释-only diff（整行 // 注释）→ true", "@@ -1 +1 @@\n-// 旧\n+// 新", true],
    ["注释-only diff（JSX 注释）→ true", "@@ -1 +1 @@\n-{/* 旧 */}\n+{/* 新 */}", true],
    ["真代码改动 → false", CODE_DIFF, false],
    ["注释 + 真代码混在同一个文件 → false", MIXED_DIFF, false],
    ["`++i` 这类真代码行不会被误当文件头吃掉 → false", "@@ -1 +1 @@\n-++i;\n+--j;", false],
    ["新增文件（new file mode）→ false（不豁免）", NEWFILE_DIFF, false],
    ["空 diff → false（读不到就不算查过）", "", false],
    ["只有文件头没有内容行 → false", "--- a/src/a.ts\n+++ b/src/a.ts", false],
  ];

  let bad = 0;
  for (const [tag, result, wantOk] of cases) {
    const pass = result.ok === wantOk;
    if (!pass) bad++;
    process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} 应${wantOk ? "放行" : "拦"} —— 实得 ${result.ok ? "放行" : "拦"}\n`);
    if (!pass) fail(result.msg);
  }
  for (const [tag, text, want] of diffCases) {
    const got = isCommentOnlyDiff(text);
    const pass = got === want;
    if (!pass) bad++;
    process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} —— 实得 ${got}\n`);
  }
  const total = cases.length + diffCases.length;
  process.stdout.write(
    bad === 0
      ? `\n✅ 自测全过（${total} 例：正例确实放行、负例确实拦）——闸不是在恒绿。\n`
      : `\n🔴 自测 ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function stagedPaths() {
  const out = execSync("git diff --cached --name-only", { cwd: ROOT, encoding: "utf-8" });
  return out.split(/\r?\n/).filter(Boolean);
}

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const msgFile = process.argv[2];
  if (!msgFile) {
    fail(
      `没给提交消息文件路径——无法判定，因此**不放行**。\n` +
        `      调用形式：node scripts/check-version-bump.mjs <COMMIT_MSG_FILE>\n` +
        `      （lefthook 的 commit-msg job 里是 \`… {1}\`；漏了 {1} 就会走到这里。）`,
    );
    process.exit(1);
  }

  let messageText;
  try {
    messageText = readFileSync(msgFile, "utf8");
  } catch (e) {
    fail(`读不到提交消息文件 ${msgFile}：${e.message}`);
    process.exit(1);
  }

  let paths;
  try {
    paths = stagedPaths();
  } catch (e) {
    fail(`跑 git diff --cached 失败：${e.message}`);
    process.exit(1);
  }

  const judged = judge(paths, messageText, commentOnlyStagedFiles(softwareSideFiles(paths)));
  if (!judged.ok) {
    fail(judged.msg);
    process.exit(1);
  }
  process.stdout.write(`✅ 版本号判定门禁 —— ${judged.msg}\n`);
}

main();
