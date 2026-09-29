/**
 * linkdeskctl 客户端库——**通道发现 ＋ 一条请求 ＋ 错误分类法**。
 *
 * 这是错误分类法的**唯一一份实现**（spike `AI#31` 用真实读数换来的纪律：三处消费者共用，
 * ⛔ 不许 fork，否则「同一故障三种说法」）：
 *   · `cli/linkdeskctl/linkdeskctl.mjs`（CLI 皮，AI#34）
 *   · MCP 皮（AI#36，后续棒）——接到这份上，别抄
 *   · 全链验收器（AI#44，后续棒）
 *
 * ## 通道发现
 * 客户端不「猜端口」——它读**主进程留下的记录**（`electron/services/aiBridge/index.ts` 写在
 * userData 下）。顺序：`LINKDESK_USER_DATA`（显式）⇒ `%APPDATA%\linkdesk` ⇒ `%APPDATA%\LinkDesk`。
 * 🔴 后两个都要试：dev 轨道 `app.getName()` = `linkdesk`，打包后 = `LinkDesk`（electron-builder 的
 * `productName`）⇒ **同一个软件、两种 userData 目录**（大小写在 Windows 上是不同目录）。
 *
 * ## 错误分类法（连接面——「连不上」不是一种故障，是六种）
 *
 * | code | 意思是 | 下一步 |
 * |---|---|---|
 * | `NO_RECORD` | 这只 userData 下没有记录（软件没跑过 / 指错目录） | 起软件 或 指对 `--user-data-dir` |
 * | `SWITCH_OFF` | **软件在跑，但开关是关的**（门锁语义） | 设置页开「AI 接入」（`AI#38.3`；今日 = settings.json 的 `ai.cli.enabled`） |
 * | `LAST_FAILED` | 软件在跑、也想开，但**监听失败**（如 `EADDRINUSE`） | 改端口重启（`lastError` 有细节） |
 * | `APP_EXITED` | 记录说在监听，但那个 pid 已经不在了（残留记录） | 重启软件 |
 * | `REFUSED` | 记录说在监听、pid 也活着，但连接被拒 | 软件可能正在启动/退出，稍等重试 |
 * | `TIMEOUT` | 连上了，没应答 | 先探相位（见下「超时三分类」），⛔ 别当失败重试 |
 * | `EAUTH` | 应答了，但**凭据不对** | 用 `ai-bridge.token` 里那份（重新生成 = 删掉它重启，AI#38.9） |
 * | `STALE_IDENTITY` | 应答的**不是记录里那个进程** | 🔴 M5 教训：存在 ≠ 是它 |
 *
 * ## 超时三分类（`EPENDING` / `EASKPENDING` / `TIMEOUT`）——「没拿到答复」不是一种故障，是三种
 *
 * 客户端**预算用完的那一刻**，用第二次廉价请求（`ping`，2 秒）回读服务端的**相位**
 * （`identity().inFlight`：`op` / `shell` / `ask-user`），据此分说：
 *
 * | code | 意思是 | 下一步 |
 * |---|---|---|
 * | `EPENDING` | **还在跑**——服务端仍持有这条请求 | ⛔ 别重试；等它跑完再用读数面核实 |
 * | `EASKPENDING` | **正等人点头**——软件里弹着确认框 | 去软件里点它（Enter 同意 / Esc 取消）；⛔ 别重试 |
 * | `TIMEOUT` | **真没应答**——服务端当下没在办任何请求 | 查软件是否卡住；重试前想清楚会不会重复发生效果 |
 * | `ESHELLTIMEOUT` | 服务端答了：**壳那半**没在预算内答复（命令可能仍在执行） | 文案由内核如实写；⛔ 别据此判断「没做」 |
 *
 * ⛔ 探活本身没回 / 对方是老版内核（没有 `inFlight` 字段）⇒ **不硬判**：原样报原错（探不透 ≠ 新故障）。
 * 出处 = 生长格 `AI#60`（真机 `0.2.23 → 0.2.24` 整跳：`exec update.openUpdateFlow` 明明跑成了，
 * AI 那侧只拿到「壳无应答」＋退出码 1 ⇒ 会重试、或向用户报「失败」）。
 *
 * 操作级 code（内核白名单，`electron/services/aiBridge/whitelist.ts`）原样透传：
 * `EOP`（表外操作）/ `EUNKNOWN`（命令不在运行期派生命令面）/ `EARGS` / `ENOTFOUND` /
 * `ENOACTION` / `ESHELLTIMEOUT` / `ESHELLERROR` / `EPROTO` / `ETOOBIG` / `EERROR` /
 * **`EUSERDENIED`（敏感动作没等到用户点头——AI#29：动作**没执行**，不是失败后重试的那类）**。
 *
 * 零第三方依赖，只 `node:*`（发安装包的 CLI 不许拖 node_modules——AI#40 随包的硬前提）。
 */

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const RECORD_NAME = "ai-bridge.json";
const TOKEN_NAME = "ai-bridge.token";

/** 带机读 code ＋ 人读 hint 的错误（CLI 把 hint 打给用户，`--json` 里 code 给 AI） */
export class BridgeError extends Error {
  constructor(code, message, hint) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
    this.hint = hint;
  }
}

const CANDIDATE_APP_NAMES = ["linkdesk", "LinkDesk"];

/** 找记录的候选目录（显式 env 优先；⛔ 不猜端口，只找记录） */
export function candidateUserDataDirs(env = process.env) {
  if (env.LINKDESK_USER_DATA) return [env.LINKDESK_USER_DATA];
  const appData = env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return CANDIDATE_APP_NAMES.map((n) => path.join(appData, n));
}

/** 读记录 ＋ 凭据：只负责「找到并读出来」，故障分类交给 `classify`（两件事分开才好测） */
export function readRecord({ userDataDirs } = {}) {
  const dirs = userDataDirs && userDataDirs.length ? userDataDirs : candidateUserDataDirs();
  let recordPath = null;
  let record = null;
  for (const dir of dirs) {
    const p = path.join(dir, RECORD_NAME);
    if (fs.existsSync(p)) {
      recordPath = p;
      try {
        record = JSON.parse(fs.readFileSync(p, "utf8"));
      } catch (e) {
        throw new BridgeError("BAD_RECORD", `通道记录读不动（${p}）：${e.message}`, "记录写坏了——重启软件会重写它。");
      }
      break;
    }
  }
  if (!record) {
    return { record: null, recordPath: null, token: null, searched: dirs };
  }
  let token = null;
  const tokenPath = path.join(path.dirname(recordPath), TOKEN_NAME);
  if (fs.existsSync(tokenPath)) token = fs.readFileSync(tokenPath, "utf8").trim();
  return { record, recordPath, token, tokenPath, searched: dirs };
}

/**
 * 操作级 code 的人读下一步——内核说得出 code，说不出「用户此刻该干什么」。
 * ⛔ 只补这一句，不另立一套错误分类（分类法住内核，见文件头）。
 * ⛔ 文案里不写仓内工作序号（外部 AI 读不懂「AI#NN」，那是我们自己的队列号）。
 */
const OP_HINTS = {
  EUSERDENIED:
    "去软件里点那个确认框（键盘 Enter = 同意 / Esc = 取消）——**不点就不执行**；授权不缓存，下次还会问。",
  EASKPENDING:
    "**去软件里点那个确认框**（Enter = 同意 / Esc = 取消）——你这次调用已经放弃等待，但框还在；点完再用读数面核实。⛔ 别重试：重试只会再弹一个框。",
  EPENDING:
    "⛔ 别重试。等它跑完，再用读数面（`log` 账本 / `describe` / `tabs`）回读效果——重试 = 同一个动作做两遍。",
  ESHELLTIMEOUT:
    "这是**壳那半没在预算内答复**，⛔ 不是执行失败、⛔ 别据此判断「没做」。长命令（下载、装更新）合法超过这个预算：去界面或用读数面（`log` / `tabs` / `notifications`）核实它到底有没有跑起来。",
  TIMEOUT:
    "服务端此刻**没在办任何请求**（探活也没看到在办的事）⇒ 真没应答。先看软件是否卡住；重试前想清楚这条命令会不会重复发生效果。",
};

/** 探活预算——超时之后那一次「到底还在不在办」的回读，⛔ 别让它变成第二轮长等待 */
export const PROBE_TIMEOUT_MS = 2000;

/**
 * 超时读数**三分类**（纯函数——单测直接打它；探活那半在 `callBridge` 里）。
 *
 * `inFlight` = 服务端当下在办的请求（`ping` 的 `identity().inFlight`）。
 * 🔴 `null` / 字段缺席 ⇒ **不硬判**：返回 `null`，调用方原样报原错——
 * 「探不透」不是一种新故障，也⛔ 不该被说成「真没应答」。
 */
export function classifyTimeout({ inFlight, timeoutMs, op }) {
  if (!Array.isArray(inFlight)) return null;
  const asking = inFlight.find((e) => e && e.phase === "ask-user");
  if (asking) {
    const what = asking.what ? `（在问：「${asking.what}」）` : "";
    return new BridgeError(
      "EASKPENDING",
      `${op} 正在**等你点头**${what}——软件里弹着确认框，已等 ${asking.ms} 毫秒`,
      OP_HINTS.EASKPENDING,
    );
  }
  if (inFlight.length) {
    const first = inFlight[0] || {};
    const more = inFlight.length > 1 ? `（另有 ${inFlight.length - 1} 条）` : "";
    return new BridgeError(
      "EPENDING",
      `${first.op || op} **还在跑**${more}——服务端仍持有它，已 ${first.ms} 毫秒没回`,
      OP_HINTS.EPENDING,
    );
  }
  return new BridgeError(
    "TIMEOUT",
    `客户端等待预算用完（${timeoutMs}ms 无应答），服务端此刻**没有在办任何请求**——真没应答`,
    OP_HINTS.TIMEOUT,
  );
}

/** pid 还活着吗（`kill(pid,0)` 不发信号，纯探活；`EPERM` = 活着但不是我们的进程） */
function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

/**
 * 把「有记录 ＋ 连不上」翻译成具体故障。
 * 顺序有意：**先判「软件在不在」再判「为什么连不上」**——否则残留记录会被误报成「开关关着」。
 */
export function classify({ record, error, attempted }) {
  if (!record) {
    return new BridgeError(
      "NO_RECORD",
      `没有通道记录（找过：${attempted.searched.join(" · ")}）`,
      "① 软件没跑过？先起它。② 用了隔离实例（`--user-data-dir`）？把 `LINKDESK_USER_DATA` 指到那只目录。",
    );
  }
  const alive = pidAlive(record.pid);
  if (record.lastError) {
    return new BridgeError(
      "LAST_FAILED",
      `软件在跑（pid ${record.pid}），但**通道没起来**：${record.lastError}`,
      "监听失败不会自动重试。若是端口被占（EADDRINUSE）→ 改 `LINKDESK_AIBRIDGE_PORT` 重启软件。",
    );
  }
  if (record.mode === "off" || record.enabled !== true) {
    return new BridgeError(
      "SWITCH_OFF",
      alive
        ? `软件在跑（pid ${record.pid}，${record.appName} ${record.appVersion}），但 **AI 接入开关是关的**（门锁语义）`
        : `开关是关的，而且那只进程（pid ${record.pid}）已经不在了`,
      "关着时**连不进来**是设计意图。开它：设置页「AI 接入」——通道开关任一即可（`ai.mcp.enabled` / `ai.cli.enabled`），改完重启软件生效。",
    );
  }
  if (!alive) {
    return new BridgeError(
      "APP_EXITED",
      `记录说在 ${fmtEndpoint(record.endpoint)} 监听，但那个 pid（${record.pid}）已经不在了——这是**残留记录**`,
      "重启软件即可（启动会重写记录）。残留记录说明上次 `will-quit` 盖章没跑成（崩溃/强杀）。",
    );
  }
  const code = error && (error.code || error.name);
  if (code === "ECONNREFUSED" || code === "ENOENT") {
    return new BridgeError(
      "REFUSED",
      `连 ${fmtEndpoint(record.endpoint)} 被拒（pid ${record.pid} 还活着）`,
      "软件可能正在启动或正在退出。稍等重试；持续如此就是「记录了却没在听」——查那只进程的 stdout。",
    );
  }
  if (code === "ETIMEDOUT" || code === "TIMEOUT") {
    // ⚠️ 这里**不下结论**（缺证据）：分类法这一层只知道「没在预算内拿到答复」，
    //    到底是「还在跑 / 正等人点头 / 真没应答」由 `classifyTimeout` 拿相位分说（AI#60）。
    return new BridgeError(
      "TIMEOUT",
      `连上了但无应答（${attempted.timeoutMs}ms 超时）`,
      "请求超时——**不一定是失败**（命令可能还在跑、或正在等你点头）。⛔ 重试前想清楚会不会重复发生效果。",
    );
  }
  return new BridgeError("CONNECT_FAILED", `连 ${fmtEndpoint(record.endpoint)} 失败：${error && error.message}`, null);
}

export function fmtEndpoint(ep) {
  if (!ep) return "(无地址)";
  if (ep.transport === "pipe") return ep.pipe;
  return `${ep.host}:${ep.port}`;
}

/** 一条请求（一次连接 = 一条请求 + 一条应答；用完即断——本地开销可忽略，换来零状态机） */
function sendOnce(endpoint, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const target = endpoint.transport === "pipe" ? endpoint.pipe : { host: endpoint.host, port: endpoint.port };
    const socket = net.createConnection(target);
    let buf = "";
    let done = false;
    const finish = (fn, arg) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      fn(arg);
    };
    const timer = setTimeout(() => finish(reject, Object.assign(new Error(`无应答（${timeoutMs}ms）`), { code: "TIMEOUT" })), timeoutMs);
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(JSON.stringify(payload) + "\n"));
    socket.on("data", (chunk) => {
      buf += chunk;
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      let msg = null;
      try {
        msg = JSON.parse(buf.slice(0, nl));
      } catch {
        return finish(reject, new BridgeError("EPROTO", "应答不是合法 JSON", "版本不匹配？"));
      }
      finish(resolve, msg);
    });
    socket.on("error", (e) => finish(reject, e));
    socket.on("close", () => finish(reject, Object.assign(new Error("连接被关闭且无应答"), { code: "ECONNREFUSED" })));
  });
}

/**
 * 一次完整调用：**读记录 → 连 → 认人（pid 对齐）→ 发真请求**。
 *
 * 🔴 「认人」这一步是 M5 教训的直接落地（memory `exclusive-resource-handover-and-probe-strength`）：
 *    **存在 ≠ 是它**。每次调用都先 `ping` 一次、把应答的 pid 与记录里的 pid 逐字对齐；
 *    不等 ⇒ `STALE_IDENTITY`（有人应答，但不是记录里那个进程——双实例 / 记录没被重写）。
 *    代价 = 每次多一条本地请求（可忽略），换来「连上的到底是谁」永远有答案。
 */
export async function callBridge(op, payload = {}, opts = {}) {
  const {
    userDataDirs,
    timeoutMs = 5000,
    transport = null,
    record: recordOverride = null,
    token: tokenOverride = undefined,
    identityCheck = true,
  } = opts;

  const found = recordOverride ? { record: recordOverride, token: null, searched: [] } : readRecord({ userDataDirs });
  const record = found.record;
  const token = tokenOverride !== undefined ? tokenOverride : found.token;
  const searched = found.searched;

  // 没得连的情形在这里一次说清（⛔ 不发无用连接——否则「开关关着」会被报成「连接被拒」）
  if (!record) throw classify({ record: null, error: null, attempted: { searched, timeoutMs } });
  if (record.lastError || record.mode === "off" || record.enabled !== true || !pidAlive(record.pid)) {
    throw classify({ record, error: null, attempted: { searched, timeoutMs } });
  }

  const endpoint = transport ? { ...record.endpoint, transport } : record.endpoint;
  if (!endpoint) throw new BridgeError("NO_ENDPOINT", "记录里没有通道地址", "软件可能正在启动。");

  const run = (opName, body) =>
    sendOnce(endpoint, { token, op: opName, ...body }, timeoutMs).then(
      (msg) => {
        if (msg && msg.ok) return msg.result;
        const code = msg && msg.code ? msg.code : "EERROR";
        throw new BridgeError(code, (msg && msg.message) || "未知错误", OP_HINTS[code] ?? null);
      },
      (e) => {
        if (e instanceof BridgeError) throw e;
        throw classify({ record, error: e, attempted: { searched, timeoutMs } });
      },
    );

  let servedBy = null;
  if (identityCheck && op !== "ping") {
    const pong = await run("ping", {});
    servedBy = pong && pong.pid;
    if (servedBy !== record.pid) {
      throw new BridgeError(
        "STALE_IDENTITY",
        `有人应答，但**不是记录里那个进程**：应答 pid=${servedBy}，记录 pid=${record.pid}`,
        "记录没被重写（上个实例崩了？）或多实例并发。🔴 别信「端口通」——要问「谁在服务」。",
      );
    }
  }

  /**
   * 超时那一刻回读**相位**（AI#60）——第二次廉价请求（`ping` ＋ 2 秒），与「每次调用先 ping 认人」
   * 同一套路，零新机制。⛔ 探不到（连探活都没答 / 老版内核没有 `inFlight`）⇒ 返回 `null` =
   * 「不知道」，由 `classifyTimeout` 决定照原样报原错，⛔ 不编一个结论出来。
   */
  async function probeInFlight() {
    try {
      const msg = await sendOnce(endpoint, { token, op: "ping" }, PROBE_TIMEOUT_MS);
      if (!msg || !msg.ok || !msg.result) return null;
      return Array.isArray(msg.result.inFlight) ? msg.result.inFlight : null;
    } catch {
      return null;
    }
  }

  let result;
  try {
    result = await run(op, payload);
  } catch (e) {
    // 🔴 只有「客户端这条腿没拿到答复」才需要三分类：服务端的 code（含 `ESHELLTIMEOUT`）已经
    //    如实作答（哪个预算、可能仍在执行），⛔ 别在客户端二次演绎它。
    const isLocalTimeout = e instanceof BridgeError && e.code === "TIMEOUT";
    if (!isLocalTimeout) throw e;
    throw classifyTimeout({ inFlight: await probeInFlight(), timeoutMs, op }) ?? e;
  }
  return { result, record, endpoint, token, servedBy, searched, recordPath: found.recordPath };
}
