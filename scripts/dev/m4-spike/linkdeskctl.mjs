#!/usr/bin/env node
/**
 * M4 spike（`AI#31`）CLI 皮原型 —— `linkdeskctl` 的**最小垂直切片**。
 *
 * 正式件是 `AI#34` 的 `cli/linkdeskctl/`（PATH 已现成：`build/installer.nsh:183`）；
 * 这里只用来回答一件事：**一条命令能不能真控制运行中的实例，且开不了时说得清为什么**。
 *
 * ⚠️ 落点在 `scripts/dev/m4-spike/` 而非 `cli/`：它是**一次性原型**（结论见 README），
 *    不进软件产物、不占版本号；正式 CLI 由 `AI#34` 另起。
 *
 * ## 用法（`--help` 是自省面 —— `AI#35` 的判据）
 * ```
 * node scripts/dev/m4-spike/linkdeskctl.mjs ping            # 谁在服务
 * node scripts/dev/m4-spike/linkdeskctl.mjs tabs --json     # 读标签快照
 * node scripts/dev/m4-spike/linkdeskctl.mjs exec <commandId>
 * node scripts/dev/m4-spike/linkdeskctl.mjs --help
 * ```
 *
 * 🔴 **`--help` 的降级设计**（= `AI#37` 冷启动悖论的答案，本 spike 用一条命令把它演示出来）：
 *    · 软件在跑 ⇒ `--help` 附上**从这个实例自省来的**操作清单（`describe` 操作，运行期派生）
 *    · 软件没跑 ⇒ `--help` **照常可用**：静态骨架 ＋ 一行「离线：以下清单来自 CLI 自带的静态表」，
 *      外加**离线条**（怎么起软件 / 怎么看记录）。
 *    ⇒ 「MCP 客户端拉起时软件没开」不再是死局：**自省面不依赖实例**，这是 CLI 相对 MCP 的结构性优势。
 */

import { callBridge, BridgeError, readRecord, candidateUserDataDirs, fmtEndpoint } from "./bridge-client.mjs";

const USAGE = `linkdeskctl（M4 spike 原型）—— 一条命令控制运行中的 LinkDesk

用法:
  linkdeskctl <操作> [选项] [参数]
  linkdeskctl --help

操作用法（离线静态表；连得上时下面会附「运行中实例自省」）:
  describe              列出本实例支持的操作与参数（自举点）
  ping                  认人：谁在服务（pid / 通道 / 版本 / 已跑多久）
  tabs                  读标签快照（经壳读取面）
  exec <commandId>      执行壳命令（能执行的 = 命令面板里那些）
  log                   读最近操作账

选项:
  --json                机读输出（给 AI 用）
  --user-data-dir <路径> 指定实例的 userData（隔离实例必须给）
  --timeout <毫秒>       单次请求超时（默认 5000）
  --token <凭据>         覆盖凭据（用于验证「凭据不对会被拒」）
  --no-identity-check   跳过「应答者是不是记录里那个进程」的对齐（仅诊断用）

通道:
  客户端不猜端口 —— 它读主进程留下的记录：
    <userData>/m4-spike-bridge.json   通道地址 ＋ 身份 ＋ 状态（不含凭据）
    <userData>/m4-spike-bridge.token  凭据（32 字节 hex）
  userData 候选: \${LINKDESK_USER_DATA} ⇒ %APPDATA%\\linkdesk ⇒ %APPDATA%\\LinkDesk

退出码: 0 成功 · 1 失败（错误分类见 --json 的 code 字段）`;

const OFFLINE_NOTE = `
离线说明（软件没起来时看到的这一份）:
  本页操作表是 CLI 自带的**静态骨架**；连上实例后，同一份 --help 会附上
  「运行中实例自省」一节（从实例的 describe 操作**运行期派生**，不是手抄第二份）。
  ⇒ 软件没开**不影响自省**：先看清单、再决定要不要把它拉起来。`;

function parseArgv(argv) {
  const opts = { json: false, userDataDir: null, timeoutMs: 5000, token: undefined, identityCheck: true };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--user-data-dir") opts.userDataDir = argv[++i];
    else if (a === "--timeout") opts.timeoutMs = Number(argv[++i]);
    else if (a === "--token") opts.token = argv[++i];
    else if (a === "--no-identity-check") opts.identityCheck = false;
    else if (a.startsWith("--")) throw new BridgeError("EUSAGE", `未知选项 ${a}`, "看 `--help`。");
    else rest.push(a);
  }
  return { opts, rest };
}

/** 把 CLI 参数折成一条请求（参数解析与通道分离 —— 前者可单测，后者要真机） */
function buildRequest(op, args) {
  switch (op) {
    case "describe":
    case "ping":
    case "tabs":
    case "log":
      return {};
    case "exec": {
      const [commandId, ...rest] = args;
      if (!commandId) throw new BridgeError("EUSAGE", "exec 要一个 commandId", "如 `exec workbench.action.newWindow`。");
      const parsedArgs = rest.map((s) => {
        try {
          return JSON.parse(s);
        } catch {
          return s; // 不是 JSON 就当字符串（`--json` 之外的常见用法）
        }
      });
      return { commandId, args: parsedArgs };
    }
    default:
      throw new BridgeError("EUSAGE", `未知操作 ${op}`, "看 `--help` 的操作表。");
  }
}

const CLI_OPS = ["describe", "ping", "tabs", "exec", "log"];

/** `--help`：静态骨架 ＋（连得上时）**从这个实例自省**的清单 —— 零源码环境 AI 的自举点 */
async function helpText(opts) {
  let extra = OFFLINE_NOTE;
  let live = null;
  try {
    const { result } = await callBridge("describe", {}, { userDataDirs: dirsOf(opts), timeoutMs: opts.timeoutMs });
    live = result;
  } catch (e) {
    extra = `\n离线说明（探测失败：${e.code}）:\n  ${e.message}` + (e.hint ? `\n  下一步：${e.hint}` : "") + OFFLINE_NOTE;
  }
  if (live && live.ops) {
    const liveNames = live.ops.map((o) => o.name);
    const staticOnly = CLI_OPS.filter((n) => !liveNames.includes(n));
    const liveOnly = liveNames.filter((n) => !CLI_OPS.includes(n));
    extra =
      `\n运行中实例自省（白名单 v${live.whitelistVersion} —— **运行期派生**，改一处就够）:\n` +
      live.ops
        .map(
          (o) =>
            `  ${o.name}${o.params.length ? " " + o.params.map((p) => (p.required ? `<${p.name}>` : `[${p.name}]`)).join(" ") : ""}\n      ${o.help}`,
        )
        .join("\n") +
      `\n  对账：静态表有 / 实例无 = ${staticOnly.length ? staticOnly.join(",") : "(空)"} · 实例有 / 静态表无 = ${liveOnly.length ? liveOnly.join(",") : "(空)"}\n` +
      "  ⇒ 差集是空的就说明「文档没漂移」；非空即说明静态骨架该更新了（正式版靠对账脚本守）。";
  }
  return USAGE + "\n" + extra;
}

function dirsOf(opts) {
  return opts.userDataDir ? [opts.userDataDir] : candidateUserDataDirs();
}

function render(op, result, { json }) {
  if (json) return JSON.stringify(result, null, 2);
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
    return result.ops.map((o) => `${o.name.padEnd(10)} ${o.help}`).join("\n");
  }
  if (op === "tabs") {
    const wins = result.windows || [];
    const lines = [`窗口 ${wins.length} 只`];
    for (const w of wins) {
      lines.push(`  ${w.id}  区段 ${(w.groups || []).length}`);
      for (const g of w.groups || []) {
        lines.push(`    ${g.id}  active=${g.activeTabId}  tabs=${(g.tabs || []).length}`);
        for (const t of g.tabs || []) lines.push(`      · ${t.id}  plugin=${t.pluginId}  title=${t.title}  shellType=${t.shellType ?? "-"}`);
      }
    }
    return lines.join("\n");
  }
  if (op === "log") {
    return [`账本 ${result.count} 条`, ...result.entries.map((e) => `  ${e.ts}  ${e.op.padEnd(9)} ok=${e.ok} ${e.code ?? ""} ${e.ms}ms`)].join("\n");
  }
  return JSON.stringify(result, null, 2);
}

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

  const op = rest[0];
  const args = rest.slice(1);
  let payload;
  try {
    payload = buildRequest(op, args);
  } catch (e) {
    if (opts.json) console.log(JSON.stringify({ ok: false, code: e.code, message: e.message, hint: e.hint }));
    else console.error(`linkdeskctl: ${e.message}` + (e.hint ? `\n  ${e.hint}` : ""));
    process.exit(1);
  }

  try {
    const { result, record, servedBy } = await callBridge(op, payload, {
      userDataDirs: dirsOf(opts),
      timeoutMs: opts.timeoutMs,
      token: opts.token,
      identityCheck: opts.identityCheck,
    });
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, op, servedBy: servedBy ?? record.pid, recordPid: record.pid, result }, null, 2));
    } else {
      console.log(render(op, result, opts));
    }
    process.exit(0);
  } catch (e) {
    const code = e instanceof BridgeError ? e.code : e.code || "EERROR";
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, code, message: e.message, hint: e.hint ?? null }));
    } else {
      // 人读形态：**一行说清是什么故障，一行说清下一步**（判据 ②③ 的可读性就在这两行）
      console.error(`linkdeskctl: [${code}] ${e.message}`);
      if (e.hint) console.error(`  下一步: ${e.hint}`);
      if (code === "NO_RECORD") {
        const { searched } = readRecord({ userDataDirs: dirsOf(opts) });
        console.error(`  找过: ${searched.join(" · ")}`);
      }
    }
    process.exit(1);
  }
}

main();
