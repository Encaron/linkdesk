/**
 * E5.8#24.9 LSP 关键交互集成冒烟——goToDefinition 链路真 spawn 一键验证。
 *
 * 背景（回归 #24）：pyright 被删 → dev spawn ENOENT → invoke 仍返 channelId →
 * client.start() 挂死 → 跳转静默消失。物理存在由 #24.7 check-lsp-deps.mjs（构建期哨兵）
 * + #24.6 checkLspDependency（运行期哨兵）双兜底；本脚本验证更深一层——**即使 pyright
 * 在，协议链路是否真通**：真 spawn pyright → JSON-RPC initialize 握手 → didOpen .py →
 * textDocument/definition 请求 → 响应非空且指向声明行。把「跳转断了」变成可重复一键验证。
 *
 * 检查基准可配置（E6 联动，与 check-lsp-deps.mjs 同约定）：
 *   --base <dir>      pyright 相对路径基准（dev 默认项目根 → <base>/node_modules/pyright/...）
 *   --pyright <path>  显式 pyright 脚本绝对路径（E6 搬迁后 args 变绝对路径——直接传插件目录下的路径）
 *   环境变量 LSP_DEP_BASE 作 --base 兜底
 *   E6 搬迁验收：换 --base/--pyright 指向插件目录 node_modules 即复用，无需改脚本逻辑。
 *
 * 用法：node scripts/check-lsp-smoke.mjs [--base <dir>] [--pyright <path>]（npm run lsp:smoke）
 * 退出码 0 = .py 跳转全链路通，1 = 任一环节失败/超时/pyright 缺失（stderr 报因）。
 */

import { spawn } from "child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/**
 * 向上找 `<ancestor>/node_modules/<seg>` 首个命中（Node 模块解析语义）——找不到返回 null。
 *
 * 🔴 E6#98d（L7 第 7.1 轮）：**这是本轮抓到的真缺陷的修法**。此前 `--pyright` 缺省时只查
 * `resolve(base, "node_modules/pyright/dist/pyright-langserver.js")` 一处——而 E6#16 workspaces 化后
 * 插件依赖会被 **hoist 到仓库根**（实测：`pyright` 在 `node_modules/pyright`，`plugins/python/node_modules/`
 * 整个不存在）⇒ `npm run lsp:smoke`（`--base plugins/python`）**恒报「pyright 缺失」**，而依赖其实在。
 * 这与 `check-lsp-deps.mjs` 的 `resolveNodeModulesUpward` 是**同一条规则**——两处各写一份必然漂移，
 * 故此处照抄同一语义（该脚本已在 E6#16 修过，本脚本漏了）。
 *
 * 另一重意义：python 插件源码搬出壳仓（L7 7.2）之后，`--base` 指向哪里由外部传入——上层搜索让
 * 「基准 = 插件源码树」这个语义不依赖「插件根一定有自己的 node_modules」这个会被 npm 布局打破的假设。
 */
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

/** pyright 入口解析——先向上找（本地命中优先，hoist 在父级/仓库根命中），都无则回落基准位（错误信息仍指向期望位） */
function resolvePyrightFromBase(baseDir) {
  const seg = "pyright/dist/pyright-langserver.js";
  return resolveNodeModulesUpward(baseDir, seg) ?? resolve(baseDir, "node_modules", ...seg.split("/"));
}

/** 检查基准（E6 可配置）——CLI --base 优先，其次 LSP_DEP_BASE 环境变量，默认项目根 */
let base = ROOT;
/** pyright 脚本路径——--pyright 显式绝对路径优先，否则由 base 解析 */
let pyrightPath = null;
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base" && argv[i + 1]) base = resolve(argv[i + 1]);
    if (argv[i].startsWith("--base=")) base = resolve(argv[i].slice("--base=".length));
    if (argv[i] === "--pyright" && argv[i + 1]) pyrightPath = resolve(argv[i + 1]);
    if (argv[i].startsWith("--pyright=")) pyrightPath = resolve(argv[i].slice("--pyright=".length));
  }
  if (!pyrightPath && process.env.LSP_DEP_BASE) base = resolve(process.env.LSP_DEP_BASE);
}
if (!pyrightPath) pyrightPath = resolvePyrightFromBase(base);

/** 冒烟测试工作区（临时目录，脚本结束清理） */
const WORKSPACE = mkdtempSync(resolve(tmpdir(), "ld-lsp-smoke-"));
const TEST_FILE = resolve(WORKSPACE, "smoke_target.py");
const TEST_URI = pathToFileURL(TEST_FILE).toString();
const TEST_CONTENT = [
  "class Target:",
  "    def method(self) -> int:",
  "        return 42",
  "",
  "",
  "def use() -> int:",
  "    instance = Target()",
  "    return instance.method()",
  "",
].join("\n");
// 定义请求落点：`    instance = Target()` —— Target 起于 0-based 行 6、字符 15
const DEF_LINE = 6;
const DEF_CHAR = 15;

const DEADLINE_MS = 45000; // 全程护栏——任何阶段超时即红
const PER_REQ_TIMEOUT_MS = 10000;
const DEF_RETRIES = 10; // pyright 增量分析未就绪时空结果重试

let watchdog = null;
function armWatchdog(child, reason) {
  watchdog = setTimeout(() => {
    console.error(`[lsp-smoke] ❌ 超时（${DEADLINE_MS}ms）——${reason}`);
    child.kill();
    process.exit(1);
  }, DEADLINE_MS);
}
function disarmWatchdog() {
  if (watchdog) { clearTimeout(watchdog); watchdog = null; }
}

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`[lsp-smoke] ${label} 超时（${ms}ms）`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

/** 最小 LSP JSON-RPC 客户端——Content-Length 分帧 + id 路由（只解请求响应，通知忽略） */
function createLspClient(proc) {
  let buf = Buffer.alloc(0);
  const pending = new Map();
  let nextId = 1;

  proc.stdout.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const headerEnd = buf.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const header = buf.subarray(0, headerEnd).toString("ascii");
      const m = /Content-Length:\s*(\d+)/i.exec(header);
      if (!m) break;
      const len = parseInt(m[1], 10);
      const total = headerEnd + 4 + len;
      if (buf.length < total) break;
      const body = buf.subarray(headerEnd + 4, total).toString("utf8");
      buf = buf.subarray(total);
      let msg;
      try { msg = JSON.parse(body); } catch { continue; }
      if (msg.id !== undefined && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`[lsp-smoke] 服务器错误 ${JSON.stringify(msg.error)}`));
        else p.resolve(msg.result);
      }
    }
  });

  function send(msg) {
    const body = JSON.stringify(msg);
    proc.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
  }
  function request(method, params) {
    const id = nextId++;
    return new Promise((resolve_, reject_) => {
      pending.set(id, { resolve: resolve_, reject: reject_ });
      send({ jsonrpc: "2.0", id, method, params });
    });
  }
  function notify(method, params) { send({ jsonrpc: "2.0", method, params }); }
  return { request, notify };
}

writeFileSync(TEST_FILE, TEST_CONTENT, "utf8");

try {
  console.log(`[lsp-smoke] pyright 脚本: ${pyrightPath}`);
  console.log(`[lsp-smoke] 临时工作区: ${WORKSPACE}`);
  if (!existsSync(pyrightPath)) {
    console.error(`[lsp-smoke] ❌ pyright 缺失: ${pyrightPath}——恢复依赖后重跑（#24 回归同款根因）`);
    process.exit(1);
  }

  const child = spawn(process.execPath, [pyrightPath, "--stdio"], {
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
    cwd: WORKSPACE,
  });
  armWatchdog(child, "pyright 全程无响应");

  let stderrTail = "";
  child.stderr.on("data", (d) => { stderrTail = (stderrTail + d.toString()).slice(-2000); });
  let settled = false;
  child.on("error", (err) => {
    if (settled) return;
    console.error(`[lsp-smoke] ❌ spawn 失败: ${err.message}`);
    process.exit(1);
  });
  child.on("exit", (code) => {
    if (settled) return;
    console.error(`[lsp-smoke] ❌ pyright 提前退出（code=${code}）——stderr 尾部: ${stderrTail.slice(-500)}`);
    process.exit(1);
  });

  const lsp = createLspClient(child);

  // 1. initialize 握手
  const initResult = await withTimeout(
    lsp.request("initialize", {
      processId: null,
      rootUri: pathToFileURL(WORKSPACE).toString(),
      capabilities: {},
    }),
    PER_REQ_TIMEOUT_MS,
    "initialize 握手",
  );
  console.log(`[lsp-smoke] initialize 握手 ✓（serverInfo=${JSON.stringify(initResult?.serverInfo ?? "n/a")}）`);
  lsp.notify("initialized", {});

  // 2. didOpen 打开 .py
  lsp.notify("textDocument/didOpen", {
    textDocument: { uri: TEST_URI, languageId: "python", version: 1, text: TEST_CONTENT },
  });

  // 3. textDocument/definition——空结果重试（pyright 增量分析就绪前可能暂无结果）
  let defs = null;
  for (let attempt = 1; attempt <= DEF_RETRIES; attempt++) {
    defs = await withTimeout(
      lsp.request("textDocument/definition", {
        textDocument: { uri: TEST_URI },
        position: { line: DEF_LINE, character: DEF_CHAR },
      }),
      PER_REQ_TIMEOUT_MS,
      `textDocument/definition（第 ${attempt}/${DEF_RETRIES} 次）`,
    );
    const arr = Array.isArray(defs) ? defs : defs ? [defs] : [];
    if (arr.length > 0) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  const list = Array.isArray(defs) ? defs : defs ? [defs] : [];
  if (list.length === 0) {
    console.error(`[lsp-smoke] ❌ textDocument/definition 返回空（${DEF_RETRIES} 次重试后）——跳转链路断了（响应非空断言失败）`);
    process.exit(1);
  }
  const loc = list[0];
  if (loc?.range?.start?.line !== 0) {
    console.error(`[lsp-smoke] ❌ definition 落点异常: ${JSON.stringify(loc)}——期望 class Target 声明行（line 0）`);
    process.exit(1);
  }
  console.log(`[lsp-smoke] textDocument/definition → ${list.length} 个位置，落在 ${loc.uri.split("/").pop()} line ${loc.range.start.line} ✓`);

  // 4. shutdown 收尾
  await lsp.request("shutdown", {}).catch(() => {});
  settled = true;
  child.kill();
  disarmWatchdog();
  console.log(`[lsp-smoke] ✓ .py 跳转全链路通过（initialize → didOpen → definition 非空指向声明）`);
} finally {
  disarmWatchdog();
  rmSync(WORKSPACE, { recursive: true, force: true });
}
