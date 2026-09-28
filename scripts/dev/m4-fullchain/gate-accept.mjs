#!/usr/bin/env node
/**
 * AI#29 验收器 —— 「敏感动作有**统一确认回路**，且该回路**不是唯一鼠标路径**」。
 *
 * 判据原文（[`03-任务档案/M2-操作面.md`](../../../docs/04-软件更新/待抉择池/AI友好化-全自动操作/03-任务档案/M2-操作面.md) `AI#29`）：
 *   把「AI 能发起、但敏感动作要用户点头」落成**一致机制**（装/卸插件 = 问一声为既有先例）……
 *   判据 = 敏感动作有统一确认回路，且该回路**不是唯一鼠标路径**。
 *
 * ## 它验的四件事（每件都有对立面，⛔ 不是「跑通就算绿」）
 *
 * | # | 验什么 | 反面（同一批读数里真跑） |
 * |---|---|---|
 * | ① 自述面 | `describe.askFirst` 报出名单（AI 读得到「哪些要问」） | `describe.ops` 里**没有任何应答确认框的面**——AI 自己答不了 |
 * | ② 门真的拦 | `exec update.openUpdateFlow` 挂起、池里弹出统一措辞的确认框 | **名单外**的 `exec` 照旧不问（门不是无差别弹窗） |
 * | ③ 键盘腿 | **Esc** ⇒ `EUSERDENIED`／**Enter** ⇒ 放行——两条腿都不碰鼠标 | 不存在的命令 ⇒ `EUNKNOWN`、**门不出现**（门≠无条件） |
 * | ④ 账本不撒谎 | 被拒的那次在账本里是 `ok=false code=EUSERDENIED` | 两个读面（CLI `log` ＋ 盘上 `ai-bridge-log.jsonl`）**同一条** |
 *
 * ## 与 `accept.mjs`（AI#44）的分工
 *
 * `accept.mjs` 的链是**业务链**（开标签 → 命令 → 通知 → 按钮），它的确认门只是**顺带被点了一下**；
 * 本件专打**门本身**：措辞、两把键、被拒后的账、以及「AI 没有应答面」。两件都跑，互不替代。
 *
 * ## 🔴 关于「不是唯一鼠标路径」的取证口径
 *
 * 键盘两腿用 **CDP `Input.dispatchKeyEvent`**（真按键，不是 `el.click()`）；万一那条路在无焦点窗口上
 * 不生效，退 **DOM 合成 `KeyboardEvent`**（仍是键盘处理路径，仍不碰鼠标），并在读数里**如实标出**用的哪条
 * ——⛔ 不把降级过的那次写成 CDP。
 *
 * ## ⚠️ 验收器自身踩过的两条坑（首跑实测，写下来免得下一棒当回归）
 *
 * 1. **门刚出现 ≠ 门接得住键盘**：`DialogHost` 收到 show 后 **50ms** 才 `panelRef.focus()`，而 Enter 的
 *    监听挂在**面板**上。首跑在门出现那一帧就打字 ⇒ Enter 打在 `BODY` 上、石沉大海（同期 Escape 照旧生效
 *    ——它是 `window` 监听），差点被误判成「Enter 不工作」。⇒ `waitGate` 等到**焦点落在面板上**再打字，
 *    并单列一条 `门接得住键盘` 读数（焦点始终不来时它变红，而不是伪装成超时）。
 * 2. **面板消失晚 1–2 帧**：按键后 CLI 立刻收场，池里那一帧还没重渲染完 ⇒ 0ms 快照读成「面板残留」。
 *    ⇒ `门已收` 改成**轮询等消失**（≤2.5s）。
 *
 * ## 用法（前置见同夹 README.md：隔离实例已起 ＋ `LINKDESK_USER_DATA`/`LINKDESK_CDP` 指过去）
 *
 * ```
 * LINKDESK_USER_DATA=<iso> LINKDESK_CDP=http://127.0.0.1:9444 node scripts/dev/m4-fullchain/gate-accept.mjs
 * … --json     # 机读全部读数
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

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const USER_DATA = process.env.LINKDESK_USER_DATA || null;
/** 敏感名单里那条命令（AI#29 首版仅此一条；改名要两处同笔——见 `sensitive.ts`） */
const SENSITIVE_CMD = "update.openUpdateFlow";
/** 名单外、**无副作用**的探针命令（证明「不问」不是靠运气）：核心视图缩放复位 */
const HARMLESS_CMD = "view.zoomReset";
/** 盘上账本（第二读面，⛔ 不只信 CLI 那条读面） */
const AUDIT_FILE = USER_DATA ? path.join(USER_DATA, "ai-bridge-log.jsonl") : null;

/* ── 读数收集（照 accept.mjs 的形状：id/ok/detail，机读一份人读一份） ── */

const readings = [];
function check(id, ok, detail) {
  readings.push({ id, ok: !!ok, detail: String(detail ?? "") });
  if (!JSON_OUT) console.log(`  ${ok ? "✔" : "✗"} ${id.padEnd(26)} ${detail ?? ""}`);
  return !!ok;
}
const note = (text) => !JSON_OUT && console.log(`    · ${text}`);
const head = (text) => !JSON_OUT && console.log(`\n── ${text} ──`);

/* ── 通道皮（真子进程；门在途时本进程不阻塞——要点门得同时进行） ── */

const stripAnsi = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, "");

function spawnCli(argvAfterCli, { timeoutMs = 60_000, raw = false } = {}) {
  const args = raw ? argvAfterCli : [CLI, ...argvAfterCli, "--json", "--timeout", String(timeoutMs)];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, raw ? [CLI, ...argvAfterCli] : args, {
      cwd: ROOT,
      env: { ...process.env, LINKDESK_USER_DATA: USER_DATA },
      windowsHide: true,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      const text = stripAnsi(out).trim();
      let parsed = null;
      const brace = text.indexOf("{");
      if (brace >= 0) {
        try {
          parsed = JSON.parse(text.slice(brace));
        } catch {
          parsed = null;
        }
      }
      resolve({
        exitCode: code,
        ok: !!(parsed && parsed.ok),
        code: parsed ? parsed.code ?? null : null,
        message: parsed ? parsed.message ?? null : null,
        hint: parsed ? parsed.hint ?? null : null,
        result: parsed ? parsed.result ?? null : null,
        text,
        stderr: stripAnsi(err),
      });
    });
  });
}

/* ── CDP 证人（池 DOM——绕开本通道的第二个读面） ── */

const poolTarget = async () => (await listTargets()).find((t) => labelOf(t.url) === "pool");
const poolEval = async (expr) => withTarget(await poolTarget(), (s) => s.evaluate(expr));

/** 门的读面：面板文字 ＋ 按钮 ＋ 当前焦点（焦点在哪＝键盘打给谁，取证要用） */
const EXPR_GATE = `(function () {
  var pane = document.querySelector('.ldk-dialog-host-panel');
  if (!pane) return { dialog: false, focused: null, docFocus: document.hasFocus() };
  return {
    dialog: true,
    text: pane.innerText.replace(/\\s+/g, ' ').slice(0, 300),
    buttons: [...pane.querySelectorAll('button')].map(function (b) { return b.textContent.trim(); }),
    focused: document.activeElement ? (document.activeElement.className || document.activeElement.tagName) : null,
    docFocus: document.hasFocus()
  };
})()`;

/**
 * 等门**就绪**——不只是「面板在」，还要「键盘打得到」。
 *
 * 🔴 首跑教训（实测，不是理论）：`DialogHost` 在收到 show 后 **50ms** 才 `panelRef.focus()`，
 *   而 Enter 的监听挂在**面板**上（Escape 挂在 window 上）。门刚出现就打字 ⇒ 打在 BODY 上、
 *   Enter 石沉大海——**假红**（同期 Escape 照旧生效，因为它是 window 监听）。真实用户按 Enter
 *   本来就是秒级，天然晚于那 50ms；验收器必须等这一帧，就像等壳就绪一样（README §四.1 同类）。
 *
 * `readyGraceMs` 是兜底：面板始终不接焦点（真缺陷）时不至于把整件卡死在等待里——
 * 超时就**如实返回未就绪**，让那条读数变红。
 */
async function waitGate(timeoutMs, { readyGraceMs = 3000 } = {}) {
  const t0 = Date.now();
  let appearedMs = null;
  for (;;) {
    const d = await poolEval(EXPR_GATE);
    const now = Date.now();
    if (d.dialog && appearedMs === null) appearedMs = now - t0;
    const focused = !!d.dialog && /ldk-dialog-host-panel/.test(d.focused || "");
    if (d.dialog && (focused || now - t0 > readyGraceMs)) {
      return { ...d, appearedMs, readyMs: now - t0, ready: focused };
    }
    if (now - t0 > timeoutMs) return null;
    await sleep(60);
  }
}

/** 等门**收**——按键之后面板消失有 1–2 帧的滞后（⛔ 0ms 快照会把正常的重渲染判成残留） */
async function waitGateGone(timeoutMs = 2500) {
  const t0 = Date.now();
  for (;;) {
    const d = await poolEval(EXPR_GATE);
    if (!d.dialog) return { gone: true, ms: Date.now() - t0 };
    if (Date.now() - t0 > timeoutMs) return { gone: false, ms: Date.now() - t0 };
    await sleep(100);
  }
}

/** 键盘腿 A：CDP 真按键（rawKeyDown ＋ keyUp——修饰位不用给，两把键都不吃修饰） */
async function keyViaCdp(key, vk) {
  const t = await poolTarget();
  if (!t) throw new Error("池 target 不在（窗口没起来？）");
  return withTarget(t, async (s) => {
    const base = { key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await s.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
    await s.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    return true;
  });
}

/** 键盘腿 B（降级）：DOM 合成 KeyboardEvent，打在**面板**上——Escape 冒泡到 window、Enter 走 React 委托 */
async function keyViaDom(key) {
  const expr = `(function () {
    var pane = document.querySelector('.ldk-dialog-host-panel');
    if (!pane) return { fired: false, reason: 'no-pane' };
    pane.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }));
    return { fired: true };
  })()`;
  return poolEval(expr);
}

/**
 * 「挂起中的 CLI 调用」＋「键盘作答」一次做完。
 *
 * 顺序有意：**先发调用（门随后才出现）→ 等门 → 打字 → 再看调用怎么收场**。
 * 若先等门再发调用，门永远不来（没有发起方）。
 */
async function gatedLeg(id, { key, vk, expect }) {
  const t0 = Date.now();
  const pending = spawnCli(["exec", SENSITIVE_CMD], { timeoutMs: 90_000 });
  const gate = await waitGate(15_000);
  if (!gate) {
    check(`${id}·门出现`, false, `等了 15s 没出现（${SENSITIVE_CMD} 挂起中应弹门）`);
    const r = await pending;
    note(`收场：exit=${r.exitCode} code=${r.code}`);
    return null;
  }
  check(`${id}·门出现`, true, `${gate.appearedMs}ms · 按钮=${JSON.stringify(gate.buttons)}`);
  check(`${id}·门接得住键盘`, gate.ready, `焦点=${gate.focused} · docFocus=${gate.docFocus} · 就绪 ${gate.readyMs}ms`);
  check(
    `${id}·门文案统一`,
    /AI 请求执行敏感命令/.test(gate.text) && /问一声的原因/.test(gate.text) && /不点 = 不执行/.test(gate.text),
    gate.text,
  );

  // 键盘作答：CDP 真按键优先；没在预期时间内收场 ⇒ 降级 DOM 合成（并如实标注）
  let mechanism = "cdp";
  await keyViaCdp(key, vk);
  let r = await Promise.race([pending, sleep(3000).then(() => null)]);
  if (!r) {
    mechanism = "dom-fallback";
    note("CDP 真按键没让门收场——降级 DOM 合成 KeyboardEvent（仍不碰鼠标），读数标 dom");
    await keyViaDom(key);
    r = await Promise.race([pending, sleep(8000).then(() => null)]);
  }
  if (!r) {
    check(`${id}·键盘腿(${mechanism})`, false, `按了 ${key} 仍没收场（门卡住？）`);
    return null;
  }
  check(
    `${id}·键盘腿(${mechanism})`,
    expect({ ok: r.ok, code: r.code }),
    `按 ${key} ⇒ exit=${r.exitCode} ok=${r.ok} code=${r.code} ${Date.now() - t0}ms` + (r.hint ? ` · hint=${r.hint.slice(0, 60)}…` : ""),
  );
  const after = await waitGateGone();
  check(`${id}·门已收`, after.gone, after.gone ? `${after.ms}ms 内面板消失` : `${after.ms}ms 面板还在（按键没关掉它）`);
  return r;
}

/** 账本读数（两个读面共用一段判据）——`arg` 一维很要紧：同一条命令的两种结局要能分开 */
function judgeLedger(entries, { op, ok, code = null, arg = null }) {
  const hit = entries.find((e) => e && e.op === op && e.ok === ok && (arg === null || e.arg === arg));
  if (!hit) return { hit: null, text: entries.map((e) => `${e.op} ok=${e.ok} ${e.code ?? ""} ${e.arg ?? "-"}`).join(" | ") };
  if (code && hit.code !== code) return { hit: null, text: `命中但 code=${hit.code}（要 ${code}）` };
  return { hit, text: `ts=${hit.ts} op=${hit.op} ok=${hit.ok} code=${hit.code ?? "null"} arg=${hit.arg ?? "-"}` };
}

/* ── 主流程 ── */

async function main() {
  if (!USER_DATA) {
    console.error("缺 LINKDESK_USER_DATA（隔离实例的 userData 路径）——见同夹 README.md");
    process.exit(2);
  }
  if (!JSON_OUT) {
    console.log("AI#29 验收 —— 敏感动作的**统一确认回路**（不是唯一鼠标路径）");
    console.log(`实例：${USER_DATA} · CDP ${CDP_BASE} · 敏感命令 ${SENSITIVE_CMD}`);
  }

  /* ── 前置：认人不认端口（M5「存在 ≠ 是它」） ── */
  head("前置");
  const ping = await spawnCli(["ping"]);
  check("ENV-PING", ping.ok, ping.ok ? `应答 pid=${ping.result?.pid} 通道=${ping.result?.transport} 版本=${ping.result?.appVersion}` : `code=${ping.code} ${ping.message ?? ""}`);
  const targets = await listTargets().catch(() => []);
  check("ENV-CDP", targets.some((t) => labelOf(t.url) === "pool"), `target = ${JSON.stringify(targets.map((t) => labelOf(t.url)))}`);
  if (!ping.ok) {
    console.error("\n实例没在服务——先照 README 起隔离实例，再跑本件。");
    process.exit(2);
  }

  /* ── ① 自述面：AI 读得到「哪些要问」，也读得到「AI 没有应答面」 ── */
  head("① 自述面（describe.askFirst）");
  const desc = await spawnCli(["describe"]);
  const askFirst = (desc.result && desc.result.askFirst) || null;
  const askCmds = (askFirst && askFirst.commands) || [];
  const askOps = (askFirst && askFirst.ops) || [];
  check("G0.1·自述含敏感命令", askCmds.some((r) => r.id === SENSITIVE_CMD && r.what && r.why), `commands = ${JSON.stringify(askCmds.map((r) => r.id))}`);
  check("G0.2·自述含敏感操作", askOps.some((r) => r.id === "install" && r.what && r.why), `ops = ${JSON.stringify(askOps.map((r) => r.id))}`);
  const opNames = ((desc.result && desc.result.ops) || []).map((o) => o.name || o);
  const answerish = opNames.filter((n) => /dialog|answer|confirm|approve|reply|accept/i.test(n));
  check("G0.3·🔴 AI 没有应答面", answerish.length === 0, `${opNames.length} 个操作，命中 /dialog|answer|confirm|approve|reply/ 的 = ${JSON.stringify(answerish)}`);
  const help = await spawnCli(["--help"], { raw: true });
  check(
    "G0.4·--help 能自查名单",
    /要用户点头的动作/.test(help.text) && help.text.includes(SENSITIVE_CMD),
    (help.text.match(/.*要用户点头的动作.*/) || ["(没有这一节)"])[0].trim(),
  );

  /* ── ② 名单外不问（门不是无差别弹窗） ── */
  head("② 名单外不问");
  const plain = await spawnCli(["exec", HARMLESS_CMD]);
  check("G1.1·普通命令照旧", plain.ok, `exec ${HARMLESS_CMD} ⇒ ok=${plain.ok} code=${plain.code}`);
  await sleep(1200);
  const strayGate = await poolEval(EXPR_GATE);
  check("G1.2·普通命令不弹门", !strayGate.dialog, strayGate.dialog ? `竟然弹了：${strayGate.text}` : "1.2s 内池里没有确认面板");

  /* ── ③ 键盘腿：Esc 拒 / Enter 准 ── */
  head("③ 键盘腿（Esc = 拒）");
  const denied = await gatedLeg("G2", { key: "Escape", vk: 27, expect: (r) => r.ok === false && r.code === "EUSERDENIED" });
  check(
    "G2.5·被拒读数可自救",
    !!(denied && denied.hint && /Enter|Esc/.test(denied.hint)),
    denied ? `hint=${denied.hint}` : "没拿到被拒读数",
  );

  head("③ 键盘腿（Enter = 准）");
  const allowed = await gatedLeg("G3", { key: "Enter", vk: 13, expect: (r) => r.ok === true });

  /* ── ④ 账本：被拒与放行各一条，两个读面一致 ── */
  head("④ 账本（不撒谎）");
  const log = await spawnCli(["log", "--limit", "8"]);
  const entries = (log.result && log.result.entries) || [];
  const d = judgeLedger(entries, { op: "exec", ok: false, code: "EUSERDENIED", arg: SENSITIVE_CMD });
  check("G4.1·拒了记 ok=false", !!d.hit, d.text);
  const a = judgeLedger(entries, { op: "exec", ok: true, arg: SENSITIVE_CMD });
  check("G4.2·准了记 ok=true", !!a.hit, a.text);
  let diskLine = "(账本文件不存在——`ai.auditLog.enabled` 关着？)";
  let diskOk = false;
  if (AUDIT_FILE && fs.existsSync(AUDIT_FILE)) {
    const lines = fs.readFileSync(AUDIT_FILE, "utf8").trim().split("\n").filter(Boolean).slice(-8);
    const parsed = lines.map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    });
    const dd = judgeLedger(parsed.filter(Boolean), { op: "exec", ok: false, code: "EUSERDENIED", arg: SENSITIVE_CMD });
    diskLine = dd.text;
    diskOk = !!dd.hit;
  }
  check("G4.3·盘上账同一条", diskOk, `${path.basename(AUDIT_FILE || "ai-bridge-log.jsonl")} 尾 8 行：${diskLine}`);

  /* ── ⑤ 负控：门≠无条件（不存在的命令不问） ── */
  head("⑤ 负控");
  const bogus = spawnCli(["exec", "no.such.command"]);
  const bogusGate = await waitGate(2500);
  const br = await bogus;
  check("G5.1·不存在的命令不问", !bogusGate && br.ok === false, `code=${br.code} · 门=${bogusGate ? "竟然弹了" : "没出现"}`);
  check(
    "G5.2·Esc 那次真没落地",
    !!d.hit && d.hit.ok === false,
    allowed && allowed.ok ? "同一条命令 Enter 那次 ok=true —— 同路径两种读法，差别只来自那一下按键" : "Enter 那腿没取到读数",
  );

  const okAll = readings.filter((r) => r.ok).length;
  const failed = readings.filter((r) => !r.ok);
  head(`合计 ${okAll}/${readings.length} 条读数${failed.length ? ` · ✗ ${failed.map((f) => f.id).join(" ")}` : ""}`);
  if (JSON_OUT) console.log(JSON.stringify({ cdps: CDP_BASE, userData: USER_DATA, pass: okAll, total: readings.length, readings }, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("验收器异常：", e && e.stack ? e.stack : e);
  process.exit(3);
});
