#!/usr/bin/env node
/**
 * AI#44 验收器 —— 「**任一通道**可完整走通『开标签 → 执行命令 → 读通知 → 执行通知按钮』全链路」。
 *
 * 判据原文（[`03-任务档案/M4-通道.md`](../../../docs/04-软件更新/已落地/AI友好化-全自动操作/03-任务档案/M4-通道.md)）：
 *   任一通道 ⇒ **CLI 与 MCP 各跑一遍**——两条皮**共用内核但皮不同**，皮的 bug 只会在自己那条上露
 *   （⛔ 不用 CLI 的绿冒充 MCP 的绿）。
 *
 * ## 它与 spike 验收器（`scripts/dev/m4-spike/accept.mjs`）的分工
 *
 * | | spike `AI#31` | 本件 `AI#44` |
 * |---|---|---|
 * | 跑什么 | **原型**（注入式 hook，产品码零改动） | **产品**（真 `linkdeskctl` + 真 `linkdeskctl mcp`） |
 * | 验什么 | 通道能不能用（四判据） | **一条业务链能不能走完**（开标签 → 命令 → 通知 → 按钮） |
 * | 实例 | 自己起、自己杀（独占端口） | **脚手架外已起**（见 README），本件只**从外部观察** |
 *
 * ## 三条纪律（照 spike 换来的，⛔ 别重犯）
 *
 * ① **认人看身份**：每次调用前 `ping`，应答 pid 必须等于记录 pid（M5「存在 ≠ 是它」）。
 * ② **证人要独立**：业务链每一步都有**两个读面**——本通道（`tabs`/`notifications` 操作）＋
 *    **绕开通道的 CDP 读面**（池 DOM：标签条 / 确认门 / 通知面板）。单读面的绿不算绿。
 * ③ **负控必须真跑**：只读「正控全绿」不够——本件每条负控都**故意让它在错的前提上跑**
 *    （命令面还没有的命令 / 不存在的按钮 / 不存在的通知 id / 没有 command 的按钮），
 *    证明读数不是恒绿。
 *
 * ## 🔴 这一条链里「用户」在哪
 *
 * `marketplace.retryInstall` **自带确认门**（E6#71k「都问」）⇒ AI 发起 ≠ 装成：
 * 门弹出、**用户点确认**、才继续。验收器扮演的就是那一下（CDP `el.click()`，**非坐标**——
 * 照 §三 验收面第 1 条）。因此本链的读数**天然含「装 = 问一声」这个语义**（AI#29）：
 * 没有那一下，后面那条带 command 的通知根本不会出现。
 *
 * ## 用法（前置见同夹 README.md）
 *
 * ```
 * # 隔离实例已起（真 dev 实例 + LINKDESK_USER_DATA + LINKDESK_CDP 指过去）
 * LINKDESK_USER_DATA=<iso> LINKDESK_CDP=http://127.0.0.1:9444 node scripts/dev/m4-fullchain/accept.mjs
 * … --channel cli      # 只跑 CLI 通道
 * … --channel mcp      # 只跑 MCP 通道
 * … --json             # 机读全部读数
 * ```
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { listTargets, withTarget, labelOf, CDP_BASE, sleep } from "../lib/cdp.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const CLI = path.join(ROOT, "cli", "linkdeskctl", "linkdeskctl.mjs");
/** 被装的那只插件包（仓外兄弟仓；⛔ 不是 bundled 种子——种子里那六只装不上也验不了「装」） */
const DEFAULT_PKG = path.resolve(ROOT, "..", "linkdesk-plugins", "official", "serial-monitor", "serial-monitor.linkdesk-plugin");

const argv = process.argv.slice(2);
const argOf = (flag, dflt = null) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
const JSON_OUT = argv.includes("--json");
const CHANNEL = argOf("--channel", "both");
const PKG = argOf("--plugin-package", DEFAULT_PKG);
const USER_DATA = process.env.LINKDESK_USER_DATA || null;
/** 本轮起点——账本条目按时间过滤，⛔ 不拿上一腿留下的条目充数 */
const T0 = Date.now();
/** 那条「坏地址」——端口 9（discard）+ 本机回环 ⇒ 立刻 ECONNREFUSED，不依赖外网、不等待超时 */
const BAD_URL = "http://127.0.0.1:9/nope.linkdesk-plugin";
const PLUGIN_ID = "serial-monitor";

/* ── 读数收集 ── */

const readings = [];
function check(id, ok, detail) {
  readings.push({ id, ok: !!ok, detail: String(detail ?? "") });
  if (!JSON_OUT) console.log(`  ${ok ? "✔" : "✗"} ${id.padEnd(30)} ${detail ?? ""}`);
  return !!ok;
}
/** 跳过（**如实**记，⛔ 不当绿）：负控只在「净态」成立，非净态跑出来的绿是假的 */
function checkSkip(id, detail) {
  readings.push({ id, ok: true, skip: true, detail: `跳过：${detail}` });
  if (!JSON_OUT) console.log(`  ○ ${id.padEnd(30)} 跳过：${detail}`);
  return true;
}
const note = (text) => !JSON_OUT && console.log(`    · ${text}`);
const head = (text) => !JSON_OUT && console.log(`\n── ${text} ──`);

/* ── CDP 证人（池 DOM——绕开本通道的第二个读面） ── */

const poolTarget = async () => (await listTargets()).find((t) => labelOf(t.url) === "pool");
const poolEval = async (expr) => withTarget(await poolTarget(), (s) => s.evaluate(expr));

const EXPR_TABS = `(function () {
  return [...document.querySelectorAll('.ldk-group-tab-item .ldk-group-tab-label')].map(function (e) { return e.textContent.trim(); });
})()`;

const EXPR_DIALOG = `(function () {
  var pane = document.querySelector('.ldk-dialog-host-panel');
  if (!pane) return { dialog: false };
  return {
    dialog: true,
    text: pane.innerText.replace(/\\s+/g, ' ').slice(0, 240),
    buttons: [...pane.querySelectorAll('button')].map(function (b) { return b.textContent.trim(); }),
  };
})()`;

const EXPR_NOTIF = `(function () {
  var items = [...document.querySelectorAll('.ldk-notif-panel-item')];
  return items.map(function (i) {
    return {
      text: i.innerText.replace(/\\s+/g, ' ').slice(0, 160),
      actions: [...i.querySelectorAll('.ldk-notif-action-btn')].map(function (b) { return b.textContent.trim(); }),
    };
  });
})()`;

/** 门按钮是**插件自绘**的（富内容卡）⇒ 一律按文案挑，⛔ 不认 host 的类名（skeleton 会漂） */
const EXPR_CLICK_GATE = `(function () {
  var pane = document.querySelector('.ldk-dialog-host-panel');
  if (!pane) return { clicked: null, reason: 'no-dialog' };
  var btns = [...pane.querySelectorAll('button')];
  var hit = btns.filter(function (b) { return /^(?!.*取消).*(确认|确定|安装|重试|继续|下载|重启)/.test(b.textContent.trim()); })[0]
         || pane.querySelector('.ldk-dialog-host-btn-primary');
  if (!hit) return { clicked: null, reason: 'no-match', buttons: btns.map(function (b) { return b.textContent.trim(); }) };
  var label = hit.textContent.trim();
  hit.click();
  return { clicked: label };
})()`;

/** 等门 → 记读数 → 点确认（一次做完：门的生命期短，分两次取会错过） */
async function clickGate(id, { timeoutMs = 20000, expect = null } = {}) {
  const t0 = Date.now();
  for (;;) {
    const d = await poolEval(EXPR_DIALOG);
    if (d.dialog) {
      const okShape = expect ? expect.test(d.text) : true;
      check(`${id}.门出现`, okShape, `${Date.now() - t0}ms · ${d.text}`);
      const c = await poolEval(EXPR_CLICK_GATE);
      check(`${id}.点确认`, c.clicked !== null, `clicked=${JSON.stringify(c.clicked)} buttons=${JSON.stringify(d.buttons)}`);
      return { gate: d, click: c };
    }
    if (Date.now() - t0 > timeoutMs) {
      check(`${id}.门出现`, false, `等了 ${timeoutMs}ms 没出现`);
      return { gate: null, click: null };
    }
    await sleep(120);
  }
}

/* ── 通道皮（CLI / MCP）——统一成 { ok, code, result } 一个形状 ── */

/** 子命令 + argv 拼法（照 `cli/linkdeskctl/linkdeskctl.mjs` 的 buildRequest） */
function cliArgv(op, p = {}) {
  switch (op) {
    case "exec": return ["exec", p.commandId, ...(p.args ?? []).map((a) => JSON.stringify(a))];
    case "notifyAction": return ["notify-action", p.notificationId, String(p.action)];
    case "install": return ["install", p.source];
    case "openTab": return ["open-tab", p.type, ...(p.opts ? ["--opts", JSON.stringify(p.opts)] : [])];
    case "log": return ["log", ...(p.limit ? ["--limit", String(p.limit)] : [])];
    default: return [op === "openTab" ? "open-tab" : op.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())];
  }
}

const stripAnsi = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, "");

/** CLI 一次调用（真子进程；异步——因为要在调用在途时去点门） */
function cliCall(op, p = {}, { timeoutMs = 60000 } = {}) {
  const args = [CLI, ...cliArgv(op, p), "--json", "--timeout", String(timeoutMs)];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env: { ...process.env, LINKDESK_USER_DATA: USER_DATA },
      windowsHide: true,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      // ⚠️ CLI 的 `--json` **成功时打多行美化 JSON、失败时打单行紧凑 JSON**——按「最后一行」解析
      //    只对失败有效（首跑实测：成功全被误判成 ✗ 假红）。按**第一个 `{` 起**整体解析，两种都吃。
      const text = stripAnsi(out).trim();
      let parsed = null;
      const brace = text.indexOf("{");
      if (brace >= 0) {
        try {
          parsed = JSON.parse(text.slice(brace));
        } catch {
          /* 真非 JSON（用法/崩溃）——原样留证 */
        }
      }
      resolve({
        ok: !!(parsed && parsed.ok),
        code: (parsed && parsed.code) || (parsed ? null : "ECLI"),
        servedBy: parsed && parsed.servedBy,
        recordPid: parsed && parsed.recordPid,
        result: parsed ? parsed.result : null,
        raw: text.slice(0, 600) + (err ? ` | stderr: ${stripAnsi(err).slice(0, 300)}` : "") + (code !== 0 ? ` | exit=${code}` : ""),
      });
    });
  });
}

/* ── MCP 皮：一条常驻 stdio 会话（⛔ 不每次重开——「一次会话能不能走完一条链」本身是判据） ── */

function mcpStart() {
  const child = spawn(process.execPath, [CLI, "mcp", "--user-data-dir", USER_DATA], {
    cwd: ROOT,
    env: { ...process.env, LINKDESK_USER_DATA: USER_DATA },
    windowsHide: true,
  });
  let buf = "";
  const waiters = new Map();
  let seq = 0;
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  child.stdout.on("data", (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg = null;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const w = waiters.get(msg.id);
      if (w) {
        waiters.delete(msg.id);
        w(msg);
      }
    }
  });
  const send = (method, params, timeoutMs = 60000) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        waiters.delete(id);
        reject(new Error(`MCP ${method} 超时（${timeoutMs}ms）`));
      }, timeoutMs);
      waiters.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  return {
    send,
    notify: (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n"),
    stderr: () => stderr,
    close: () => child.kill(),
  };
}

/** MCP 一次 tools/call ⇒ 统一形状（错误码在正文里，形如 `[EUNKNOWN] …`） */
async function mcpCall(session, tool, payload = {}, { timeoutMs = 60000 } = {}) {
  const msg = await session.send("tools/call", { name: tool, arguments: payload }, timeoutMs);
  if (msg.error) return { ok: false, code: "ERPC", result: null, raw: JSON.stringify(msg.error) };
  const text = (msg.result?.content ?? []).map((c) => c.text ?? "").join("\n");
  const isError = msg.result?.isError === true;
  const m = /\b(EOP|EUNKNOWN|EARGS|ENOTFOUND|ENOACTION|ESHELLTIMEOUT|ESHELLERROR|EPROTO|NO_RECORD|SWITCH_OFF|LAST_FAILED|APP_EXITED|REFUSED|TIMEOUT|EAUTH|STALE_IDENTITY)\b/.exec(text);
  let result = null;
  try {
    result = JSON.parse(text);
  } catch {
    /* 纯文本（status / 错误）——留在 raw */
  }
  return { ok: !isError, code: m ? m[1] : null, result, raw: text.slice(0, 500) };
}

const TOOL = {
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

/* ── 一条通道跑完「开标签 → 执行命令 → 读通知 → 执行通知按钮」（＋负控 ＆ 账本） ── */

async function runChain(ch, call) {
  head(`通道 ${ch}：开标签 → 执行命令 → 读通知 → 执行通知按钮`);

  /* S0 前置 */
  const record = JSON.parse(fs.readFileSync(path.join(USER_DATA, "ai-bridge.json"), "utf8"));
  check(`${ch}-S0.1`, record.enabled === true && record.listening === true, `enabled=${record.enabled} listening=${record.listening} pid=${record.pid} ${record.endpoint?.host}:${record.endpoint?.port}`);
  const pong = await call("ping", {});
  check(`${ch}-S0.2`, pong.ok && pong.result?.pid === record.pid, `认人：应答 pid=${pong.result?.pid} == 记录 pid=${record.pid}`);

  /* S0.3/S0.4 就绪门 —— 冷启动窗口（首跑实测）：记录刚写 listening，壳还没法应答**读**，
     此时 describe/exec 全 8 秒超时 ⇒ 一串假红。等它活，并把等待时长当读数如实记下。 */
  const tReady = Date.now();
  let readyCmds = 0;
  while (Date.now() - tReady < 90000) {
    const d = await call("describe", {});
    readyCmds = (d.result?.commands ?? []).length;
    if (d.ok && readyCmds > 0) break;
    await sleep(1000);
  }
  check(`${ch}-S0.3 壳读面就绪`, readyCmds > 0, `等 ${((Date.now() - tReady) / 1000).toFixed(1)}s 后命令面 ${readyCmds} 条（冷启动时延）`);
  const tWarm = Date.now();
  let warmOk = false;
  let warmCode = null;
  while (Date.now() - tWarm < 60000) {
    const w = await call("exec", { commandId: "view.zoomReset", args: [] });
    warmOk = w.ok;
    warmCode = w.code;
    if (w.ok) break;
    await sleep(1000);
  }
  check(`${ch}-S0.4 命令路径就绪`, warmOk, `暖机命令 view.zoomReset ⇒ ok=${warmOk}（等 ${((Date.now() - tWarm) / 1000).toFixed(1)}s${warmCode ? ` · 末次 code=${warmCode}` : ""}）`);

  /* S1 开标签＋白名单生长（负控在前：命令面还没有它） */
  const before = await call("describe", {});
  const idsBefore = (before.result?.commands ?? []).map((c) => c.id);
  const alreadyLoaded = idsBefore.includes("marketplace.retryInstall");
  if (alreadyLoaded) {
    checkSkip(`${ch}-S1.1 负控`, "本实例已加载过市场（命令面已挂牌）——负控只在净态成立，净态重启步骤见 README");
  } else {
    const neg0 = await call("exec", { commandId: "marketplace.retryInstall", args: [{ pluginId: PLUGIN_ID, downloadUrl: BAD_URL }] });
    check(`${ch}-S1.1 负控`, !neg0.ok && neg0.code === "EUNKNOWN", `命令面${idsBefore.length}条里没有 marketplace.retryInstall ⇒ ${neg0.code}（运行期派生的白名单真在现取）`);
  }

  const opened = await call("openTab", { type: "marketplace" });
  check(`${ch}-S1.2`, opened.ok && opened.result?.accepted === true, `open-tab marketplace ⇒ accepted（tabs:create 是 fire 型，成不成看下一行）`);
  await sleep(1500);
  const tabs = await call("tabs", {});
  const tabList = JSON.stringify(tabs.result ?? "");
  check(`${ch}-S1.3 回读`, /marketplace/.test(tabList), `tabs 回读含 marketplace：${JSON.stringify(tabs.result).slice(0, 140)}`);
  const domTabs = await poolEval(EXPR_TABS);
  check(`${ch}-S1.4 CDP证人`, domTabs.some((t) => t.includes("插件市场")), `池标签条 = ${JSON.stringify(domTabs)}`);

  const after = await call("describe", {});
  const idsAfter = (after.result?.commands ?? []).map((c) => c.id);
  const grew = idsAfter.filter((i) => i.startsWith("marketplace."));
  check(`${ch}-S1.5 生长`, grew.includes("marketplace.retryInstall"), `命令面 ${idsBefore.length} → ${idsAfter.length}，新挂牌 = ${JSON.stringify(grew)}（「挂牌即进名单」）`);

  /* S2 执行命令：一条**真带 command 的活通知**的造法 = 市场安装失败链 */
  const pendingExec = call("exec", { commandId: "marketplace.retryInstall", args: [{ pluginId: PLUGIN_ID, downloadUrl: BAD_URL }] });
  const gate1 = await clickGate(`${ch}-S2.1`, { expect: /串口监视器|确认安装/ });
  const execRes = await pendingExec;
  check(`${ch}-S2.2`, execRes.ok, `exec 严格回执：ok=${execRes.ok} code=${execRes.code ?? "-"} ${execRes.raw.slice(0, 120)}`);
  await sleep(1200);
  const notifs1 = await call("notifications", {});
  const items1 = (notifs1.result?.groups ?? []).flatMap((g) => g.items ?? []);
  const withCmd = items1.filter((i) => (i.actions ?? []).some((a) => a.command === "marketplace.retryInstall"));
  check(`${ch}-S2.3`, withCmd.length >= 1, `通知面板 ${items1.length} 条，其中带 command 的 ${withCmd.length} 条：id=${withCmd[0]?.id} 「${withCmd[0]?.message}」`);
  const domNotif1 = await poolEval(EXPR_NOTIF);
  check(`${ch}-S2.4 CDP证人`, domNotif1.some((i) => i.actions.includes("重试")), `池通知面板 = ${JSON.stringify(domNotif1.map((i) => i.actions))}（按钮真在用户看得见的地方）`);

  /* S3 读通知 */
  const target = withCmd[0];
  const a0 = (target?.actions ?? [])[0];
  check(`${ch}-S3.1`, !!target && a0?.command === "marketplace.retryInstall" && a0?.args?.[0]?.pluginId === PLUGIN_ID, `按钮事实随行：command=${a0?.command} args=${JSON.stringify(a0?.args)}（M1 AI#2 的 command/args 经 DTO 活着）`);
  if (!target) {
    checkSkip(`${ch}-S3.2~S4 余下`, "S2.3 没造出带 command 的通知 ⇒ 链在此断（上游 ✗ 已记，不拿 CDP 冒充）");
    return { target: null, chainBroken: true };
  }
  const neg1 = await call("notifyAction", { notificationId: target.id, action: "没有这个按钮" });
  check(`${ch}-S3.2 负控`, !neg1.ok && neg1.code === "ENOTFOUND", `乱点名按钮 ⇒ ${neg1.code}`);

  /* S4 执行通知按钮 */
  const pendingPress = call("notifyAction", { notificationId: target.id, action: "重试" });
  const gate2 = await clickGate(`${ch}-S4.1`, { expect: /串口监视器|确认安装/ });
  const pressRes = await pendingPress;
  check(`${ch}-S4.2`, pressRes.ok && pressRes.result?.pressed === true && pressRes.result?.command === "marketplace.retryInstall", `按按钮 = 跑命令：pressed=${pressRes.result?.pressed} command=${pressRes.result?.command} code=${pressRes.code ?? "-"}`);
  await sleep(1500);
  const notifs2 = await call("notifications", {});
  const items2 = (notifs2.result?.groups ?? []).flatMap((g) => g.items ?? []);
  const newOnes = items2.filter((i) => i.id !== target.id && (i.actions ?? []).some((a) => a.command === "marketplace.retryInstall"));
  check(`${ch}-S4.3 双证人`, newOnes.length >= 1, `按钮那一下又跑出一条**新**的带 command 通知：${newOnes.map((i) => i.id).join(",") || "（无）"}（旧 ${target.id} + 新 = ${items2.length} 条）`);
  const domNotif2 = await poolEval(EXPR_NOTIF);
  check(`${ch}-S4.4 CDP证人`, domNotif2.length >= 2, `池面板条数 ${domNotif1.length} → ${domNotif2.length}`);
  const neg2 = await call("notifyAction", { notificationId: "toast-不存在", action: "重试" });
  check(`${ch}-S4.5 负控`, !neg2.ok && neg2.code === "ENOTFOUND", `乱点通知 id ⇒ ${neg2.code}`);

  /* S5 账本（⛔ 只认**本轮**条目：账本文件跨重启累加，不按时间过滤会拿上一腿的绿冒充） */
  const log = await call("log", { limit: 200 });
  const entries = (log.result?.entries ?? []).filter((e) => !e.ts || Date.parse(e.ts) >= T0);
  const execHits = entries.filter((e) => e.ok && e.op === "exec" && e.arg === "marketplace.retryInstall");
  const pressHits = entries.filter((e) => e.ok && e.op === "notifyAction");
  check(`${ch}-S5.1`, execHits.length >= 1 && pressHits.length >= 1, `账本本轮：exec(arg=marketplace.retryInstall) 成功 ${execHits.length} 条 · notifyAction 成功 ${pressHits.length} 条（arg 只对 exec/install 记，见残余）`);
  const rejected = entries.filter((e) => !e.ok && e.code === "EUNKNOWN");
  check(`${ch}-S5.2 负控留痕`, rejected.length >= 1, `先记后判：被拒的那条也在账上（ok=false code=EUNKNOWN），本轮 ${rejected.length} 条／账本读完 ${(log.result?.entries ?? []).length} 条`);

  return { target, gate1, gate2 };
}

/* ── AI#19 ① 复验：装一个插件 → 打开它 → 操作它（CLI 全套；MCP 交叉验一条命令） ── */

async function runAi19(tag, primary, cross) {
  head(`M5 AI#19 ① 复验（${tag} 腿）：装一个插件 → 打开它 → 操作它（⛔ 全程走通道，不拿 CDP 冒充）`);
  check(`${tag}-S6.0 前置`, fs.existsSync(PKG), `插件包在盘上：${PKG}`);

  const before = await primary("describe", {});
  const idsBefore = (before.result?.commands ?? []).map((c) => c.id);
  check(`${tag}-S6.1 装前`, !idsBefore.some((i) => i.startsWith("serial-monitor.")), `命令面 ${idsBefore.length} 条，无 serial-monitor.*（净态：上一腿装完已卸干净）`);

  const pendingInstall = primary("install", { source: PKG }, { timeoutMs: 180000 });
  const gate = await clickGate(`${tag}-S6.2`, { expect: /AI 请求安装插件|确认/ });
  const inst = await pendingInstall;
  check(`${tag}-S6.3 装`, inst.ok && inst.result?.installed === true, `install ⇒ installed=${inst.result?.installed} job=${JSON.stringify(inst.result?.job).slice(0, 160)} code=${inst.code ?? "-"}`);
  await sleep(2000);

  const opened = await primary("openTab", { type: PLUGIN_ID });
  check(`${tag}-S6.4 打开`, opened.ok && opened.result?.accepted === true, `open-tab ${PLUGIN_ID} ⇒ accepted`);
  await sleep(2500);
  const domTabs = await poolEval(EXPR_TABS);
  check(`${tag}-S6.5 CDP证人`, domTabs.some((t) => t.includes("串口")), `池标签条 = ${JSON.stringify(domTabs)}`);

  const after = await primary("describe", {});
  const idsAfter = (after.result?.commands ?? []).map((c) => c.id);
  const sm = idsAfter.filter((i) => i.startsWith("serial-monitor."));
  check(`${tag}-S6.6 挂牌`, sm.length >= 1, `命令面 ${idsBefore.length} → ${idsAfter.length}，serial-monitor.* 新挂牌 ${sm.length} 条（视图挂载即挂牌）`);

  const op = await primary("exec", { commandId: "serial-monitor.toggleLineNumbers", args: [] }, { timeoutMs: 30000 });
  check(`${tag}-S6.7 操作`, op.ok, `exec serial-monitor.toggleLineNumbers ⇒ ok=${op.ok} code=${op.code ?? "-"}（装完就能操作它）`);

  if (cross) {
    const op2 = await cross("exec", { commandId: "serial-monitor.toggleEcho", args: [] }, { timeoutMs: 30000 });
    check(`${tag}-S6.8 交叉验`, op2.ok, `同一条已装命令经**另一条**通道 ⇒ ok=${op2.ok} code=${op2.code ?? "-"}`);
  }

  /* 负控 ENOACTION：真产品里「没绑命令的按钮」（onClick 型）——市场禁用插件那条的「撤销」 */
  const dis = await primary("exec", { commandId: "marketplace.disable", args: [{ pluginId: PLUGIN_ID }] }, { timeoutMs: 30000 });
  check(`${tag}-S7.1`, dis.ok, `exec marketplace.disable ⇒ ok=${dis.ok}`);
  await sleep(1500);
  const notifs = await primary("notifications", {});
  const undo = (notifs.result?.groups ?? [])
    .flatMap((g) => g.items ?? [])
    .find((i) => (i.actions ?? []).some((a) => a.label && !a.command));
  const neg = undo ? await primary("notifyAction", { notificationId: undo.id, action: (undo.actions.find((a) => !a.command) || {}).label }) : null;
  check(`${tag}-S7.2 负控`, !!neg && !neg.ok && neg.code === "ENOACTION", `「${undo?.message}」的按钮没绑命令 ⇒ notify-action ${neg?.code ?? "（没这条通知）"}（⛔ 不假装按得动）`);
  const en = await primary("exec", { commandId: "marketplace.enable", args: [{ pluginId: PLUGIN_ID }] }, { timeoutMs: 30000 });
  check(`${tag}-S7.3 复原`, en.ok, `exec marketplace.enable ⇒ ok=${en.ok}（不留半禁用态）`);

  /* 还原：把这腿装的插件卸干净——下一腿 S6.1「装前无 serial-monitor.*」才立得住 */
  await sleep(1000);
  const un = await primary("exec", { commandId: "marketplace.uninstall", args: [{ pluginId: PLUGIN_ID }] }, { timeoutMs: 60000 });
  check(`${tag}-S6.9 还原`, un.ok, `exec marketplace.uninstall ⇒ ok=${un.ok} code=${un.code ?? "-"}`);
}

/* ── main ── */

async function main() {
  if (!USER_DATA) {
    console.error("✗ 缺 LINKDESK_USER_DATA（隔离实例的 userData 目录）。前置步骤见 scripts/dev/m4-fullchain/README.md");
    process.exit(2);
  }
  const targets = await listTargets().catch(() => []);
  head("前置");
  check("ENV-CDP", targets.length > 0, `CDP ${CDP_BASE} 上的 target = ${JSON.stringify(targets.map((t) => labelOf(t.url)))}`);
  check("ENV-USERDATA", fs.existsSync(path.join(USER_DATA, "ai-bridge.json")), `记录在盘：${path.join(USER_DATA, "ai-bridge.json")}`);

  const cliCallFn = (op, p, o) => cliCall(op, p, o);

  if (CHANNEL === "cli") {
    await runChain("CLI", (op, p, o) => cliCallFn(op, p, o));
    await runAi19("CLI", (op, p, o) => cliCallFn(op, p, o), null);
  }

  if (CHANNEL === "mcp" || CHANNEL === "both") {
    const session = mcpStart();
    const init = await session.send("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "m4-fullchain-accept", version: "1.0.0" } });
    check("MCP-S0.0", !!init.result, `initialize ⇒ serverInfo=${JSON.stringify(init.result?.serverInfo)}`);
    session.notify("notifications/initialized", {});
    const listed = await session.send("tools/list", {});
    const toolNames = (listed.result?.tools ?? []).map((t) => t.name);
    check("MCP-S0.0b", toolNames.includes("linkdesk_exec") && toolNames.includes("linkdesk_notify_action"), `tools/list 在线派生 ${toolNames.length} 个：${toolNames.join(" ")}`);
    const mcpCallFn = (op, p, o) => mcpCall(session, TOOL[op] ?? op, p, o);
    try {
      await runChain("MCP", mcpCallFn);
      /* MCP 腿也整走出「装 → 开 → 操作」（不用 CLI 的绿冒充）＋ 回程交叉验一条命令 */
      await runAi19("MCP", mcpCallFn, CHANNEL === "both" ? cliCallFn : null);
    } finally {
      session.close();
    }
  }

  const okAll = readings.filter((r) => r.ok).length;
  const skipped = readings.filter((r) => r.skip).length;
  const failed = readings.filter((r) => !r.ok);
  head(`合计 ${okAll}/${readings.length} 条读数（跳过 ${skipped}）${failed.length ? ` · ✗ ${failed.map((f) => f.id).join(" ")}` : ""}`);
  if (JSON_OUT) console.log(JSON.stringify({ cdps: CDP_BASE, userData: USER_DATA, pass: okAll, total: readings.length, skipped, readings }, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("验收器异常：", e && e.stack ? e.stack : e);
  process.exit(3);
});
