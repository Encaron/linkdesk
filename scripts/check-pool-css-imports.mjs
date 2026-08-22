/**
 * 机械检查：src/pool/ 下 .css 文件禁止 @import——池 CSS 必须自包含。
 *
 * 用法：node scripts/check-pool-css-imports.mjs
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
 *
 * 背景：E5.7#9（c5407294）删壳 UI DOM 连带删除壳侧 WelcomeView.css，
 * 池侧 WelcomePoolView.css 的 @import "../../components/views/WelcomeView.css"
 * 幸存未清理 → Vite ENOENT 潜伏 bug（#20 MainZone 挂载才引爆）。
 * TS 引用有 tsc 兜底，CSS @import 没有——此脚本就是那道机械兜底。
 *
 * 纪律来源：壳目录规范——池不 import 壳 components 目录（Path B），
 * zone 零跨 zone import——CSS 同样适用（RightSidebarZone.css 同源自包含先例）。
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 收集 src/pool/ 下所有 .css 文件 */
function collectCssFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      files.push(...collectCssFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".css")) {
      files.push(full);
    }
  }
  return files;
}

function main() {
  const poolDir = resolve(ROOT, "src", "pool");
  const cssFiles = collectCssFiles(poolDir);

  const violations = [];
  let inBlockComment = false;

  for (const file of cssFiles) {
    const rawLines = readFileSync(file, "utf-8").split("\n");

    for (let i = 0; i < rawLines.length; i++) {
      let line = rawLines[i];

      // 注释处理——与 check-spacing-grid.mjs 同款（注释里的 @import 不算数）
      if (inBlockComment) {
        const endIdx = line.indexOf("*/");
        if (endIdx === -1) continue;
        line = line.slice(endIdx + 2);
        inBlockComment = false;
      }
      line = line.replace(/\/\*.*?\*\//g, "");
      const startIdx = line.indexOf("/*");
      if (startIdx !== -1) {
        const afterStart = line.indexOf("*/", startIdx + 2);
        if (afterStart === -1) {
          line = line.slice(0, startIdx);
          inBlockComment = true;
        }
      }

      if (!/@import\s*["']/.test(line)) continue;

      const relPath = file.replace(ROOT + "/", "").replace(ROOT + "\\", "");
      violations.push(`  ${relPath}:${i + 1}  ⚠  @import 违规——池 CSS 必须自包含`);
    }
  }

  if (violations.length > 0) {
    console.error(violations.join("\n"));
    console.error(`\n❌ ${violations.length} 处 @import 违规——样式自包含拷入池文件（壳目录规范 / Path B）。`);
    process.exit(1);
  }

  console.log("✅ src/pool/ CSS 全部自包含（零 @import）。");
}

main();
