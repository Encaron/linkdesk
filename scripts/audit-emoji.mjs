#!/usr/bin/env node
/**
 * 机械门禁：**用户可见文案禁 emoji**（2026-11-24 · 用户拍板）。
 *
 * 用法：
 *   node scripts/audit-emoji.mjs            # 判据：UI 文案（t() 键 / JSX 文本 / 设置声明）
 *   node scripts/audit-emoji.mjs --docs     # 追加：作者面与 04 更新档（只报不拦）
 *   node scripts/audit-emoji.mjs --self-test # 负控真跑打坏版
 *
 * ── 为什么只判「UI 文案」，不判全仓 ──
 *   控制台诊断（`console.warn("⚠️ …")`）是给维护者看的，不是产品界面；把它们一起判红 =
 *   让门禁去管不该管的域（本仓反复踩过的「判据越界」）。本门禁的域 = **用户读到的字符串**：
 *   ① 源码里 `t("…")` / `t('…')` 的键（i18n key = 中文原文，就是 UI 文案）；
 *   ② JSX 文本节点（`>文本<`）；
 *   ③ 设置声明（`src/App/config/**` 的 title/description/enumDescriptions）。
 *
 * ── 允许的符号 ──
 *   箭头（→ ← ↑ ↓）、对勾（✓ U+2713，共享件里的勾选字形）、乘号（×）等**排版符号**不判；
 *   判的是 emoji 与「表情式」符号：✅ ⛔ ⚠️ 🚫 ❌ 以及 U+1F300–U+1FAFF 全区。
 *
 * ── 修法 ──
 *   把符号换成文字：「禁止」「注意」「允许」「失败」。⛔ 不要用同义 emoji 替换。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BANNED = /[\u{1F300}-\u{1FAFF}\u{2705}\u{26D4}\u{26A0}\u{274C}\u{FE0F}]/u;

/** 图标渲染件豁免：这里 emoji 是**图标本体**（插件图标兜底 📄），不是文案。 */
const ICON_RENDERERS = new Set(["src/pool/shared/pool-plugin-icon/PoolPluginIcon.tsx"]);

/** 去掉注释——判的是文案，不在注释里逮人 */
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name === "dist-electron" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(full);
  }
  return out;
}

/**
 * 判据本体（纯函数，自测直接打）。
 * @param {Array<{path:string,text:string}>} files
 * @returns {Array<{file:string,line:number,kind:string,text:string}>}
 */
export function findEmojiInCopy(files) {
  const findings = [];
  for (const f of files) {
    if (ICON_RENDERERS.has(f.path)) continue;
    const code = stripComments(f.text);
    const lines = code.split(/\r?\n/);
    const isConfig = /[\\/]src[\\/]App[\\/]config[\\/]/.test(f.path);
    lines.forEach((line, i) => {
      if (!BANNED.test(line)) return;
      let kind = "";
      if (/\bt\(\s*["'][^"']*["']\s*\)/.test(line)) kind = "t()";
      else if (isConfig && /\b(title|description|enumDescriptions)\s*:/.test(line)) kind = "config";
      else if (/>[^<>{}]*[\u{1F300}-\u{1FAFF}\u{2705}\u{26D4}\u{26A0}\u{274C}][^<>{}]*</u.test(line)) kind = "jsx";
      if (kind) findings.push({ file: f.path, line: i + 1, kind, text: line.trim().slice(0, 160) });
    });
  }
  return findings;
}

function loadFiles() {
  const files = [];
  for (const dir of ["src", "electron"]) {
    for (const p of walk(join(ROOT, dir))) {
      files.push({ path: relative(ROOT, p).replace(/\\/g, "/"), text: readFileSync(p, "utf8") });
    }
  }
  return files;
}

function scanDocs() {
  const roots = [
    join(ROOT, "docs", "03-插件制造"),
    join(ROOT, "docs", "03-plugin-authoring"),
    join(ROOT, "docs", "04-软件更新"),
  ];
  const hits = [];
  const walkMd = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walkMd(full);
      else if (/\.md$/.test(name)) {
        const lines = readFileSync(full, "utf8").split(/\r?\n/);
        lines.forEach((l, i) => {
          if (BANNED.test(l)) hits.push(`${relative(ROOT, full).replace(/\\/g, "/")}:${i + 1}: ${l.trim().slice(0, 120)}`);
        });
      }
    }
  };
  for (const r of roots) walkMd(r);
  return hits;
}

function selfTest() {
  const cases = [
    {
      name: "正控：普通文案零命中",
      files: [{ path: "src/a.ts", text: 'const x = t("允许");' }],
      expect: (r) => r.length === 0,
    },
    {
      name: "负控：t() 键里有 emoji ⇒ 红",
      files: [{ path: "src/a.ts", text: 'const x = t("允许 ✅");' }],
      expect: (r) => r.some((x) => x.kind === "t()"),
    },
    {
      name: "负控：设置声明 title 里有 ⛔ ⇒ 红",
      files: [{ path: "src/App/config/x.ts", text: 'title: t("⛔ 目标档位"),' }],
      expect: (r) => r.some((x) => x.kind === "config" || x.kind === "t()"),
    },
    {
      name: "负控：JSX 文本里有 ⚠️ ⇒ 红",
      files: [{ path: "src/b.tsx", text: "<span>⚠️ 注意</span>" }],
      expect: (r) => r.some((x) => x.kind === "jsx"),
    },
    {
      name: "域外：控制台诊断不判",
      files: [{ path: "src/c.ts", text: 'console.warn("⚠️ 配置写歪了");' }],
      expect: (r) => r.length === 0,
    },
    {
      name: "域外：注释不判",
      files: [{ path: "src/d.ts", text: "// ⛔ 这是注释里的禁令说明\nconst x = 1;" }],
      expect: (r) => r.length === 0,
    },
    {
      name: "允许：对勾 ✓ / 箭头 → 不判",
      files: [{ path: "src/e.tsx", text: '<span>{"✓"}</span>\nconst y = "→";' }],
      expect: (r) => r.length === 0,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const r = findEmojiInCopy(c.files);
    if (!c.expect(r)) {
      failed += 1;
      console.error(`  ✗ ${c.name}`);
      console.error(`    findings: ${JSON.stringify(r)}`);
    } else console.log(`  ✓ ${c.name}`);
  }
  if (failed > 0) {
    console.error(`\n[audit-emoji] 自测失败 ${failed} 例`);
    process.exit(1);
  }
  console.log(`\n[audit-emoji] 自测通过（${cases.length} 例）`);
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const findings = findEmojiInCopy(loadFiles());
  for (const f of findings) {
    console.error(`[ERROR] ${f.file}:${f.line} (${f.kind}) ${f.text}`);
  }
  if (process.argv.includes("--docs")) {
    const docs = scanDocs();
    for (const d of docs) console.warn(`[WARN] 文档 ${d}`);
    console.warn(`[audit-emoji] 文档侧命中 ${docs.length} 处（只报不拦，债务账本分批清）`);
  }
  if (findings.length > 0) {
    console.error(`\n[audit-emoji] ${findings.length} 处 UI 文案含 emoji——改成文字标签（禁止 / 注意 / 允许）`);
    process.exit(1);
  }
  console.log("[audit-emoji] OK（UI 文案零 emoji）");
}
