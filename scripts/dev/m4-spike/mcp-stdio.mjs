#!/usr/bin/env node
/**
 * M4 spike（`AI#31`）MCP 皮原型 —— **stdio server ＋ `tools/list` ＋ `tools/call`**（`AI#36` / `AI#37` 的最小切片）。
 *
 * 正式件是 `AI#36` 的 `electron/services/aiBridge/mcp.ts`；这里只回答一件事：
 * **MCP 客户端拉起本 server 时软件没开，会怎样**（`AI#37` 的冷启动悖论）。
 *
 * 零依赖手搓 JSON-RPC（stdio = 一行 JSON 一条报文）——正因为协议是**换行分隔的 JSON**，
 * 所以「stdio 优先」在 Windows 上最省事（⛔ 不走 `net`、⛔ 无端口、⛔ 无防火墙弹窗）。
 *
 * ## 🔴 本 spike 对冷启动悖论的答案（三段，都可配）
 *   ① **不挂死**：`initialize` / `tools/list` **立刻应答**，不等软件。
 *   ② **说清状态**：启动时探一次，`linkdesk_status` 永远可用（**这就是「离线能力」**——
 *      它读的是**文件面**：userData 下的通道记录。文件面不依赖软件运行，与 `AI#37` 的判断一致）。
 *   ③ **要等就等得明白**：`LINKDESK_MCP_WAIT_MS`（默认 `0` = 不等）——>0 时真请求会**轮询等软件出现**，
 *      等满就把「等了多久、为什么」写进错误文本。**默认 0 是有意的**：MCP 客户端常在启动时
 *      批量试调工具，默认傻等会让它整段卡住（宁可立刻给可读原因）。
 *
 * ## 工具清单不手抄
 * 在线时 `tools/list` 用实例的 `describe` 操作**运行期派生**；离线时退回静态表（内容与
 * `linkdeskctl.mjs` 的 `--help` 同源）。⇒ `AI#33` 的「同一份能力清单供三处消费」在这里被演示了一遍。
 *
 * 手测（stdio 会话）:
 *   echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node scripts/dev/m4-spike/mcp-stdio.mjs
 */

import { callBridge, readRecord, candidateUserDataDirs, BridgeError, fmtEndpoint } from "./bridge-client.mjs";

const JSONRPC_ERROR = { PARSE: -32700, INVALID_REQUEST: -32600, METHOD_NOT_FOUND: -32601, INVALID_PARAMS: -32602, INTERNAL: -32603 };

const env = process.env;
const USER_DATA_URL = env.LINKDESK_USER_DATA ? [env.LINKDESK_USER_DATA] : candidateUserDataDirs();
const WAIT_MS = Number(env.LINKDESK_MCP_WAIT_MS || 0);
const FORCE_OFFLINE = env.LINKDESK_MCP_FORCE_OFFLINE === "1"; // 负控开关：假装软件没开（不需要真杀软件）
const TIMEOUT_MS = Number(env.LINKDESK_MCP_TIMEOUT_MS || 5000);

/** 离线静态表（与 `linkdeskctl.mjs` 的操作表同源；在线时会被实例的 describe 覆盖） */
const STATIC_TOOLS = [
  { name: "describe", description: "列出实例支持的操作与参数（自举点）", params: [] },
  { name: "ping", description: "认人：谁在服务（pid / 通道 / 版本 / 已跑多久）", params: [] },
  { name: "tabs", description: "读标签快照（经壳读取面）", params: [] },
  { name: "exec", description: "执行壳命令（能执行的 = 命令面板里那些）", params: [{ name: "commandId", type: "string", required: true }] },
  { name: "log", description: "读最近操作账", params: [] },
];

// ── stdio 收发（一行一条 JSON；⛔ stdout 只许放协议报文，日志一律走 stderr/文件）──
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

/** 文件面探活：**不依赖软件运行**（读记录 = 离线能力） */
function statusSnapshot() {
  if (FORCE_OFFLINE) return { online: false, code: "FORCED_OFFLINE", detail: "负控：LINKDESK_MCP_FORCE_OFFLINE=1（软件可能其实在跑）" };
  const { record, recordPath } = readRecord({ userDataDirs: USER_DATA_URL });
  if (!record) return { online: false, code: "NO_RECORD", detail: `没有通道记录（找过 ${USER_DATA_URL.join(" · ")}）`, recordPath: null };
  if (record.lastError) return { online: false, code: "LAST_FAILED", detail: `监听失败：${record.lastError}`, recordPath };
  if (record.mode === "off" || record.enabled !== true)
    return { online: false, code: "SWITCH_OFF", detail: `软件在跑（pid ${record.pid}），但 AI 接入开关关着`, recordPath, record };
  return { online: true, code: null, detail: `在服务：pid ${record.pid} ${fmtEndpoint(record.endpoint)}`, recordPath, record };
}

/** 等到软件出现（`WAIT_MS > 0` 时才等；等满如实说出等了多久） */
async function waitForOnline(deadlineMs) {
  if (deadlineMs <= 0) return statusSnapshot();
  const t0 = Date.now();
  for (;;) {
    const s = statusSnapshot();
    if (s.online) return { ...s, waitedMs: Date.now() - t0 };
    if (Date.now() - t0 >= deadlineMs) return { ...s, waitedMs: Date.now() - t0, waitedOut: true };
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function toolListPayload() {
  const st = statusSnapshot();
  let tools = STATIC_TOOLS;
  let source = "静态表（离线）";
  if (st.online) {
    try {
      const { result } = await callBridge("describe", {}, { userDataDirs: USER_DATA_URL, timeoutMs: TIMEOUT_MS, identityCheck: false });
      if (result && Array.isArray(result.ops) && result.ops.length) {
        tools = result.ops.map((o) => ({ name: o.name, description: o.help, params: o.params }));
        source = `实例自省（白名单 v${result.whitelistVersion}）`;
      }
    } catch (e) {
      source = `静态表（自省失败：${e.code}）`;
    }
  }
  const offlineSuffix = st.online ? "" : `　⚠️ 离线（${st.code}）：调用会立刻返回可读原因，不会挂死`;
  const statusTool = {
    name: "linkdesk_status",
    description: `查软件在不在、通道通不通（**离线可用** —— 读文件面，不需要软件运行）${offlineSuffix}`,
    inputSchema: { type: "object", properties: {} },
  };
  return {
    tools: [
      statusTool,
      ...tools.map((t) => ({
        name: t.name,
        description: st.online ? t.description : `${t.description}${offlineSuffix}`,
        inputSchema: {
          type: "object",
          properties: Object.fromEntries(
            (t.params || []).map((p) => [p.name, { type: p.type === "array" ? "array" : "string", description: p.note || "" }]),
          ),
          required: (t.params || []).filter((p) => p.required).map((p) => p.name),
        },
      })),
    ],
    _meta: { catalogSource: source, online: st.online, waitMs: WAIT_MS },
  };
}

async function callTool(name, args) {
  if (name === "linkdesk_status") {
    const st = statusSnapshot();
    const lines = [
      st.online ? "状态: 在线" : "状态: 离线",
      `原因: ${st.code ?? "-"}`,
      `详情: ${st.detail}`,
      st.recordPath ? `记录: ${st.recordPath}` : "",
      "",
      st.online
        ? "下一步: 可直接调其它工具。"
        : "下一步: ① 起软件（`npm run dev` 或装好的 LinkDesk）；② 若是隔离实例，把 LINKDESK_USER_DATA 指过去；③ 若开关关着，去设置页开（AI#38.3）。",
    ].filter(Boolean);
    return toolResult(lines.join("\n"));
  }

  const st = await waitForOnline(WAIT_MS);
  if (!st.online) {
    const waited = st.waitedMs ? `（等了 ${st.waitedMs}ms）` : "";
    return toolResult(
      `无法调用 ${name}${waited}：软件不在服务状态 [${st.code}] ${st.detail}\n` +
        `下一步: 先调 linkdesk_status 看完整原因；不需要软件运行的工具只有它一个。`,
      { isError: true },
    );
  }

  try {
    const payload = name === "exec" ? { commandId: args?.commandId, args: args?.args ?? [] } : {};
    const { result } = await callBridge(name, payload, { userDataDirs: USER_DATA_URL, timeoutMs: TIMEOUT_MS });
    return toolResult(typeof result === "string" ? result : JSON.stringify(result, null, 2));
  } catch (e) {
    const code = e instanceof BridgeError ? e.code : e.code || "EERROR";
    return toolResult(`${name} 失败 [${code}]：${e.message}` + (e.hint ? `\n下一步: ${e.hint}` : ""), { isError: true });
  }
}

async function handle(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;
  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: (params && params.protocolVersion) || "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "linkdesk-mcp-spike", version: "0.0.1-m4spike" },
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return; // 通知：不应答
    case "ping":
      return reply(id, {});
    case "tools/list": {
      const payload = await toolListPayload();
      return reply(id, payload);
    }
    case "tools/call": {
      const name = params && params.name;
      if (!name) return replyError(id, JSONRPC_ERROR.INVALID_PARAMS, "tools/call 缺 name");
      const content = await callTool(name, params && params.arguments);
      return reply(id, content);
    }
    case "resources/list":
      return reply(id, { resources: [] });
    default:
      if (isNotification) return;
      return replyError(id, JSONRPC_ERROR.METHOD_NOT_FOUND, `未知方法 ${method}`);
  }
}

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
    Promise.resolve(handle(msg)).catch((e) => {
      if (msg && msg.id !== undefined) replyError(msg.id, JSONRPC_ERROR.INTERNAL, String((e && e.message) || e));
    });
  }
});
process.stdin.on("end", () => process.exit(0)); // 客户端关管道 ⇒ 正常退出（每个 stdio MCP server 的必然结局）
