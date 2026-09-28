#!/usr/bin/env node
/**
 * `linkdeskctl`——LinkDesk 的命令行皮（M4 `AI#34` 子命令 ＋ `AI#35` `--help` 自省 ＋ `--json` 机读）。
 *
 * 人和 AI 共用的正门：一条命令控制运行中的 LinkDesk。内核在主进程
 * （`electron/services/aiBridge/`），本 CLI 只是皮——通道发现/错误分类法住在
 * `lib/bridge-client.mjs`（与 MCP 皮共用一份，⛔ 不 fork）。
 *
 * ## `--help` 的降级设计（= AI#35 判据「--help 能自查操作清单」的答案）
 *   · 软件在跑 ⇒ 附上**从这个实例自省来的**白名单（`describe` 操作——运行期派生，
 *     与内核真实现不可能漂移）＋ 静态表与实例的**双向对账**（差集非空 = 该更新静态骨架了）；
 *   · 软件没跑 ⇒ `--help` 照常可用：静态骨架 ＋ 一行「离线」与探测失败的原因 ＋ 离线条。
 *   ⇒ 零源码环境 AI 知道名字就能自举（AI#46 §八 第 3 场景的第 2 跳）。
 *
 * ## `status` 的降级设计（状态查询离线可用）
 *   读**记录文件面**分诊（NO_RECORD / SWITCH_OFF / LAST_FAILED / APP_EXITED），
 *   不需要软件活着；软件活着再附 ping 的实时详情。`--json` 的 `state.code` 给 AI。
 *
 * 用法（`--json` 全子命令通用，末尾字段 `code`/`hint` 是给 AI 的）：
 *   linkdeskctl status                       # 状态分诊（离线可用）
 *   linkdeskctl ping                         # 谁在服务
 *   linkdeskctl describe                     # 白名单 + 命令面（自省）
 *   linkdeskctl tabs                         # 读标签快照
 *   linkdeskctl open-tab app                 # 开标签页
 *   linkdeskctl exec app.openAiManual        # 执行壳命令
 *   linkdeskctl install <url|path>           # 装插件（确认框在软件里弹）
 *   linkdeskctl notifications                # 读通知
 *   linkdeskctl notify-action <id> <label>   # 执行通知按钮
 *   linkdeskctl log                          # 读最近操作账
 */

import {
  callBridge, BridgeError, readRecord, candidateUserDataDirs, classify, fmtEndpoint,
} from "./lib/bridge-client.mjs";

/* ── 静态骨架（离线时的 --help 正文）——与内核白名单的双向对账守漂移（AI#33/AI#35） ── */

/** 子命令 → 内核操作名（status 是客户端本地分诊，不在内核表里） */
const SUBCOMMAND_OPS = {
  describe: "describe", ping: "ping", tabs: "tabs", "open-tab": "openTab", exec: "exec",
  install: "install", notifications: "notifications", "notify-action": "notifyAction", log: "log",
};

const STATIC_USAGE = `linkdeskctl——一条命令控制运行中的 LinkDesk（AI 接入正门的 CLI 皮）

用法:
  linkdeskctl <子命令> [参数] [选项]
  linkdeskctl --help

子命令（离线静态表；连得上时下面会附「运行中实例自省」）:
  status                        状态分诊——离线可用（读记录文件；在线时附 ping 详情）
  ping                          认人：谁在服务（pid / 通道 / 版本 / 已跑多久）
  describe                      自省：白名单操作 ＋ 可执行命令面（运行期派生）
  tabs                          读标签快照（窗口/分组/标签树）
  open-tab <type>               开一个标签页（type = 视图/插件 id；可加 --opts '{"k":"v"}'）
  exec <commandId> [args…]      执行壳命令（能执行的 = describe 里 commands 清单那些；严格回传真结果）
  install <source>              安装插件（zip 包 URL 或本地路径）——确认对话框在软件里弹出，用户点头才装
  notifications                 读通知面板（按钮的 command 事实随行）
  notify-action <id> <action>   执行通知上的按钮（action = 按钮 label 或序号）
  log                           读最近操作账（正门三件套之「账本」的读取面）
  mcp                           起 MCP stdio server（给 AI 客户端配置用——⛔ 别在终端里直接跑；
                                客户端配置 = { "command": "<linkdeskctl 绝对路径>", "args": ["mcp"] }）

选项:
  --json                  机读输出（给 AI 用；失败时带 code + hint）
  --user-data-dir <路径>   指定实例的 userData（隔离实例必须给）
  --timeout <毫秒>         单次请求超时（默认 5000；install 默认 600000——等用户点头）
  --token <凭据>           覆盖凭据（验证「凭据不对会被拒」用）
  --no-identity-check     跳过「应答者是不是记录里那个进程」的对齐（仅诊断用）

通道:
  客户端不猜端口——它读主进程留下的记录：
    <userData>/ai-bridge.json   通道地址 ＋ 身份 ＋ 状态（不含凭据）
    <userData>/ai-bridge.token  凭据（32 字节 hex）
  userData 候选: \${LINKDESK_USER_DATA} ⇒ %APPDATA%\\linkdesk ⇒ %APPDATA%\\LinkDesk

退出码: 0 成功 · 1 失败（错误分类见 --json 的 code 字段）`;

const OFFLINE_NOTE = `
离线说明（软件没起来时看到的这一份）:
  本页子命令表是 CLI 自带的**静态骨架**；连上实例后，同一份 --help 会附上
  「运行中实例自省」一节（从实例的 describe 操作**运行期派生**，不是手抄第二份）。
  ⇒ 软件没开**不影响自省**：先看清单、再决定要不要把它拉起来。`;

/* ── 参数解析（CLI 参数折成一条请求——解析与通道分离，前者可单测后者要真机） ── */

function parseArgv(argv) {
  const opts = { json: false, userDataDir: null, timeoutMs: null, token: undefined, identityCheck: true, help: false, optsJson: null, limit: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--user-data-dir") opts.userDataDir = argv[++i];
    else if (a === "--timeout") opts.timeoutMs = Number(argv[++i]);
    else if (a === "--token") opts.token = argv[++i];
    else if (a === "--no-identity-check") opts.identityCheck = false;
    else if (a === "--opts") opts.optsJson = argv[++i];
    else if (a === "--limit") opts.limit = Number(argv[++i]);
    else if (a.startsWith("--")) throw new BridgeError("EUSAGE", `未知选项 ${a}`, "看 `--help`。");
    else rest.push(a);
  }
  return { opts, rest };
}

function dirsOf(opts) {
  return opts.userDataDir ? [opts.userDataDir] : candidateUserDataDirs();
}

function timeoutOf(opts, subcommand) {
  if (Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0) return opts.timeoutMs;
  return subcommand === "install" ? 600_000 : 5000; // install 等用户点头，不吃默认超时
}

/** 子命令 → 一条内核操作请求；返回 null = 本地子命令（status），不发网络 */
function buildRequest(subcommand, args, opts) {
  switch (subcommand) {
    case "status":
      return null;
    case "describe":
    case "ping":
    case "tabs":
    case "notifications":
      return {};
    case "log":
      return opts.limit !== null ? { limit: opts.limit } : {};
    case "open-tab": {
      const [type] = args;
      if (!type) throw new BridgeError("EUSAGE", "open-tab 要一个 type（视图/插件 id）", "如 `open-tab app`。");
      let parsed = undefined;
      if (opts.optsJson !== null) {
        try {
          parsed = JSON.parse(opts.optsJson);
        } catch {
          throw new BridgeError("EUSAGE", "--opts 必须是合法 JSON", `例：--opts '{"folder":"C:/x"}'`);
        }
      }
      return { type, ...(parsed !== undefined ? { opts: parsed } : {}) };
    }
    case "exec": {
      const [commandId, ...rest] = args;
      if (!commandId) throw new BridgeError("EUSAGE", "exec 要一个 commandId", "如 `exec app.openAiManual`；清单看 `describe`。");
      const parsedArgs = rest.map((s) => {
        try {
          return JSON.parse(s);
        } catch {
          return s; // 不是 JSON 就当字符串（常见用法）
        }
      });
      return { commandId, args: parsedArgs };
    }
    case "install": {
      const [source] = args;
      if (!source) throw new BridgeError("EUSAGE", "install 要一个 source（插件包 URL 或本地路径）", "确认对话框会在软件里弹出——去软件里点头。");
      return { source };
    }
    case "notify-action": {
      const [notificationId, action] = args;
      if (!notificationId || action === undefined) {
        throw new BridgeError("EUSAGE", "notify-action 要 notificationId 和 action（label 或序号）", "清单看 `notifications` 的输出。");
      }
      const actionNorm = /^\d+$/.test(action) ? Number(action) : action;
      return { notificationId, action: actionNorm };
    }
    default:
      throw new BridgeError("EUSAGE", `未知子命令 ${subcommand}`, "看 `--help` 的子命令表。");
  }
}

/* ── `--help` 自省（AI#35：静态骨架 ＋ 在线实例自省 ＋ 双向对账） ── */

async function helpText(opts) {
  let extra = OFFLINE_NOTE;
  let live = null;
  try {
    const { result } = await callBridge("describe", {}, { userDataDirs: dirsOf(opts), timeoutMs: timeoutOf(opts, "describe") });
    live = result;
  } catch (e) {
    extra = `\n离线说明（探测失败：${e.code}）:\n  ${e.message}` + (e.hint ? `\n  下一步：${e.hint}` : "") + OFFLINE_NOTE;
  }
  if (live && live.ops) {
    const staticNames = Object.values(SUBCOMMAND_OPS);
    const liveNames = live.ops.map((o) => o.name);
    const staticOnly = staticNames.filter((n) => !liveNames.includes(n));
    const liveOnly = liveNames.filter((n) => !staticNames.includes(n));
    extra =
      `\n运行中实例自省（白名单 v${live.whitelistVersion}——**运行期派生**，改一处就够）:\n` +
      live.ops
        .map((o) => {
          const sub = Object.keys(SUBCOMMAND_OPS).find((k) => SUBCOMMAND_OPS[k] === o.name) ?? o.name;
          const params = (o.params ?? []).map((p) => (p.required ? `<${p.name}>` : `[${p.name}]`)).join(" ");
          return `  ${sub}${params ? " " + params : ""}\n      ${o.help}`;
        })
        .join("\n") +
      `\n  命令面（exec 可执行，运行期派生）：${live.commandCount} 条——逐条看 \`describe --json\`` +
      `\n  对账：静态表有 / 实例无 = ${staticOnly.length ? staticOnly.join(",") : "(空)"} · 实例有 / 静态表无 = ${liveOnly.length ? liveOnly.join(",") : "(空)"}` +
      `\n  ⇒ 差集是空的就说明「文档没漂移」；非空即说明静态骨架该更新了。`;
  }
  return STATIC_USAGE + "\n" + extra;
}

/* ── 人读渲染（`--json` 不走这里） ── */

function render(op, result) {
  if (op === "ping") {
    return [
      `谁在服务  pid ${result.pid}  (${result.appName} ${result.appVersion})`,
      `通道      ${result.transport} ${fmtEndpoint(result.endpoint)}`,
      `已跑      ${Math.round(result.uptimeMs / 1000)}s（起于 ${result.startedAt}）`,
      `壳窗      ${result.shellWindows}`,
      `userData  ${result.userData}`,
    ].join("\n");
  }
  if (op === "describe") {
    const lines = result.ops.map((o) => `${o.name.padEnd(14)} ${o.help}`);
    lines.push("", `命令面（exec 可执行）：${result.commandCount} 条`);
    for (const c of result.commands) lines.push(`  ${(c.id ?? "?").padEnd(36)} ${c.title ?? ""}`);
    return lines.join("\n");
  }
  if (op === "tabs") {
    const wins = result.windows || [];
    const lines = [`窗口 ${wins.length} 只`];
    for (const w of wins) {
      lines.push(`  ${w.id}  区段 ${(w.groups || []).length}`);
      for (const g of w.groups || []) {
        lines.push(`    ${g.id}  active=${g.activeTabId}  tabs=${(g.tabs || []).length}`);
        for (const t of g.tabs || []) lines.push(`      · ${t.id}  plugin=${t.pluginId}  title=${t.title}`);
      }
    }
    return lines.join("\n");
  }
  if (op === "notifications") {
    const groups = result.groups || [];
    const lines = [`未读 ${result.unread} · ${groups.length} 组`];
    for (const g of groups) {
      lines.push(`  [${g.label}] 未读 ${g.unread}`);
      for (const item of g.items || []) {
        lines.push(`    · ${item.id}  ${item.message}`);
        for (const a of item.actions || []) lines.push(`        按钮 [${a.label}]${a.command ? ` → ${a.command}` : " （无命令，仅关闭）"}`);
      }
    }
    return lines.join("\n");
  }
  if (op === "log") {
    return [`账本 ${result.count} 条`, ...result.entries.map((e) => `  ${e.ts}  ${e.op.padEnd(14)} ok=${e.ok} ${e.code ?? ""} ${e.ms}ms${e.arg ? ` arg=${e.arg}` : ""}`)].join("\n");
  }
  return JSON.stringify(result, null, 2);
}

/** status 的客户端分诊（离线可用——读记录文件面，不需要软件活着） */
function renderStatus(found, live, opts) {
  const { record, recordPath, searched } = found;
  if (!record) {
    const err = classify({ record: null, error: null, attempted: { searched, timeoutMs: 0 } });
    return { state: { code: err.code, message: err.message, hint: err.hint }, text: `状态      ${err.message}\n下一步    ${err.hint ?? "—"}` };
  }
  const head = `记录      ${recordPath}\n身份      ${record.appName} ${record.appVersion} · pid ${record.pid} · 起于 ${record.startedAt}`;
  if (live) {
    return {
      state: { code: "SERVING", message: `在服务（${fmtEndpoint(live.endpoint)}）`, hint: null },
      text: [head, `状态      在服务  ${live.transport} ${fmtEndpoint(live.endpoint)}`, `已跑      ${Math.round(live.uptimeMs / 1000)}s · 壳窗 ${live.shellWindows}`].join("\n"),
    };
  }
  const err = classify({ record, error: null, attempted: { searched, timeoutMs: 0 } });
  if (err.code === "REFUSED" || err.code === "CONNECT_FAILED" || err.code === "TIMEOUT") {
    // 探活未竟 ≠ 分诊结论（记录说在听但这次没连上）——如实报「记录面正常、这次没连上」
    return {
      state: { code: "RECORD_OK", message: `记录说在 ${fmtEndpoint(record.endpoint)} 监听（这次探活没连上：${err.code}）`, hint: err.hint },
      text: [head, `状态      记录说在 ${fmtEndpoint(record.endpoint)} 监听（这次探活没连上：${err.code}）`, `下一步    ${err.hint ?? "稍等重试"}`].join("\n"),
    };
  }
  return {
    state: { code: err.code, message: err.message, hint: err.hint },
    text: [head, `状态      ${err.message}`, `下一步    ${err.hint ?? "—"}`].join("\n"),
  };
}

/* ── 主流程 ── */

async function main() {
  const argv = process.argv.slice(2);
  let opts, rest;
  try {
    ({ opts, rest } = parseArgv(argv));
  } catch (e) {
    console.error(`linkdeskctl: ${e.message}` + (e.hint ? `\n  ${e.hint}` : ""));
    process.exit(1);
  }

  if (opts.help || rest.length === 0) {
    console.log(await helpText(opts));
    process.exit(0);
  }

  const subcommand = rest[0];

  // MCP 皮（AI#36）——stdio server 模式：接管 stdin/stdout，不走普通子命令流程（AI#37：不读盘不挂死）
  if (subcommand === "mcp") {
    const { runMcpServer } = await import("./lib/mcp-server.mjs");
    runMcpServer({ userDataDir: opts.userDataDir });
    return; // 生命周期归 stdin（客户端关管道 = 退出）
  }

  let payload;
  try {
    payload = buildRequest(subcommand, rest.slice(1), opts);
  } catch (e) {
    if (opts.json) console.log(JSON.stringify({ ok: false, code: e.code, message: e.message, hint: e.hint ?? null }));
    else console.error(`linkdeskctl: ${e.message}` + (e.hint ? `\n  ${e.hint}` : ""));
    process.exit(1);
  }

  const callOpts = {
    userDataDirs: dirsOf(opts),
    timeoutMs: timeoutOf(opts, subcommand),
    token: opts.token,
    identityCheck: opts.identityCheck,
  };

  try {
    // status = 客户端分诊 + 在线 ping 详情（离线可用是它的存在意义）
    if (subcommand === "status") {
      const found = readRecord({ userDataDirs: callOpts.userDataDirs });
      let live = null;
      if (found.record && !found.record.lastError && found.record.enabled === true && found.record.mode !== "off") {
        try {
          live = await callBridge("ping", {}, callOpts).then((r) => r.result);
        } catch {
          live = null; // 探活失败不掩盖分诊结论——renderStatus 如实报「记录面正常、这次没连上」
        }
      }
      const out = renderStatus(found, live, opts);
      if (opts.json) {
        console.log(JSON.stringify({ ok: true, subcommand, state: out.state, record: found.record, recordPath: found.recordPath, searched: found.searched }, null, 2));
      } else {
        console.log(out.text);
      }
      process.exit(0);
    }

    const { result, record, servedBy } = await callBridge(SUBCOMMAND_OPS[subcommand], payload, callOpts);
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, subcommand, op: SUBCOMMAND_OPS[subcommand], servedBy: servedBy ?? record.pid, recordPid: record.pid, result }, null, 2));
    } else {
      console.log(render(SUBCOMMAND_OPS[subcommand], result));
    }
    process.exit(0);
  } catch (e) {
    const code = e instanceof BridgeError ? e.code : e.code || "EERROR";
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, subcommand, code, message: e.message, hint: e.hint ?? null }));
    } else {
      // 人读形态：一行说清是什么故障，一行说清下一步（失败路径的可读性就在这两行）
      console.error(`linkdeskctl: [${code}] ${e.message}`);
      if (e.hint) console.error(`  下一步: ${e.hint}`);
      if (code === "NO_RECORD") {
        const { searched } = readRecord({ userDataDirs: callOpts.userDataDirs });
        console.error(`  找过: ${searched.join(" · ")}`);
      }
    }
    process.exit(1);
  }
}

main();
