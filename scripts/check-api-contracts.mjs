/**
 * 机械检查：插件 API 契约反向漂移（audit-api-contracts，E5.8#137）。
 *
 * 新能力设计流程 §五 5.1——新 API 契约四件套：contracts/linkdesk.d.ts 类型声明 + preload 实现 +
 * IpcBridgeHandler 分发 + 03-插件制造 文档说明。其中前三件已由既有机械门禁覆盖：
 *   contracts:check（d.ts 自动生成字节比对，#21）+ `satisfies PoolExposed/ShellExposed`（preload 形状，
 *   tsc 即门禁）。本文档（01-插件API契约.md）是有意**指针式**（E5#85→E5.8#22）——方法明细不手写，
 *   指向 d.ts + 命名空间矩阵，避免第二份真相源。
 *
 * 因此本脚本机械拦截的是**文档引用反向漂移**：文档里出现的 `window.linkdesk.<ns>` / `linkdesk.<ns>` /
 * `lk.<ns>` 引用必须在 live 契约（src/core/api/linkdesk-api* 接口成员）里真实存在。文档引用了不存在的
 * 命名空间 = 陈旧/笔误（实证：`window.linkdesk.data` E5.7 时代残留，契约无此面）。新 API 的文档说明
 * 由流程层强制（设计前置 + design-flow skill）——机械层管"文档不指向假命名空间"。
 *
 * 误报排除：`linkdesk.d.ts`（文件名）→ `d`；`lk.path.normalize` 等别名表前缀 → 正常命中已有命名空间。
 *
 * 用法：node scripts/check-api-contracts.mjs（已挂 npm run check）
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const API_DIR = "src/core/api/linkdesk-api";
const API_MAIN = "src/core/api/linkdesk-api.ts";
const DOC = "docs/03-插件制造/01-插件API契约.md";

/** 收集接口成员名（命名空间）——`name: {` 或 `name?: {`（可选面 bridge/hotExit 等） */
function collectNamespaceKeys(file) {
  const src = readFileSync(resolve(ROOT, file), "utf-8");
  const keys = new Set();
  // 🔴 `\w+`（2026-09-13 修 5.1 登记的正则洞）：`[a-zA-Z]+` 匹配不了带数字的名字（`p2p`）——
  //    文档一旦引用含数字的命名空间就会被漏检（静默降级）。与 scripts/lib/contract-parse.mjs 同口径。
  const re = /^\s{2}(\w+)\??:\s*\{/gm;
  let m;
  while ((m = re.exec(src)) !== null) keys.add(m[1]);
  return keys;
}

/** 契约命名空间全集：主文件 + 14 子域接口（LinkDeskAPI = 14 接口交叉，E6#57.2a 加 App 域） */
function loadContractNamespaces() {
  const names = new Set();
  for (const file of readdirSync(resolve(ROOT, API_DIR))) {
    if (extname(file) !== ".ts") continue;
    for (const k of collectNamespaceKeys(`${API_DIR}/${file}`)) names.add(k);
  }
  for (const k of collectNamespaceKeys(API_MAIN)) names.add(k);
  return names;
}

/** 从文档提取命名空间引用：window.linkdesk.X / linkdesk.X / lk.X */
function extractDocReferences() {
  const doc = readFileSync(resolve(ROOT, DOC), "utf-8");
  const refs = new Set();
  let m;
  // 🔴 `\w+`（同上）：含数字的命名空间（`p2p`）不能被 `[a-zA-Z]+` 漏掉
  const linkdeskRe = /(?:window\.)?linkdesk\.(\w+)/g;
  while ((m = linkdeskRe.exec(doc)) !== null) refs.add(m[1]);
  const lkRe = /\blk\.(\w+)/g;
  while ((m = lkRe.exec(doc)) !== null) refs.add(m[1]);
  // 误报排除：`linkdesk.d.ts` 文件名 → `d`（其余命中应真实存在）
  refs.delete("d");
  return refs;
}

function main() {
  const contract = loadContractNamespaces();
  const refs = extractDocReferences();
  const violations = [];
  for (const ref of refs) {
    if (!contract.has(ref)) {
      violations.push(
        `  文档引用了不存在的命名空间 window.linkdesk.${ref}——契约（linkdesk-api*）无此面，陈旧或笔误`,
      );
    }
  }

  if (violations.length > 0) {
    console.error(violations.join("\n"));
    console.error(`\n❌ API 契约反向漂移 ${violations.length} 处——文档引用的命名空间必须存在于 live 契约。`);
    process.exit(1);
  }

  console.log(`✅ API 契约反向漂移审计干净——文档 ${refs.size} 个命名空间引用全部命中 live 契约。`);
}

/**
 * 自测——`--self-test`：正则洞回归钉（2026-09-13 修 5.1 登记项）。
 * 判据 = 「旧正则错、新正则对」**两者都验**：旧 `[a-zA-Z]+` 对 `p2p` 引用捕到的是**残缺名** `p`
 * （不是没抓到——是抓错名，违约报告会指向不存在的 `linkdesk.p`，比漏检更误导），新 `\w+` 必须抓全。
 * 任何一条不成立即 exit 1（尺子不是恒绿）。
 */
function selfTest() {
  const sample = "用 `linkdesk.p2p`（或 `lk.p2p`）发起对等连接。";
  const oldRe = /(?:window\.)?linkdesk\.([a-zA-Z]+)/g;
  const newRe = /(?:window\.)?linkdesk\.(\w+)/g;
  const oldHit = oldRe.exec(sample)?.[1];
  const newHit = newRe.exec(sample)?.[1];
  if (oldHit !== "p") {
    console.error(`❌ 自测失败：旧正则的残缺捕获是 ${oldHit}（期望 "p"）——「洞真实存在过」这条前提不成立，样本或修复已失效。`);
    process.exit(1);
  }
  if (newHit !== "p2p") {
    console.error(`❌ 自测失败：新正则未抓到 p2p（抓到 ${newHit}）。`);
    process.exit(1);
  }
  const member = /^\s{2}(\w+)\??:\s*\{/gm.exec("  p2p?: {\n    send(): void;\n  }");
  if (member?.[1] !== "p2p") {
    console.error(`❌ 自测失败：接口成员正则未抓到 p2p（抓到 ${member?.[1]}）。`);
    process.exit(1);
  }
  console.log("✅ 自测全过——旧正则把 p2p 抓成 p（洞真实）、新正则抓到 p2p（已修）、接口成员正则同口径。");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  main();
}
