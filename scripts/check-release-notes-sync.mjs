/**
 * E6#167：发版前置对账——「**已发 Release 正文 ↔ 仓内 CHANGELOG 对应段**」一致性门禁。
 *
 * 防的一句话：「**Release 已经发了，仓内 CHANGELOG 那段还在被人改**」。两份一旦漂移，没有任何
 * 门禁看得见：`check-changelog-section` 只管「段在不在、空不空」；CI 的 Release 正文是**发布那一刻**
 * 从仓内切段生成的（build.yml「Prepend download block」步），之后两份各自演进。2026-10-01 首例实证：
 * v0.2.32 发布后有人把两条未出货的 feat 追加进仓内 v0.2.32 段，与已发 Release 正文不符——
 * 靠下一场发版会话花 2-3 分钟人眼对账才抓回来。本门禁把这一步机械化，挂 `npm run publish` 前置。
 *
 * ── 判据 ──
 *   对象 = **最新已发 Release**（`releases/latest`——不是本次要发的版本，本次此刻还没发）：
 *     ① Release 正文取「### 变更」块（build.yml E6#43a 的拼装格式；缺块 ⇒ 红——正文形状走样了）；
 *     ② 仓内 CHANGELOG 取**同一版本**的 `## v{version}` 段（切段规则 = `lib/changelog-section.mjs`
 *        唯一实现，⛔ 本文件不写第二套切段）；
 *     ③ 两侧归一化（CRLF→LF ＋ 去首尾空白行）后**逐字相等**；不等 ⇒ 红。
 *   一个已发 Release 都没有（首次发布）⇒ 放行**并出声**（无可比对象，不是「通过」）。
 *   **修正方向写死在报错里**：已发 Release 是既成事实（用户看到的更新说明）——改**仓内段**去对齐它
 *   （或 `gh release edit` 改 Release 并在记账里说明理由）；⛔ 不是反过来拿仓内覆写 Release。
 *
 * ── 为什么挂 `npm run publish` 前置、不接 `npm run check` ──
 *   联网（GitHub Releases API）＋对账对象只在发版时变化——平时提交里「最新 Release ↔ 仓内段」
 *   恒为同一对值，接进 check 链只白付网络不添信息。⇒ `check-gate-health` 的 EXEMPT 登记
 *   （其反向核对保证本门禁不会被误接进 check 链）。
 *
 * 用法：
 *   node scripts/check-release-notes-sync.mjs            # 真对账（联网；仓库 slug 从 git remote 推导）
 *   node scripts/check-release-notes-sync.mjs --self-test
 * 退出码 0 = 过；1 = 红拦（打印到 stderr）。
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 🔴 切段规则只此一处（与发布门禁/check-changelog-section 共用），不另写第二套。
import { changelogSection } from "./lib/changelog-section.mjs";
// 🔴 网络口径/认证/错误话术只此一份（api.github.com 直连 + GITHUB_TOKEN/GH_TOKEN 自动附）。
import { networkHint, readLatestRelease } from "./lib/official-catalog.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CHANGELOG = join(ROOT, "CHANGELOG.md");

/** build.yml 拼 Release 正文用的变更块标题（E6#43a）——取块与对账都认这一行。 */
const CHANGES_HEADING = "### 变更";

// ─────────────────────────── 纯判据（--self-test 注入输入） ───────────────────────────

/** git remote URL → `owner/repo`（https / ssh / ssh:// 三形态皆可；解析不出 → null，调用方红） */
function repoSlugFromGitRemote(url) {
  if (typeof url !== "string") return null;
  const m =
    /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url.trim()) ?? null;
  return m ? `${m[1]}/${m[2]}` : null;
}

/** Release 正文 → 「### 变更」块正文（去块头后的前导空行、去尾部空白）；没有块头 → null（形状走样） */
function extractChangesBlock(body) {
  if (typeof body !== "string") return null;
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const idx = lines.findIndex((l) => l.trim() === CHANGES_HEADING);
  if (idx < 0) return null;
  const rest = lines.slice(idx + 1);
  while (rest.length > 0 && rest[0].trim() === "") rest.shift();
  return rest.join("\n").replace(/\s+$/, "");
}

/** 对账口径的归一化：CRLF→LF ＋ 去首尾空白（GitHub 存正文会动掉尾部换行；行内内容必须逐字） */
function normalizeNotes(s) {
  return s.replace(/\r\n/g, "\n").trim();
}

/** 两段文字第一条不同的行（报错定位用；无差异 → null） */
function firstDiffLine(a, b) {
  const la = a.split("\n");
  const lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) return { n: i + 1, release: la[i] ?? "(无)", repo: lb[i] ?? "(无)" };
  }
  return null;
}

/**
 * 判据本体：已发 Release ↔ 仓内段。输入由主流程注入（--self-test 可复跑，零网络零盘）。
 *   release = { tag, body } | null（null = 一个已发 Release 都没有）
 *   repoSection = string | null（null = 仓内没有该版本段）
 */
function judgeNotesSync({ release, repoSection }) {
  if (release === null) {
    return {
      ok: true,
      msg: "对账 —— 远端一个已发 Release 都没有（首次发布？）⇒ 无可比对象，放行（不是「通过」，是没得比）",
    };
  }
  const version = release.tag.replace(/^v/, "");
  if (typeof release.body !== "string" || release.body.trim() === "") {
    return { ok: false, msg: `对账 —— ${release.tag} 的 Release 正文是空的，无法对账（正文形状走样，先查发布流程）` };
  }
  const releaseNotes = extractChangesBlock(release.body);
  if (releaseNotes === null) {
    return {
      ok: false,
      msg:
        `对账 —— ${release.tag} 的 Release 正文里没有「${CHANGES_HEADING}」块。\n` +
        `      正文的拼装格式（E6#43a：下载信息块 ＋ ${CHANGES_HEADING} ＋ CHANGELOG 段）走样了，先查 ${release.tag} 的正文。`,
    };
  }
  if (typeof repoSection !== "string") {
    return {
      ok: false,
      msg:
        `对账 —— 仓内 CHANGELOG.md 里没有 \`## v${version}\` 段，无法与已发 ${release.tag} 对账。\n` +
        `      若是 E6#164 的归档窗口把这段裁掉了，从归档档把该段临时取回核对后再处置。`,
    };
  }
  const repoNotes = normalizeNotes(repoSection);
  const relNotes = normalizeNotes(releaseNotes);
  if (relNotes === repoNotes) {
    return { ok: true, msg: `对账 —— 已发 ${release.tag} 正文「${CHANGES_HEADING}」块 ↔ 仓内 \`## v${version}\` 段逐字一致` };
  }
  const d = firstDiffLine(relNotes, repoNotes);
  return {
    ok: false,
    msg:
      `对账 —— 已发 ${release.tag} 正文与仓内 CHANGELOG 的 \`## v${version}\` 段**不一致**（第 ${d?.n ?? "?"} 行起）：\n` +
      `      Release 侧：${JSON.stringify(d?.release)}\n` +
      `      仓内　侧：${JSON.stringify(d?.repo)}\n` +
      `      已发 Release 是既成事实——改**仓内段**去对齐它（或 gh release edit 改 Release 并在记账里说明理由），\n` +
      `      ⛔ 不是默认拿仓内覆写 Release。修完重跑本门禁。`,
  };
}

function fail(msg) {
  process.stderr.write(`\n🔴 ${msg}\n`);
}

// ────────────────────────────────── 自测 ──────────────────────────────────

function runSelfTest() {
  const BODY_OK = [
    "## LinkDesk v0.2.33",
    "",
    "**下载：** [`linkdesk-setup-0.2.33.exe`](https://example) · **发布日期：** 2026-10-01 · **系统需求：** Windows 10/11 · 64-bit",
    "",
    CHANGES_HEADING,
    "",
    "- 主题显示名去双语化",
    "- 更新记录窗口入段",
    "",
  ].join("\n");
  const SECTION_OK = "- 主题显示名去双语化\n- 更新记录窗口入段";

  const cases = [];
  const push = (tag, result, wantOk) => cases.push([tag, result, wantOk]);

  // repoSlugFromGitRemote
  push("remote https", { ok: repoSlugFromGitRemote("https://github.com/Encaron/linkdesk.git") === "Encaron/linkdesk", msg: "" }, true);
  push("remote ssh", { ok: repoSlugFromGitRemote("git@github.com:Encaron/linkdesk.git") === "Encaron/linkdesk", msg: "" }, true);
  push("remote ssh:// 形态", { ok: repoSlugFromGitRemote("ssh://git@github.com/Encaron/linkdesk") === "Encaron/linkdesk", msg: "" }, true);
  push("remote 解析不出", { ok: repoSlugFromGitRemote("https://gitlab.com/a/b.git") === null, msg: "" }, true);
  push("remote 非字符串", { ok: repoSlugFromGitRemote(null) === null, msg: "" }, true);

  // extractChangesBlock
  push(
    "变更块提取",
    { ok: extractChangesBlock(BODY_OK) === SECTION_OK, msg: JSON.stringify(extractChangesBlock(BODY_OK)) },
    true
  );
  push("变更块缺头（形状走样）", { ok: extractChangesBlock("## LinkDesk v1\n\n正文没有块头") === null, msg: "" }, true);
  push("变更块 CRLF 归一", { ok: extractChangesBlock(BODY_OK.replace(/\n/g, "\r\n")) === SECTION_OK, msg: "" }, true);
  push("变更块非字符串", { ok: extractChangesBlock(null) === null, msg: "" }, true);

  // judgeNotesSync
  push("两侧一致（含尾部换行差）", judgeNotesSync({ release: { tag: "v0.2.33", body: BODY_OK }, repoSection: SECTION_OK + "\n" }), true);
  push("两侧一致（CRLF vs LF）", judgeNotesSync({ release: { tag: "v0.2.33", body: BODY_OK }, repoSection: SECTION_OK.replace(/\n/g, "\r\n") }), true);
  push("一字之差 ⇒ 红", judgeNotesSync({ release: { tag: "v0.2.33", body: BODY_OK }, repoSection: "- 主题显示名去双语化\n- 多出来的一行" }), false);
  push("行序颠倒 ⇒ 红", judgeNotesSync({ release: { tag: "v0.2.33", body: BODY_OK }, repoSection: "- 更新记录窗口入段\n- 主题显示名去双语化" }), false);
  push("无任何已发 Release ⇒ 出声放行", judgeNotesSync({ release: null, repoSection: SECTION_OK }), true);
  push("Release 正文空 ⇒ 红", judgeNotesSync({ release: { tag: "v0.2.33", body: "" }, repoSection: SECTION_OK }), false);
  push("正文缺变更块 ⇒ 红", judgeNotesSync({ release: { tag: "v0.2.33", body: "## LinkDesk v0.2.33" }, repoSection: SECTION_OK }), false);
  push("仓内无该段 ⇒ 红", judgeNotesSync({ release: { tag: "v0.2.33", body: BODY_OK }, repoSection: null }), false);

  let bad = 0;
  for (const [tag, result, wantOk] of cases) {
    const pass = result.ok === wantOk;
    if (!pass) bad++;
    process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} ${wantOk ? "应过" : "应红"} —— 实得 ${result.ok ? "过" : "红"}\n`);
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

function localRepoSlug() {
  const url = execFileSync("git", ["config", "--get", "remote.origin.url"], { cwd: ROOT, encoding: "utf8" });
  return repoSlugFromGitRemote(url);
}

async function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  // 🔴 主流程（联网后）**不用 `process.exit()`**：Windows 上 fetch 的 keep-alive 句柄还在收尾时
  //    硬退会撞 libuv 断言（`src\win\async.c UV_HANDLE_CLOSING`，2026-10-01 实测）——断言把退出码
  //    打成非零，「对账成功」会被 publish.mjs 当成「门禁红」。改设 exitCode 让循环自然收尾。
  const done = (code, msg, toStderr = false) => {
    if (msg !== undefined) (toStderr ? process.stderr : process.stdout).write(msg);
    process.exitCode = code;
  };

  const slug = localRepoSlug();
  if (!slug) {
    fail("对账 —— 从 git remote 推导不出 GitHub 仓库 slug（owner/repo），无法定位已发 Release。");
    process.exitCode = 1;
    return;
  }

  let release;
  try {
    release = await readLatestRelease(slug);
  } catch (e) {
    fail(`对账 —— 取 ${slug} 的最新 Release 失败：\n${e instanceof Error ? e.message : String(e)}\n   （${networkHint("已发 Release", "https://api.github.com/repos/" + slug + "/releases/latest")}）`);
    process.exitCode = 1;
    return;
  }
  if (release === null) {
    done(0, `✅ 对账 —— ${slug} 还没有任何已发 Release（首次发布？）⇒ 无可比对象，放行\n`);
    return;
  }

  const version = release.tag.replace(/^v/, "");
  const repoSection = changelogSection(readFileSync(CHANGELOG, "utf8"), version);
  const judged = judgeNotesSync({ release, repoSection });
  if (judged.ok) {
    done(0, `✅ ${judged.msg}\n`);
    return;
  }
  fail(judged.msg);
  process.exitCode = 1;
}

main();
