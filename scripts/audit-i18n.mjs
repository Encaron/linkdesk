/**
 * i18n 全量审计——扫描所有 .tsx/.ts 文件中的中文 UI 字符串，
 * 与 5 个 i18n/en.json 交叉比对，输出缺翻译清单。
 *
 * 用法：node scripts/audit-i18n.mjs
 *
 * 输出：
 *   - 已翻译数 / 缺翻译数
 *   - 每个缺翻译字符串的原文 + 出现位置
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

// ── 1. 加载所有翻译 key ──
const I18N_FILES = [
  "plugins/user/lang-defaults/en.json",
  "plugins/builtin/file-tree/i18n/en.json",
  "plugins/builtin/editor/i18n/en.json",
  "plugins/user/serial-monitor/i18n/en.json",
  "plugins/builtin/marketplace/i18n/en.json",
];

const translated = new Set();
for (const f of I18N_FILES) {
  if (!existsSync(f)) { console.warn(`⚠ 缺失: ${f}`); continue; }
  Object.keys(JSON.parse(readFileSync(f, "utf-8"))).forEach((k) => translated.add(k));
}

// ── 2. 扫描所有源文件，提取完整引用字符串中的中文 ──
function walkDir(dir, cb) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const n = e.name;
    if (n.startsWith(".") || n === "node_modules" || n === "dist" || n === "dist-electron" || n === "__tests__") continue;
    const full = join(dir, n);
    if (e.isDirectory()) walkDir(full, cb);
    else if (/\.(tsx?)$/.test(n)) cb(full);
  }
}

// 匹配完整引用字符串：'...' / "..." / `...`
const FULL_STR = /['"`]([^'"`]*[一-鿿][^'"`]*)['"`]/g;

const found = new Map(); // text → [file:line, ...]

function processFile(filePath) {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 跳过注释、console、import
      if (/^\s*\/\/|\*\s|^\s*\/\*/.test(line.trim())) continue;
      if (/console\.(log|error|warn|debug|info)/.test(line)) continue;
      if (/^\s*import\s/.test(line.trim())) continue;

      FULL_STR.lastIndex = 0;
      let m;
      while ((m = FULL_STR.exec(line)) !== null) {
        const text = m[1].trim();
        if (text.length < 2) continue;
        if (!/[一-鿿]/.test(text)) continue;
        if (!found.has(text)) found.set(text, []);
        found.get(text).push(filePath + ":" + (i + 1));
      }
    }
  } catch { /* skip unreadable */ }
}

for (const root of ["src", "plugins"]) {
  walkDir(root, processFile);
}

// ── 3. 筛选真正缺翻译的（排除子串误报） ──
const missing = [];
for (const [text, files] of found) {
  if (translated.has(text)) continue;
  // 排除已被更长 key 覆盖的子串（如 "条通知" 已被 "{{count}} 条通知" 覆盖）
  let isSub = false;
  for (const k of translated) {
    if (k.length > text.length && k.includes(text)) { isSub = true; break; }
  }
  if (isSub) continue;
  missing.push({ text, count: files.length, first: files[0] });
}

missing.sort((a, b) => b.count - a.count);

// ── 4. 输出 ──
const totalFound = found.size;
const totalTranslated = found.size - missing.length;

console.log(`\n=== i18n 审计 ===`);
console.log(`已翻译: ${totalTranslated}  |  缺翻译: ${missing.length}  |  总字符串: ${totalFound}`);
console.log(`翻译文件: ${I18N_FILES.length} 个, 共 ${translated.size} key\n`);

if (missing.length === 0) {
  console.log("✅ 所有中文 UI 字符串均有翻译。\n");
} else {
  console.log("🔴 以下字符串缺翻译：\n");
  for (const m of missing) {
    console.log(`  ${m.text}  [${m.count}x, e.g. ${m.first}]`);
  }
  console.log(`\n修复：将以上字符串添加到对应插件的 i18n/en.json 或 lang-defaults/en.json\n`);
}
