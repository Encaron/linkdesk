#!/usr/bin/env node
/**
 * 推 tag 前的「发版预演」——把 CI 六分钟后才告诉你的答案，提前到推之前的三十秒。
 *
 * 为什么要有它（2026-10-07，用户原话：「发版一次，半个小时发不出去，这谁都会着急」）：
 *   v0.2.52 的 tag 推上去后 CI 第 28 秒红在判据⑤——`@linkdesk/ui` 作者面漂移，起因是**一笔文档归档**
 *   顺手改了共享件里一条注释的路径；修完再推，第 6 分钟又红在 Build 步——上游把钉死的 7zr 换了文件。
 *   **两次都不是代码写错，是「只有发版那一下才照见的漂移」**，而照见它要付一整轮 CI（≈10 分钟）。
 *   判据其实早就写好了（`check-publish-gate.mjs` 本地就能跑、`check-third-party-pins.mjs` 就是为这次写的）
 *   —— **缺的只是「没人会在推之前想起来跑」**。⇒ 挂成 pre-push 钩子：红了就推不出去。
 *
 * 挂钩位置（lefthook.yml 的 pre-push）：git 在**真正推送之前**调它；非零退出 ⇒ 推送中止。
 *   ⚠️ 本脚本只在**本次推的是 `refs/tags/v*`** 时才干活（普通分支推送静默放行——不是发版别拖慢它）；
 *      删 tag（local oid 全零）也放行。
 *
 * 跑什么（顺序＝从便宜到贵，红一个就停，省时间）：
 *   ① 发布门禁 ①②③⑤（**离线**，秒级）—— `check-publish-gate.mjs --expect-tag <tag> --pre-push`
 *   ② 已发 Release 正文对账（联网只读，E6#167）—— 改过**已发布**的 CHANGELOG 段就红
 *   ③ 出厂种子新鲜（联网）—— 攒批档没人代跑它
 *   ④ 第三方钉（联网）—— 上游换没换文件（含 7zr）
 *   ⛔ **本地全量门禁（`npm run check`）刻意不在这**：那是 pre-push 上另一条 job 的活，且 CI 会重跑。
 *
 * 逃生口：`git push --no-verify`（git 机制，跳过全部钩子）。**CI 的 tag 运行仍是最后防线**——
 *   本钩子的价值是**省掉一轮 CI**，不是取代它。
 *
 * 用法：
 *   node scripts/pre-push-release-rehearsal.mjs                 # 钩子调用（refs 从 git 的 stdin 读）
 *   node scripts/pre-push-release-rehearsal.mjs --tag v0.2.52   # 手动预演
 *   node scripts/pre-push-release-rehearsal.mjs --offline       # 明示降级：只跑不需要网络的那条
 * 退出码：0 = 可推；1 = 有红（git 会中止推送）。
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname ?? __dirname, "..");

const PROXY_HINT = [
  "  本机联网判据若因代理红：Node 的 fetch 默认不读环境变量，先在**同一个窗口**里",
  "    export HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890 NODE_USE_ENV_PROXY=1",
  "    （git 钩子继承你 shell 的环境）然后重推。",
].join("\n");

const AFTER_FIX = [
  "",
  "修完再推同一版即可——**失败未发布的 tag 可以移动重打**（先例 v0.2.12 / v0.2.22 / v0.2.50）。",
  "⛔ 已发布过的 tag 归用户（撤版 / 改写已发布 tag 不由 AI 做）。",
  "逃生口：`git push --no-verify`（放弃省钱，不是放弃发版——CI 仍会跑同一批判据）。",
].join("\n");

/**
 * git pre-push 的 stdin 协议：每行 `<local ref> <local oid> <remote ref> <remote oid>`。
 * 只挑本次真在推的版本 tag；**删 tag** 时 local oid 是全零 40 位 ⇒ 不算发版，不预演。
 */
function pushedVersionTags(stdinText) {
  const tags = [];
  for (const line of stdinText.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const [localRef, localOid] = parts;
    if (!localRef.startsWith("refs/tags/v")) continue;
    if (!/^[0-9a-f]{40}$/.test(localOid) || /^0{40}$/.test(localOid)) continue;
    tags.push(localRef.slice("refs/tags/".length));
  }
  return tags;
}

/** 读 stdin（钩子把 refs 打进来）。TTY / 无输入 ⇒ 空串，不阻塞。 */
function readStdin() {
  if (process.stdin.isTTY) return "";
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function runStep(name, args) {
  process.stdout.write(`\n▶ ${name}\n`);
  const res = spawnSync(process.execPath, args, { cwd: ROOT, stdio: "inherit" });
  const ok = res.status === 0;
  process.stdout.write(`${ok ? "✅" : "🔴"} ${name}\n`);
  return ok;
}

function main() {
  const argv = process.argv.slice(2);
  const offline = argv.includes("--offline");
  const tagIdx = argv.indexOf("--tag");
  let tag = tagIdx >= 0 ? (argv[tagIdx + 1] ?? null) : null;
  if (tagIdx >= 0 && !tag) {
    process.stderr.write("🔴 --tag 后面要跟一个 tag 名（如 --tag v0.2.52）\n");
    return 1;
  }
  if (tag === null) {
    const stdinText = readStdin();
    tag = pushedVersionTags(stdinText)[0] ?? null;
    if (tag === null && stdinText.trim() === "") {
      // 🔴 这不是「没有 tag」而是「**读不到 git 说的话**」——2026-10-07 实测踩到：lefthook 默认
      //    不把 stdin 转给 job，于是推 tag 时脚本读了个空、静默放行（hook 在、闸不在 = 假门禁）。
      //    兜底口径：**大声说这次没跑**，绝不装作通过。
      process.stdout.write(
        "⚠️  读不到 git 的 refs（stdin 是空的）⇒ **发版预演这次没跑**。\n" +
          "   推分支时 stdin 必有内容；为空通常意味着钩子丢了 `use_stdin: true`\n" +
          "   （lefthook.yml 的 release rehearsal job）——那是假门禁，别放着不管。\n" +
          "   手工补跑：node scripts/pre-push-release-rehearsal.mjs --tag v<版本>\n"
      );
      return 0;
    }
    if (tag === null) {
      process.stdout.write("ℹ️  本次推送不含版本 tag（refs/tags/v*）——发版预演不适用，直接放行。\n");
      return 0;
    }
  }

  process.stdout.write(
    `\n🔎 发版预演：本次推 tag **${tag}**${offline ? "（--offline 明示降级）" : ""}\n` +
      `   跑的是 CI 在 tag 运行里会跑的、且**本地跑得动**的那些判据——红了就推不出去（git 中止推送）。\n`
  );

  const steps = [
    {
      name: "① 发布门禁 ①②③⑤（离线，秒级）",
      args: ["scripts/check-publish-gate.mjs", "--expect-tag", tag, "--pre-push"],
      skipOffline: false,
    },
    {
      name: "② 已发 Release 正文对账（联网只读，E6#167）",
      args: ["scripts/check-release-notes-sync.mjs"],
      skipOffline: true,
    },
    {
      name: "③ 出厂种子新鲜（联网）",
      args: ["scripts/check-bundled-freshness.mjs"],
      offlineArgs: ["--offline"],
    },
    {
      name: "④ 第三方钉（联网）",
      args: ["scripts/check-third-party-pins.mjs"],
      offlineArgs: ["--offline"],
    },
  ];

  for (const s of steps) {
    if (offline && s.skipOffline) {
      process.stdout.write(`\n⚠️  --offline：跳过「${s.name}」——**这一条今天没验**（它没有降级档）。\n`);
      continue;
    }
    const args = offline && s.offlineArgs ? [...s.args, ...s.offlineArgs] : s.args;
    if (!runStep(s.name, args)) {
      process.stdout.write(
        `\n🔴 预演未过 ⇒ **推送已中止**（本钩子非零退出，git 不推）。\n${PROXY_HINT}\n${AFTER_FIX}\n`
      );
      return 1;
    }
  }

  process.stdout.write(
    `\n✅ 预演全过 ⇒ 可以推了。${offline ? "（⚠️ --offline：联网那几条没验）\n" : "\n"}` +
      `   ⚠️ 本地绿 ≠ CI 绿：CI 的 tag 运行仍会重跑同一批判据（那是最后防线，不是重复劳动）。\n`
  );
  return 0;
}

process.exit(main());
