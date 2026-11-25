#!/usr/bin/env node
/**
 * check-core-retired —— `core` 旗标**退役闸**（2026-11-26 插件语义二分）。
 *
 * 为什么有它：`core:true` 曾同时表达「随包 / 内置 / 不可卸载」，市场据此判过一次「能不能更新」
 * （「全部更新」谎报已是最新）。定论是**三事实分家**：随包＝lock `seed`；重要＝`essential`
 * （只影响卸载入口可见性）；可更新＝住所 `updatable`。`core` **整删、无兼容别名**。
 *
 * 判据（代码/清单/schema/作者文档里出现即红）：
 *   · `"core": …`（JSON/对象键）        · `core?: boolean`
 *   · `manifest.core`                   · `rejectCore`
 *   · `core-forbidden`                  · `.core ===`
 *   · `core: true|false`
 *
 * ⛔ 不误伤：`@src/core/...` 模块路径、`src/core/` 目录、`core.openSettings` 这类宿主命令前缀、
 *    CSS 类名里的 `-core`（`kind: "core"` 是徽标样式键，不是插件事实）。
 * ⛔ 射程：只扫**现行代码与作者面**（src/electron/contracts/schemas/作者文档），不扫历史档案
 *    （docs/01、docs/02 归档、docs/04 已落地）——那些是回溯记录，改了反而毁证据。
 *
 * 用法：node scripts/check-core-retired.mjs [--self-test]
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = [
  "src",
  "electron",
  "contracts",
  "public/schemas",
  "packages/plugin-sdk/schemas",
  "docs/03-插件制造",
  "docs/03-plugin-authoring",
];
const EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md"]);

const PATTERNS = [
  /"core"\s*:/,
  /\bcore\?:\s*boolean/,
  /\bmanifest\.core\b/,
  /\brejectCore\b/,
  /\bcore-forbidden\b/,
  /\.core\s*===/,
  /\bcore:\s*(true|false)\b/,
];

/** 单行判定（纯函数，自测直测） */
export function isViolation(line) {
  return PATTERNS.some((re) => re.test(line));
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXT.has(extname(name))) out.push(p);
  }
  return out;
}

function scan() {
  const hits = [];
  for (const root of ROOTS) {
    for (const file of walk(join(ROOT, root))) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        if (isViolation(line)) hits.push(`${relative(ROOT, file).split(sep).join("/")}:${i + 1}  ${line.trim().slice(0, 120)}`);
      });
    }
  }
  return hits;
}

function selfTest() {
  const bad = [
    '  core?: boolean;',
    '  "core": true,',
    'if (opts?.rejectCore && m.core === true) {',
    'return { ok: false, reason: "core-forbidden" };',
    'const flagged = row.manifest.core;',
  ];
  const good = [
    'import type { PluginListEntry } from "@src/core/api/linkdesk-api";',
    '// 见 src/core/services 与 core.openSettings',
    '<span className="ldk-pd-badge-core">{t("内置")}</span>',
    'const badge = { kind: "core", key: "内置" };',
  ];
  const missed = bad.filter((l) => !isViolation(l));
  const falsePos = good.filter((l) => isViolation(l));
  if (missed.length || falsePos.length) {
    console.error("❌ 自测未过：", { missed, falsePos });
    process.exitCode = 1;
    return;
  }
  console.log("✅ check-core-retired 自测通过（5 负控全红 / 4 正控全不红）");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const hits = scan();
  if (hits.length > 0) {
    console.error(`❌ \`core\` 旗标残留 ${hits.length} 条——已退役，改用 essential（只影响卸载入口可见性）：`);
    for (const h of hits) console.error(`  · ${h}`);
    process.exitCode = 1;
  } else {
    console.log("✅ `core` 旗标已彻底退役（代码/清单/schema/作者文档零残留）。");
  }
}
