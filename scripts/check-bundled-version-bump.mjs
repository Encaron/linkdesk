/**
 * E6#15n：bundled zip 打包 gate——「内容变更必 bump 插件自身 version」的机械门禁。
 *
 * 背景（2026-09-06 实证 + 拍板）：boot 自动装只补缺失、永不刷新已装（同版异版都不覆盖）——
 * 已物化 userData 副本按「版本」固化。bundled 发货 zip **内容变更但 plugin.json version 不 bump**
 * → 已装用户永滞旧内容（实证：python zip 加 pyright 忘 bump → 旧副本 spawn 无 pyright → LSP 全挂；
 * editor zip 130 文件 vs 旧物化 116）。#15n 拍板：bundled 夹 = 首启离线种子**非更新通道**，
 * boot 不刷指纹；防滞旧 = ① 发布纪律必 bump ② 本 gate ③ dev 强制重物化开关（bundle-zip.ts force）。
 * 用户拿 seed 内容修复走市场真实条目按版本更新——boot 不伸手。
 *
 * 机制（单点门禁，仿 check-lsp-args-base.mjs 入 npm run check）：对 bundled-plugins/ 每个
 * working-tree zip，取 git HEAD 同路径 blob 作基线（无基线 = 新 bundled 插件跳过）：
 *   - 内容指纹 = zip 内每个非目录条目 {规范化名: sha256(**归一 LF 后**的内容)} 排序拼接——只比包内容，
 *     不比 zip 字节（重建时间戳/压缩差异不误报）；
 *   - version = 顶层 plugin.json（容忍单层 wrapper，与 bundle-zip locateManifest 同规）version。
 *   - 判定：working version === HEAD version 且 指纹 ≠ → 🔴 红拦（改内容没 bump）；
 *     version 不同（bump 过）→ 过；指纹相同（重建无实质变更）→ 过。
 *
 * 🔴 **行尾必须先归一（2026-09-12 修，同族第 5 次）**——指纹此前直接 sha256 原始字节，于是它比的
 * **不只是内容、还捎带了行尾**，而两边行尾来源不同、谁都不受控：
 *   ① 基线那份是**历史上某次工作区**打的（实测 `bundled-plugins/theme-zones.linkdesk-plugin`：
 *      `plugin.json` 是 CRLF、`README.md` 是 LF——**同一包里混着**）；
 *   ② 新产物那份是**当下工作区**打的（本机 `git ls-files --eol` = `i/lf w/crlf`：索引 LF、工作区 CRLF，
 *      `.gitattributes` 管不住已检出的存量文件）。
 * 一份源码在两种工作区打出的 zip ⇒ 判「改内容没 bump」**满屏红**——源码一个字没改。这红还**有毒**：
 * 它给的唯一出路是「bump 插件版本」，于是人要么条件反射去 bump（用户侧收到一批零意义的"更新"），
 * 要么学会绕过门禁（**假红让真红失效**）。判据 = 行尾不是内容（`normalizeEol` 只动 CRLF→LF，二进制
 * 与无 CRLF 的文本逐字节不动）；**真内容变更照样红**（self-test 负例钉住，且只看 EOL 的差异另有一例
 * 明确放行）。规则本体在 `scripts/lib/text-eol.mjs`——与打包脚本**共用同一份**，不各写一套。
 *
 * 用法：
 *   node scripts/check-bundled-version-bump.mjs            # 扫 bundled-plugins/ vs git HEAD（挂 npm run check）
 *   node scripts/check-bundled-version-bump.mjs --compare A.zip B.zip   # 对拍任意两 zip 出判定（调试/验证）
 *   node scripts/check-bundled-version-bump.mjs --self-test             # 负例（同版改内容红）+ 正例（bump 过）
 *                                                                       # + 行尾例（同版只差 EOL 放行）自测
 * 退出码 0 = 全过，1 = 有红拦（打印到 stderr）。
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { normalizeEol } from "./lib/text-eol.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BUNDLED_DIR = join(ROOT, "bundled-plugins");
const EXT = ".linkdesk-plugin";

/** sha256——内容指纹单元 */
function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/** 顶层 plugin.json 的 version（容忍单层 wrapper 目录，与 bundle-zip locateManifest 同规）；取不到 → null */
async function readZipVersion(zip) {
  const norm = Object.keys(zip.files)
    .map((n) => n.replace(/\\/g, "/"))
    .filter((n) => n.slice(n.lastIndexOf("/") + 1) === "plugin.json")
    .sort((a, b) => a.split("/").length - b.split("/").length);
  if (norm.length === 0) return null;
  try {
    const parsed = JSON.parse(await zip.files[norm[0]].async("string"));
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

/**
 * 内容指纹 = 排序后的 `{规范化名}:{sha256}`——只比包内容不比 zip 字节（重建的非确定性元数据不误报）。
 * 条目内容先过 `normalizeEol`（文本归一 LF、二进制原样）——行尾不是内容，见文件头 🔴 段。
 * 含 plugin.json 自身：仅 version 变 → 指纹也变，但判定先看 version 不等 → 不算违例（合法 bump）。
 */
async function fingerprint(zip) {
  const rows = [];
  for (const raw of Object.keys(zip.files)) {
    const entry = zip.files[raw];
    if (entry.dir) continue;
    const name = raw.replace(/\\/g, "/");
    const { buf } = normalizeEol(Buffer.from(await entry.async("uint8array")));
    rows.push(`${name}:${sha256(buf)}`);
  }
  return rows.sort().join("\n");
}

/** 读一个 zip 文件 → { version, fp }；打不开 → null */
async function inspectZip(path) {
  const buf = readFileSync(path);
  const zip = await JSZip.loadAsync(buf);
  const fp = await fingerprint(zip);
  const version = await readZipVersion(zip);
  return { version, fp, zip, buf };
}

/** 两个 zip 的 gate 判定 → { ok, verdict, why }。A = 新产物（working），B = 基线（HEAD） */
function verdict(aVersion, bVersion, aFp, bFp) {
  if (aVersion === null || bVersion === null) {
    return { ok: true, verdict: "version-unreadable", why: "任一方读不出 plugin.json.version——本 gate 不判" };
  }
  if (aVersion !== bVersion) {
    return { ok: true, verdict: "version-bumped", why: `version ${bVersion} → ${aVersion}（bump 过，内容随版本到达）` };
  }
  if (aFp === bFp) {
    return { ok: true, verdict: "identical", why: `version 同 ${aVersion} 且内容指纹同（重建无实质变更）` };
  }
  return {
    ok: false,
    verdict: "red-same-version-content-diff",
    why: `version 仍 ${aVersion} 但内容指纹不同——改内容没 bump，已装用户永滞旧内容（E6#15n：内容变更必 bump 插件自身 version）`,
  };
}

/** 主模式：扫 bundled-plugins/ working vs git HEAD */
async function scanBundled() {
  if (!existsSync(BUNDLED_DIR)) {
    console.log("[bundled-version-bump] bundled-plugins/ 不存在——跳过");
    return;
  }
  // HEAD 已追踪的 bundled 路径集（无基线 = 新 bundled 插件，跳过）
  let headFiles = new Set();
  try {
    const out = execFileSync("git", ["-C", ROOT, "ls-tree", "-r", "--name-only", "HEAD", "--", "bundled-plugins"], {
      encoding: "utf8",
    });
    headFiles = new Set(out.split("\n").filter(Boolean));
  } catch {
    /* 无 HEAD / 非 git——无基线可比，全跳过 */
  }

  const results = [];
  for (const name of readdirSync(BUNDLED_DIR).filter((n) => n.endsWith(EXT))) {
    const rel = `bundled-plugins/${name}`;
    if (!headFiles.has(rel)) continue; // 新 bundled 插件——首个 commit 建立基线，无从比
    const a = await inspectZip(join(BUNDLED_DIR, name));
    let headBuf;
    try {
      headBuf = execFileSync("git", ["-C", ROOT, "show", `HEAD:${rel}`], { maxBuffer: 512 * 1024 * 1024 });
    } catch {
      continue;
    }
    const bZip = await JSZip.loadAsync(headBuf);
    const b = { version: await readZipVersion(bZip), fp: await fingerprint(bZip) };
    const v = verdict(a.version, b.version, a.fp, b.fp);
    results.push({ name, ...v });
  }

  const reds = results.filter((r) => !r.ok);
  for (const r of results) {
    if (r.ok) {
      console.log(`  ✓ ${r.name}（${r.verdict}）`);
    } else {
      console.error(`❌ ${r.name}（${r.verdict}）——${r.why}`);
    }
  }
  if (reds.length > 0) {
    console.error(
      `\n[bundled-version-bump] 🔴 红拦 ${reds.length} 个 bundled zip——内容变更但 plugin.json version 没 bump。` +
        `boot 永不刷新已装，用户唯一拿到新内容的路 = 版本号。请 bump 插件自身 version 后重打 zip（E6#15n）。`,
    );
    process.exit(1);
  }
  console.log(`\n[bundled-version-bump] ✓ bundled-plugins/ ${results.length} 个有基线 zip 全过——内容变更必 bump 纪律机械对齐。`);
}

/** --compare 模式：对拍两个任意 zip 出判定（调试/验证用） */
async function compareMode(aPath, bPath) {
  const a = await inspectZip(resolve(aPath));
  const b = await inspectZip(resolve(bPath));
  const v = verdict(a.version, b.version, a.fp, b.fp);
  console.log(`[bundled-version-bump] compare ${basename(aPath)} vs ${basename(bPath)} → ${v.verdict}`);
  console.log(`  A version=${a.version}  B version=${b.version}`);
  console.log(`  ${v.why}`);
  return v.ok;
}

/** --self-test：负例（同版改内容红）+ 正例（bump 过绿）+ 行尾例（同版只差 EOL 绿），合成 zip 不碰真实 bundled-plugins */
async function selfTest() {
  const tmp = mkdtempSync(join(tmpdir(), "bundled-bump-selftest-"));
  try {
    const mkZip = async (version, readme) => {
      const z = new JSZip();
      z.file("plugin.json", JSON.stringify({ pluginId: "demo-seed", version }));
      z.file("README.md", readme);
      return z.generateAsync({ type: "nodebuffer" });
    };
    const base = join(tmp, "base.linkdesk-plugin");
    const sameContentDiff = join(tmp, "same-content-diff.linkdesk-plugin");
    const bumped = join(tmp, "bumped.linkdesk-plugin");
    const eolOnly = join(tmp, "eol-only.linkdesk-plugin");
    writeFileSync(base, await mkZip("1.0.0", "readme v1\nsecond line\n"));
    writeFileSync(sameContentDiff, await mkZip("1.0.0", "readme v1 CHANGED\nsecond line\n")); // 同版改内容 → 负例
    writeFileSync(bumped, await mkZip("1.0.1", "readme v1 CHANGED\nsecond line\n")); // bump 过 → 正例
    writeFileSync(eolOnly, await mkZip("1.0.0", "readme v1\r\nsecond line\r\n")); // 同版只差行尾 → 期望放行

    const neg = !(await compareMode(sameContentDiff, base)); // 期望红（同版内容 diff）
    const pos = await compareMode(bumped, base); // 期望绿（bump 过）
    const eol = await compareMode(eolOnly, base); // 期望绿（只差 EOL = 无实质变更）
    console.log(
      `\n[bundled-version-bump] self-test: 负例（同版改内容）红拦=${neg ? "✓" : "✗ FAIL"}  ` +
        `正例（bump 过）放行=${pos ? "✓" : "✗ FAIL"}  行尾例（同版只差 EOL）放行=${eol ? "✓" : "✗ FAIL"}`,
    );
    return neg && pos && eol ? 0 : 1;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) {
    process.exit(await selfTest());
    return;
  }
  if (argv.includes("--compare")) {
    const i = argv.indexOf("--compare");
    process.exit((await compareMode(argv[i + 1], argv[i + 2])) ? 0 : 1);
    return;
  }
  await scanBundled();
}

main().catch((e) => {
  console.error(`[bundled-version-bump] 脚本异常: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
