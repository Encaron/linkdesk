#!/usr/bin/env node
/**
 * 第三方钉体检——上游把「钉死的件」悄悄换掉，本脚本负责在**发版之前**（而不是 CI 第 6 分钟）说出来。
 *
 * 为什么要有它（2026-10-07 实例）：`https://www.7-zip.org/a/7zr.exe` 是**滚动 URL**（永远指向当前发布版），
 *   2026-10-05 上游把文件从 26.03 换成了 26.04。`fetch-7z.ps1` 按 sha256 拒收——**那是设计意图，不是缺陷**
 *   ——但发现它的地方是 **CI 的 Build 步**（tag 已推、已白等 6 分钟）：一次发版白付一整轮 CI。
 *   判据本身没问题，**缺的是「平常就有人问它」**（时间衰减型故障：与本次改了多少代码无关，
 *   只与「距上次发版多久」成正比）。本脚本＋ pre-push 预演就是那个人。
 *
 * 🔴 真源只有一处：钉子住 `fetch-7z.ps1` 的 `$url` / `$Sha256`（**下载时被判的就是它**），
 *   本脚本把它**解析出来**比对。⛔ 不在这里另抄一份哈希表——抄了就是第二份真值，
 *   改了 ps1 忘了这里 = 假绿（比没有更坏）。⇒ **加新钉子＝在 PINS 里加一行**（指到持有 url＋sha 的那个文件）。
 *
 * 口径与 check-bundled-freshness 一致：**默认联网，取不到上游就红**（不许假装绿）；
 *   明示降级用 `--offline`（只校验钉子解析得到、形状合法，**并出声说「上游那一半未验」**）。
 *
 * 本机要过代理（Node 的 fetch 默认不读环境变量）：
 *   export HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890 NODE_USE_ENV_PROXY=1
 *
 * 用法：
 *   node scripts/check-third-party-pins.mjs             # 联网比对（发布前 / pre-push 预演跑的）
 *   node scripts/check-third-party-pins.mjs --offline   # 明示降级：不出网
 *   node scripts/check-third-party-pins.mjs --self-test
 * 退出码：0 = 全对上；1 = 有钉子失配 / 取不到上游 / 解析不到钉子。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname ?? __dirname, "..");

/**
 * 钉子表：一条 = 「哪个文件持有上游 URL ＋ 期望 sha256」。
 * holder 为相对 repo 根的路径，脚本从它里面解析 `$url` / `$Sha256`（见文件头 🔴）。
 */
const PINS = [
  {
    name: "7zr.exe —— 安装器载荷解包器（7-Zip 官方独立版，进 RCDATA id 2）",
    holder: "build/installer/bootstrapper/tools/fetch-7z.ps1",
  },
];

/** 失配时给的是**查证流程**，不是「把新哈希抄进去」——2026-10-07 那次是正当换版，但流程不能省。 */
const REPIN_HINT = [
  "  上游换文件**可能正当**（官方重新打包 / 升版），但必须先查证再重钉：",
  "   ① 自己下载算哈希，与 build 日志报出的实际值对上；",
  "   ② 无参运行那个二进制，用**自身版本横幅**（不是 $Version 标签）与旧件、官方下载页三方对照；",
  "   ③ 期待字节大面积不同（重建件）——**同尺寸的近似副本才可疑**。",
  "  查完改 fetch-7z.ps1 的 $Sha256（＋ $Version 标签），同笔更新 CHANGELOG 的说明段。",
].join("\n");

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/** 从持有文件里解析 url / sha256 / version。取不到 url 或 sha256 ⇒ null（调用方判红：解析不到＝无从判定）。 */
function parsePin(text) {
  if (typeof text !== "string") return null;
  const url = text.match(/^\s*\$url\s*=\s*"([^"]+)"/m)?.[1] ?? null;
  const sha = text.match(/\$Sha256\s*=\s*"([0-9a-f]{64})"/i)?.[1]?.toLowerCase() ?? null;
  const version = text.match(/\$Version\s*=\s*"([^"]+)"/m)?.[1] ?? null;
  return url && sha ? { url, sha256: sha, version } : null;
}

/** 判据（纯函数）：上游此刻给的字节 == 钉住的哈希。actual 为空 ⇒ 取不到上游 ⇒ 红（fail-closed）。 */
function judgePin({ expected, actual }) {
  if (!actual) return { ok: false, msg: "取不到上游字节（无网络 / 被墙 / URL 404），无从判定" };
  if (expected === actual) return { ok: true, msg: `钉与上游一致（${expected.slice(0, 12)}…）` };
  return { ok: false, msg: `上游已换文件：钉 ${expected.slice(0, 12)}… ≠ 现 ${actual.slice(0, 12)}…` };
}

// ────────────────────────────────── 自测 ──────────────────────────────────

function runSelfTest() {
  const cases = [];
  const push = (label, result, wantOk) => cases.push([label, result, wantOk]);
  const H = "a".repeat(64);

  // 解析
  const holder = `$url = "https://example.com/x.exe"\n[string]$Version = "1.2"\n[string]$Sha256 = "${H}"\n`;
  const p = parsePin(holder);
  push(
    "解析：url / sha / version 三件齐",
    { ok: p?.url === "https://example.com/x.exe" && p?.sha256 === H && p?.version === "1.2", msg: JSON.stringify(p) },
    true
  );
  push("解析：拿不到 sha256 ⇒ 拒（判红口径）", { ok: parsePin('$url = "https://e/x"\n') === null, msg: "应为 null" }, true);
  push("解析：拿不到 url ⇒ 拒", { ok: parsePin(`$Sha256 = "${H}"\n`) === null, msg: "应为 null" }, true);
  push(
    "解析：sha 非 64 位十六进制（写坏/占位符）⇒ 拒",
    { ok: parsePin('$url = "https://e/x"\n$Sha256 = "TODO"\n') === null, msg: "应为 null" },
    true
  );
  push(
    "解析：大写十六进制归一为小写（同一颗，不因大小写假红）",
    { ok: parsePin(`$url = "u"\n$Sha256 = "${"A".repeat(64)}"\n`)?.sha256 === H, msg: "应归一小写" },
    true
  );
  push(
    "解析：注释里出现 $Version（无 `= \"…\"`）不当真",
    { ok: parsePin('# refresh $Version to the banner version\n$url = "u"\n') === null, msg: "应为 null" },
    true
  );

  // 判据本体
  push("判据：一致 ⇒ 过", judgePin({ expected: H, actual: H }), true);
  push("判据：上游换文件（负例——2026-10-07 就是这个形状）", judgePin({ expected: H, actual: "b".repeat(64) }), false);
  push("判据：取不到上游 ⇒ 红（fail-closed，不许假装绿）", judgePin({ expected: H, actual: null }), false);

  // 真源：仓内那把钉子必须真解析得到（挡「有人改了 ps1 的形状」）
  const realAbs = join(ROOT, PINS[0].holder);
  const realParsed = existsSync(realAbs) ? parsePin(readFileSync(realAbs, "utf8")) : null;
  push(
    "真源：仓内 fetch-7z.ps1 解析得到 https url ＋ 64 位 sha",
    { ok: realParsed !== null && /^https:\/\//.test(realParsed.url), msg: JSON.stringify(realParsed) },
    true
  );

  let bad = 0;
  for (const [label, result, wantOk] of cases) {
    const pass = result.ok === wantOk;
    if (!pass) bad++;
    process.stdout.write(`${pass ? "✅" : "🔴"} ${label} ${wantOk ? "应过" : "应红"} —— 实得 ${result.ok ? "过" : "红"}\n`);
    if (!pass) process.stderr.write(`\n🔴 ${result.msg}\n`);
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ 自测全过（${cases.length} 例：负例确实会红、正例确实会过）——体检不是在恒绿。\n`
      : `\n🔴 自测 ${bad} 例不符。\n`
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

async function download(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function run({ offline }) {
  let bad = 0;
  for (const pin of PINS) {
    process.stdout.write(`\n[3rd-party-pins] ${pin.name}\n  持有：${pin.holder}\n`);
    const abs = join(ROOT, pin.holder);
    if (!existsSync(abs)) {
      process.stdout.write(`  🔴 持有文件不存在——钉子被删了？\n`);
      bad++;
      continue;
    }
    const parsed = parsePin(readFileSync(abs, "utf8"));
    if (!parsed) {
      process.stdout.write(`  🔴 在持有文件里解析不到 $url/$Sha256（钉子的写法变了？本脚本的解析要跟着改）\n`);
      bad++;
      continue;
    }
    process.stdout.write(
      `  钉住：${parsed.sha256.slice(0, 12)}…   版本标签：${parsed.version ?? "(无)"}\n  上游：${parsed.url}\n`
    );
    if (offline) {
      process.stdout.write("  ⚠️  --offline：**上游那一半未验**——发布前必须联网再跑一次。\n");
      continue;
    }
    let actual = null;
    try {
      actual = sha256(await download(parsed.url));
    } catch (e) {
      process.stdout.write(`  🔴 取不到上游：${e.message}\n`);
      process.stdout.write(
        "     若本机需要代理：export HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890 NODE_USE_ENV_PROXY=1\n"
      );
      bad++;
      continue;
    }
    const judged = judgePin({ expected: parsed.sha256, actual });
    process.stdout.write(`  ${judged.ok ? "✅" : "🔴"} ${judged.msg}\n`);
    if (!judged.ok) {
      process.stdout.write(`${REPIN_HINT}\n`);
      bad++;
    }
  }
  process.stdout.write(
    bad === 0
      ? offline
        ? "\n[3rd-party-pins] ⚠️ 解析全绿，但**上游那一半按 --offline 未验**。\n"
        : "\n[3rd-party-pins] ✓ 钉子与上游一致。\n"
      : `\n[3rd-party-pins] 🔴 ${bad} 处未过。\n`
  );
  return bad === 0 ? 0 : 1;
}

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) {
  runSelfTest();
} else if (argv.some((a) => a !== "--offline")) {
  process.stderr.write(`[3rd-party-pins] 未知参数：${argv.filter((a) => a !== "--offline").join(" ")}\n`);
  process.exit(2);
} else {
  process.exit(await run({ offline: argv.includes("--offline") }));
}
