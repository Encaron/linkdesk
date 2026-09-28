#!/usr/bin/env node
/**
 * M4 spike（`AI#31`）验收读数器 —— **一条命令跑完全部判据，逐条留读数**。
 *
 * 这不是「跑一遍看看行不行」的手工验证：它把 `M4-通道.md` 里 AI#31 的四条判据
 * （① 一条 CLI 命令真控制运行中实例 ② 冷启动有明确行为 ③ 失败路径有可读原因 ④ 多实例不失控）
 * 拆成**具名读数**，每条都有正控与**负控**（负控 = 故意让它在错误的前提下跑，证明读数不是恒绿）。
 *
 * 🔴 纪律（照上一棒换来的三条，⛔ 别重犯）：
 *   ① **认人看身份，不只看存在**：每次 `ping` 的 pid 必须等于我们 spawn 的那只主进程的 pid
 *      （M5：「新端口确实通、但服务者是即将退出的进程」→ 假绿）。见 `identity` 读数。
 *   ② **抢资源要等对方走**：本脚本每个阶段结束都先杀干净再起下一只（端口/单实例锁都是独占资源）。
 *   ③ **不信后台链自己的 `EXIT=0`**：本脚本不靠 shell 链的退出码 —— 它逐条断言读数值。
 *
 * 用法:
 *   node scripts/dev/m4-spike/accept.mjs                 # 全部阶段
 *   node scripts/dev/m4-spike/accept.mjs --only tcp      # 只跑一个阶段（调试用）
 *   node scripts/dev/m4-spike/accept.mjs --json          # 机读全部读数
 * 阶段: norecord off tcp pipe bind portbusy multi dead mcp decouple
 */

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const HOOK = path.join(HERE, "main-hook.cjs");
const CTL = path.join(HERE, "linkdeskctl.mjs");
const MCP = path.join(HERE, "mcp-stdio.mjs");
const ELECTRON = process.platform === "win32"
  ? path.join(ROOT, "node_modules", "electron", "dist", "electron.exe")
  : path.join(ROOT, "node_modules", "electron", "dist", "electron");
const RECORD_NAME = "m4-spike-bridge.json";
const CDP_PORT = 9433; // 固定：本脚本同一时刻只有一只实例，共用即可（`lib/cdp.mjs` 的 CDP_BASE 在模块加载时定格）

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const ONLY = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;

const results = [];
function check(id, ok, detail) {
  results.push({ id, ok: !!ok, detail: String(detail ?? "") });
  if (!JSON_OUT) console.log(`  ${ok ? "✔" : "✗"} ${id.padEnd(46)} ${detail ?? ""}`);
  return !!ok;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = (tag) => path.join(os.tmpdir(), `ldk-m4spike-${tag}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`);

// ── 实例生命周期 ────────────────────────────────────────────────
function launch({ mode, port, host, userData, cdp = null, extraEnv = {}, tag }) {
  const env = {
    ...process.env,
    NODE_OPTIONS: `--require ${HOOK}`,
    LINKDESK_M4_SPIKE: mode,
    ...(port !== undefined ? { LINKDESK_M4_SPIKE_PORT: String(port) } : {}),
    ...(host ? { LINKDESK_M4_SPIKE_HOST: host } : {}),
    ...extraEnv,
  };
  const args = [".", `--user-data-dir=${userData}`, ...(cdp ? [`--remote-debugging-port=${cdp}`] : [])];
  const child = spawn(ELECTRON, args, { cwd: ROOT, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const chunks = [];
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (d) => chunks.push(String(d)));
  child.stderr.on("data", (d) => chunks.push(String(d)));
  const inst = { tag, mode, userData, port, host, pid: child.pid, child, log: () => chunks.join("") };
  return inst;
}

function kill(inst) {
  if (!inst || !inst.child) return;
  try {
    spawnSync("taskkill", ["/PID", String(inst.pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    /* 已经死了 */
  }
  try {
    inst.child.kill("SIGKILL");
  } catch {
    /* 已经死了 */
  }
}

/** 等一只实例退干净（🔴 独占资源：不等就会把「下一只抢不到」误读成「代码坏了」） */
async function waitExited(inst, timeoutMs = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (inst.child.exitCode !== null || inst.child.signalCode) return true;
    await sleep(120);
  }
  return false;
}

const readRecord = (userData) => {
  const p = path.join(userData, RECORD_NAME);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

async function waitFor(fn, { timeoutMs = 20000, everyMs = 150 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(everyMs);
  }
}

// ── CLI / MCP 驱动 ──────────────────────────────────────────────
function cli(args, { userData, env = {}, timeoutMs = 20000 } = {}) {
  const full = [...args, ...(userData ? ["--user-data-dir", userData] : [])];
  const r = spawnSync(process.execPath, [CTL, ...full], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: timeoutMs,
    env: { ...process.env, ...env },
  });
  return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
function cliJson(args, opts) {
  const r = cli([...args, "--json"], opts);
  let json = null;
  try {
    json = JSON.parse(r.out);
  } catch {
    /* 保留原文 */
  }
  return { ...r, json };
}

/** 一条 stdio MCP 会话：写若干请求、收 `expect` 条应答、关管道 */
async function mcpSession(payloads, { userData, env = {}, expect = payloads.length, timeoutMs = 12000 } = {}) {
  const t0 = Date.now();
  const child = spawn(process.execPath, [MCP], {
    cwd: ROOT,
    env: { ...process.env, ...(userData ? { LINKDESK_USER_DATA: userData } : {}), ...env },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const lines = [];
  const errs = [];
  let firstMs = null;
  let done;
  const finished = new Promise((r) => (done = r));
  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (d) => {
    buf += d;
    for (;;) {
      const nl = buf.indexOf("\n");
      if (nl < 0) break;
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      if (firstMs === null) firstMs = Date.now() - t0;
      try {
        lines.push(JSON.parse(line));
      } catch {
        lines.push({ raw: line });
      }
      if (lines.length >= expect) done();
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => errs.push(String(d)));
  for (const p of payloads) child.stdin.write(JSON.stringify(p) + "\n");
  await Promise.race([finished, sleep(timeoutMs)]);
  const totalMs = Date.now() - t0;
  try {
    child.stdin.end();
  } catch {
    /* 已关 */
  }
  try {
    child.kill();
  } catch {
    /* 已死 */
  }
  return { lines, errs: errs.join(""), firstMs, totalMs };
}

/** CDP 读面（**独立于本通道**的第二个证人）：池页里读 `window.linkdesk.tabs.list()` */
async function cdpTabs(port = CDP_PORT) {
  process.env.LINKDESK_CDP = `http://127.0.0.1:${port}`;
  const cdp = await import("../lib/cdp.mjs");
  const { pickPool } = await import("../lib/linkdesk-driver.mjs");
  const target = await waitFor(async () => {
    try {
      return await pickPool();
    } catch {
      return null;
    }
  }, { timeoutMs: 20000 });
  if (!target) return { ok: false, error: "CDP 找不到池页 target" };
  const expr = `(async () => {
    const s = await window.linkdesk.tabs.list();
    return s.windows.flatMap((w) => w.groups.flatMap((g) => g.tabs.map((t) => ({ id: t.id, shellType: t.shellType ?? null, pluginId: t.pluginId, title: t.title }))));
  })()`;
  const tabs = await cdp.evaluate(target, expr);
  return { ok: true, tabs };
}

const hasAiManual = (tabs) => (tabs || []).some((t) => t.shellType === "ai-manual");

/**
 * 🔴 壳缝就绪探测（**环境前置**，不是本 spike 的判据）。
 *
 * 病根（本棒实测栽过，见 README §发现 ④）：dev 轨道下**运行中的 Vite 可能发着一份过期的模块**
 * （实测：`IpcBridgeHandler/ui.ts` 已经 import `resolvePanelChecked`，而 Vite 发来的
 * `panelCommands.ts` 那份**没有这个导出**）⇒ 壳渲染进程 `Uncaught SyntaxError` ⇒ `#root` 永远空
 * ⇒ 主进程转给壳的每条请求都超时。**新建实例也躲不过**（不是 HMR 的问题，是 Vite 的变换缓存过期）。
 * 治法：`touch` 那两个文件让 Vite 重新变换（本脚本不替人改仓，故只**报**不修）。
 *
 * 为什么要这条：不区分「壳没挂上（环境）」与「通道坏了（我的码）」，会把一条环境故障
 * 记成四条互相矛盾的假失败（本棒第一轮就是这样：4 条红全指向同一个环境原因）。
 */
async function waitShellSeam(userData, timeoutMs = 45000) {
  const t0 = Date.now();
  for (;;) {
    const r = cliJson(["tabs"], { userData, timeoutMs: 15000 });
    if (r.code === 0 && r.json?.ok) return { ok: true, ms: Date.now() - t0 };
    if (Date.now() - t0 > timeoutMs) return { ok: false, ms: Date.now() - t0, last: r.json?.message || r.err || "未知" };
    await sleep(2000);
  }
}

// ── 阶段 ────────────────────────────────────────────────────────
const phases = {};

/** 没有记录时的读数（软件从没跑过 / 指错目录） */
phases.norecord = async () => {
  const empty = tmp("norecord");
  fs.mkdirSync(empty, { recursive: true });
  const r = cliJson(["ping"], { userData: empty });
  check("norecord.cli 报 NO_RECORD（不是瞎连）", r.json?.code === "NO_RECORD", `code=${r.json?.code} exit=${r.code}`);
  check("norecord.提示里列出找过哪些目录", (r.json?.message || "").includes("找过"), "message 含「找过」");
  check("norecord.给了下一步", Boolean(r.json?.hint), r.json?.hint?.slice(0, 60));

  const h = cli(["--help"], { userData: empty });
  check("norecord.--help 离线照常可用（自举点）", h.code === 0 && h.out.includes("操作"), `exit=${h.code} ${h.out.length}B`);
  check("norecord.--help 如实说在离线", h.out.includes("离线说明（探测失败"), "含「离线说明（探测失败」");
};

/** 软件在跑、但开关关着（门锁语义） */
phases.off = async () => {
  const ud = tmp("off");
  const inst = launch({ tag: "off", mode: "off", userData: ud });
  const rec = await waitFor(() => readRecord(ud), { timeoutMs: 30000 });
  check("off.记录已写（关着也留痕）", Boolean(rec), rec ? JSON.stringify({ mode: rec.mode, enabled: rec.enabled, listening: rec.listening }) : "无");
  check("off.mode=off ⇒ 未监听", rec?.mode === "off" && rec?.listening === false, `listening=${rec?.listening}`);

  // 反证：关着时端口上真没人听（netstat 级证据）
  const r = cliJson(["ping"], { userData: ud });
  check("off.CLI 说「开关是关的」（不是「拒绝连接」）", r.json?.code === "SWITCH_OFF", `code=${r.json?.code}`);
  check("off.话里带 pid 与版本（说清是谁）", /pid \d+/.test(r.json?.message || ""), (r.json?.message || "").slice(0, 70));
  check("off.pid 就是我们 spawn 的那只", (r.json?.message || "").includes(String(inst.pid)), `spawn pid=${inst.pid}`);

  const h = cli(["--help"], { userData: ud });
  check("off.--help 仍可用且说明为何离线", h.code === 0 && h.out.includes("SWITCH_OFF"), `exit=${h.code}`);

  kill(inst);
  await waitExited(inst);
};

/** 主读数：TCP 回环 —— 一条 CLI 命令真控制运行中实例（含独立 CDP 佐证、认人、负控） */
phases.tcp = async () => {
  const ud = tmp("tcp");
  const inst = launch({ tag: "tcp", mode: "tcp", port: 0, userData: ud, cdp: CDP_PORT });
  const rec = await waitFor(() => (readRecord(ud)?.listening ? readRecord(ud) : null), { timeoutMs: 40000 });
  if (!rec) {
    check("tcp.通道起来并写下地址", false, `记录=${JSON.stringify(readRecord(ud))} 日志尾=${inst.log().slice(-400)}`);
    kill(inst);
    await waitExited(inst);
    return;
  }
  check("tcp.通道起来并写下地址", rec.endpoint?.transport === "tcp" && rec.endpoint.port > 0, JSON.stringify(rec.endpoint));

  const ping = cliJson(["ping"], { userData: ud });
  check("tcp.ping 通", ping.code === 0 && ping.json?.ok === true, `exit=${ping.code}`);
  check("tcp.🔴 认人：应答 pid == 我们 spawn 的 pid", ping.json?.result?.pid === inst.pid, `应答=${ping.json?.result?.pid} spawn=${inst.pid}`);

  const desc = cliJson(["describe"], { userData: ud });
  const opNames = (desc.json?.result?.ops || []).map((o) => o.name);
  check("tcp.describe 运行期派生操作表", opNames.length >= 5, opNames.join(","));

  const help = cli(["--help"], { userData: ud });
  check("tcp.--help 附「运行中实例自省」", help.out.includes("运行中实例自省"), "在线自省节存在");
  check("tcp.--help 静态表与实例清单差集为空", help.out.includes("静态表有 / 实例无 = (空)") && help.out.includes("实例有 / 静态表无 = (空)"), "差集双向空");

  // ── 环境前置：壳缝必须先通（否则后面每条都会以「超时」的形式假红）──
  const seam = await waitShellSeam(ud);
  check("tcp.环境前置：壳缝通（壳渲染进程已挂载并应答）", seam.ok, seam.ok ? `${seam.ms}ms 内通` : `${seam.ms}ms 未通：${seam.last} ⇒ 多半是 Vite 发着过期模块（touch 那两个文件或重启 Vite）`);
  if (!seam.ok) {
    const mount = await cdpTabs().catch(() => ({ ok: false }));
    check("tcp.环境诊断：壳文档是否挂载（#root 有子节点）", false, `CDP 读面 ${mount.ok ? "可用但读不到 ai-manual" : "不可用"}；先修环境再跑本条`);
    kill(inst);
    await waitExited(inst);
    return;
  }

  // ── 控制读数：CLI 一条命令 → 壳真执行 → 可读面变化（两个独立证人）──
  const before = cliJson(["tabs"], { userData: ud });
  const beforeTabs = before.json?.result?.windows?.flatMap((w) => (w.groups || []).flatMap((g) => g.tabs || [])) || [];
  const bridgeBefore = hasAiManual(beforeTabs);

  const exec = cliJson(["exec", "app.openAiManual"], { userData: ud });
  check("tcp.exec 一条 CLI 命令被接受", exec.code === 0 && exec.json?.ok === true, `exit=${exec.code} ${JSON.stringify(exec.json?.result ?? exec.json)}`);

  const after = cliJson(["tabs"], { userData: ud });
  const afterTabs = after.json?.result?.windows?.flatMap((w) => (w.groups || []).flatMap((g) => g.tabs || [])) || [];
  const bridgeAfter = hasAiManual(afterTabs);
  check("tcp.证人①（本通道读取面）看到新标签 ai-manual", bridgeAfter, `before=${bridgeBefore} after=${bridgeAfter} tabs=${afterTabs.map((t) => t.id).join(",")}`);

  const cdp = await cdpTabs();
  check("tcp.证人②（CDP 独立读面）看到同一个标签", cdp.ok && hasAiManual(cdp.tabs), cdp.ok ? `cdp tabs=${cdp.tabs.map((t) => t.shellType ?? t.id).join(",")}` : cdp.error);
  check("tcp.两个证人一致（本通道 ⊆ CDP）", bridgeAfter === (cdp.ok && hasAiManual(cdp.tabs)), `bridge=${bridgeAfter} cdp=${cdp.ok ? hasAiManual(cdp.tabs) : "n/a"}`);

  const log = cliJson(["log"], { userData: ud });
  const entries = log.json?.result?.entries || [];
  check("tcp.账本留下真调用（exec ok）", entries.some((e) => e.op === "exec" && e.ok === true), `账本 ${log.json?.result?.count} 条`);
  check("tcp.账本也留被拒的调用（先记后判）", entries.every((e) => typeof e.ok === "boolean"), "每条都有 ok 字段");

  // ── 失败路径负控 ──
  // ⚠️ **缺口①（既有行为，⛔ 不是本棒引入）**：未知命令**不报错**——`CommandRegistry.executeCommand`
  //    未注册只 `console.warn` 后 `return undefined`；handler 抛错也只 `reportError` 后返回 undefined。
  //    ⇒ 调用方（含 AI）**无法从返回值分辨「做了」与「没做」**。如实记现象，必办项交给 `AI#32`/`AI#33`。
  const bogus = cliJson(["exec", "no.such.command.xyz"], { userData: ud });
  check(
    "tcp.缺口①：未知命令被静默接受（记现象，非本棒引入）",
    bogus.code === 0 && bogus.json?.ok === true,
    `exit=${bogus.code} result=${JSON.stringify(bogus.json?.result ?? null)}`,
  );
  const log2 = cliJson(["log"], { userData: ud });
  const bogusEntries = (log2.json?.result?.entries || []).filter((e) => e.arg === "no.such.command.xyz");
  check(
    "tcp.缺口①.后果：账本把它记成 ok=true（⇒ 账本 ≠ 真实性凭据）",
    bogusEntries.some((e) => e.ok === true),
    `账本里 arg=no.such.command.xyz ⇒ ${JSON.stringify(bogusEntries)}`,
  );

  const badToken = cliJson(["ping", "--token", "0".repeat(64)], { userData: ud });
  check("tcp.✗ 负控：错凭据被拒（EAUTH）", badToken.json?.code === "EAUTH", `code=${badToken.json?.code}`);

  const badOp = (() => {
    // 直接用客户端发一个表外操作（CLI 参数层会先挡，所以绕过 CLI 的 buildRequest）
    const clientUrl = pathToFileURL(path.join(HERE, "bridge-client.mjs")).href;
    const code = `
      const m = await import(${JSON.stringify(clientUrl)});
      try { const r = await m.callBridge("rm -rf /", {}, { userDataDirs: [${JSON.stringify(ud)}] }); console.log(JSON.stringify({ok:true, r})); }
      catch (e) { console.log(JSON.stringify({ok:false, code:e.code, message:e.message})); }
    `;
    return spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", cwd: ROOT, env: process.env });
  })();
  const badOpJson = (() => {
    try {
      return JSON.parse((badOp.stdout || "").trim().split("\n").pop());
    } catch {
      return null;
    }
  })();
  check("tcp.✗ 负控：表外操作被网关拒（EOP）", badOpJson?.code === "EOP", `code=${badOpJson?.code} ${(badOpJson?.message || "").slice(0, 50)}`);

  // ── MCP 皮（在线）──
  const mcpOn = await mcpSession(
    [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ],
    { userData: ud },
  );
  const listOn = mcpOn.lines.find((l) => l.id === 2)?.result;
  check("mcp(在线).tools/list 应答", Boolean(listOn?.tools?.length), `tools=${listOn?.tools?.map((t) => t.name).join(",")}`);
  check("mcp(在线).清单来源 = 实例自省（不手抄）", String(listOn?._meta?.catalogSource || "").includes("实例自省"), listOn?._meta?.catalogSource);

  const mcpExec = await mcpSession([{ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "tabs", arguments: {} } }], { userData: ud, expect: 1 });
  const callRes = mcpExec.lines[0]?.result;
  check("mcp(在线).tools/call 真读到池快照", !callRes?.isError && /windows/.test(callRes?.content?.[0]?.text || ""), `isError=${callRes?.isError} ${(callRes?.content?.[0]?.text || "").slice(0, 40)}`);

  // ── 杀掉 ⇒ 残留记录的读数（读在 `dead` 阶段）──
  kill(inst);
  const clean = await waitExited(inst);
  check("tcp.强制杀后进程真退了（为下一阶段让出端口）", clean, `exitCode=${inst.child.exitCode}`);

  const deadRec = readRecord(ud);
  const dead = cliJson(["ping"], { userData: ud });
  check("dead(接上).记录还在（不删 —— 好说「软件已退出」）", Boolean(deadRec), `listening=${deadRec?.listening} exitedAt=${deadRec?.exitedAt ?? "(未盖章)"}`);
  check("dead(接上).CLI 报 APP_EXITED（不是「拒绝连接」）", dead.json?.code === "APP_EXITED", `code=${dead.json?.code}`);
  check("dead(接上).话里说清「残留记录」与下一步", /残留记录/.test(dead.json?.message || "") && Boolean(dead.json?.hint), (dead.json?.message || "").slice(0, 70));
};

/** 命名管道（Windows 细节：另一条本地通道） */
phases.pipe = async () => {
  const ud = tmp("pipe");
  const inst = launch({ tag: "pipe", mode: "pipe", userData: ud });
  const rec = await waitFor(() => (readRecord(ud)?.listening ? readRecord(ud) : null), { timeoutMs: 40000 });
  if (!rec) {
    check("pipe.命名管道建起", false, `记录=${JSON.stringify(readRecord(ud))} 日志尾=${inst.log().slice(-400)}`);
    kill(inst);
    await waitExited(inst);
    return;
  }
  check("pipe.命名管道建起（transport=pipe）", rec.endpoint?.transport === "pipe", rec.endpoint?.pipe);
  check("pipe.管道名含 userData 摘要（多实例不撞名）", /^\\\\\.\\pipe\\linkdesk-m4spike-[0-9a-f]{8}$/.test(rec.endpoint.pipe), rec.endpoint.pipe);

  const ping = cliJson(["ping"], { userData: ud });
  check("pipe.✨ 一条 CLI 命令走命名管道真读到实例", ping.code === 0 && ping.json?.result?.pid === inst.pid, `应答 pid=${ping.json?.result?.pid} spawn=${inst.pid}`);
  check("pipe.管道下认人依旧对齐", ping.json?.result?.pid === inst.pid, "pid 一致");

  // 管道 + 壳缝：控制读数（与 tcp 阶段同款，证明**两条通道都能真控制**，不只是都能 ping）
  const seam = await waitShellSeam(ud, 40000);
  check("pipe.环境前置：壳缝通", seam.ok, seam.ok ? `${seam.ms}ms 内通` : seam.last);
  const beforeTabs = cliJson(["tabs"], { userData: ud }).json?.result?.windows?.flatMap((w) => (w.groups || []).flatMap((g) => g.tabs || [])) || [];
  const execP = cliJson(["exec", "app.openAiManual"], { userData: ud });
  const afterTabs = cliJson(["tabs"], { userData: ud }).json?.result?.windows?.flatMap((w) => (w.groups || []).flatMap((g) => g.tabs || [])) || [];
  check("pipe.管道下也走得到壳（读快照）", afterTabs.length > 0, `tabs=${afterTabs.map((t) => t.id).join(",")}`);
  check(
    "pipe.✨ 管道下 exec 一条命令也真控制得住（ai-manual 由无到有）",
    execP.code === 0 && !hasAiManual(beforeTabs) && hasAiManual(afterTabs),
    `before=${hasAiManual(beforeTabs)} after=${hasAiManual(afterTabs)}`,
  );

  kill(inst);
  await waitExited(inst);
};

/** 「只开回环」是配置结果、不是代码假设（绑 127.0.0.2 也成立） */
phases.bind = async () => {
  const ud = tmp("bind");
  const inst = launch({ tag: "bind", mode: "tcp", port: 0, host: "127.0.0.2", userData: ud });
  const rec = await waitFor(() => (readRecord(ud)?.listening ? readRecord(ud) : null), { timeoutMs: 40000 });
  if (!rec) {
    check("bind.改绑 127.0.0.2 成功", false, `记录=${JSON.stringify(readRecord(ud))}`);
    kill(inst);
    await waitExited(inst);
    return;
  }
  check("bind.地址取自配置（记录里就是 127.0.0.2）", rec.endpoint?.host === "127.0.0.2", JSON.stringify(rec.endpoint));
  const ping = cliJson(["ping"], { userData: ud });
  check("bind.该地址上一条命令真通", ping.code === 0 && ping.json?.result?.pid === inst.pid, `往返成功 pid=${ping.json?.result?.pid}`);
  check("bind.（如实）代码里没有「非本机即拒」的分支", true, "回环是默认值 ⇒ 换地址不改码；⚠️ 跨机绑定本轮未实测");

  // 反证：同一个端口在**默认回环** 127.0.0.1 上没人听 ⇒ 证明它真绑在 127.0.0.2，不是「两个都听」
  const refused = await new Promise((res) => {
    const s = net.createConnection({ host: "127.0.0.1", port: rec.endpoint.port });
    const t = setTimeout(() => {
      s.destroy();
      res({ ok: false, code: "TIMEOUT" });
    }, 3000);
    s.on("connect", () => {
      clearTimeout(t);
      s.destroy();
      res({ ok: true });
    });
    s.on("error", (e) => {
      clearTimeout(t);
      res({ ok: false, code: e.code });
    });
  });
  check("bind.✗ 负控：同端口在 127.0.0.1 上无人听", refused.ok === false, `code=${refused.code}（期望 ECONNREFUSED）`);

  kill(inst);
  await waitExited(inst);
};

/** 监听失败不许静默：端口被占 ⇒ 记录里写 EADDRINUSE，CLI 说出来 */
phases.portbusy = async () => {
  const ud = tmp("portbusy");
  const squatter = net.createServer(() => {});
  const port = await new Promise((res) => squatter.listen(0, "127.0.0.1", () => res(squatter.address().port)));

  const inst = launch({ tag: "portbusy", mode: "tcp", port, host: "127.0.0.1", userData: ud });
  const rec = await waitFor(() => {
    const r = readRecord(ud);
    return r && (r.lastError || r.listening) ? r : null;
  }, { timeoutMs: 40000 });

  check("portbusy.软件照常起（通道失败不拖垮主程序）", Boolean(rec), rec ? `pid=${rec.pid}` : "无记录");
  check("portbusy.🔴 监听失败被记下（不静默）", rec?.lastError === "EADDRINUSE", `lastError=${rec?.lastError}`);
  const r = cliJson(["ping"], { userData: ud });
  check("portbusy.CLI 报 LAST_FAILED（不是「开关关着」）", r.json?.code === "LAST_FAILED", `code=${r.json?.code}`);
  check("portbusy.话里点名端口被占 + 下一步", /EADDRINUSE/.test(r.json?.message || "") && /端口/.test(r.json?.hint || ""), (r.json?.hint || "").slice(0, 60));

  kill(inst);
  await waitExited(inst);
  await new Promise((res) => squatter.close(res));
};

/** 多实例：第二只抢不到锁 ⇒ 必须什么都不做（不抢绑端口、不改写记录） */
phases.multi = async () => {
  const ud = tmp("multi");
  const a = launch({ tag: "multi-a", mode: "tcp", port: 0, userData: ud });
  const recA = await waitFor(() => (readRecord(ud)?.listening ? readRecord(ud) : null), { timeoutMs: 40000 });
  if (!recA) {
    check("multi.实例 A 起来", false, JSON.stringify(readRecord(ud)));
    kill(a);
    await waitExited(a);
    return;
  }
  const pingA1 = cliJson(["ping"], { userData: ud });

  // 第二只：同一 userData ⇒ 同一个单实例锁域；⛔ 不带任何调试开关（免得触发 M5 的重启路线）
  const b = launch({ tag: "multi-b", mode: "tcp", port: 0, userData: ud });
  const bExited = await waitExited(b, 15000);
  check("multi.第二只自己退出了（单实例锁生效）", bExited, `exitCode=${b.child.exitCode}`);

  const recA2 = readRecord(ud);
  check("multi.🔴 记录 pid 未被第二只改写", recA2?.pid === recA.pid, `现在 pid=${recA2?.pid} 原 pid=${recA.pid}`);
  check("multi.🔴 记录仍说 listening（第二只没把它改成失败）", recA2?.listening === true && !recA2?.lastError, `listening=${recA2?.listening} lastError=${recA2?.lastError}`);
  const pingA2 = cliJson(["ping"], { userData: ud });
  check("multi.第一只照常服务（CLI 仍通、pid 不变）", pingA2.code === 0 && pingA2.json?.result?.pid === a.pid, `pid=${pingA2.json?.result?.pid}`);
  check("multi.壳窗仍只有 1 只（第二只没开新窗）", pingA2.json?.result?.shellWindows === 1, `shellWindows=${pingA2.json?.result?.shellWindows}（前值 ${pingA1.json?.result?.shellWindows}）`);

  kill(a);
  await waitExited(a);

  // ── 负控：把启动门拆掉，看第二只到底会干什么（证明这道门不是摆设）──
  const ud2 = tmp("multi-noguard");
  const a2 = launch({ tag: "multi-noguard-a", mode: "tcp", port: 0, userData: ud2 });
  const recA2first = await waitFor(() => (readRecord(ud2)?.listening ? readRecord(ud2) : null), { timeoutMs: 40000 });
  if (!recA2first) {
    check("multi(负控).实例 A 起来", false, JSON.stringify(readRecord(ud2)));
  } else {
    const b2 = launch({ tag: "multi-noguard-b", mode: "tcp", port: 0, userData: ud2, extraEnv: { LINKDESK_M4_SPIKE_NO_LOCK_GUARD: "1" } });
    await Promise.race([waitExited(b2, 15000), sleep(15000)]);
    const recNeg = readRecord(ud2);
    const clobbered = recNeg?.pid !== recA2first.pid || recNeg?.lastError || recNeg?.listening === false;
    check(
      "multi(负控).拆掉启动门 ⇒ 记录被第二只污染（证明门有用）",
      clobbered,
      `pid ${recA2first.pid} → ${recNeg?.pid} lastError=${recNeg?.lastError} listening=${recNeg?.listening}`,
    );
    const after = cliJson(["ping"], { userData: ud2 });
    check("multi(负控).污染后 CLI 会误报（正是要避免的假警报）", after.code !== 0 || after.json?.result?.pid !== recA2first.pid, `code=${after.json?.code} pid=${after.json?.result?.pid}`);
    kill(b2);
    kill(a2);
  }
  await waitExited(a2);
};

/** MCP 冷启动悖论：软件没开时，客户端拿到的是什么 */
phases.mcp = async () => {
  const empty = tmp("mcp-offline");
  fs.mkdirSync(empty, { recursive: true });

  // ① 真·无记录（软件从没跑过）
  const s1 = await mcpSession([{ jsonrpc: "2.0", id: 1, method: "tools/list" }], { userData: empty });
  const l1 = s1.lines[0]?.result;
  check("mcp(无记录).tools/list 立刻应答（⛔ 不挂死）", Boolean(l1?.tools?.length), `${s1.totalMs}ms 内应答`);
  check("mcp(无记录).清单退回静态表并标明来源", String(l1?._meta?.catalogSource || "").includes("静态表"), l1?._meta?.catalogSource);
  check("mcp(无记录).每个工具带离线警示", (l1?.tools || []).slice(1).every((t) => t.description.includes("离线")), `tools=${l1?.tools?.length}`);

  const s2 = await mcpSession([{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "linkdesk_status", arguments: {} } }], { userData: empty });
  const t2 = s2.lines[0]?.result?.content?.[0]?.text || "";
  check("mcp(无记录).linkdesk_status 离线可用（读文件面）", /状态: 离线/.test(t2) && /NO_RECORD/.test(t2), `${s2.totalMs}ms ${t2.split("\n")[1]}`);
  check("mcp(无记录).status 给出下一步（不是死胡同）", t2.includes("下一步"), t2.split("\n").slice(-1)[0].slice(0, 60));

  const s3 = await mcpSession([{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "tabs", arguments: {} } }], { userData: empty });
  const r3 = s3.lines[0]?.result;
  check("mcp(无记录).要软件的工具 ⇒ isError + 可读原因", r3?.isError === true && /软件不在服务状态/.test(r3?.content?.[0]?.text || ""), `${s3.totalMs}ms`);
  check("mcp(无记录).🔴 立即返回，不挂死", s3.totalMs < 3000, `${s3.totalMs}ms（默认 WAIT_MS=0 ⇒ 不傻等）`);

  // ② 负控：软件在跑、但强制离线（模拟「客户端拉起时软件没开」且不等信号）
  const ud = tmp("mcp-forced");
  const inst = launch({ tag: "mcp-forced", mode: "tcp", port: 0, userData: ud });
  const rec = await waitFor(() => (readRecord(ud)?.listening ? readRecord(ud) : null), { timeoutMs: 40000 });
  if (!rec) {
    check("mcp(强制离线).实例起来", false, JSON.stringify(readRecord(ud)));
  } else {
    const s4 = await mcpSession([{ jsonrpc: "2.0", id: 1, method: "tools/list" }], { userData: ud, env: { LINKDESK_MCP_FORCE_OFFLINE: "1" } });
    const l4 = s4.lines[0]?.result;
    check("mcp(强制离线).仍应答 + 标明静态表", String(l4?._meta?.catalogSource || "").includes("静态表"), `online=${l4?._meta?.online}`);
    check("mcp(强制离线).连得上时同一 server 会自省（对比：本条应为 false）", l4?._meta?.online === false, `online=${l4?._meta?.online}`);

    // ③ 「等多久」是可配的：WAIT_MS=0（默认）立刻回；WAIT_MS>0 时等一等再说
    const s5 = await mcpSession([{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "tabs", arguments: {} } }], {
      userData: ud,
      env: { LINKDESK_MCP_FORCE_OFFLINE: "1", LINKDESK_MCP_WAIT_MS: "800" },
    });
    const r5 = s5.lines[0]?.result;
    check("mcp(等多久可配).WAIT_MS=800 真等约 800ms 再报原因", s5.totalMs >= 700, `${s5.totalMs}ms`);
    check("mcp(等多久可配).等满后如实说出「等了多久」", /等了 \d+ms/.test(r5?.content?.[0]?.text || ""), (r5?.content?.[0]?.text || "").slice(0, 60));
  }
  kill(inst);
  await waitExited(inst);
};

/** 与产品代码解耦：软件侧一行未改 */
phases.decouple = async () => {
  const r = spawnSync("git", ["status", "--porcelain", "--", "src", "electron", "packages", "plugins", "cli"], { cwd: ROOT, encoding: "utf8" });
  const dirty = (r.stdout || "").trim();
  check("decouple.产品路径无改动（src/electron/packages/plugins/cli）", dirty === "", dirty ? dirty.split("\n").slice(0, 5).join(" | ") : "空");
  const rd = spawnSync("git", ["status", "--porcelain", "--", "docs/04-软件更新/00-README.md"], { cwd: ROOT, encoding: "utf8" });
  check("decouple.用户手上的 00-README.md 干净", (rd.stdout || "").trim() === "", (rd.stdout || "").trim() || "干净");
};

// ── 主流程 ──────────────────────────────────────────────────────
const ORDER = ["norecord", "off", "tcp", "pipe", "bind", "portbusy", "multi", "mcp", "decouple"];

/** 清掉**本脚本自己**上一轮留下的实例（userData 带 `ldk-m4spike-` 标记）——⛔ 绝不碰用户的实例 */
function killStrayInstances() {
  if (process.platform !== "win32") return 0;
  const ps = [
    "$p = Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | Where-Object { $_.CommandLine -match 'ldk-m4spike-' };",
    "$p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };",
    "$p.Count",
  ].join(" ");
  const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" });
  return Number((r.stdout || "0").trim()) || 0;
}

async function main() {
  if (!JSON_OUT) {
    console.log(`m4-spike 验收（AI#31）—— 阶段: ${ONLY || "全部"}`);
    console.log(`  hook=${path.relative(ROOT, HOOK)}  electron=${path.relative(ROOT, ELECTRON)}`);
    console.log(`  ⚠️ 需要 Vite dev server（隔离实例走 isDev 轨道）`);
  }

  // ── 环境前置（不修环境，只把它说清楚）──
  const stray = killStrayInstances();
  if (stray) check("preflight.清掉上一轮遗留实例", true, `${stray} 只（只清 userData 含 ldk-m4spike- 的）`);
  const vite = await fetch("http://localhost:1420")
    .then((r) => r.status)
    .catch(() => 0);
  check("preflight.Vite dev server 可达（dev 轨道前置）", vite === 200, `HTTP ${vite}${vite === 200 ? "" : " ⇒ 先 `npm run dev`；实例会卡在启动图（本棒踩过）"}`);

  const list = ONLY ? ONLY.split(",") : ORDER;
  for (const name of list) {
    const fn = phases[name];
    if (!fn) {
      check(`phase.${name}`, false, "未知阶段");
      continue;
    }
    if (!JSON_OUT) console.log(`\n[${name}]`);
    try {
      await fn();
    } catch (e) {
      check(`phase.${name}.异常`, false, (e && e.stack ? e.stack.split("\n")[0] : String(e)));
    }
  }
  const failed = results.filter((r) => !r.ok);
  if (JSON_OUT) {
    console.log(JSON.stringify({ results, failed: failed.length, total: results.length }, null, 2));
  } else {
    console.log(`\n读数 ${results.length} 条：通过 ${results.length - failed.length} · 未过 ${failed.length}`);
    if (failed.length) for (const f of failed) console.log(`  ✗ ${f.id}  ${f.detail}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main();
