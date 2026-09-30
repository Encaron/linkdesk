/**
 * 机械门禁：**CLAUDE.md 体量上限**（防「进度行长成巨无霸」复发）。
 *
 * 用法：node scripts/check-claude-md.mjs
 *       node scripts/check-claude-md.mjs --self-test
 * 退出码 0 = 全过（第 4 条读不到 `HEAD:CLAUDE.md` 时如实跳过并打印原因）；1 = 有超限。
 *
 * ── 为什么必须有它（根因：2026-09-30 用户立案「CLAUDE.md 又又又又超了，尤其是第五行」）──
 *   CLAUDE.md 第 5 行 = 「当前进度」，而 `AGENTS.md` 的维护义务**要求每个会话完成工程任务时同笔完善它**
 *   ⇒ 它成了**只增不减**的记账本。实测两代读数：
 *     · 2026-09-28 压过一次：第 5 行 17,928 → 2,220 字节，全文 51,157 → 33,374 字节；
 *     · 2026-09-30 复量：第 5 行 **18,392 字符**（比压缩前更大——历史流水全在这行里），
 *       全文 **40,181 字符 / 70,861 字节**。两次压缩的判据都住在**记忆**里
 *       （memory `claude-md-compression-criteria`），而**记忆是「进场面」不是「提交闸门」**——
 *       没有一个机械件在「往那一行写」的当下说「不行」，于是每次都靠用户又一次发现「超了」。
 *   本门禁就把那条判据从**自觉**变成**提交前必过**（`check` 全绿才提交 = 项目既有纪律）。
 *   🔑 **它拦的不是「改 CLAUDE.md」**（改是必须的：每完成一件工程任务都要校准现状行）——
 *   拦的是**只加不减**：加一段就得同笔压/删一段（G4），且总量不许爬回巨无霸（G1–G3）。
 *
 * ── 五条判据（G1–G4 单位「**字符**」＝ 阅读税口径，字节数一并打印但不判定；G5 是行数）──
 *   G1 全文 ≤ `LIMITS.total`           —— 兜底：别爬回巨无霸（对齐 2026-09-28 那次压缩的量级）
 *   G2 任意单行 ≤ `LIMITS.line`        —— 挡「某一行变巨型」（2026-09-30 的病灶 = 第 5 行 18,392 字符）
 *   G3 「当前进度」行 ≤ `LIMITS.progress`，且**必须恰有一条**（0 条 / >1 条都红）
 *                                      —— 重灾区单列，逼「现状行短到能每次校准」（记忆第 1 条判据）
 *   G4 相对 `HEAD` 的**净增** ≤ `LIMITS.growth` —— 「加一段就同笔删一段」；无 git 时跳过（打印原因）
 *   G5 行数 ≤ `LIMITS.lines`           —— 🔴 **与用户的 `cost` 审计同口径**（`~/.zcode/cost-audit.py`
 *                                         的「CLAUDE.md 体量」判据 = `splitlines() <= 150`）。两条尺子必须同时绿，
 *                                         否则用户每次收尾跑 `cost` 都再看见一次「CLAUDE.md 超了」。加这条的实测
 *                                         根因：2026-09-30 那次内容砍了 56%（40,181 → 17,526 字符）而**行数几乎没动**
 *                                         （166 → 166）⇒ 字符尺全绿、审计仍报红。本门禁比审计**严一行**
 *                                         （`split("\n")` 比 `splitlines()` 多一个尾空行）⇒ 只会更早报红，绝不更晚。
 *   超限时打印**最长的几行 ＋ 行号**，并把「流水该往哪写」印出来（章法 = skill `claude-md-maintenance`）。
 *
 * ── 域外声明（免得下一个人以为漏了）──
 *   · 本门禁只管 **CLAUDE.md 一个文件**。别的文档体积不在域内（那是 `check-file-size.mjs`：src/electron/插件源码）；
 *     文档断链是 `check-doc-links.mjs`；手册生成区漂移是 `check-manual-surface.mjs`。
 *   · ⛔ 不把「CLAUDE.md 应该有哪些段」写成期望清单——那会变成又一处需要维护的副本（判据只判**体量**）。
 *   · 阈值是可调的常量（`LIMITS`），但**调高它不是「修好」**：`LIMITS` 改动须同笔在
 *     memory `claude-md-compression-criteria` 记账（否则就是「放宽判据凑绿」）。
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const FILE = "CLAUDE.md";

/** 体量阈值（G1–G4 = 字符，G5 = 行）——见头注「阈值可调但调高不是修好」 */
export const LIMITS = {
  total: 20000,
  line: 1600,
  progress: 1200,
  growth: 1200,
  lines: 150,
};

/** 进度行锚点——它必须**恰有一条**（G3）。选前缀而非「包含『进度』」是防误伤别的行 */
export const PROGRESS_PREFIX = "> **当前进度";

const chars = (s) => [...s].length;
const bytes = (s) => Buffer.byteLength(s, "utf8");

/**
 * 纯判定（自测注入假输入）：给定文本 ＋ HEAD 文本 ⇒ 违规列表。
 * @param {{text: string, headText?: string|null, limits?: typeof LIMITS}} input
 * @returns {{violations: any[], stats: any}}
 */
export function judgeClaudeMd({ text, headText = null, limits = LIMITS }) {
  const violations = [];
  const lines = text.split("\n");
  const total = chars(text);

  if (total > limits.total) {
    violations.push({
      kind: "total",
      msg: `CLAUDE.md 全文 **${total}** 字符，超上限 ${limits.total}（+${total - limits.total}）——流水该住各层 \`00-整理档案.md\` / \`交接.md\` / 台账，不该住这里`,
    });
  }

  const lengths = lines.map((l, i) => ({ line: i + 1, len: chars(l) }));
  for (const { line, len } of lengths) {
    if (len > limits.line) {
      violations.push({
        kind: "line",
        line,
        msg: `CLAUDE.md 第 ${line} 行 **${len}** 字符，超单行上限 ${limits.line}（+${len - limits.line}）——拆成多行，或把细节搬到它指的那份档里只留指针`,
      });
    }
  }

  const progressIdx = lines.map((l, i) => (l.startsWith(PROGRESS_PREFIX) ? i : -1)).filter((i) => i >= 0);
  if (progressIdx.length !== 1) {
    violations.push({
      kind: "progress-count",
      msg:
        `「当前进度」行实得 **${progressIdx.length}** 条（要求恰 1 条；锚点 = 行首 \`${PROGRESS_PREFIX}\`）` +
        (progressIdx.length === 0 ? "——现状行没了？新 AI 进场会失去唯一的方向入口" : `，行号 = ${progressIdx.map((i) => i + 1).join(" / ")}`),
    });
  } else {
    const i = progressIdx[0];
    const len = chars(lines[i]);
    if (len > limits.progress) {
      violations.push({
        kind: "progress",
        line: i + 1,
        msg:
          `「当前进度」行（第 ${i + 1} 行）**${len}** 字符，超上限 ${limits.progress}（+${len - limits.progress}）` +
          `——它只该是「现状 ＋ 指针」：逐格读数 / 版本沿革 / 会话流水搬进 E6 执行清单与各层 \`00-整理档案.md\``,
      });
    }
  }

  let growth = null;
  if (typeof headText === "string") {
    growth = total - chars(headText);
    if (growth > limits.growth) {
      violations.push({
        kind: "growth",
        msg:
          `本次相对 \`HEAD:CLAUDE.md\` **净增 ${growth}** 字符，超上限 ${limits.growth}——**加一段就同笔删/压一段**` +
          `（⛔ 不是「先加上、以后再压」：那正是它三天长回 18,392 字符的方式）`,
      });
    }
  }

  // G5 行数——与用户 cost-audit.py 的「CLAUDE.md 体量」同口径（见头注）：
  // 字符尺全绿而行数爬回去 = 用户每次收尾跑 cost 又看见一次「超了」（2026-09-30 实测就是这么发生的）
  const lineCount = lines.length;
  if (lineCount > limits.lines) {
    violations.push({
      kind: "lines",
      msg:
        `CLAUDE.md **${lineCount}** 行，超行数上限 ${limits.lines}（+${lineCount - limits.lines}）` +
        `——字符尺没超而这条超了，正是「内容砍了、行数没动」的复发形态：删段 / 合并重复的行（用户收尾跑 \`cost\` 用的就是这个口径）`,
    });
  }

  return {
    violations,
    stats: {
      total,
      bytes: bytes(text),
      lines: lines.length,
      longest: [...lengths].sort((a, b) => b.len - a.len).slice(0, 5),
      progressLine: progressIdx.length === 1 ? progressIdx[0] + 1 : null,
      progressLen: progressIdx.length === 1 ? chars(lines[progressIdx[0]]) : null,
      growth,
      limits,
    },
  };}

// ────────────────────────────────── 自测 ──────────────────────────────────

const mkText = (parts) => parts.join("\n");
const P = `${PROGRESS_PREFIX}（2026-09-30）**：现状 ＋ 指针。`;

export function runSelfTest() {
  const L = LIMITS;
  const cases = [
    // ── 正控 ──
    [
      "正控①：**真实仓库今天的 CLAUDE.md** 五条全过（本门禁的基线自证）",
      judgeClaudeMd({ text: readFileSync(resolve(ROOT, FILE), "utf8") }).violations.length,
      0,
    ],
    [
      "正控②：合成文件在限额内 ＋ 恰一条进度行 ⇒ 零违规",
      judgeClaudeMd({ text: mkText(["# T", P, "x".repeat(L.line - 10), "y".repeat(10)]) }).violations.length,
      0,
    ],
    [
      "正控③：读不到 HEAD（无 git / 未提交）⇒ 只跳过 G4，其余照判 ⇒ 零违规",
      judgeClaudeMd({ text: mkText([P]), headText: null }).violations.length,
      0,
    ],
    [
      "正控④：净增**恰好等于**上限 ⇒ 不算超（对齐「≤」语义）",
      judgeClaudeMd({ text: "a".repeat(L.growth + 5) + "\n" + P, headText: "a".repeat(5) + "\n" + P }).violations.length,
      0,
    ],
    [
      "正控⑤：净增为**负**（这次压小了）⇒ 零违规",
      judgeClaudeMd({ text: P, headText: "旧".repeat(L.growth * 3) + P }).violations.length,
      0,
    ],
    [
      "正控⑥：多行都短、只是总和大 ⇒ 只报 total，**不**串味报 line（判据互不干扰）",
      judgeClaudeMd({
        text: mkText([P, ...Array.from({ length: 30 }, () => "x".repeat(L.line - 1))]),
        limits: { ...L, total: 100 },
      }).violations.map((v) => v.kind).join(","),
      "total",
    ],
    [
      "正控⑦：行数**恰好等于**上限 ⇒ 不算超（对齐 `cost` 审计的 ≤150 边界）",
      judgeClaudeMd({ text: mkText(Array.from({ length: L.lines }, (_, i) => (i === 0 ? P : "x"))) }).violations.length,
      0,
    ],
    // ── 负控 ──
    [
      "🔴 负控①：全文超上限 ⇒ 报 total",
      judgeClaudeMd({ text: "x".repeat(L.total + 1) + "\n" + P }).violations[0].kind,
      "total",
    ],
    [
      "🔴 负控②：单行超上限 ⇒ 报 line",
      judgeClaudeMd({ text: mkText([P, "x".repeat(L.line + 1)]) }).violations[0].kind,
      "line",
    ],
    [
      "🔴 负控③：上条必须**带正确行号**（否则「哪一行超了」指不出来）",
      judgeClaudeMd({ text: mkText([P, "fine", "x".repeat(L.line + 1)]) }).violations[0].line,
      3,
    ],
    [
      "🔴 负控④：进度行超上限 ⇒ 报 progress（重灾区单列）",
      judgeClaudeMd({ text: mkText([P + "字".repeat(L.progress)], "tail") }).violations[0].kind,
      "progress",
    ],
    [
      "🔴 负控⑤：**一条进度行都没有** ⇒ 报 progress-count（新 AI 失去方向入口）",
      judgeClaudeMd({ text: mkText(["# T", "没有那条行"]) }).violations[0].kind,
      "progress-count",
    ],
    [
      "🔴 负控⑥：**两条**进度行 ⇒ 也报 progress-count（不许双份记），且打印行号",
      judgeClaudeMd({ text: mkText([P, "middle", P]) }).violations[0].msg.includes("1 / 3"),
      true,
    ],
    [
      "🔴 负控⑦：净增超上限 ⇒ 报 growth（「先加上、以后再压」正是病根）",
      judgeClaudeMd({
        // 夹具要点：把增量加在**另一行**上——否则会先撞 G3（本自测第一版就是这么写错的，被自己抓住）
        text: mkText([P, "新".repeat(L.growth + 1)]),
        headText: P,
      }).violations.map((v) => v.kind).join(","),
      "growth",
    ],
    [
      "🔴 负控⑧：`LIMITS` 真值本身自洽（五条上限都是正整数，且单行 / 进度行 / 行数 < 全文）",
      Object.values(L).every((v) => Number.isInteger(v) && v > 0) &&
        L.line < L.total &&
        L.progress < L.total &&
        L.lines < L.total,
      true,
    ],
    [
      "🔴 负控⑨：行数超上限 ⇒ 报 lines（**字符尺可能同时全绿**——正是 2026-09-30 复发的形态）",
      judgeClaudeMd({ text: mkText(Array.from({ length: L.lines + 1 }, (_, i) => (i === 0 ? P : "x"))) })
        .violations.map((v) => v.kind)
        .join(","),
      "lines",
    ],
  ];

  let bad = 0;
  for (const [tag, got, want] of cases) {
    const pass = got === want;
    if (!pass) bad++;
    process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} —— 实得 ${JSON.stringify(got)}（期望 ${JSON.stringify(want)}）\n`);
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ check-claude-md self-test 全过（${cases.length} 例：正控绿 / 负控红）——尺子不是在恒绿。\n`
      : `\n🔴 check-claude-md self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

/** 读 `HEAD:CLAUDE.md`；读不到（无 git / 未提交 / 浅克隆）返回 null ⇒ G4 跳过 */
function readHead() {
  try {
    return execFileSync("git", ["show", `HEAD:${FILE}`], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const text = readFileSync(resolve(ROOT, FILE), "utf8");
  const headText = readHead();
  const { violations, stats } = judgeClaudeMd({ text, headText });

  const fmt = (n) => n.toLocaleString("en-US");
  console.log(
    `📄 CLAUDE.md：**${fmt(stats.total)} 字符** / ${fmt(stats.bytes)} 字节 · ${stats.lines} 行 · ` +
      `最长行 ${stats.longest[0].line}（${fmt(stats.longest[0].len)}）· ` +
      `进度行 ${stats.progressLen === null ? "○ 无" : `${stats.progressLine}（${fmt(stats.progressLen)}）`} · ` +
      `净增 ${stats.growth === null ? "○ 跳过（读不到 HEAD:CLAUDE.md）" : fmt(stats.growth)}`,
  );
  console.log(
    `   上限：全文 ${fmt(stats.limits.total)} 字符 · 行数 ${stats.limits.lines} 行 · 单行 ${fmt(stats.limits.line)} 字符 · ` +
      `进度行 ${fmt(stats.limits.progress)} 字符 · 单笔净增 ${fmt(stats.limits.growth)} 字符（行数这条与 \`cost\` 审计同口径）`,
  );

  if (violations.length === 0) {
    console.log(`✅ CLAUDE.md 体量五条全过（最长的五行： ${stats.longest.map((l) => `L${l.line}=${fmt(l.len)}`).join(" · ")} ）`);
    return;
  }

  console.error(`\n❌ CLAUDE.md 体量超限——${violations.length} 处：\n`);
  for (const v of violations) console.error(`   [${v.kind}] ${v.msg}\n`);
  console.error(`   最长的五行： ${stats.longest.map((l) => `L${l.line}=${fmt(l.len)}`).join(" · ")}`);
  console.error(
    `   🔴 别急着调高 LIMITS（那只是把问题推给下一次）——按 skill \`claude-md-maintenance\` 与 ` +
      `memory \`claude-md-compression-criteria\` 的三档压缩法处理：\n` +
      `      · 流水 / 逐格读数 / 版本沿革 → 各层 \`00-整理档案.md\` · \`交接.md\` · 台账（\`已落地/00-README.md\`）\n` +
      `      · 现状行只留「现状 ＋ 指针」，历史压成一句「有过这个过程」\n` +
      `      · 删任何一段前先 grep 它有没有别的落点（否则删的不是冗余，是唯一副本）`,
  );
  process.exit(1);
}

main();
