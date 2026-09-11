/**
 * 机械检查：**空目录扫描**（E6#95a · L3.7 门禁 G1 · 红灯）。
 *
 * 为什么必须机械扫（06 §1.1）：**`git status` 看不见空目录**（Git 不记录目录），
 * 所以「提交前看一眼 git status」这个习惯**结构性地防不住**这一类垃圾。
 * 实证（04 §〇）：探针在 `plugins/settings/src/` 下造了个空目录，用完只删脚本没删目录 ⇒
 * 工作区报 clean，垃圾躺到用户肉眼发现。
 *
 * 三档定位（06 §1.2 自审）：**红灯**——空目录**没有任何合法存在形态**（要「占位」必须放文件，
 * 放了文件就不是空目录了）⇒ 零误报，满足闸 1；修法就是删目录，成本 0，满足闸 2。
 *
 * 扫描根（06 §1.2 明确划定，**不擅自扩**——扩范围是设计决策不是实现细节）：
 *   src/  plugins/  electron/  scripts/  docs/
 * 排除同名目录：`.git` `node_modules` `dist` `dist-electron` `.vite` `*.linkdesk-plugin`（市场解包物）
 * 另排除一切 `.` 开头的目录（编辑器/工具临时目录不在版本控制视野内）。
 *
 * 用法：node scripts/check-empty-dirs.mjs（已挂 npm run check）
 * 退出码 0 = 无空目录；1 = 有（路径 + 修法打到 stderr）。
 */

import { readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SCAN_ROOTS = ["src", "plugins", "electron", "scripts", "docs"];

/** 目录名排除——构建产物 / 依赖 / 市场解包物（`*.linkdesk-plugin` 解包后是目录） */
const EXCLUDED_DIRS = new Set(["node_modules", "dist", "dist-electron", ".vite"]);
const EXCLUDED_SUFFIX = ".linkdesk-plugin";

/** 空目录路径（仓库相对，正斜杠） */
const emptyDirs = [];

function shouldSkip(name) {
  if (name.startsWith(".")) return true;          // .git / .vscode / .cache …（不在版本控制视野）
  if (EXCLUDED_DIRS.has(name)) return true;
  if (name.endsWith(EXCLUDED_SUFFIX)) return true;
  return false;
}

function walk(absDir, relDir) {
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    return; // 不可读（权限/竞态）——不阻断门禁
  }
  if (entries.length === 0) {
    emptyDirs.push(relDir);
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (shouldSkip(e.name)) continue;
    walk(join(absDir, e.name), `${relDir}/${e.name}`);
  }
}

for (const root of SCAN_ROOTS) {
  const abs = resolve(ROOT, root);
  if (!existsSync(abs)) continue; // 约定根缺失不是本门禁的事（别的门禁管存在性）
  walk(abs, root);
}

if (emptyDirs.length > 0) {
  emptyDirs.sort();
  console.error(`❌ 发现 ${emptyDirs.length} 个空目录——git 不记录目录，工作区看着 clean 但垃圾在仓里。`);
  console.error(`   修法：rmdir "<路径>"（Windows: rmdir "路径"；确认目录真的空，别误删有内容的）\n`);
  for (const d of emptyDirs) console.error(`   ${d}/`);
  console.error("");
  process.exit(1);
}

console.log(`✅ 无空目录——已扫 ${SCAN_ROOTS.map((r) => `${r}/`).join(" ")}（排除 .* / node_modules / dist / dist-electron / .vite / *.linkdesk-plugin）。`);
