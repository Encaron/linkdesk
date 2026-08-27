/**
 * 机械检查：插件贡献点三件套（audit-contributes，E5.8#137）。
 *
 * 新能力设计流程 §五 5.3——新增 `contributes.*` 必须：plugin.schema.json 字段 + 加载器消费 + 文档说明。
 * 本脚本三条机械不变量（全部通过才绿）：
 *   ① schema → 文档：live schema 每个 contributes 字段在 03-插件contributes规范.md 有说明
 *      （`contributes.<field>` 提及）。
 *   ② schema 拷贝漂移：docs/03-插件制造/plugin.schema.json 的 contributes 字段 == live schema
 *      （public/schemas/plugin.schema.json）——两份漂移即红灯（单一权威）。
 *   ③ schema → 消费面：live schema 每个 contributes 字段在 src/ + electron/ 有消费方
 *      （`contributes.<field>` 出现即算——声明被读才有意义，纯声明零消费 = 死字段）。
 *
 * live schema = public/schemas/plugin.schema.json（发布态校验源，dist/ 构建拷贝）。
 *
 * 用法：node scripts/check-contributes.mjs（已挂 npm run check）
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const LIVE_SCHEMA = "public/schemas/plugin.schema.json";
const DOCS_SCHEMA = "docs/03-插件制造/plugin.schema.json";
const DOC = "docs/03-插件制造/03-插件contributes规范.md";

/** 收集目录下所有 .ts/.tsx 文件（排除 node_modules） */
function collectTsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      files.push(...collectTsFiles(full));
    } else if (entry.isFile() && (extname(full) === ".ts" || extname(full) === ".tsx")) {
      files.push(full);
    }
  }
  return files;
}

/** 读 schema 的 contributes.properties 键集合 */
function readContributesFields(schemaPath) {
  const schema = JSON.parse(readFileSync(resolve(ROOT, schemaPath), "utf-8"));
  const contributes = schema?.properties?.contributes;
  if (!contributes?.properties) {
    console.error(`❌ ${schemaPath} 无 properties.contributes——审计失效。`);
    process.exit(1);
  }
  return Object.keys(contributes.properties).sort();
}

function main() {
  const violations = [];
  const live = readContributesFields(LIVE_SCHEMA);
  const docText = readFileSync(resolve(ROOT, DOC), "utf-8");

  // ── ① schema → 文档 ──
  for (const field of live) {
    if (!docText.includes(`contributes.${field}`)) {
      violations.push(
        `  contributes.${field}  在 03-插件contributes规范.md 无说明——三件套缺文档`,
      );
    }
  }

  // ── ② schema 拷贝漂移（docs 拷贝 vs live）──
  const docs = readContributesFields(DOCS_SCHEMA);
  const joined = (arr) => arr.join(", ");
  if (joined(live) !== joined(docs)) {
    violations.push(
      `  docs/03-插件制造/plugin.schema.json 拷贝漂移：live(${live.length}) [${joined(live)}] vs 拷贝(${docs.length}) [${joined(docs)}]——单一权威，拷贝须与 live 同步`,
    );
  }

  // ── ③ schema → 消费面（contributes.<field> 在 src/ + electron/ 出现即算有消费方）──
  const sources = collectTsFiles(resolve(ROOT, "src"))
    .concat(collectTsFiles(resolve(ROOT, "electron")))
    .map((f) => readFileSync(f, "utf-8"))
    .join("\n");
  for (const field of live) {
    if (!new RegExp(`contributes\\.\\??${field}\\b`).test(sources)) {
      violations.push(
        `  contributes.${field}  在 src/+electron/ 零消费引用——死字段或加载器漏接线（三件套缺消费）`,
      );
    }
  }

  if (violations.length > 0) {
    console.error(violations.join("\n"));
    console.error(`\n❌ contributes 三件套 ${violations.length} 处违规——见新能力设计流程 §五 5.3。`);
    process.exit(1);
  }

  console.log(`✅ contributes 三件套审计干净——${live.length} 字段 schema/文档/消费全对齐。`);
}

main();
