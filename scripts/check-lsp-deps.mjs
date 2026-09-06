/**
 * E5.8#24.7 运行时依赖哨兵——spawn 型二进制物理存在门禁。
 *
 * 背景（回归 #24）：pyright 被 knip 误删——`node_modules/pyright/dist/pyright-langserver.js`
 * 是 spawn 字符串引用（非 import），knip 静态 import 图看不见 → 删依赖时绿灯 → dev spawn ENOENT →
 * 跳转静默消失。与 knip `ignoreDependencies` 互补：knip 管静态 import 图，本哨兵管运行时依赖活着。
 *
 * 扫描 spawn 二进制引用的两个来源：
 *   1. plugins/ 下各插件 plugin.json 的 `contributes.langDefs[].lsp.{command,args}`——LSP 服务器声明
 *      （架构真相源：渲染进程经 langDef IPC 查询 → 主进程 spawn。pyright 就声明在这里，knip 盲区）。
 *   2. electron/ 下 *.ts 中 `spawn/exec/spawnSync/execFile` 调用参数里的二进制路径字符串字面量——
 *      防未来有人把 spawn 路径硬编码进主进程代码（回归 #24 同款盲区，先拦在门口）。
 * 全部解析后 `fs.existsSync`——任一缺失 → exit 1（红门禁）。OS shell 命令（`start powershell` /
 * `open -a Terminal` / `xdg-open` 等）无二进制扩展名，天然豁免。
 *
 * 检查基准（E6#15e 后按源决定，`--base` / `LSP_DEP_BASE` 可显式覆盖）：
 *   - plugin.json langDefs.lsp args：以「该 plugin.json 所在目录」为基（= 插件根——lsp.args 相对路径
 *     以插件根目录为基准解析，E6#15l 锚词「插件根目录为基准」，门禁 scripts/check-lsp-args-base.mjs 钉）——
 *     镜像主进程注册处一次绝对化（electron/plugins/lsp-arg-resolve.ts）：作者相对路径基准就是插件目录，
 *     pyright 随 python 插件自走，落 plugins/python/node_modules/。
 *   - electron/ 下 *.ts spawn 字面量：以项目根为基（主进程硬编码 spawn 字面量的保守基准；lsp-handlers
 *     运行时 cwd = 该语言插件根，见 E6#15k——这里只拦「有人把 spawn 路径写死进主进程」的未来回归）。
 *   - 显式 `--base <dir>`：两源通吃覆盖（冒烟脚本等外部调用场景保留）。
 *
 * 用法：node scripts/check-lsp-deps.mjs [--base <dir>]（已挂 npm run check）
 * 退出码 0 = 全部就位，1 = 有缺失（打印到 stderr）。
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname, extname, isAbsolute, sep } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 显式检查基准（E6 可配置）——CLI --base 优先，其次 LSP_DEP_BASE。缺省按源决定（plugin.json 插件根 / electron 项目根） */
let cliBase = null;
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base" && argv[i + 1]) cliBase = resolve(argv[i + 1]);
    if (argv[i].startsWith("--base=")) cliBase = resolve(argv[i].slice("--base=".length));
  }
  if (process.env.LSP_DEP_BASE) cliBase = resolve(process.env.LSP_DEP_BASE);
}

/** spawn 引用的脚本/二进制扩展名白名单——哨兵只查这些（与 electron/ipc/lsp-dependency.ts 同语义） */
const BINARY_EXT = /\.(js|mjs|cjs|cmd|exe|bat)$/i;
/** 不需物理存在的 shell 内建命令（node 启动 .js LSP 脚本等） */
const SHELL_BUILTINS = new Set(["node", "npm", "npx", "python", "python3", "py", "bash", "sh", "cmd", "powershell", "pwsh"]);

function collectFiles(dir, extSet, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
      collectFiles(resolve(dir, entry.name), extSet, out);
    } else if (entry.isFile() && extSet.has(extname(entry.name))) {
      out.push(resolve(dir, entry.name));
    }
  }
  return out;
}

/** 向上找 `<ancestor>/node_modules/<seg>` 首个命中（Node 模块解析语义）——找不到 null。
 *  E6#16：workspaces 化后插件依赖可 hoist 到仓库根 node_modules（python 的 pyright 实证），
 *  插件根本地无 node_modules/… 物理文件 ≠ 依赖缺失（只是被提升）——先本地（嵌套布局）后向上（hoist 布局）。 */
function resolveNodeModulesUpward(startDir, seg) {
  let dir = startDir;
  for (;;) {
    const candidate = resolve(dir, "node_modules", ...seg.split("/"));
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** 解析引用为绝对路径——绝对原样；相对对给定基准 resolve（调用方传入按源决定的 baseDir）。
 *  node_modules/ 前缀相对引用走向上解析（本地命中优先，hoist 在父级/仓库根命中）；都无 → 回落基准位
 *  （错误信息仍指向基准期望位，不静默）。 */
function resolveRef(ref, baseDir) {
  if (isAbsolute(ref)) return ref;
  const norm = ref.replace(/\\/g, "/");
  if (norm.startsWith("node_modules/")) {
    const seg = norm.split("node_modules/")[1];
    if (seg) {
      const up = resolveNodeModulesUpward(baseDir, seg);
      if (up) return up;
    }
  }
  return resolve(baseDir, ref);
}

/** 是否路径式引用（含路径分隔符 = 相对/绝对文件，不是 PATH 二进制） */
function isPathLike(ref) {
  return ref.includes("/") || ref.includes("\\") || isAbsolute(ref) || BINARY_EXT.test(ref);
}

/**
 * 扫描 TS 中 spawn/exec 调用参数里的字符串字面量。
 * 从匹配后的 `(` 起扫描到括号闭合，收集引号内字符串（跳过转义）。
 */
function extractSpawnStrings(text) {
  const results = [];
  const CALL_RE = /\b(spawn|exec|spawnSync|execFile|execFileSync)\s*\(/g;
  let m;
  while ((m = CALL_RE.exec(text)) !== null) {
    const openParen = m.index + m[0].length - 1;
    let depth = 0;
    let quote = null;
    let cur = "";
    for (let j = openParen; j < text.length; j++) {
      const ch = text[j];
      if (quote) {
        if (ch === "\\") { j++; continue; }
        if (ch === quote) { results.push(cur); cur = ""; quote = null; continue; }
        cur += ch;
        continue;
      }
      if (ch === "(") { depth++; continue; }
      if (ch === ")") {
        depth--;
        if (depth === 0) break;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === "`") { quote = ch; cur = ""; continue; }
    }
  }
  return results;
}

/** 收集一个引用 + 来源，缺失时报错用 */
const missing = [];
let checked = 0;

function checkRef(ref, source, baseDir) {
  if (typeof ref !== "string" || !ref) return;
  if (!isPathLike(ref)) return;          // 内建/PATH 二进制（clangd 等）——同步无法验证，跳过
  if (!BINARY_EXT.test(ref) && !isAbsolute(ref)) return; // 非二进制扩展名的相对 ref 不查
  const abs = resolveRef(ref, baseDir);
  checked++;
  if (!existsSync(abs)) {
    missing.push({ ref, abs, source });
  }
}

/** 扫描 plugin.json 的 langDefs.lsp 声明——E6#15e：基准 = 该 plugin.json 所在目录（作者相对路径的插件根） */
function scanPluginJson(file) {
  let json;
  try {
    json = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return; // 非法 JSON——其他门禁（schema/解析）负责，这里跳过
  }
  const langDefs = json?.contributes?.langDefs;
  if (!Array.isArray(langDefs)) return;
  const baseDir = cliBase ?? dirname(file);
  for (const langDef of langDefs) {
    const lsp = langDef?.lsp;
    if (!lsp) continue;
    if (typeof lsp.command === "string" && !SHELL_BUILTINS.has(lsp.command)) {
      checkRef(lsp.command, file, baseDir);
    }
    if (Array.isArray(lsp.args)) {
      for (const arg of lsp.args) checkRef(arg, file, baseDir);
    }
  }
}

/** 扫描 electron/**\/*.ts 中 spawn 调用参数字符串字面量——基准 = 项目根（主进程 spawn cwd = app.getAppPath()） */
function scanElectronTs(file) {
  const text = readFileSync(file, "utf-8");
  const baseDir = cliBase ?? ROOT;
  for (const ref of extractSpawnStrings(text)) {
    if (SHELL_BUILTINS.has(ref)) continue;
    checkRef(ref, file, baseDir);
  }
}

// ── 执行 ──

const pluginJsonFiles = collectFiles(resolve(ROOT, "plugins"), new Set([".json"]), []).filter((f) => f.endsWith("plugin.json"));
const electronTsFiles = collectFiles(resolve(ROOT, "electron"), new Set([".ts"]), []);

for (const f of pluginJsonFiles) scanPluginJson(f);
for (const f of electronTsFiles) scanElectronTs(f);

console.log(`[lsp-deps] 哨兵检查 spawn 运行时依赖：${checked} 个二进制引用，${missing.length} 缺失（plugin.json 按插件目录基准，electron .ts 按项目根${cliBase ? `，--base=${cliBase}` : ""}）`);

if (missing.length > 0) {
  for (const { ref, abs, source } of missing) {
    console.error(`❌ LSP 运行时依赖缺失: "${ref}"（解析 ${abs}）——声明源 ${source}。删依赖时 knip 静态图看不见，本哨兵兜底。`);
  }
  console.error(`[lsp-deps] 红门禁——上述 ${missing.length} 个 spawn 依赖不存在。恢复依赖或删除失效引用后重跑。`);
  process.exit(1);
}

console.log("[lsp-deps] ✓ 全部 spawn 运行时依赖物理存在");
