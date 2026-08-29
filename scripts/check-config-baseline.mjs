/**
 * 机械检查：壳侧 app.* 配置项必须有保底默认值（audit-config-baseline，E5.8#137）。
 *
 * 新能力设计流程 §五 5.2——新增 `app.*` 配置项必须：registerConfiguration 声明 + 保底默认值
 * （无插件也成立）+ 设置组归属。本脚本机械拦截第一条硬性部分：声明了但没有 `default:` 的 app.* 键。
 *
 * 扫描 registerConfiguration 的 properties 对象（appearance.ts + startup.ts）——每个
 * `"app.xxx": { ... }` 块内必须有 `default:`。缺省默认值 = 用户未配置时读空值 → 下游 bug。
 *
 * 用法：node scripts/check-config-baseline.mjs（已挂 npm run check）
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 从 offset 找匹配的右大括号——跳过字符串字面量（对标 check-ipc-audit findMatchingBrace） */
function findMatchingBrace(text, start) {
  let depth = 0;
  let inString = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") inString = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 扫描文件的 registerConfiguration properties——返回缺 default 的 app.* 键 */
function scanFile(relPath) {
  const src = readFileSync(resolve(ROOT, relPath), "utf-8");
  const violations = [];
  const re = /"(app\.[\w.]+)":\s*\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const key = m[1];
    const open = src.indexOf("{", m.index + m[0].length - 1);
    const close = findMatchingBrace(src, open);
    if (close === -1) {
      violations.push(`  ${relPath}  ⚠  "${key}" 块括号不闭合——审计无法解析`);
      continue;
    }
    const block = src.slice(open, close + 1);
    if (!/default\s*:/.test(block)) {
      violations.push(
        `  ${relPath}  ⚠  "${key}" 声明了但块内无 default:——app.* 配置项必须带保底默认值（新能力设计流程 §五 5.2）`,
      );
    }
  }
  return violations;
}

function main() {
  // app.* 声明集中在壳外观配置 + 壳通用配置两处（E5.8#50.19 主题组第二贡献点 "appearance"）
  const targets = ["src/App/config/appearance.ts", "src/App/startup.ts"];
  const violations = targets.flatMap(scanFile);

  if (violations.length > 0) {
    console.error(violations.join("\n"));
    console.error(`\n❌ ${violations.length} 处 app.* 配置项缺保底默认值——见新能力设计流程 §五 5.2。`);
    process.exit(1);
  }

  console.log(`✅ app.* 配置保底审计干净——${targets.length} 文件全部配置项带 default。`);
}

main();
