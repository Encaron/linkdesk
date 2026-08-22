/**
 * 机械检查：CSS 中 padding/margin/gap 是否在 4px 节奏刻度上。
 *
 * 用法：node scripts/check-spacing-grid.mjs
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
 *
 * 排除：font-size、line-height、height、width、border-radius、定位属性（top/left/right/bottom）。
 * 1-6px 视为微调值（图标间距/紧凑内边距等有意的精细控制），不强制 4px 节奏。
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 收集 src/ 下所有 .css 文件 */
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
  const srcDir = resolve(ROOT, "src");
  const cssFiles = collectCssFiles(srcDir);

  let totalViolations = 0;
  let inBlockComment = false;

  for (const file of cssFiles) {
    const raw = readFileSync(file, "utf-8");
    const rawLines = raw.split("\n");

    for (let i = 0; i < rawLines.length; i++) {
      let line = rawLines[i];

      // 处理多行注释：如果上一行未闭合，检查本行是否闭合
      if (inBlockComment) {
        const endIdx = line.indexOf("*/");
        if (endIdx === -1) continue;          // 仍在注释中——跳过整行
        line = line.slice(endIdx + 2);        // 取注释后的部分
        inBlockComment = false;
      }

      // 去掉本行中的行内注释 /* ... */
      line = line.replace(/\/\*.*?\*\//g, "");

      // 检查是否开启了新的多行注释（/* 但没有 */）
      const startIdx = line.indexOf("/*");
      if (startIdx !== -1) {
        const afterStart = line.indexOf("*/", startIdx + 2);
        if (afterStart === -1) {
          // 多行注释未闭合——取注释前的部分，标记 inBlockComment
          line = line.slice(0, startIdx);
          inBlockComment = true;
        }
        // 如果已闭合，上面的 replace 已经处理了
      }

      // 只检查包含 padding/margin/gap 属性声明的行
      if (!/\b(padding|margin|gap)\s*:/.test(line)) continue;

      // 提取所有 px 值
      const pxRegex = /\b(\d+)px\b/g;
      let match;
      while ((match = pxRegex.exec(line)) !== null) {
        const value = parseInt(match[1], 10);
        // 跳过 1-6px（微调值，图标间距/紧凑内边距等有意的精细控制）和 4 的倍数（合规）
        if (value <= 6) continue;
        if (value % 4 === 0) continue;
        // 违规
        const relPath = file.replace(ROOT + "/", "").replace(ROOT + "\\", "");
        console.error(
          `  ${relPath}:${i + 1}:${match.index + 1}  ⚠  ${value}px 不在 4px 节奏刻度上（padding/margin/gap）`
        );
        totalViolations++;
      }
    }
  }

  if (totalViolations > 0) {
    console.error(`\n❌ ${totalViolations} 处间距违规——请归到最近的 4px 倍数值。`);
    process.exit(1);
  }

  console.log("✅ 所有 padding/margin/gap 在 4px 节奏刻度上。");
}

main();
