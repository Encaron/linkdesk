/**
 * M4 spike（`AI#31`）主进程侧原型 —— **本地通道 ＋ token ＋ 语义操作转发**。
 *
 * ⚠️ **一次性原型**：正式件是 `AI#32` 的 `electron/services/aiBridge/`；本文件只用来「退未知」，
 *    结论见同夹 `README.md`。反过来说 —— **它不改产品代码一行**（注入式），这正是它的价值：
 *    spike 结论不与任何将被推翻的落地形态绑死。
 *
 * 注入方式（⛔ 不改 `electron/`）：
 *   `NODE_OPTIONS=--require <本文件> electron . …`
 *   ——实测 Electron 43 dev 轨道支持 `NODE_OPTIONS=--require`，且**主进程与各渲染进程都会跑**；
 *      本文件按 `process.type === "browser"` 只让主进程干活（渲染进程加载到就返回）。
 *
 * 🔴 **注入件的头号坑（实测栽过一次，见 README §发现 ①）**：`--require` 在 **Node 的
 *    `pre_execution` 阶段**就跑（早于 Electron 给主模块接线），此刻 `require("electron").app`
 *    还是 `undefined` ⇒ 顶层一碰 `app.getPath` 就 `TypeError` **整只主进程起不来**。
 *    解法 = 顶层只干「不碰 electron」的事，其余丢给 `setImmediate` 重试到真模块可用为止。
 *
 * 开关（环境变量；本 spike 不进设置页——设置面归 `AI#38`）：
 *   · 未设置            ⇒ 本 hook **完全惰性**（不写文件、不监听、不占端口）
 *   · `off`             ⇒ **门锁关着**：不监听任何东西，但留一条记录（好让 CLI 说出「软件在跑、开关是关的」）
 *   · `pipe`            ⇒ Windows 命名管道 `\\.\pipe\linkdesk-m4spike-<userData 摘要>`
 *   · `tcp`             ⇒ TCP
 *   · `LINKDESK_M4_SPIKE_HOST` / `_PORT` ⇒ 绑定地址与端口（**都是配置项**，见下「留口子」）
 *
 * 🔴 「留口子」硬要求（用户 2026-09-28 拍板）在本文件里长这样：
 *   **代码里没有一处「本机才放行」的判断**——地址是 `LINKDESK_M4_SPIKE_HOST`、端口是 `_PORT`，
 *   「现在只开回环」是**默认值**（配置的结果），不是 `if (peer !== "127.0.0.1") reject` 这类假设（代码的假设）。
 *
 * 落点（`userData` 下两件，**地址与凭据分家**）：
 *   · `m4-spike-bridge.json` —— 通道记录（地址 ＋ 身份 ＋ 状态，**不含凭据**）
 *   · `m4-spike-bridge.token` —— 凭据（一把随机 32 字节 hex；Windows 下靠 userData 的**逐用户 ACL** 保护）
 *
 * 操作（本 spike 只有这几条：一条自查 ＋ 一条认人 ＋ 一条读 ＋ 一条写 ＋ 一条账）：
 *   · `describe` ⇒ 从同一张操作表**派生**的清单（自举点）
 *   · `ping`     ⇒ 认人：`{pid, transport, endpoint, appVersion, uptimeMs …}`
 *   · `tabs`     ⇒ 壳侧读取面 `plugins:call / listTabs`（M1 `AI#4`）
 *   · `exec`     ⇒ `commands:execute`（**经壳**的 `CommandRegistry` 执行）
 *   · `log`      ⇒ 最近 20 条操作账（`AI#43` 的雏形：正门三件套之「账本」）
 *
 * 🔴 两条本 spike 用实测换来的纪律（写给 `AI#32` 的落地人；读数见 README）：
 *   ① **启动点必须在「抢到单实例锁之后」**——输掉锁的那个进程也会加载本 hook（`--require` 早于 main.js），
 *      而它整只进程正要消失；不设门就可能**改写记录 / 抢绑端口**（多实例下「谁在服务」当场失真）。
 *      本文件的门 = `app.hasSingleInstanceLock()`。
 *   ② **监听失败不许静默**——`EADDRINUSE`（端口被占）时记录里写 `lastError`，否则
 *      「软件在跑但通道没起来」与「开关关着」在客户端**不可分辨**（M5 的同型教训：CDP 端口绑不上不重试）。
 */

"use strict";

// ── 顶层：只做「不碰 electron」的事（此时 `require("electron")` 还没接线）──
if (process.type !== "browser") return; // NODE_OPTIONS 是进程级 ⇒ 渲染进程也会加载；只有主进程干活
const MODE = process.env.LINKDESK_M4_SPIKE || "";
if (!MODE) return; // 未点名 ⇒ 完全惰性

const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const crypto = require("node:crypto");

const STARTED_AT = new Date().toISOString();
const STARTED_MS = Date.now();
const MAX_REQUEST_BYTES = 1024 * 1024;
const RECORD_NAME = "m4-spike-bridge.json";
const TOKEN_NAME = "m4-spike-bridge.token";
const LEDGER = []; // 操作账（本 spike 只留最近若干条）

let app = null; // 等真模块接上后填
let BrowserWindow = null;
let ipcMain = null;
let CH = null; // 构建产物里的 IPC 通道名（不手抄）
let USER_DATA = null;
let RECORD_FILE = null;
let TOKEN_FILE = null;
let PIPE_NAME = null;
let RECORD = null;
let TOKEN = null;
let SERVER = null;

const log = (...parts) => console.log("[m4-spike]", ...parts);

/** 带机读 code 的错误（分类法在客户端那一侧只有一份实现 —— `bridge-client.mjs`） */
function coded(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// ── 注入接线：`--require` 早于 Electron 的模块装配 ⇒ 重试到真模块可用 ──
function bootstrap(attempt = 0) {
  let electron = null;
  try {
    electron = require("electron");
  } catch {
    electron = null;
  }
  const a = electron && electron.app;
  if (!a || typeof a.getPath !== "function") {
    if (attempt > 400) {
      log("⚠️ 一直拿不到 electron 真模块（`require('electron').app` 恒为 undefined）⇒ 放弃注入");
      return;
    }
    setTimeout(() => bootstrap(attempt + 1), 10);
    return;
  }
  app = a;
  BrowserWindow = electron.BrowserWindow;
  ipcMain = electron.ipcMain;
  setUp();
}

function setUp() {
  // 🔴 启动门（本 spike 的头号发现，见文件头纪律 ①）：抢到锁的进程才启动。
  // ⚠️ `LINKDESK_M4_SPIKE_NO_LOCK_GUARD=1` 是**负控开关**（`accept.mjs` 的 multi 阶段用它复现
  //    「不设门会怎样」）——⛔ 正式件不许有这个东西，它只为让「这道门有用」变成一条可复现读数。
  const noGuard = process.env.LINKDESK_M4_SPIKE_NO_LOCK_GUARD === "1";
  app.whenReady().then(() => {
    if (noGuard) {
      log(`⚠️ 负控：LINKDESK_M4_SPIKE_NO_LOCK_GUARD=1 ⇒ 跳过单实例锁检查（**正式件⛔ 不许有此开关**）`);
      start();
      return;
    }
    if (typeof app.hasSingleInstanceLock === "function" && !app.hasSingleInstanceLock()) {
      log(`pid=${process.pid} 未持有单实例锁（它是抢锁失败的那个进程）⇒ 不监听、不写记录`);
      return;
    }
    start();
  });
}

// ── 通道名**不手抄**：从构建产物读（名字改了就在这里响亮地报出来）──
//    这也是一条「构建握手」：忘了 `tsc -p electron/tsconfig.json` 时本文件会说清是产物旧了。
function loadChannels() {
  try {
    return require(path.join(app.getAppPath(), "dist-electron", "electron", "ipc", "channels.js")).IPC;
  } catch (e) {
    log("⚠️ 读不到构建产物 channels.js（先跑 `npx tsc -p electron/tsconfig.json`）:", e && e.message);
    return null;
  }
}

function writeRecord() {
  try {
    fs.mkdirSync(USER_DATA, { recursive: true });
    fs.writeFileSync(RECORD_FILE, JSON.stringify(RECORD, null, 2) + "\n");
  } catch (e) {
    log("⚠️ 写记录失败:", e && e.message);
  }
}

function endpointOf() {
  if (MODE === "pipe") return { transport: "pipe", pipe: PIPE_NAME };
  const addr = SERVER && SERVER.address();
  return { transport: "tcp", host: process.env.LINKDESK_M4_SPIKE_HOST || "127.0.0.1", port: addr && typeof addr === "object" ? addr.port : Number(process.env.LINKDESK_M4_SPIKE_PORT || 0) };
}

// ════════════════════════════════════════════════════════════
// 主进程 → 壳渲染进程：**复用既有 bridge 信封**（零新增 IPC 通道）
//
// 为什么要这一跳：主进程里没有「执行命令」这个入口——命令注册表住在**壳渲染进程**
// （`CommandRegistry`），标签权威也在壳（`useTabManager` React state）。所以网关（住主进程）
// 要干活必须经这条既有缝，而不是新开一条 IPC 通道（那会牵动命名空间矩阵/审计/契约）。
// 与 `IpcBridge` 的 pending 表**互不干扰**：只认自己的 requestId 前缀（对方的表里没有 ⇒ 直接忽略）。
// ════════════════════════════════════════════════════════════
let _seq = 0;
const _pending = new Map();

function registerSeam() {
  ipcMain.on(CH.bridge.response, (_event, msg) => {
    const p = msg && _pending.get(msg.requestId);
    if (!p) return; // 不是本次 spike 的请求（`IpcBridge` 自己的请求也走这条通道）
    _pending.delete(msg.requestId);
    clearTimeout(p.timer);
    if (msg.error) p.reject(new Error(String(msg.error)));
    else p.resolve(msg.result);
  });
}

async function waitShellWindow(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    if (win) return win;
    if (Date.now() > deadline) throw coded("ENOSHELL", `壳窗在 ${timeoutMs}ms 内没有出现`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * 主进程 → 壳的一次请求。
 * ⚠️ `sourceWindowId: "main"` 与 `IpcBridge` 对「主壳发起」的兜底章一致；多窗口下这里**必然要改**
 * （按目标窗路由 —— `AI#41` 的活）。
 */
async function shellRequest(channel, args, timeoutMs = 8000) {
  const win = await waitShellWindow(timeoutMs);
  const requestId = `m4spike-${process.pid}-${++_seq}-${Date.now()}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pending.delete(requestId);
      reject(coded("ESHELLTIMEOUT", `壳无应答（${timeoutMs}ms 超时）`));
    }, timeoutMs);
    _pending.set(requestId, { resolve, reject, timer });
    win.webContents.send(CH.bridge.request, { requestId, channel, args, sourceWindowId: "main" });
  });
}

// ── 操作面（本 spike 的「白名单」：只有这几条，别的名字一律拒 —— 反证用）──
// 🔴 形态即 `AI#33` 的结论：**表里每一条自带 `help` / `params`**，`describe` 操作**从这张表派生**
//    （`opCatalog()` 读同一个对象）⇒ 清单与真实现**不可能漂移**。这正是「运行期派生，不手抄第二份」。
const OPS = {
  describe: {
    help: "自查：列出本实例支持的操作与参数（零源码环境 AI 的**自举点** —— `AI#35`）",
    params: [],
    run: async () => ({ whitelistVersion: 1, ops: opCatalog() }),
  },

  ping: {
    help: "认人：谁在服务（pid / 通道 / 版本 / 已跑多久）",
    params: [],
    run: async () => ({
      pid: process.pid,
      appName: app.getName(),
      mode: MODE,
      transport: MODE === "pipe" ? "pipe" : "tcp",
      endpoint: endpointOf(),
      appVersion: app.getVersion(),
      userData: USER_DATA,
      startedAt: STARTED_AT,
      uptimeMs: Date.now() - STARTED_MS,
      shellWindows: BrowserWindow.getAllWindows().length,
    }),
  },

  tabs: {
    help: "读标签快照（经壳读取面 `plugins:call` / `listTabs` —— M1 `AI#4`）",
    params: [],
    run: async () => shellRequest(CH.plugins.call, ["listTabs"]),
  },

  exec: {
    help: "执行壳命令（经壳 `CommandRegistry`；能执行的 = 命令面板里那些）",
    params: [
      { name: "commandId", type: "string", required: true, note: "命令 id（如 `app.openAiManual`）" },
      { name: "args", type: "array", required: false, note: "透传给命令的实参" },
    ],
    run: async (req) => {
      const commandId = req.commandId;
      if (typeof commandId !== "string" || !commandId) throw coded("EARGS", "exec 要 `commandId`（非空 string）");
      const extra = Array.isArray(req.args) ? req.args : [];
      // ⚠️ 槽位对齐：壳侧 `executeCommand(id, token, ...realArgs)` —— 那个 `undefined` 是**池侧 token 占位**
      //    （M1 会话一的遗留：漏了它真参数会被当 token 剥掉、命令静默空转）。这里同样要占。
      const result = await shellRequest(CH.commands.execute, [commandId, undefined, ...extra]);
      return { commandId, result: result === undefined ? null : result };
    },
  },

  log: {
    help: "读最近操作账（`AI#43` 的雏形：正门三件套之「账本」）",
    params: [],
    run: async () => ({ count: LEDGER.length, entries: LEDGER.slice(-20) }),
  },
};

/** 从 `OPS` **派生**（不手抄）——改表即改清单，改不到两处。 */
function opCatalog() {
  return Object.keys(OPS).map((name) => ({ name, help: OPS[name].help, params: OPS[name].params }));
}

function fingerprint(token) {
  if (typeof token !== "string" || !token) return "(无)";
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 8);
}

function tokenOk(candidate) {
  if (typeof candidate !== "string" || !TOKEN) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function ledgerEntry(op, ok, code, ms, req) {
  // ⚠️ `arg` 记关键实参（本 spike 只有 `exec` 的 commandId）——`AI#43` 的账本必须记「对谁做了什么」，
  //    否则「AI 说做了、其实没做」查不出来。加这个字段正是为了下面那条读数能成立。
  const arg = req && typeof req.commandId === "string" ? req.commandId : null;
  LEDGER.push({ ts: new Date().toISOString(), op: op || "(空)", arg, ok, code: code || null, ms });
  if (LEDGER.length > 50) LEDGER.shift();
}

async function handleRequest(req) {
  if (!req || typeof req !== "object") throw coded("EPROTO", "请求必须是 JSON 对象");
  const op = typeof req.op === "string" ? req.op : "";
  // 账本**先记后判**（含被拒的——「AI 以为没做、其实做了」这类情形要查得出来：AI#43 判据）
  if (!tokenOk(req.token)) {
    ledgerEntry(op, false, "EAUTH", 0, req);
    log(`req 被拒 op=${op} tokenFP=${fingerprint(req.token)}（凭据不匹配）`);
    throw coded("EAUTH", "凭据不对（token 不匹配）");
  }
  const handler = OPS[op];
  if (!handler) {
    ledgerEntry(op, false, "EOP", 0, req);
    log(`req 未知 op=${op}`);
    throw coded("EOP", `未知操作 ${op}（本 spike 只有 ${Object.keys(OPS).join(" / ")}）`);
  }
  const t0 = Date.now();
  try {
    const result = await handler.run(req);
    ledgerEntry(op, true, null, Date.now() - t0, req);
    log(`req 完成 op=${op} ${Date.now() - t0}ms`);
    return result;
  } catch (e) {
    const code = (e && e.code) || "EERROR";
    ledgerEntry(op, false, code, Date.now() - t0, req);
    log(`req 失败 op=${op} code=${code}: ${e && e.message}`);
    throw e && e.code ? e : coded("EERROR", e && e.message ? e.message : String(e));
  }
}

function sendLine(socket, obj) {
  if (socket.destroyed || !socket.writable) return;
  socket.end(JSON.stringify(obj) + "\n");
}

function onConnection(socket) {
  let buf = "";
  socket.setEncoding("utf8");
  socket.on("error", () => {}); // 客户端早退不许炸主进程
  socket.on("data", (chunk) => {
    buf += chunk;
    if (buf.length > MAX_REQUEST_BYTES) {
      sendLine(socket, { ok: false, code: "ETOOBIG", message: `请求超过 ${MAX_REQUEST_BYTES} 字节` });
      socket.destroy();
      return;
    }
    const nl = buf.indexOf("\n");
    if (nl < 0) return; // 还没读到完整一行
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    let req = null;
    try {
      req = JSON.parse(line);
    } catch {
      sendLine(socket, { ok: false, code: "EPROTO", message: "请求不是合法 JSON" });
      return;
    }
    handleRequest(req).then(
      (result) => sendLine(socket, { ok: true, result }),
      (e) => sendLine(socket, { ok: false, code: e.code || "EERROR", message: e.message, servedBy: process.pid }),
    );
  });
}

function start() {
  USER_DATA = app.getPath("userData");
  RECORD_FILE = path.join(USER_DATA, RECORD_NAME);
  TOKEN_FILE = path.join(USER_DATA, TOKEN_NAME);
  PIPE_NAME = "\\\\.\\pipe\\linkdesk-m4spike-" + crypto.createHash("sha1").update(USER_DATA).digest("hex").slice(0, 8);

  RECORD = {
    v: 1,
    mode: MODE,
    pid: process.pid,
    // ⚠️ `app.getName()` 在 dev 轨道 = `linkdesk`（package.json 的 name）；打包后是 `LinkDesk`
    //    （electron-builder 的 `productName`）⇒ **userData 目录大小写不同**——客户端找记录必须
    //    两个候选都试（`bridge-client.mjs` 的 `candidateUserDataDirs()`）。实测发现，见 README。
    appName: app.getName(),
    userData: USER_DATA,
    appVersion: app.getVersion(),
    startedAt: STARTED_AT,
    enabled: false,
    listening: false,
    endpoint: null,
    lastError: null,
  };

  if (MODE === "off") {
    // 门锁语义：**不监听任何东西**（连管道都不建）——但留一条记录，让客户端能说出「为什么连不上」。
    writeRecord();
    log(`mode=off ⇒ 未监听（门锁关着）；记录已留下：${RECORD_FILE}`);
    return;
  }

  CH = loadChannels();
  if (!CH) {
    RECORD.lastError = "构建产物 channels.js 读不到";
    writeRecord();
    log("⚠️ 未启动：" + RECORD.lastError);
    return;
  }
  registerSeam();

  TOKEN = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(TOKEN_FILE, TOKEN, { mode: 0o600 });

  SERVER = net.createServer(onConnection);
  SERVER.on("error", (e) => {
    // 🔴 响亮失败：写进记录（否则客户端无法把「没起来」和「关着」分开）
    RECORD.enabled = false;
    RECORD.listening = false;
    RECORD.lastError = (e && e.code) || String(e);
    writeRecord();
    log(`🔴 监听失败（${RECORD.lastError}）：${e && e.message}——通道没起来`);
  });

  const onListening = () => {
    RECORD.enabled = true;
    RECORD.listening = true;
    RECORD.lastError = null;
    RECORD.endpoint = endpointOf();
    writeRecord();
    log(`listening mode=${MODE} endpoint=${JSON.stringify(RECORD.endpoint)} pid=${process.pid} userData=${USER_DATA}`);
  };
  if (MODE === "pipe") SERVER.listen(PIPE_NAME, onListening);
  else SERVER.listen(Number(process.env.LINKDESK_M4_SPIKE_PORT || 0), process.env.LINKDESK_M4_SPIKE_HOST || "127.0.0.1", onListening);

  app.on("will-quit", () => {
    RECORD.listening = false;
    RECORD.exitedAt = new Date().toISOString();
    writeRecord();
    log("退出：记录已盖章 listening=false（记录**不删**——客户端靠它说清「软件已退出」而不是「没装过」）");
  });
}

setImmediate(() => bootstrap());
