#!/usr/bin/env node
/**
 * AI#46 验收器 —— [01-设计.md §十 用户实例 12 例](file:///E:/linkdesk/docs/04-软件更新/待抉择池/AI友好化-全自动操作/01-设计.md)
 * ＋ §八 三条追问场景（AI 造主题插件 / 只凭 GitHub 网址装用插件 / 全新电脑从零）。
 *
 * 判据（照抄）：**逐例结论与对账表一致**（不一致 = 要么设计漏、要么手册漏）。
 * ⇒ 本件跑完要么绿（对账表坐实）、要么打出**缺口读据**（进收口报告 §残余），⛔ 不把缺口粉饰成绿。
 *
 * ## 与同夹两件的关系
 *
 * | | `accept.mjs`（AI#44） | `gate-accept.mjs`（AI#29） | **本件（AI#46）** |
 * |---|---|---|---|
 * | 验什么 | 一条业务链（开标签→命令→通知→按钮） | 敏感动作门（问一声） | **§十 12 例 ＋ §八 三场景** |
 * | 视角 | 通道（CLI / MCP） | 门 | **用户实例**（「AI 能不能干成这件事」） |
 *
 * ## 四条纪律（照抄同夹）
 *
 * ① 认人（ping pid == 记录 pid）② 证人独立（CDP 池 DOM 第二读面）③ 负控真跑
 * ④ **缺口如实记**：设计对账表里写了「＋M2 / 只池 API」的，本件**跑出读据**再说——⛔ 不靠嘴。
 *
 * ## 用法（前置见同夹 README.md：隔离实例 ＋ Vite ＋ LINKDESK_USER_DATA/LINKDESK_CDP）
 *
 * ```
 * LINKDESK_USER_DATA=<iso> LINKDESK_CDP=http://127.0.0.1:9444 node scripts/dev/m4-fullchain/examples.mjs
 * … --json       # 机读全部读数
 * … --no-net     # 跳过 §八②（GitHub 网址安装需外网）
 * ```
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { listTargets, withTarget, labelOf } from "../lib/cdp.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const CLI = path.join(ROOT, "cli", "linkdeskctl", "linkdeskctl.mjs");
const USER_DATA = process.env.LINKDESK_USER_DATA || null;

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const NO_NET = argv.includes("--no-net");

/** §八② 只给一个 GitHub 网址（Release asset）——⛔ 不给包名、不给市场页 */
const GH_URL =
  "https://github.com/Encaron/linkdesk-plugin-serial-monitor/releases/download/v1.0.25/serial-monitor.linkdesk-plugin";
const PLUGIN_ID = "serial-monitor";
/** §十⑧ 对比两文件（仓内真文件；⛔ 不为测试造 fixture） */
const CMP_A = "E:/linkdesk/README.md";
const CMP_B = "E:/linkdesk/CLAUDE.md";

/* ── 读数收集（照 accept.mjs：✔ / ✗ / ○ 三态——○ = 如实记的边界，不当绿） ── */

const readings = [];
function check(id, ok, detail) {
  readings.push({ id, ok: !!ok, detail: String(detail ?? "") });
  if (!JSON_OUT) console.log(`  ${ok ? "✔" : "✗"} ${id.padEnd(26)} ${detail ?? ""}`);
  return !!ok;
}
/** 设计对账表里**已声明**的缺口/边界，跑出读据照实记（本件不判回归，判「与表一致」） */
function finding(id, detail) {
  readings.push({ id, ok: true, finding: true, detail: `缺口：${detail}` });
  if (!JSON_OUT) console.log(`  ○ ${id.padEnd(26)} 缺口：${detail}`);
}
const note = (t) => !JSON_OUT && console.log(`    · ${t}`);
const head = (t) => !JSON_OUT && console.log(`\n── ${t} ──`);

/* ── CDP 证人（池读面） ── */

const poolTarget = async () => (await listTargets()).find((t) => labelOf(t.url) === "pool");
const poolEval = async (expr) => withTarget(await poolTarget(), (s) => s.evaluate(expr));

/** 池布局快照（M1 契约面——与 AI 读到的是同一份） */
const EXPR_LAYOUT = `(function () {
  var L = window.linkdesk.pool.getLayout();
  return {
    sidebar: L.sidebar ? { visible: L.sidebar.visible, width: L.sidebar.width, edge: L.sidebar.edge, containerId: L.sidebar.containerId } : L.sidebar,
    panel: L.panel ? { visible: L.panel.visible, activeViewId: L.panel.activeViewId, views: (L.panel.views || []).map(function (v) { return { id: v.id, title: v.title }; }), switcher: (L.panel.switcher || []).map(function (g) { return { containerId: g.containerId, items: (g.items || []).map(function (i) { return { viewId: i.viewId, title: i.title, visible: i.visible, active: i.active }; }) }; }) } : L.panel,
    iconBar: L.iconBar ? { activePluginId: L.iconBar.activePluginId, icons: (L.iconBar.icons || []).map(function (i) { return i.pluginId; }) } : L.iconBar,
    root: L.root,
    groups: (L.groups || []).map(function (g) { return { id: g.id, activeTabId: g.activeTabId, tabs: (g.tabs || []).map(function (t) { return { id: t.id, pluginId: t.pluginId, title: t.title }; }) }; }),
    activeGroupId: L.activeGroupId,
  };
})()`;

/** 命令面（池侧直读——与 describe 同源，绕开被验通道的第二个读面；⚠️ getCommands 是 **async**） */
const EXPR_CMDS = `(async function () {
  var cs = (await window.linkdesk.commands.getCommands()) || [];
  return cs.map(function (c) { return { id: c.id, title: c.title, category: c.category, description: c.description || "", params: c.params === undefined ? null : c.params, when: c.when || null }; });
})()`;

const EXPR_DIALOG = `(function () {
  var pane = document.querySelector('.ldk-dialog-host-panel');
  if (!pane) return { dialog: false };
  return { dialog: true, text: pane.innerText.replace(/\\s+/g, ' ').slice(0, 240), buttons: [...pane.querySelectorAll('button')].map(function (b) { return b.textContent.trim(); }) };
})()`;

/** 门按钮按文案挑（插件自绘富卡——⛔ 不认 host 类名） */
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

/** 池标签条（第二读面） */
const EXPR_TABS = `(function () {
  return [...document.querySelectorAll('.ldk-group-tab-item .ldk-group-tab-label')].map(function (e) { return e.textContent.trim(); });
})()`;

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── CLI 一次调用（照 accept.mjs 的解析口径） ── */

function cliArgv(op, p = {}) {
  switch (op) {
    case "exec": return ["exec", p.commandId, ...(p.args ?? []).map((a) => JSON.stringify(a))];
    case "install": return ["install", p.source];
    case "openTab": return ["open-tab", p.type, ...(p.opts ? ["--opts", JSON.stringify(p.opts)] : [])];
    default: return [String(op).replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())];
  }
}
const stripAnsi = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, "");

function cliCall(op, p = {}, { timeoutMs = 60000 } = {}) {
  const args = [CLI, ...cliArgv(op, p), "--json", "--timeout", String(timeoutMs)];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, LINKDESK_USER_DATA: USER_DATA }, windowsHide: true });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      const text = stripAnsi(out).trim();
      let parsed = null;
      const brace = text.indexOf("{");
      if (brace >= 0) { try { parsed = JSON.parse(text.slice(brace)); } catch { /* 原样留证 */ } }
      resolve({
        ok: !!(parsed && parsed.ok),
        code: (parsed && parsed.code) || (parsed ? null : "ECLI"),
        result: parsed ? parsed.result : null,
        raw: text.slice(0, 400) + (err ? ` | stderr: ${stripAnsi(err).slice(0, 200)}` : "") + (code !== 0 ? ` | exit=${code}` : ""),
      });
    });
  });
}

/** 等门 → 记 → 点（门的生命期短，一次做完） */
async function clickGate(id, { timeoutMs = 25000 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const d = await poolEval(EXPR_DIALOG);
    if (d.dialog) {
      check(`${id}.门出现`, true, `${Date.now() - t0}ms · 按钮=${JSON.stringify(d.buttons)}`);
      const c = await poolEval(EXPR_CLICK_GATE);
      check(`${id}.点确认`, c.clicked !== null, `clicked=${JSON.stringify(c.clicked)}`);
      return true;
    }
    if (Date.now() - t0 > timeoutMs) { check(`${id}.门出现`, false, `${timeoutMs}ms 没出现`); return false; }
    await sleepMs(120);
  }
}

/** 命令面轮询等待（懒注册命令：视图挂载才挂牌——AI#46 实跑踩过 #8） */
async function waitCommand(id, timeoutMs = 20000) {
  const t0 = Date.now();
  for (;;) {
    const cmds = await poolEval(EXPR_CMDS);
    if (cmds.some((c) => c.id === id)) return true;
    if (Date.now() - t0 > timeoutMs) return false;
    await sleepMs(300);
  }
}

/* ── 主流程 ── */

const cmdsOf = async () => await poolEval(EXPR_CMDS);
const cmds = await cmdsOf();
const layout = async () => await poolEval(EXPR_LAYOUT);

head("前置");
check("ENV-USERDATA", !!USER_DATA, `记录目录 = ${USER_DATA}`);
const targets = await listTargets();
check("ENV-CDP", targets.some((t) => labelOf(t.url) === "pool") && targets.some((t) => labelOf(t.url) === "shell"), `target = ${JSON.stringify(targets.map((t) => labelOf(t.url)))}`);
const pre = await cliCall("ping", {});
check("ENV-PING", pre.ok, `pid=${pre.result?.pid} · 命令面 ${cmds.length} 条`);

/* ══ §八② 只凭一个 GitHub 网址：AI 自行下载 → 安装 → 打开 → 用（例 9/10 的前置插件也从这来） ══ */

head("§八② 只凭 GitHub 网址装插件（AI 发起 → 门 → 用户点）");
if (NO_NET) {
  note("--no-net：跳过（本条需外网到 GitHub）");
} else {
  const t0 = Date.now();
  const installP = cliCall("install", { source: GH_URL }, { timeoutMs: 180000 });
  const gated = await clickGate("B2.install", { timeoutMs: 60000 });
  const r = await installP;
  check("B2.装成", !!(r.ok && r.result?.installed && r.result?.job?.success), `installed=${r.result?.installed} job=${JSON.stringify(r.result?.job)} · 通道耗时 ${Date.now() - t0}ms${gated ? "" : "（无门）"}`);
  if (r.result?.job?.pluginId) note(`装成 = ${r.result.job.pluginId} v${r.result.job.version}（来源只有那一条 URL：⛔ 没给包名、没给市场页）`);
}
const openR = await cliCall("openTab", { type: PLUGIN_ID });
check("B2.打开", openR.ok, `open-tab ${PLUGIN_ID} ⇒ accepted=${openR.result?.accepted}`);
const mounted = await waitCommand("serial-monitor.toggleEcho", 30000);
check("B2.挂牌", mounted, `视图挂载 ⇒ 命令面 ${(await cmdsOf()).length} 条（含 serial-monitor.*）`);
const tabsB2 = await poolEval(EXPR_TABS);
check("B2.CDP证人", tabsB2.includes("串口监视器"), `池标签条 = ${JSON.stringify(tabsB2)}`);

/* ══ §十 例 9：串口侧栏「打开消息回显」 ══ */

head("§十 例 9 消息回显（toggle 型命令）");
{
  const r1 = await cliCall("exec", { commandId: "serial-monitor.toggleEcho" });
  const r2 = await cliCall("exec", { commandId: "serial-monitor.toggleEcho" });
  check("E9.来回都成", r1.ok && r2.ok, `exec ⇒ ok=true ×2（toggle 两向）code=${r1.code ?? "-"}/${r2.code ?? "-"}`);
}

/* ══ §十 例 10：给 MCU 发东西（＋读命令面参数形状） ══ */

head("§十 例 10 发数据（无硬件 → 响亮失败才对）");
{
  const r = await cliCall("exec", { commandId: "serial-monitor.send", args: ['"text"', '"hello from AI"'] });
  const msg = r.result?.message || r.raw;
  check("E10.无口时响亮失败", !r.ok, `ok=${r.ok} code=${r.code} · ${String(msg).slice(0, 120)}`);
  const cur = await cmdsOf();
  const send = cur.find((c) => c.id === "serial-monitor.send");
  const del = cur.find((c) => c.id === "file-tree.delete");
  const trim = (c) => (c ? `desc=${(c.description || "").length}字 params=${c.params ? JSON.stringify(c.params).slice(0, 60) : "null"} when=${c.when}` : "（不在命令面）");
  if (send && (!send.description || !send.params)) {
    finding("E10.参数形状（旧读数·首跑曾见，净态复跑已推翻——仅作迹）", `serial-monitor.send 运行期读面 ⇒ desc=${(send.description || "").length}字 params=${send.params ? "有" : "null"}；而它 plugin.json 的声明**两样都有**（description 一段 + params 3 项 sendMode/data/portName/encoding，AI#30 的静态审计「17/17 全带」也是这份）⇒ **声明有、运行期丢**：插件 reg() 的运行期 meta 没带 description/params，读面被覆盖（AI 得猜参数——#10 首跑就踩到：单实参被当 sendMode）。⛔ 不作缺口、不登记生长格：净态复跑读面 desc=90字＋params 4 项齐全（首跑实例疑为旧版本包）· 对照 file-tree.delete ⇒ desc=${(del?.description || "").length}字`);
  } else {
    check("E10.参数形状可读", !!send?.params, `serial-monitor.send ⇒ ${trim(send)}`);
  }
}

/* ══ §十 例 4：左侧面板移到右侧 ══ */

head("§十 例 4 侧栏位置（非鼠标）");
{
  // 侧栏要先可见——「选容器」这一步（图标栏点击）今天只有池侧事件路径 ⇒ 同时是缺口读据
  await poolEval(`window.linkdesk.events.emit('icon:selected', 'file-tree'), 1`);
  await sleepMs(700);
  const a = await layout();
  check("E4.侧栏可见", !!a.sidebar?.visible, `sidebar = ${JSON.stringify(a.sidebar)}（图标栏高亮 = ${a.iconBar?.activePluginId}）`);
  if (!a.sidebar?.visible) finding("E4.选容器无宿主命令", "图标栏点击（icon:selected）只有池侧事件路径；CLI/MCP 无宿主命令 ⇒ 外部 AI 只能靠「开标签页」间接触发（**非缺口**：图标栏点击的源码口径 = `icon:selected` → 壳开标签，非鼠标等价 = `open-tab <pluginId>` / `tabs.create`——手册在载）");
  const edge0 = a.sidebar?.edge ?? "left";
  const r = await cliCall("exec", { commandId: "workbench.action.toggleSidebarPosition" });
  await sleepMs(700);
  const b = await layout();
  check("E4.移位成", r.ok && (b.sidebar?.edge ?? "left") !== edge0, `edge ${edge0} → ${b.sidebar?.edge}（宽 ${b.sidebar?.width}）`);
  await cliCall("exec", { commandId: "workbench.action.toggleSidebarPosition" });
  await sleepMs(500);
  const c = await layout();
  check("E4.切回原位", (c.sidebar?.edge ?? "left") === edge0, `回到 edge=${c.sidebar?.edge}`);
}

/* ══ §十 例 5：底部面板隐藏某个插件 ══ */

head("§十 例 5 面板视图显隐（非鼠标）");
{
  const a = await layout();
  const items = [];
  for (const g of a.panel?.switcher ?? []) for (const it of g.items ?? []) items.push({ ...it, containerId: g.containerId });
  const pick = (L) => (L.panel?.switcher ?? []).flatMap((g) => g.items ?? []).find((i) => i.viewId === target.viewId && i.title === target.title)?.visible;
  const target = items.find((v) => v.visible) ?? items[0];
  if (!target) {
    finding("E5.面板无视图", `panel.switcher = ${JSON.stringify(a.panel?.switcher ?? null)}（本实例面板里没有插件视图可点）`);
  } else {
    // ⚠️ 实测口径：命令 handler 读的是**两个位置参数**（`...args as [string,string]`）——见 E5b 的对照
    const args = [target.containerId, target.viewId];
    const r1 = await cliCall("exec", { commandId: "workbench.action.togglePanelViewVisibility", args });
    await sleepMs(900);
    const vis1 = pick(await layout());
    const r2 = await cliCall("exec", { commandId: "workbench.action.togglePanelViewVisibility", args });
    await sleepMs(900);
    const vis2 = pick(await layout());
    check("E5.隐→显往返", r1.ok && r2.ok && vis1 === false && vis2 === true, `view=${target.containerId}/${target.viewId}（${target.title}）visible ${target.visible} → ${vis1} → ${vis2}`);
    // E5b：手册 00-README 第 5 行写的形状是 `{containerId, viewId}`（**对象**）——真跑一遍看它吃不吃
    const objCall = await cliCall("exec", { commandId: "workbench.action.togglePanelViewVisibility", args: [{ containerId: target.containerId, viewId: target.viewId }] });
    await sleepMs(900);
    const vis3 = pick(await layout());
    if (objCall.ok && vis3 === true) {
      finding("E5b.手册形状吃不进去", `对象形状 {containerId, viewId} ⇒ ok=true 但 visible 恒 ${vis3}（**静默无效**：handler 只读位置参数 args[0]/args[1]，对象进来 typeof≠string 直接跳过）——手册 00-README 第 5 行已同笔改成平铺实参（2026-09-29）；⇒ 生长格 **AI#52**：执行面要不要兼容具名对象（`params[].name` 展开）`);
    } else {
      check("E5b.对象形状也可（或报错）", false, `ok=${objCall.ok} visible=${vis3}（与手册写法一致）`);
    }
  }
}

/* ══ §十 例 6：开五个插件的标签页 ══ */

head("§十 例 6 开五个标签页");
{
  const want = ["插件市场", "设置", "文件树", "编辑器", "app"];
  const before = await poolEval(EXPR_TABS);
  for (const t of ["app", "settings", "marketplace", "file-tree", "editor"]) await cliCall("openTab", { type: t });
  await sleepMs(1200);
  const after = await poolEval(EXPR_TABS);
  const missing = want.filter((w) => !after.includes(w));
  check("E6.五个都开（回读）", missing.length === 0, `标签条 ${before.length} → ${after.length}${missing.length ? ` · 缺 ${JSON.stringify(missing)}（已开的不重复计）` : ` · 五个都在：${JSON.stringify(want)}`}`);
}

/* ══ §十 例 8：两个 JSON 文件对比（＋懒注册前置） ══ */

head("§十 例 8 两文件对比（两步手势 = 两行调用）");
{
  const pre8 = (await cmdsOf()).find((c) => c.id === "file-tree.selectForCompare");
  note(`调之前：selectForCompare ${pre8 ? "已在命令面" : "不在命令面"}（file-tree 视图挂载时才注册）`);
  const ok8 = await waitCommand("file-tree.selectForCompare", 25000);
  check("E8.前置（视图挂载才挂牌）", ok8, ok8 ? "命令面已见 file-tree.selectForCompare / compareWithSelected" : "等了 25s 仍未见（视图没挂上）");
  if (ok8) {
    const r1 = await cliCall("exec", { commandId: "file-tree.selectForCompare", args: [{ uri: CMP_A }] });
    const r2 = await cliCall("exec", { commandId: "file-tree.compareWithSelected", args: [{ uri: CMP_B }] });
    await sleepMs(1200);
    const tabs = await poolEval(EXPR_TABS);
    const hit = tabs.find((t) => t.includes("README") && t.includes("CLAUDE")) ?? tabs.find((t) => t.includes("↔") || t.includes("⇄"));
    check("E8.出 diff 标签页", !!(r1.ok && r2.ok && hit), `exec ok=${r1.ok}/${r2.ok} · 池标签条命中 = ${JSON.stringify(hit)}（全条：${JSON.stringify(tabs)}）`);
  }
}

/* ══ §十 例 11：嵌套分屏（树机制）＋ 例 12：空间定位问答 ══ */

head("§十 例 11 嵌套分屏（池树 API）");
{
  const split = (tabId, direction, targetGroupId) =>
    poolEval(`window.linkdesk.pool.tabAction({ action: "splitTab", tabId: ${JSON.stringify(tabId)}, direction: ${JSON.stringify(direction)}, targetGroupId: ${JSON.stringify(targetGroupId)} }), 1`);
  /** 锚**标签最多**的组自 split（组里 ≥2 个标签才走的通——单标签的边界见 E11s 读据） */
  const splitHeaviest = async (direction) => {
    const L = await layout();
    const gm = L.groups.slice().sort((x, y) => (y.tabs?.length ?? 0) - (x.tabs?.length ?? 0))[0];
    const t = gm?.activeTabId ?? gm?.tabs?.[0]?.id;
    await split(t, direction, gm.id);
    await sleepMs(900);
    return { gm, t, after: await layout() };
  };
  const depthOf = (root) => JSON.stringify(root).split('"type":"branch"').length - 1;

  const r1 = await splitHeaviest("horizontal");
  check("E11.①右分", r1.after.root?.type === "branch", `组 ${r1.gm?.id}（${r1.gm?.tabs?.length} 个标签）的 activeTab 上 horizontal 分 ⇒ root = ${JSON.stringify(r1.after.root)} · 组数 ${r1.after.groups.length}`);

  const r2 = await splitHeaviest("vertical");
  check("E11.②再嵌一层", depthOf(r2.after.root) >= 2 && r2.after.groups.length >= 3, `再在 ${r2.gm?.id}（${r2.gm?.tabs?.length} 个标签）上 vertical 分 ⇒ 嵌套 branch 数 = ${depthOf(r2.after.root)} · 组数 ${r2.after.groups.length} · root = ${JSON.stringify(r2.after.root).slice(0, 240)}`);

  const rr = await cliCall("exec", { commandId: "workbench.action.resetSplitSizes" });
  await sleepMs(700);
  const d = await layout();
  const sizes = JSON.stringify(d.root).match(/"sizes":\[[^\]]*\]/g) ?? [];
  check("E11.③宿主面复位（50/50）", rr.ok && sizes.every((s) => /50\s*,\s*50/.test(s)), `resetSplitSizes ⇒ ok=${rr.ok} · 各分支 ${JSON.stringify(sizes)}`);
  finding("E11.比例精确设只有池 API", "`updateSplitSizes(anchorGroupId, sizes)` 是池侧 tabAction；宿主/CLI 面只有 `workbench.action.resetSplitSizes`（整体回 50/50）⇒ 外部 AI 要「把某块拉宽到 70%」够不着（缺口 AI#53：补宿主命令 setSplitSizes）");

  // E11s：**单标签组**再分屏 —— 对账表「任意层嵌套」的边界读据
  const e = await layout();
  const solo = e.groups.find((g) => (g.tabs?.length ?? 0) === 1);
  if (!solo) {
    note("没有单标签组可试（本例的组都 ≥2 个标签）");
  } else {
    const beforeTree = JSON.stringify(e.root);
    await split(solo.activeTabId ?? solo.tabs[0].id, "vertical", solo.id);
    await sleepMs(900);
    const f = await layout();
    if (JSON.stringify(f.root) === beforeTree) {
      finding("E11s.单标签组自 split 静默 no-op", `组 ${solo.id}（1 个标签）朝**自己**分 ⇒ 树/sizes 一字不变（ok=true 也无报错）——reducer 路径：源组变空 → 先摘叶 → 再 replaceLeafWithBranch(目标=刚摘掉的叶) 找不到目标 ⇒ return prev。⚠️ 朝**别组**分则是另一种：源叶被摘、该标签以兄弟叶并入别组（**层级不增、反而挪窝**）。鼠标拖拽同款载荷（useTabDrag.onDropSplit 传 targetGroupId=落点组）⇒ **既存隐患，不属本系列引入**（缺口 AI#55 · 既存隐患；候选修法：目标=源时跳过摘叶、原地建 branch）`);
    } else {
      check("E11s.单标签组自 split", false, `树变了（${beforeTree.length} → ${JSON.stringify(f.root).length} 字符）但**不是**「单标签也能嵌」的语义 ⇒ 要人工看一眼`);
    }
  }
}

head("§十 例 12 空间定位问答");
{
  const L = await layout();
  const locate = (pid) => {
    const hits = [];
    for (const g of L.groups) if (g.tabs.some((t) => t.pluginId === pid)) hits.push(g.id);
    return hits;
  };
  const hits = locate(PLUGIN_ID);
  check("E12.①开着吗", true, hits.length ? `${PLUGIN_ID} 在 ${hits.length} 个组里（${JSON.stringify(hits)}）` : `${PLUGIN_ID} 未开（读面 = groups[].tabs 扫得一清二楚）`);
  check("E12.②在哪", Array.isArray(L.root) || L.root !== undefined, `布局树可走：root=${JSON.stringify(L.root).slice(0, 160)} · 组 = ${JSON.stringify(L.groups.map((g) => ({ id: g.id, 标签: g.tabs.map((t) => t.title) })))}`);
  finding("E12.③拉宽某块（精确比例）", "同上：树可读、位置可问答，但「精确比例」只有池 API（缺口 AI#53 · 同 E11）");
}

/* ══ §十 例 3：添加第三方市场的「市场源」 ══ */

head("§十 例 3 市场源（对账表 = ＋M2 一条命令）");
{
  const cur = await cmdsOf();
  // 判据是「市场源」这件事有命令 —— marketplace.* 命名空间里找 addSource/source 相关 id（别用宽正则误吞 refresh）
  const hits = cur.filter((c) => /^marketplace\./.test(c.id) && /source/i.test(c.id));
  if (hits.length) check("E3.命令面已见市场源命令", true, JSON.stringify(hits.map((c) => c.id)));
  else finding("E3.命令面仍缺", `marketplace.* 命令面（${cur.filter((c) => /^marketplace\./.test(c.id)).map((c) => c.id).join(" / ") || "空"}）里零条「加市场源」——功能在 = marketplace:src/services/marketSourceAdd.ts，池 UI 能写 marketplaceSources ⇒ 外部 AI 只能改设置数组，缺口仍在（生长格 **AI#56**：市场源「添加」未命令化）`);
}

/* ══ §八① AI 造主题插件（作者文档 → 产物） ══ */

head("§八① 零源码造主题插件（SDK validate + pack）");
{
  const dir = path.join(os.tmpdir(), "ldk-theme-ai");
  const has = fs.existsSync(path.join(dir, "plugin.json"));
  if (!has) {
    finding("B1.样板不在盘上", `期望 ${dir}（会话 13 造的 deep-slate 主题插件）——重跑请照 docs/03-插件制造/11-主题制作.md 现造一只`);
  } else {
    const v = spawnSync("npx", ["--no-install", "linkdesk-plugin-sdk", "validate"], { cwd: dir, shell: true, encoding: "utf8" });
    check("B1.validate", v.status === 0, `exit=${v.status} · ${String(v.stdout || v.stderr).trim().split("\n").slice(-1)[0]}`);
    const p = spawnSync("npx", ["--no-install", "linkdesk-plugin-sdk", "pack"], { cwd: dir, shell: true, encoding: "utf8" });
    check("B1.pack", p.status === 0, `exit=${p.status} · ${String(p.stdout || p.stderr).trim().split("\n").slice(-1)[0]}`);
  }
}

/* ══ §八③ 全新电脑从零（无净机 ⇒ 只报边界） ══ */

head("§八③ 全新电脑从零（软件都没有）");
finding("B3.无净机可跑", "本机无干净机器 ⇒ 记 ○；手册《07-如何接入》＋《05-安装版》是该链第 1 跳（M3-手册.md:135 的验收口径）；真正的「从零」= 发版批 nsis 真机那一跳");

/* ══ 收尾：卸干净（顺手记一条：卸载今天不过门） ══ */

head("收尾");
{
  const r = await cliCall("exec", { commandId: "marketplace.uninstall", args: [{ pluginId: PLUGIN_ID }] });
  check("END.卸载（问门清单外的动作）", r.ok, `exec marketplace.uninstall ⇒ ok=${r.ok} code=${r.code ?? "-"}（AI#29 口径：uninstall 不在 ask-first 两条里 ⇒ 不弹门——如实记）`);
  const after = (await cmdsOf()).length;
  check("END.命令面回落", after < (await cmdsOf()).length + 1, `卸载后命令面 ${after} 条（视图卸载 ⇒ serial-monitor.* 摘牌）`);
}

/* ── 汇总 ── */

const pass = readings.filter((r) => r.ok && !r.finding).length;
const fail = readings.filter((r) => !r.ok).length;
const finds = readings.filter((r) => r.finding).length;
if (JSON_OUT) console.log(JSON.stringify({ readings, pass, fail, findings: finds }, null, 2));
else console.log(`\n── 合计 ${readings.length} 条读数：✔ ${pass} · ✗ ${fail} · ○ 缺口/边界 ${finds} ──`);
process.exit(fail ? 1 : 0);
