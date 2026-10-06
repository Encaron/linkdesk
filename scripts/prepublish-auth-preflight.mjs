/**
 * 作者轴发布前的**凭据预检**——把「401 到期」从 publish 那一刻前移到开工第一秒（2026-10-07 立）。
 *
 * 用法：
 *   node scripts/prepublish-auth-preflight.mjs              # 两把钥匙都探（人 / 开工第一句用）
 *   node scripts/prepublish-auth-preflight.mjs --npm        # 只探 npm（五个包的 prepublishOnly 用它）
 *   node scripts/prepublish-auth-preflight.mjs --github     # 只探 SDK 的 GitHub PAT
 *   node scripts/prepublish-auth-preflight.mjs --self-test  # 自测（不联网）
 * 退出码：0 = 没有红；1 = 有「被拒 / 未配置（该轴必需）/ 连不上 / 探针与 SDK 不同源」。
 *   ⚠️ GitHub PAT「未配置」**不算红**（有些机器本来就没有）；npm 那把「未配置」= 红（发布必失败）。
 *
 * ── 为什么要有它（两把钥匙，各有一个已实测的到期事故）──
 *   作者轴发布要两把**不同的**钥匙，历史上各自出过一次「到期」：
 *     ① **npm token**（`~/.npmrc` 的 `//registry.npmjs.org/:_authToken=`）——发五根轴用；granular token
 *        **是带到期日的**（当前那枚 30 天期，约 2026-10-25 过期）。
 *     ② **GitHub PAT**（`{configDir}/linkdesk-sdk/config.json` 的 `githubToken`，env `LINKDESK_GITHUB_TOKEN`
 *        优先）——`linkdesk-plugin-sdk publish` 建 Release / 往官方目录写用；2026-09-14 实测死于 7 天到期
 *        （see memory `version-and-release` §7）。
 *   🔴 两把钥匙**有效期谁都读不出来**（npm 与 GitHub 都没有「查我这枚 token 何时过期」的命令），
 *   所以「过期」这件事只会在**用它那一下**以 401 露头——那时 bump/CHANGELOG 都已备好。
 *   ⇒ 判定点前移：把「钥匙今天还能用吗」挪到**发布动作的第一秒**。
 *
 * ── 接线处（⛔ 刻意不进 `npm run check`）──
 *   · 五个可发布包的 `prepublishOnly`（contracts / plugin-sdk / linkdesk-ui / plugin-docs /
 *     create-linkdesk-plugin，各按 `--npm`）。npm 的语义保证 `prepublishOnly` **只在 `npm publish`
 *     前跑、`npm install` 不跑** ⇒ 它落在**发布动作之内**，而不是每个开发者每次提交里。
 *   · ⛔ **不进 `npm run check`**：那条链是全体开发者（含无凭据环境）都要跑的，塞进去就是给所有人一个假红。
 *     故本文件名**故意不叫 `check-*.mjs`**（不属 `check-gate-health.mjs` 的域，也不是一次仓库判据——
 *     它判的是**这台机器此刻有没有钥匙**）。
 *
 * ── 🔴 npm 那半边：`--registry` 必须写死（2026-10-07 实测，别省）──
 *   `npm whoami` 不带 `--registry` 会落到**用户级默认源** `registry.npmmirror.com`（那里没有凭据）
 *   ⇒ 返回 `ENEEDAUTH`（实测 exit 1）。带上 `--registry=https://registry.npmjs.org/` ⇒ 返回真实身份。
 *   **不带 = 假红**，而「假红让真红失效」是本案最贵的坏法 ⇒ registry 写成常量、⛔ 不接受命令行传入
 *   （顺带免掉把外部输入拼进 `shell: true` 命令行的注入面）。
 *
 * ── 🔴 GitHub 那半边：探针与 SDK 必须**同源**（跨包 import 不了，故各写一份 + 锚点防漂移）──
 *   SDK 的取钥匙处 = `packages/plugin-sdk/src/publish.ts` 的 `sdkConfigDir()` / `readStoredToken()`，
 *   两个函数**都没 export**（dist 里也没），而 SDK CLI 没有可查询的子命令（`publish --dry-run` 明文
 *   「只预览不碰网络」，验不了钥匙）。⇒ 本脚本自己算路径，并用**源码锚点**把「SDK 改了取钥匙处」
 *   变成**红**（`judgeSdkSource`）——否则这里会永远报「未配置」而 publish 在别处 401 = 假门禁。
 *
 * ── 判定式 ──
 *   npm：① 退出 0 **且 stdout 有非空、像用户名的读数** ⇒ ✅（🔴 拿不到读数**不许说绿**——防恒绿老病；
 *        `npm warn …` 之类噪声行先滤掉）。② `ENEEDAUTH` ⇒ 🔴 没配。③ `401`/`E401` ⇒ 🔴 被拒（到期最常见）。
 *        ④ 网络类（ENOTFOUND/ECONNRESET/ETIMEDOUT/EAI_AGAIN…）⇒ 🔴 连不上。
 *        🔴 网络类**不**做「不可达 ⇒ 黄放行」的降级：publish 要的是同一条网络、同一份凭据，它红 ⇒
 *        publish 一秒后必红 ⇒ 不产生额外假红。（外部依赖类的降级规则见 `check-third-party-pins.mjs`，那边有 CI 兜底。）
 *   PAT：① 同源锚点缺 ⇒ 🔴（先修探针，**不再给钥匙读数**——拿一条不再可信的路径算出来的「未配置」是骗人的）。
 *        ② 未配置（env 与配置档都没有 `githubToken`）⇒ ⚠️ 不红。③ `GET /user` 200 **且 body 有 `login`** ⇒ ✅。
 *        ④ 401 ⇒ 🔴 被拒（带 `Bad credentials` = 请求带了 token 但它被拒，与「根本没带」是两回事，see §7 诊断三步）。
 *        ⑤ 403 ⇒ 🔴（多为限流/被拦）。⑥ 网络类 ⇒ 🔴。⑦ 其它 ⇒ 🔴 + 原文尾部（不硬猜）。
 *
 * ── ⛔ 域外声明（它**不**判什么）──
 *   · ⛔ 不判「这枚钥匙有没有该包的**写权限**」：只有真上传才知道；`npm publish --dry-run` **不上传**，验不了写权。
 *   · ⛔ 不判**到期日**（读不出来）：日期是**你签发时定的**——现值记在记忆库 `version-and-release`，
 *     **换钥匙时同笔更新那里**（本脚本内⛔ 不写日期，免得腐烂成一个骗人的读数）。
 *   · ⛔ 与**软件本体（壳）发版无关**：壳的 tag 运行吃 CI 自带的 `secrets.GITHUB_TOKEN`，跟这两把钥匙都没关系
 *     （见 `.github/workflows/build.yml`）——本预检只护**作者轴**。
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 🔴 写死（理由见文件头）——⛔ 不接受命令行传入 */
const NPM_REGISTRY = "https://registry.npmjs.org/";
const GITHUB_USER_API = "https://api.github.com/user";

const PROXY_HINT =
  "   若本机需要代理：export HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890 NODE_USE_ENV_PROXY=1";

/** npm 的噪声行（warn/notice 不该被当成用户名读数） */
const NOISE = /^npm (warn|notice|error|ERR)/i;

/** 用户名形状——拿不到「像用户名」的读数就不许说绿（防恒绿） */
const USERNAME = /^[a-z0-9][a-z0-9._-]*$/i;

/** 探针 ↔ SDK 的同源锚点（各写一份 + 锚点防漂移，理由见文件头） */
const SDK_SOURCE = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "plugin-sdk", "src", "publish.ts");
const SDK_ANCHORS = [
  { text: 'join(base, "linkdesk-sdk")', why: "配置目录名（sdkConfigDir）" },
  { text: "process.env.LINKDESK_GITHUB_TOKEN", why: "env 覆盖优先那条链路" },
];

// ────────────────────────────── 判据（纯函数，自测直接喂它） ──────────────────────────────

/** npm 那半边：判 `npm whoami` 的一次运行。 */
export function classifyNpm({ status, stdout = "", stderr = "" }) {
  if (status === 0) {
    const lines = stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((l) => !NOISE.test(l));
    const user = lines.length > 0 ? lines[lines.length - 1] : "";
    const saw = `实得输出：${JSON.stringify(`${stdout}${stderr}`.trim().slice(-200))}`;
    if (user === "") {
      return { ok: false, kind: "silent", msg: `退出 0 但**读不到用户名**——不认这个绿（读数拿不到就不是绿）。${saw}` };
    }
    if (!USERNAME.test(user)) {
      return { ok: false, kind: "garbled", msg: `退出 0，但读数不像用户名（输出变了？别当绿）。${saw}` };
    }
    return { ok: true, kind: "ok", user, msg: `身份：${user}` };
  }
  const text = `${stdout}\n${stderr}`;
  if (/ENEEDAUTH/.test(text)) {
    return {
      ok: false,
      kind: "no-credential",
      msg: "这台机器**没配上 npmjs 凭据**（`~/.npmrc` 里没有 `//registry.npmjs.org/:_authToken=`，或 token 被删了）",
    };
  }
  if (/E401|\b401\b/.test(text)) {
    return { ok: false, kind: "rejected", msg: "**凭据被拒**——到期是这一类里最常见的原因（也可能被吊销 / 抄错）" };
  }
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|ETIMEOUT|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|socket hang up/i.test(text)) {
    return { ok: false, kind: "network", msg: "连不上 registry.npmjs.org" };
  }
  return { ok: false, kind: "other", msg: `未知失败：${text.split(/\r?\n/).filter(Boolean).slice(-3).join(" / ")}` };
}

/** 探针的路径还算不算数——SDK 改了取钥匙处就红（锚点见文件头）。 */
export function judgeSdkSource(text) {
  const missing = SDK_ANCHORS.filter((a) => !text.includes(a.text));
  if (missing.length > 0) {
    return {
      ok: false,
      kind: "drift",
      msg: `探针与 SDK 取钥匙处**不再同源**（缺锚点：${missing.map((m) => m.why).join(" / ")}）——本探针给的读数不可信，先去核对 SDK 的取钥匙处`,
    };
  }
  return { ok: true, kind: "ok", msg: "同源锚点在" };
}

/** GitHub PAT 那半边：判一次 `GET /user`。 */
export function classifyGithub({ configured, status, bodyText = "", errorMessage = null }) {
  if (!configured) {
    return {
      ok: true,
      kind: "unconfigured",
      warn: true,
      msg: "**未配置**（env `LINKDESK_GITHUB_TOKEN` 与配置档 `githubToken` 都没有）——只在 `sdk publish` / 目录写入时才需要它",
    };
  }
  if (errorMessage) {
    return { ok: false, kind: "network", msg: `连不上 api.github.com：${errorMessage}` };
  }
  if (status === 200) {
    let login = "";
    try {
      login = String(JSON.parse(bodyText)?.login ?? "");
    } catch {
      login = "";
    }
    if (login === "") {
      return { ok: false, kind: "silent", msg: "HTTP 200 但 body 里没有 `login`——不认这个绿" };
    }
    return { ok: true, kind: "ok", user: login, msg: `身份：${login}` };
  }
  if (status === 401) {
    const bad = /Bad credentials/i.test(bodyText);
    return {
      ok: false,
      kind: "rejected",
      msg: bad
        ? "**凭据被拒**（`Bad credentials` = 请求带了 token、但这枚 token 已被拒 ⇒ 到期/吊销）"
        : "401（请求可能根本没带上 token）",
    };
  }
  if (status === 403) {
    return { ok: false, kind: "forbidden", msg: "403——多为限流或被拦（不是 token 过期的典型形态，但它用不了）" };
  }
  return { ok: false, kind: "other", msg: `未知 HTTP ${status}：${bodyText.slice(0, 200)}` };
}

// ────────────────────────────── 取读数（真跑） ──────────────────────────────

function probeNpm() {
  // 走 shell —— Windows 上 npm 是 npm.cmd（不经 shell 直接 spawn 会 EINVAL，see scripts/publish.mjs）
  const r = spawnSync(`npm whoami --registry=${NPM_REGISTRY}`, {
    encoding: "utf8",
    shell: true,
    windowsHide: true,
  });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** 读 SDK 那把 PAT。🔴 只回「有没有 / 从哪来」，**⛔ 一个字符都不打印**。 */
export function readSdkPat(env = process.env) {
  const fromEnv = env.LINKDESK_GITHUB_TOKEN;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") {
    return { token: fromEnv.trim(), source: "环境变量 LINKDESK_GITHUB_TOKEN" };
  }
  const home = env.USERPROFILE || env.HOME || "";
  const base =
    env.APPDATA && process.platform === "win32"
      ? env.APPDATA
      : env.XDG_CONFIG_HOME && process.platform !== "darwin"
        ? env.XDG_CONFIG_HOME
        : process.platform === "darwin"
          ? join(home, "Library", "Application Support")
          : join(home, ".config");
  const cfgPath = join(base, "linkdesk-sdk", "config.json"); // 与 sdkConfigDir() 同形，锚点守它
  if (!existsSync(cfgPath)) return { token: null, source: null, cfgPath };
  try {
    const parsed = JSON.parse(readFileSync(cfgPath, "utf8"));
    const t = parsed?.githubToken;
    if (typeof t === "string" && t.trim() !== "") return { token: t.trim(), source: cfgPath };
    return { token: null, source: null, cfgPath };
  } catch (e) {
    return { token: null, source: null, cfgPath, parseError: e.message };
  }
}

function probeSdkSource() {
  try {
    return judgeSdkSource(readFileSync(SDK_SOURCE, "utf8"));
  } catch (e) {
    return { ok: false, kind: "drift", msg: `读不到 SDK 取钥匙处（${SDK_SOURCE}）：${e.message}` };
  }
}

async function probeGithub() {
  const cred = readSdkPat();
  if (!cred.token) return { cred, result: classifyGithub({ configured: false }) };
  try {
    const res = await fetch(GITHUB_USER_API, {
      headers: {
        Authorization: `token ${cred.token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "linkdesk-prepublish-auth-preflight",
      },
    });
    const bodyText = await res.text().catch(() => "");
    return { cred, result: classifyGithub({ configured: true, status: res.status, bodyText }) };
  } catch (e) {
    return { cred, result: classifyGithub({ configured: true, errorMessage: e.message }) };
  }
}

// ────────────────────────────── 主流程 ──────────────────────────────

function line(mark, title, msg) {
  process.stdout.write(`${mark} ${title}\n   ${msg}\n`);
}

async function run({ npm, github }) {
  let red = 0;
  let warn = 0;
  process.stdout.write(`\n🔑 作者轴凭据预检（${npm && github ? "两把钥匙" : npm ? "npm" : "GitHub PAT"}）\n`);

  if (npm) {
    const r = classifyNpm(probeNpm());
    line(r.ok ? "✅" : "🔴", "npm token（五根轴的 publish）", r.msg);
    if (!r.ok) {
      red++;
      const next = {
        "no-credential":
          "   下一步：去 npmjs.com → Access Tokens 建一枚 granular token（须 bypass-2FA 或准备好 OTP），写进 ~/.npmrc 的\n" +
          "   `//registry.npmjs.org/:_authToken=<新 token>`；把新的**到期日**同笔更新到记忆库 version-and-release。",
        rejected:
          "   下一步：十有八九是**到期**。重新签发（记住到期日）→ 更新 ~/.npmrc → 同笔更新记忆库里的到期日 → 重跑本预检。",
        network: `   下一步：先确认网络/代理能到 registry.npmjs.org。\n${PROXY_HINT}`,
      }[r.kind];
      if (next) process.stdout.write(`${next}\n`);
    }
  }

  if (github) {
    const drift = probeSdkSource();
    if (!drift.ok) {
      line("🔴", "GitHub PAT（sdk publish / 目录写入）", drift.msg);
      process.stdout.write(`   看的地方：${SDK_SOURCE}\n   下一步：核对 SDK 的 sdkConfigDir/readStoredToken，改完同笔更新本脚本的锚点与路径。\n`);
      red++;
    } else {
      const { cred, result } = await probeGithub();
      if (result.warn) {
        warn++;
        process.stdout.write(`⚠️  GitHub PAT（sdk publish / 目录写入）\n   ${result.msg}\n`);
        if (cred.parseError) process.stdout.write(`   ⚠️ 配置档读不动：${cred.parseError}\n`);
        if (cred.cfgPath) process.stdout.write(`   看的地方：${cred.cfgPath}\n`);
      } else {
        line(result.ok ? "✅" : "🔴", "GitHub PAT（sdk publish / 目录写入）", result.msg);
        if (cred.source) process.stdout.write(`   来源：${cred.source}\n`);
        if (!result.ok) {
          red++;
          if (result.kind === "rejected") {
            process.stdout.write(
              "   下一步：重新签发经典 PAT（勾 `repo` 即可：建 Release + 传 asset + Contents PUT），写进配置档或\n" +
                "   设 LINKDESK_GITHUB_TOKEN；🔴 **绝不要把这枚 token 贴进对话**（对话进 transcript = 钥匙写进磁盘明文）。\n" +
                "   诊断三步（想看它到底死于何时）见 memory `version-and-release` §7。\n"
            );
          } else if (result.kind === "network") {
            process.stdout.write(`   下一步：先确认网络能到 api.github.com（实测直连可通）。\n${PROXY_HINT}\n`);
          }
        }
      }
    }
  }

  const tail =
    red > 0
      ? `\n🔴 预检未过（${red} 处）⇒ **先修钥匙再开工**：现在炸比 bump 完、CHANGELOG 写完再炸便宜。\n\n`
      : warn > 0
        ? `\n✅ 没有红（${warn} 处提示见上——不在提示那条轴上的发布不受影响）。\n` +
          "   ⚠️ 到期日机器读不出来——换钥匙时**同笔**更新记忆库 `version-and-release` 里的日期。\n\n"
        : "\n✅ 预检全过：该探的钥匙都可用。\n" +
          "   ⚠️ 到期日机器读不出来——换钥匙时**同笔**更新记忆库 `version-and-release` 里的日期。\n\n";
  process.stdout.write(tail);
  return red === 0 ? 0 : 1;
}

// ────────────────────────────── 自测（不联网） ──────────────────────────────

function runSelfTest() {
  const cases = [
    ["npm：真名 ⇒ 过", classifyNpm({ status: 0, stdout: "fengyili\n" }), true],
    ["npm：warn 噪声在 stderr、真名在 stdout ⇒ 过", classifyNpm({ status: 0, stdout: "fengyili\n", stderr: 'npm warn Unknown project config "electron_mirror"\n' }), true],
    ["npm：退出 0 但空读数 ⇒ **红**（不认恒绿）", classifyNpm({ status: 0, stdout: "" }), false],
    ["npm：退出 0 但读数不像用户名 ⇒ **红**", classifyNpm({ status: 0, stdout: 'npm warn Unknown project config "electron_mirror"\n' }), false],
    ["npm：ENEEDAUTH ⇒ 红", classifyNpm({ status: 1, stderr: "npm error code ENEEDAUTH" }), false],
    ["npm：401 ⇒ 红", classifyNpm({ status: 1, stderr: "npm error code E401\nnpm error 401 Unauthorized" }), false],
    ["npm：ENOTFOUND ⇒ 红", classifyNpm({ status: 1, stderr: "npm error code ENOTFOUND" }), false],
    [
      "同源：SDK 源码含两个锚点 ⇒ 过",
      judgeSdkSource('return join(base, "linkdesk-sdk"); // process.env.LINKDESK_GITHUB_TOKEN'),
      true,
    ],
    [
      "同源：SDK 改了配置目录名 ⇒ **红**（探针读数不再可信）",
      judgeSdkSource("return join(base, 'somewhere-else');"),
      false,
    ],
    ["PAT：未配置 ⇒ **不红**（黄）", classifyGithub({ configured: false }), true],
    ["PAT：200 有 login ⇒ 过", classifyGithub({ configured: true, status: 200, bodyText: '{"login":"Encaron"}' }), true],
    ["PAT：200 无 login ⇒ **红**", classifyGithub({ configured: true, status: 200, bodyText: "{}" }), false],
    ["PAT：401 Bad credentials ⇒ 红", classifyGithub({ configured: true, status: 401, bodyText: '{"message":"Bad credentials"}' }), false],
    ["PAT：403 ⇒ 红", classifyGithub({ configured: true, status: 403, bodyText: "rate limited" }), false],
    ["PAT：网络 ⇒ 红", classifyGithub({ configured: true, errorMessage: "getaddrinfo ENOTFOUND" }), false],
  ];
  let bad = 0;
  for (const [label, result, wantOk] of cases) {
    const good = result.ok === wantOk;
    if (!good) bad++;
    process.stdout.write(`${good ? "✅" : "🔴"} ${label} ${wantOk ? "应过" : "应红"} —— 实得 ${result.ok ? "过" : "红"}\n`);
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ 自测全过（${cases.length} 例：负例确实会红、正例确实会过）——预检不是在恒绿。\n`
      : `\n🔴 自测 ${bad} 例不符。\n`
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────── 入口 ──────────────────────────────

const argv = process.argv.slice(2);
const known = new Set(["--npm", "--github", "--self-test"]);
const unknown = argv.filter((a) => !known.has(a));
if (unknown.length > 0) {
  process.stderr.write(`[prepublish-auth-preflight] 未知参数：${unknown.join(" ")}\n`);
  process.exit(2);
}
if (argv.includes("--self-test")) {
  runSelfTest();
} else {
  const only = argv.includes("--npm") || argv.includes("--github");
  process.exit(
    await run({ npm: only ? argv.includes("--npm") : true, github: only ? argv.includes("--github") : true })
  );
}
