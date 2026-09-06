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
 *   - 内容指纹 = zip 内每个非目录条目 {规范化名: sha256(内容)} 排序拼接——只比包内容，
 *     不比 zip 字节（重建时间戳/压缩差异不误报）；
 *   - version = 顶层 plugin.json（容忍单层 wrapper，与 bundle-zip locateManifest 同规）version。
 *   - 判定：working version === HEAD version 且 指纹 ≠ → 🔴 红拦（改内容没 bump）；
 *     version 不同（bump 过）→ 过；指纹相同（重建无实质变更）→ 过。
 *
 * 用法：
 *   node scripts/check-bundled-version-bump.mjs            # 扫 bundled-plugins/ vs git HEAD（挂 npm run check）
 *   node scripts/check-bundled-version-bump.mjs --compare A.zip B.zip   # 对拍任意两 zip 出判定（调试/验证）
 *   node scripts/check-bundled-version-bump.mjs --self-test             # 负例（同版改内容红）+ 正例（bump 过）自测
 * 退出码 0 = 全过，1 = 有红拦（打印到 stderr）。
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

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
 * 含 plugin.json 自身：仅 version 变 → 指纹也变，但判定先看 version 不等 → 不算违例（合法 bump）。
 */
async function fingerprint(zip) {
  const rows = [];
  for (const raw of Object.keys(zip.files)) {
    const entry = zip.files[raw];
    if (entry.dir) continue;
    const name = raw.replace(/\\/g, "/");
    rows.push(`${name}:${sha256(Buffer.from(await entry.async("uint8array")))}`);
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

/** --self-test：负例（同版改内容红）+ 正例（bump 过绿），合成 zip 不碰真实 bundled-plugins */
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
    writeFileSync(base, await mkZip("1.0.0", "readme v1"));
    writeFileSync(sameContentDiff, await mkZip("1.0.0", "readme v1 CHANGED")); // 同版改内容 → 负例
    writeFileSync(bumped, await mkZip("1.0.1", "readme v1 CHANGED")); // bump 过 → 正例

    const neg = !(await compareMode(sameContentDiff, base)); // 期望红（同版内容 diff）
    const pos = await compareMode(bumped, base); // 期望绿（bump 过）
    console.log(`\n[bundled-version-bump] self-test: 负例（同版改内容）红拦=${neg ? "✓" : "✗ FAIL"}  正例（bump 过）放行=${pos ? "✓" : "✗ FAIL"}`);
    return neg && pos ? 0 : 1;
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
