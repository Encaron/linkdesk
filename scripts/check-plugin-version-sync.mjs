#!/usr/bin/env node
/**
 * E6#98e（L7 第 7.1 轮）——插件版本号「四处同源」的**第四处**机械兜底。
 *
 * 出处（唯一真源，本文不重述判据）：`docs/03-插件制造/09-插件目录规范.md` §与版本号联动
 * （「四处的锚」）＋ [插件源码外移层/09-命名规范.md](../../docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/09-命名规范.md) §5.1（N6 决策）。
 *
 * 判据一句话：**`package.json.version` 必须 === `plugin.json.version`**（两字段都必须存在）。
 *   ① `CHANGELOG.md` 段标题   ② `plugin.json.version` ← **唯一真源**
 *   ③ 目录条目 `versions[].version`（publish 自动写）
 *   ④ `package.json.version` ← **本门禁管这一处**
 *
 * 为什么必须有它（本仓门禁哲学：空喊「不许手抄」做不到，得给一条命令让人抄不了）：
 *   - 插件源码搬进各自独立的仓之后，`package.json` 是新人（和 AI）打开仓库**第一眼看到的东西**；
 *   - L7 第 7.1 轮实测：六只发货插件的 `package.json.version` **全是 `1.0.0`**，真版本在
 *     `plugin.json`（1.0.6 / 1.0.28 / …）——两个版本号并存且不一致，**必然有人 bump 错那一个**；
 *   - 而 `publish` 与内容指纹门禁（`check-bundled-version-bump.mjs`）读的都是 ② ⇒
 *     **改错的那个 = 静默无效**（版本没升、更新链不认、已装用户拿不到新内容）。**不报错的错最贵。**
 *
 * 扫描域：`plugins/<id>/` 下同时有 `package.json` 与 `plugin.json` 的目录（缺任一 = 不是插件工程，跳过）。
 * 只读两个文件的 `version` 字段，不碰网络、不碰 git——挂 `npm run check`，必须离线、必须快。
 *
 * 用法：
 *   node scripts/check-plugin-version-sync.mjs              # 扫 plugins/（挂 npm run check）
 *   node scripts/check-plugin-version-sync.mjs --self-test  # 负控：不一致 ⇒ 红；一致/跳过 ⇒ 绿
 * 退出码 0 = 全部同源，1 = 有漂移（打印到 stderr）。
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import * as jsonc from "jsonc-parser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** JSONC 读（plugin.json 允许注释/尾逗号——E6#55） */
function readVersion(path) {
  let parsed;
  try {
    parsed = jsonc.parse(readFileSync(path, "utf8"), [], { allowTrailingComma: true, disallowComments: false });
  } catch {
    return { ok: false, why: "解析失败" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, why: "不是对象" };
  const v = parsed.version;
  if (typeof v !== "string" || v.trim() === "") return { ok: false, why: "缺 version 字段" };
  return { ok: true, version: v };
}

/**
 * 扫一个目录下的「插件工程」（子目录同时有 package.json + plugin.json）。
 * @returns {{ checked: {name:string,version:string}[], reds: {name:string,why:string}[], skipped: string[] }}
 */
export function checkPluginVersionSync(pluginsRoot) {
  const checked = [];
  const reds = [];
  const skipped = [];
  if (!existsSync(pluginsRoot)) return { checked, reds, skipped };

  for (const name of readdirSync(pluginsRoot)) {
    const dir = join(pluginsRoot, name);
    const pkgPath = join(dir, "package.json");
    const manifestPath = join(dir, "plugin.json");
    if (!existsSync(pkgPath) || !existsSync(manifestPath)) {
      skipped.push(name);
      continue;
    }
    const pkg = readVersion(pkgPath);
    const manifest = readVersion(manifestPath);
    if (!manifest.ok) {
      reds.push({ name, why: `plugin.json ${manifest.why}（版本号唯一真源，必填）` });
      continue;
    }
    if (!pkg.ok) {
      reds.push({ name, why: `package.json ${pkg.why}——N6：字段必须保留且与 plugin.json.version 相等（实为 ${manifest.version}）` });
      continue;
    }
    if (pkg.version !== manifest.version) {
      reds.push({ name, why: `package.json.version=${pkg.version} ≠ plugin.json.version=${manifest.version}` });
      continue;
    }
    checked.push({ name, version: pkg.version });
  }
  return { checked, reds, skipped };
}

function scan() {
  const pluginsRoot = join(ROOT, "plugins");
  const { checked, reds, skipped } = checkPluginVersionSync(pluginsRoot);
  for (const c of checked) console.log(`  ✓ ${c.name}（${c.version}——package.json 与 plugin.json 同源）`);
  if (skipped.length > 0) console.log(`  – 跳过（缺 package.json 或 plugin.json，非插件工程）: ${skipped.join(", ")}`);
  if (reds.length > 0) {
    for (const r of reds) {
      console.error(`❌ ${r.name}：${r.why}`);
    }
    console.error(
      `\n[plugin-version-sync] 🔴 ${reds.length} 只插件的版本号漂移——` +
        `package.json.version 必须 === plugin.json.version（N6「四处的锚」第 ④ 处）。` +
        `plugin.json.version 是唯一真源：改版本先改它，再把 package.json 抄齐。`,
    );
    process.exit(1);
  }
  console.log(
    `\n[plugin-version-sync] ✓ plugins/ ${checked.length} 只插件 package.json.version === plugin.json.version（N6 第四处锚对齐）。`,
  );
}

/** 负控自测：合成 fixture 目录，不碰真实 plugins/ */
function selfTest() {
  const tmp = mkdtempSync(join(tmpdir(), "plugin-version-sync-selftest-"));
  const mk = (name, pkg, manifest) => {
    const dir = join(tmp, name);
    mkdirSync(dir, { recursive: true });
    if (pkg !== undefined) writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
    if (manifest !== undefined) writeFileSync(join(dir, "plugin.json"), JSON.stringify(manifest, null, 2));
  };
  try {
    mk("ok-plugin", { name: "linkdesk-plugin-ok", version: "1.2.3" }, { name: "Ok", version: "1.2.3" });
    mk("drifted-plugin", { name: "linkdesk-plugin-drifted", version: "1.0.0" }, { name: "Drift", version: "2.0.0" });
    mk("no-version-plugin", { name: "linkdesk-plugin-nov" }, { name: "NoV", version: "1.0.0" });
    mk("no-manifest", { name: "linkdesk-plugin-nom" }); // 缺 plugin.json ⇒ 跳过
    mk("no-pkg", undefined, { name: "NoPkg", version: "1.0.0" }); // 缺 package.json ⇒ 跳过
    // JSONC 容忍：带注释的 plugin.json 也要读得出（E6#55 口径）
    const jsoncDir = join(tmp, "jsonc-plugin");
    mkdirSync(jsoncDir, { recursive: true });
    writeFileSync(join(jsoncDir, "package.json"), JSON.stringify({ name: "linkdesk-plugin-jsonc", version: "3.0.0" }));
    writeFileSync(join(jsoncDir, "plugin.json"), `{\n  // 注释\n  "name": "Jsonc",\n  "version": "3.0.0",\n}\n`);

    const { checked, reds, skipped } = checkPluginVersionSync(tmp);
    const names = (arr) => arr.map((r) => r.name).sort().join(",");
    const gotChecked = names(checked);
    const gotReds = names(reds);
    const gotSkipped = skipped.sort().join(",");
    const ok =
      gotChecked === "jsonc-plugin,ok-plugin" &&
      gotReds === "drifted-plugin,no-version-plugin" &&
      gotSkipped === "no-manifest,no-pkg";
    console.log(`\n[plugin-version-sync] self-test: 同源放行=[${gotChecked}] 漂移红拦=[${gotReds}] 跳过=[${gotSkipped}]`);
    console.log(
      `[plugin-version-sync] self-test 判定：${ok ? "✓ 全部符合预期（负控会红、正控会绿、非插件工程跳过、JSONC 可读）" : "✗ FAIL"}`,
    );
    return ok ? 0 : 1;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (basename(process.argv[1] ?? "") === "check-plugin-version-sync.mjs") {
  if (process.argv.slice(2).includes("--self-test")) process.exit(selfTest());
  else scan();
}
