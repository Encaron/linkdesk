/**
 * `linkdeskctl mcp`——LinkDesk 的 **MCP 皮**（M4 `AI#36` stdio server ＋ `AI#37` 冷启动悖论）。
 *
 * ⚠️ **落点订正**（照前任档案是 `electron/services/aiBridge/mcp.ts`——不采纳，理由三条）：
 *   ① 打包态主进程代码进 `app.asar`，**外部客户端 spawn 不到 asar 里的文件**；
 *   ② [07-如何接入.md](../../../../docs/07-AI操作手册/07-如何接入.md) §3.2 已拍板的形态就是
 *      `linkdeskctl` ＋ `args:["mcp"]`（AI 客户端按需拉起 CLI，CLI 顺带当 MCP server）；
 *   ③ 错误分类法/通道发现必须共用 `cli/linkdeskctl/lib/bridge-client.mjs`（⛔ fork）。
 *
 * ## 冷启动悖论的答案（三段，都可配——`AI#37` 判据）
 *   ① **不挂死**：`initialize` / `tools/list` 立刻应答，不等软件（在线派生失败也是立刻退静态表）；
 *   ② **说清状态**：`linkdesk_status` **永远可用**——它读文件面（userData 的通道记录），
 *      不需要软件运行；这就是「离线能力」（与 01-设计 §八「文件面即通道」一致）；
 *   ③ **要等就等得明白**：`LINKDESK_MCP_WAIT_MS`（默认 `0` = 不等）——>0 时真请求轮询等软件，
 *      等满把「等了多久、为什么」写进错误文本。**默认 0 是有意的**：MCP 客户端常在启动时
 *      批量试调工具，默认傻等会整段卡住。
 *   ④ **软件后开不用重启客户端**：每次 `tools/call` 都重读记录（`callBridge` 无状态）。
 *
 * ## 工具清单不手抄（`AI#33`「同一份清单供三处消费」）
 * 在线 `tools/list` 用实例 `describe` **运行期派生**（kernel 白名单 → 工具表），离线退静态表；
 * 两份的差异就是「文档漂移检测」——静态表有 `OP_TOOL_MAP` 一张映射表与内核对账。
 *
 * 🔴 stdout 只许放协议报文（一行一条 JSON）；日志一律 stderr——MCP 客户端把 stdout 当协议管。
 * 零第三方依赖（同 bridge-client.mjs 的发版纪律）。
 */

import { callBridge, readRecord, candidateUserDataDirs, BridgeError, fmtEndpoint } from "./bridge-client.mjs";

/* ── 内核操作 ↔ MCP 工具名（一张表两用：工具命名 ＋ 对账）── */

/** 工具名统一 `linkdesk_` 前缀（MCP 工具在客户端是扁平命名空间，防跨 server 撞名） */
const OP_TOOL_MAP = {
  describe: "linkdesk_describe",
  ping: "linkdesk_ping",
  tabs: "linkdesk_tabs",
  openTab: "linkdesk_open_tab",
  exec: "linkdesk_exec",
  install: "linkdesk_install",
  notifications: "linkdesk_notifications",
  notifyAction: "linkdesk_notify_action",
  log: "linkdesk_log",
};
const TOOL_OP_MAP = Object.fromEntries(Object.entries(OP_TOOL_MAP).map(([op, tool]) => [tool, op]));

/** 离线静态表——与内核 `whitelist.ts` 的 9 条操作一一对应（漂移由在线派生对账兜住） */
const STATIC_TOOLS = [
  { op: "describe", description: "自查：本实例支持的操作（白名单）＋ 可执行的命令面（运行期派生）——零源码环境 AI 的自举点", params: [] },
  { op: "ping", description: "认人：谁在服务（pid / 通道 / 版本 / 已跑多久）", params: [] },
  { op: "tabs", description: "读标签快照（窗口/分组/标签树）", params: [] },
  { op: "openTab", description: "开一个标签页（结果经 linkdesk_tabs 回读确认）", params: [
    { name: "type", type: "string", required: true, description: "标签类型（视图/插件 id）" },
    { name: "opts", type: "object", required: false, description: "透传给视图的选项" },
  ] },
  { op: "exec", description: "执行壳命令（能执行的 = linkdesk_describe 的 commands 清单里那些；严格回传真结果）", params: [
    { name: "commandId", type: "string", required: true, description: "命令 id（如 app.openAiManual）" },
    { name: "args", type: "array", required: false, description: "透传给命令的实参" },
  ] },
  { op: "install", description: "安装插件（zip 包 URL 或本地路径）——确认对话框在软件里弹出，用户点头才装", params: [
    { name: "source", type: "string", required: true, description: "插件包 URL 或本地路径" },
  ] },
  { op: "notifications", description: "读通知面板（按钮的 command 事实随行）", params: [] },
  { op: "notifyAction", description: "执行通知上的按钮（按钮 = 命令，与手点同一条命令路径）", params: [
    { name: "notificationId", type: "string", required: true, description: "通知 id（linkdesk_notifications 的返回里有）" },
    { name: "action", type: "string", required: true, description: "按钮 label 或序号（从 0 起）" },
  ] },
  { op: "log", description: "读最近操作账（先记后判——被拒的调用也在账上）", params: [
    { name: "limit", type: "number", required: false, description: "返回最近几条（默认 20）" },
  ] },
];

const JSONRPC_ERROR = { PARSE: -32700, INVALID_REQUEST: -32600, METHOD_NOT_FOUND: -32601, INVALID_PARAMS: -32602, INTERNAL: -32603 };
const WAITABLE_CODES = new Set(["NO_RECORD", "APP_EXITED", "REFUSED"]); // 等 得活的才等（开关关着/监听失败等不来）

/* ── stdio 收发（一行一条 JSON；⛔ stdout 只许放协议报文）── */

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}
function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}
function replyError(id, code, message, data) {
  send({ jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } });
}
function toolResult(text, { isError = false } = {}) {
  return { content: [{ type: "text", text }], isError };
}

/* ── 文件面探活（离线能力——不依赖软件运行）── */

function statusSnapshot(ctx) {
  if (ctx.forceOffline) return { online: false, code: "FORCED_OFFLINE", detail: "负控：LINKDESK_MCP_FORCE_OFFLINE=1（软件可能其实在跑）" };
  const { record, recordPath } = readRecord({ userDataDirs: ctx.userDataDirs });
  if (!record) return { online: false, code: "NO_RECORD", detail: `没有通道记录（找过 ${ctx.userDataDirs.join(" · ")}）`, recordPath: null };
  if (record.lastError) return { online: false, code: "LAST_FAILED", detail: `软件在跑（pid ${record.pid}），但通道没起来：${record.lastError}`, recordPath };
  if (record.mode === "off" || record.enabled !== true) {
    return {
      online: false,
      code: "SWITCH_OFF",
      detail: `软件在跑（pid ${record.pid}，${record.appName} ${record.appVersion}），但 AI 接入开关关着（门锁语义）`,
      recordPath,
      record,
    };
  }
  return { online: true, code: null, detail: `在服务：pid ${record.pid} ${fmtEndpoint(record.endpoint)}`, recordPath, record };
}

/** 等到软件可用（`WAIT_MS > 0` 才等；🔴 等门包在**调用**上而不是快照上——残留记录（pid 已死）
 *  在记录面上看着「在线」，只有真调用才暴露 `APP_EXITED`；而它恰是「软件正在回来重写记录」的
 *  可等状态。等满如实把「等了多久」附进错误（AI#37 判据③）。 */
async function callWithWait(op, payload, ctx) {
  const t0 = Date.now();
  const attempt = () => callBridge(op, payload, { userDataDirs: ctx.userDataDirs, timeoutMs: ctx.timeoutMs });
  try {
    return await attempt();
  } catch (e) {
    const code = e instanceof BridgeError ? e.code : null;
    if (!WAITABLE_CODES.has(code) || ctx.waitMs <= 0) throw e;
    for (;;) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        return await attempt();
      } catch (e2) {
        if (Date.now() - t0 >= ctx.waitMs) {
          const err = e2 instanceof BridgeError ? e2 : new BridgeError(e2.code || "EERROR", e2.message, e2.hint);
          err.message = `${err.message}（已等 ${Date.now() - t0}ms——LINKDESK_MCP_WAIT_MS=${ctx.waitMs}，软件没回来）`;
          throw err;
        }
      }
    }
  }
}

/* ── 工具清单：在线从实例 describe 运行期派生，离线退静态表 ── */

function opParamsToSchema(params) {
  return {
    type: "object",
    properties: Object.fromEntries(
      (params || []).map((p) => [p.name, { type: p.type, description: p.description ?? "" }]),
    ),
    ...(params && params.some((p) => p.required) ? { required: params.filter((p) => p.required).map((p) => p.name) } : {}),
  };
}

function toolDefFromOp(op) {
  return { name: OP_TOOL_MAP[op.op] ?? op.op, description: op.description, params: op.params ?? [] };
}

async function toolListPayload(ctx) {
  const st = statusSnapshot(ctx);
  let tools = STATIC_TOOLS.map(toolDefFromOp);
  let source = "静态表（离线）";
  if (st.online) {
    try {
      const { result } = await callBridge("describe", {}, { userDataDirs: ctx.userDataDirs, timeoutMs: ctx.timeoutMs, identityCheck: false });
      if (result && Array.isArray(result.ops) && result.ops.length) {
        tools = result.ops.map((o) => toolDefFromOp({ op: o.name, description: o.help, params: o.params }));
        source = `实例自省（白名单 v${result.whitelistVersion}，命令面 ${result.commandCount} 条）`;
      }
    } catch (e) {
      source = `静态表（自省失败：${e instanceof BridgeError ? e.code : "EERROR"}）`;
    }
  }
  const offlineSuffix = st.online ? "" : `　⚠️ 离线（${st.code}）：调用会立刻返回可读原因，不会挂死`;
  const statusTool = {
    name: "linkdesk_status",
    description: `查软件在不在、通道通不通（离线可用——读文件面，不需要软件运行；唯一不需要软件的工具）${offlineSuffix}`,
    inputSchema: { type: "object", properties: {} },
  };
  return {
    tools: [
      statusTool,
      ...tools.map((t) => ({
        name: t.name,
        description: st.online ? t.description : `${t.description}${offlineSuffix}`,
        inputSchema: opParamsToSchema(t.params),
      })),
    ],
    _meta: { catalogSource: source, online: st.online, waitMs: ctx.waitMs },
  };
}

/* ── 工具调用 ── */

async function callTool(name, args, ctx) {
  if (name === "linkdesk_status") {
    const st = statusSnapshot(ctx);
    const lines = [
      st.online ? "状态: 在线" : "状态: 离线",
      `原因: ${st.code ?? "-"}`,
      `详情: ${st.detail}`,
      st.recordPath ? `记录: ${st.recordPath}` : "",
      "",
      st.online
        ? "下一步: 可直接调其它工具。"
        : "下一步: ① 起软件；② 隔离实例把 LINKDESK_USER_DATA 指过去；③ 开关关着 = 设置页「AI 接入」开（正式开关归 AI#38.3，今日 = settings.json 的 ai.cli.enabled，改完重启软件）。",
    ].filter(Boolean);
    return toolResult(lines.join("\n"));
  }

  const op = TOOL_OP_MAP[name];
  if (!op) {
    return toolResult(
      `未知工具 ${name}——tools/list 可列出全部（⛔ 网关只给白名单里的操作，不给任意 JS）`,
      { isError: true },
    );
  }

  // 冷启动快路径（WAIT_MS=0 或等不来的状态）：立刻给可读原因，⛔ 不挂死
  const st = statusSnapshot(ctx);
  if (!st.online && !(ctx.waitMs > 0 && WAITABLE_CODES.has(st.code))) {
    return toolResult(
      `无法调用 ${name}：软件不在服务状态 [${st.code}] ${st.detail}\n` +
        `下一步: 先调 linkdesk_status 看完整原因；不需要软件运行的工具只有 linkdesk_status 一个。`,
      { isError: true },
    );
  }

  try {
    const payload = args && typeof args === "object" ? args : {};
    const { result, waitedMs } = await callWithWait(op, payload, ctx);
    const waited = waitedMs ? `\n（软件已就绪——等了 ${waitedMs}ms）` : "";
    return toolResult((typeof result === "string" ? result : JSON.stringify(result, null, 2)) + waited);
  } catch (e) {
    const code = e instanceof BridgeError ? e.code : e.code || "EERROR";
    return toolResult(`无法调用 ${name}：[${code}] ${e.message}` + (e.hint ? `\n下一步: ${e.hint}` : ""), { isError: true });
  }
}

/* ── JSON-RPC 分发 ── */

async function handle(msg, ctx) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;
  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: (params && params.protocolVersion) || "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "linkdesk", version: (statusSnapshot(ctx).record || {}).appVersion ?? "offline" },
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return; // 通知：不应答
    case "ping":
      return reply(id, {});
    case "tools/list": {
      const payload = await toolListPayload(ctx);
      return reply(id, payload);
    }
    case "tools/call": {
      const name = params && params.name;
      if (!name) return replyError(id, JSONRPC_ERROR.INVALID_PARAMS, "tools/call 缺 name");
      const content = await callTool(name, params && params.arguments, ctx);
      return reply(id, content);
    }
    case "resources/list":
      return reply(id, { resources: [] });
    default:
      if (isNotification) return;
      return replyError(id, JSONRPC_ERROR.METHOD_NOT_FOUND, `未知方法 ${method}`);
  }
}

/** `linkdeskctl mcp` 入口——stdin 读完即正常退出（每个 stdio MCP server 的必然结局） */
export function runMcpServer(overrides = {}) {
  const ctx = {
    userDataDirs: overrides.userDataDir ? [overrides.userDataDir] : candidateUserDataDirs(),
    waitMs: Number(process.env.LINKDESK_MCP_WAIT_MS || 0),
    timeoutMs: Number(process.env.LINKDESK_MCP_TIMEOUT_MS || 5000),
    forceOffline: process.env.LINKDESK_MCP_FORCE_OFFLINE === "1",
  };

  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buf += chunk;
    for (;;) {
      const nl = buf.indexOf("\n");
      if (nl < 0) break;
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg = null;
      try {
        msg = JSON.parse(line);
      } catch {
        replyError(null, JSONRPC_ERROR.PARSE, "报文不是合法 JSON");
        continue;
      }
      Promise.resolve(handle(msg, ctx)).catch((e) => {
        if (msg && msg.id !== undefined) replyError(msg.id, JSONRPC_ERROR.INTERNAL, String((e && e.message) || e));
      });
    }
  });
  process.stdin.on("end", () => process.exit(0));
}
