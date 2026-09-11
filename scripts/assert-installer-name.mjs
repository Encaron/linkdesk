/**
 * E6#42e：安装包文件名门禁——「磁盘名 = latest.yml 指的 = 契约名」三处必须同一个名字。
 *
 * 背景（2026-09-11 读 electron-builder 26.15.3 源码实证，非推测）：
 *   本仓 git remote 指向 github ⇒ electron-builder 自动推定 publish provider = github
 *   （仓里一个 publish 配置都没写，PublishManager.js:217-222）。此时代码走这条链：
 *     不写 artifactName → NSIS 默认名 "LinkDesk Setup 0.1.47.exe"（含空格）
 *     → 空格不在 GitHub 允许的 [0-9A-Za-z._-] 内 → isSafeGithubName 判假
 *     → 只把空格换成连字符得 "LinkDesk-Setup-0.1.47.exe"（platformPackager.js:690）
 *     → 写进 latest.yml 的 path / files[].url（updateInfoBuilder.js:100）
 *     → 🔴 磁盘文件却仍叫带空格那个（不改名）
 *   ⇒ latest.yml 指着一个从不存在的文件；更新器读 path 去找 asset ⇒ 下载 404 asset-missing。
 *   写 artifactName 后全串字符都在安全集内 ⇒ safeArtifactName 返回 null ⇒ 不再改写 ⇒ 四处同名。
 *
 * 为什么本门禁不挂 `npm run check`：
 *   它判的是**构建产物**（.exe + latest.yml 都在磁盘上才成立）。`npm run check` 在每次提交都跑、
 *   当时通常没有产物 ⇒ 要么恒红、要么「找不到就跳过」= 恒绿假门禁。故挂在 electron:build 之后（见
 *   package.json）与 CI 的 Build 步骤之后（02-发布流水线 §1.1）。
 *
 * 🔴 三条判据的分工（缺一条就漏一类事故）：
 *   ① 配置层——electron-builder.yml 顶层 artifactName 是否**逐字符等于**契约模板。
 *      防「有人觉得名字难看顺手改了 / 删了」。**契约写死在本文件，不从现场读**——若也从现场读，
 *      改坏配置时两边一起变 ⇒ 断言恒真 = 假门禁（memory `snapshot-shadows-truth-bug-class` ①）。
 *   ② 产物层——输出目录顶层**有且只有一个** .exe，且逐字符等于 `{name}-setup-{version}.exe`。
 *      「有且只有一个」是刻意的：0 个若判过 ⇒ 偷懒写法「什么都没找到 ⇒ 什么都没错」= 恒绿。
 *   ③ 元数据层——latest.yml 的 path 必须等于那个 .exe 的**实际**文件名。
 *      这是更新器真正读的字段；②③ 比对的两侧分别来自磁盘与产物元数据，是两条独立证据。
 *
 * 用法：
 *   node scripts/assert-installer-name.mjs              # 查真实产物（electron:build 尾部自动跑）
 *   node scripts/assert-installer-name.mjs --self-test  # 负例/正例自测（纯内存，不落任何文件）
 *   node scripts/assert-installer-name.mjs --print-exe  # 全过后只把安装包**绝对路径**打到 stdout
 * 退出码 0 = 全过，1 = 有红拦（打印到 stderr）。
 *
 * `--print-exe` 的用途：CI 的 Release / 上传步骤**不手抄任何路径**，直接取本命令的输出——
 *   `files: ${{ steps.installer.outputs.path }}`
 * ⇒ 输出目录与文件名两件事都只有一处真值（electron-builder.yml 的 directories.output +
 *   artifactName），文档里的 glob 不再是一份会漂的第二真相。给定此参数时人读的状态行改走
 *   stderr，stdout 只剩那一行路径，便于 shell 捕获。
 *
 * 🔴 打印的路径**统一用正斜杠**（`D:/a/linkdesk/linkdesk-build/xxx.exe`），Windows 原生反斜杠
 *   路径在这里会埋雷：CI 跑在 Git Bash 里，`dirname "D:\a\x.exe"` 把反斜杠当普通字符、返回 `.`，
 *   于是 `${exe%/*}` 之类的 shell 取目录全部失效。正斜杠在 Node / upload-artifact / signtool
 *   三处都能正常解析，故一律输出正斜杠。取目录用 `${exe%/*}`（纯 shell 展开，不依赖外部命令）。
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BUILDER_YML = join(ROOT, "electron-builder.yml");

/** 🔴 契约模板——真理源的**期望形状**。故意写在这里，不从 electron-builder.yml 现场读（理由见头注 ①）。 */
const TEMPLATE = '${name}-setup-${version}.${ext}';

/** 不写 artifactName 时 NSIS 的默认模板（仅用于红灯文案，说明「走默认会出什么事」）。 */
const DEFAULT_TEMPLATE = '${productName} Setup ${version}.${ext}';

// ─────────────────────────── 纯判据（可被 --self-test 注入输入） ───────────────────────────

/** 取 YAML 顶层键的值（零缩进的 `key:`）。找不到 → null。去引号、去行尾注释。 */
function topLevelValue(yamlText, key) {
  const re = new RegExp(`^${key}:[ \\t]*(.*)$`);
  for (const raw of yamlText.split(/\r?\n/)) {
    if (/^[ \t]/.test(raw) || raw.trimStart().startsWith("#")) continue;
    const m = re.exec(raw);
    if (!m) continue;
    return stripValue(m[1]);
  }
  return null;
}

/** 取 `parent:` 块内某个子键的值（靠缩进判定块的范围）。找不到 → null。 */
function nestedValue(yamlText, parent, key) {
  const lines = yamlText.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^${parent}:[ \\t]*$`).test(l));
  if (start < 0) return null;
  const re = new RegExp(`^[ \\t]+${key}:[ \\t]*(.*)$`);
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!/^[ \t]/.test(line)) return null; // 缩进结束 = 块结束
    const m = re.exec(line);
    if (m) return stripValue(m[1]);
  }
  return null;
}

function stripValue(v) {
  let s = v.trim();
  const hash = s.indexOf(" #"); // 行尾注释（`#` 前有空白才算，免得砍到值里的 #）
  if (hash >= 0) s = s.slice(0, hash).trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1);
  }
  return s;
}

/** 判据①：配置层的 artifactName 是否逐字符等于契约模板。 */
function checkArtifactName(yamlText) {
  const actual = topLevelValue(yamlText, "artifactName");
  if (actual == null) {
    return {
      ok: false,
      msg:
        `electron-builder.yml 没有顶层 artifactName。\n` +
        `      ⇒ 走 NSIS 默认名「${DEFAULT_TEMPLATE}」（含空格）⇒\n` +
        `         latest.yml 会记一个「空格换连字符」的名字，磁盘却留原名 ⇒ 更新器下载必 404 asset-missing。\n` +
        `      期望：artifactName: "${TEMPLATE}"`,
    };
  }
  if (actual !== TEMPLATE) {
    return {
      ok: false,
      msg:
        `electron-builder.yml 的 artifactName 与契约不符。\n` +
        `      实际：${actual}\n      期望：${TEMPLATE}`,
    };
  }
  return { ok: true, msg: `artifactName = ${TEMPLATE}` };
}

/** 判据②：输出目录顶层有且只有一个 .exe，且名字逐字符等于期望名。entries = 顶层文件名数组。 */
function checkBuildOutput(entries, expectedName) {
  const exes = entries.filter((n) => /\.exe$/i.test(n));
  if (exes.length === 0) {
    return {
      ok: false,
      msg:
        `输出目录顶层一个 .exe 都没有。\n` +
        `      🔴 这里刻意判红而不是跳过——「什么都没找到 ⇒ 什么都没错」正是恒绿假门禁的写法。\n` +
        `      要么没真跑 electron-builder，要么产物落到了别处（检查 electron-builder.yml 的 directories.output）。`,
    };
  }
  if (exes.length > 1) {
    return {
      ok: false,
      msg:
        `输出目录顶层有 ${exes.length} 个 .exe，期望有且只有一个。\n` +
        exes.map((n) => `        - ${n}`).join("\n") +
        `\n      ⇒ 多半是改名前的旧产物没清（打包卫生：一跑一清）。`,
    };
  }
  if (exes[0] !== expectedName) {
    return {
      ok: false,
      msg: `产物名与契约不符。\n      实际：${exes[0]}\n      期望：${expectedName}`,
    };
  }
  return { ok: true, msg: `产物 ${exes[0]}` };
}

/** 判据③：latest.yml 的 path 必须等于 .exe 的实际文件名（更新器真正读的就是这个字段）。 */
function checkLatestYml(ymlText, expectedName) {
  if (ymlText == null) {
    return {
      ok: false,
      msg:
        `输出目录里没有 latest.yml。\n` +
        `      ⇒ 更新器没有可读的版本元数据，检查更新都无从谈起。NSIS 目标应产出它。`,
    };
  }
  const path = topLevelValue(ymlText, "path");
  if (path == null) {
    return { ok: false, msg: `latest.yml 里没有顶层 path 字段。` };
  }
  if (path !== expectedName) {
    return {
      ok: false,
      msg:
        `latest.yml 的 path 与实际产物名对不上——**这就是 asset-missing 的直接成因**。\n` +
        `      latest.yml path：${path}\n      磁盘上的产物名：${expectedName}\n` +
        `      ⇒ 更新器照 path 去 Release 取 asset，而 Release 上躺的是磁盘那个名字。`,
    };
  }
  return { ok: true, msg: `latest.yml path = ${path}` };
}

// ──────────────────────────────────── 主流程 ────────────────────────────────────

function fail(msg) {
  process.stderr.write(`🔴 安装包文件名门禁红拦：\n  ${msg}\n`);
}

function runSelfTest() {
  const cases = [
    // 判据①
    ["① 配置层", checkArtifactName(`artifactName: "${TEMPLATE}"\n`), true],
    ["① 配置层", checkArtifactName(`appId: com.linkdesk.app\n`), false],
    ["① 配置层", checkArtifactName(`artifactName: "\${productName} Setup \${version}.\${ext}"\n`), false],
    ["① 配置层", checkArtifactName(`artifactName: "linkdesk-setup-\${version}.\${ext}"\n`), false],
    // 判据②
    ["② 产物层", checkBuildOutput(["linkdesk-setup-0.1.47.exe"], "linkdesk-setup-0.1.47.exe"), true],
    ["② 产物层", checkBuildOutput(["LinkDesk Setup 0.1.47.exe"], "linkdesk-setup-0.1.47.exe"), false],
    ["② 产物层", checkBuildOutput([], "linkdesk-setup-0.1.47.exe"), false],
    [
      "② 产物层",
      checkBuildOutput(
        ["linkdesk-setup-0.1.47.exe", "LinkDesk Setup 0.1.47.exe"],
        "linkdesk-setup-0.1.47.exe"
      ),
      false,
    ],
    // 判据③
    ["③ 元数据层", checkLatestYml(`path: linkdesk-setup-0.1.47.exe\n`, "linkdesk-setup-0.1.47.exe"), true],
    ["③ 元数据层", checkLatestYml(`path: LinkDesk-Setup-0.1.47.exe\n`, "linkdesk-setup-0.1.47.exe"), false],
    ["③ 元数据层", checkLatestYml(null, "linkdesk-setup-0.1.47.exe"), false],
  ];

  let bad = 0;
  for (const [tag, result, wantOk] of cases) {
    const pass = result.ok === wantOk;
    if (!pass) bad++;
    const want = wantOk ? "应过" : "应红";
    process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} ${want} —— 实得 ${result.ok ? "过" : "红"}\n`);
    if (!pass) fail(result.msg);
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ 自测全过（${cases.length} 例：负例确实会红、正例确实会过）——门禁不是在恒绿。\n`
      : `\n🔴 自测 ${bad} 例不符。\n`
  );
  process.exit(bad === 0 ? 0 : 1);
}

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const expectedName = `${pkg.name}-setup-${pkg.version}.exe`;

  const yamlText = readFileSync(BUILDER_YML, "utf8");
  const outDirRaw = nestedValue(yamlText, "directories", "output") ?? "dist";
  const outDir = resolve(ROOT, outDirRaw);

  const checks = [];
  checks.push(checkArtifactName(yamlText));

  if (!existsSync(outDir)) {
    checks.push({
      ok: false,
      msg: `输出目录不存在：${outDir}\n      （electron-builder.yml 的 directories.output = ${outDirRaw}）`,
    });
    checks.push(checkLatestYml(null, expectedName));
  } else {
    const entries = readdirSync(outDir, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name);
    checks.push(checkBuildOutput(entries, expectedName));
    const ymlPath = join(outDir, "latest.yml");
    checks.push(checkLatestYml(existsSync(ymlPath) ? readFileSync(ymlPath, "utf8") : null, expectedName));
  }

  const printExe = process.argv.includes("--print-exe");
  // --print-exe 时人读状态行改走 stderr，stdout 只留最后那一行路径（便于 shell 捕获）
  const say = (line) =>
    printExe ? process.stderr.write(line) : process.stdout.write(line);

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    say(`${c.ok ? "✅" : "🔴"} ${c.msg}\n`);
  }

  if (failed.length > 0) {
    fail(`期望文件名：${expectedName}\n  输出目录：${outDir}\n  （判据分工与病根见本文件头注）`);
    process.exit(1);
  }
  if (printExe) {
    // 正斜杠输出——理由见头注（Git Bash 的 dirname 会把反斜杠当普通字符）
    process.stdout.write(`${join(outDir, expectedName).replace(/\\/g, "/")}\n`);
    return;
  }
  say(`\n✅ 安装包文件名三处一致：${expectedName}\n`);
}

main();
