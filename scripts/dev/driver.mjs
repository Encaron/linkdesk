#!/usr/bin/env node
/**
 * scripts/dev/driver.mjs —— LinkDesk **dev 验收 driver 的命令行入口**（AI 友好化 · 系列外 `D0#1`–`D0#3`）。
 *
 * 归属：**开发期工具**——不进软件产物、零用户可见面、不占版本号。⛔ 本目录不 import 任何宿主源码
 * （`@src/*` / `/@fs` 一律不碰），也不改 `src/`｜`electron/` 一行（判据 3 由 `decouple` 机械核验）。
 * 用法与取舍见同目录 `README.md`；`--help` 打印速查。
 *
 * ── 三个文件的分工（⛔ 别把语义写回传输层）──────────────────────────────
 *   `lib/cdp.mjs`           传输层：连 target、发指令、求值、等就绪、强制伪状态。
 *   `lib/linkdesk-driver.mjs` 语义层：LinkDesk 的侧栏/布局/池快照/构建握手 ——「界面长什么样、怎么驱」。
 *   本文件                   命令行：把上面两层的函数拼成一条条可复制的命令 ＋ 汇总打印。
 *
 * ── 典型一场验收（照抄即可）─────────────────────────────────────────────
 *   npm run dev:driver -- status                 # ① 实例活没活、target 有几份
 *   npm run dev:driver -- reload                 # ② 硬 reload 全部文档，把 HMR 的不确定性剥掉（D0#1）
 *   npm run dev:driver -- handshake              # ③ 构建握手：页面跑的代码是不是磁盘上这份（D0#1 判据 1）
 *   npm run dev:driver -- snapshot               # ④ 动手前的基线读数
 *   npm run dev:driver -- collapse file-tree:search   # ⑤ 走真实链路驱动
 *   npm run dev:driver -- snapshot               # ⑥ 复读 —— 变了才是「我的改动生效了」
 *
 * 退出码：0 = 该命令的判据全过；1 = 有红（含「就绪超时」「握手 stale」「点完没落」「自测不过」）；
 *         2 = 用法错。⛔ 超时/缺读数一律判红，不静默算过（三档门禁的闸 1：红灯前零误报）。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CDP_BASE, READY_EXPR, evaluate, exprCenterOf, labelOf, openSession, probeInstance, unthrottle, waitFor } from "./lib/cdp.mjs";
import {
  buildHandshake,
  collapseSection,
  diskPathForUrlPath,
  exprComputedAndMatch,
  exprModuleStamps,
  exprOpenView,
  exprPageClock,
  exprPoolSnapshot,
  exprReadLayout,
  exprReadSections,
  exprReadViewMenu,
  exprSetSection,
  hoverFace,
  judgeStamp,
  newestDiskChange,
  openSection,
  openView,
  pickPool,
  pickShell,
  readLayout,
  readPersistedStates,
  readPoolSnapshot,
  readSections,
  readViewMenu,
  reloadAll,
  resolveTargets,
} from "./lib/linkdesk-driver.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const HERE = fileURLToPath(new URL(".", import.meta.url));
const VITE_URL = process.env.LINKDESK_VITE || "http://localhost:1420";

/* ───────────────────────── 参数 ───────────────────────── */

const opts = { json: false, doc: "pool", props: null, pseudo: null, userDataDir: null, root: ROOT, base: null, file: null, timeoutMs: 30000, killTransitions: false, mode: null };
const positional = [];

function usageError(msg) {
  process.stderr.write(`✘ ${msg}\n\n${helpText()}`);
  process.exit(2);
}

for (let i = 0; i < process.argv.length - 2; i++) {
  const a = process.argv[i + 2];
  const next = () => {
    const v = process.argv[++i + 2];
    if (v === undefined) usageError(`${a} 少了值`);
    return v;
  };
  if (a === "--json") opts.json = true;
  else if (a === "--self-test") positional.unshift("selftest");
  else if (a === "--help" || a === "-h") positional.unshift("help");
  else if (a === "--doc") opts.doc = next();
  else if (a === "--props") opts.props = next().split(",").map((s) => s.trim());
  else if (a === "--pseudo") opts.pseudo = next().split(",").map((s) => s.trim());
  else if (a === "--kill-transitions") opts.killTransitions = true;
  else if (a === "--mode") opts.mode = next();
  else if (a === "--user-data-dir") opts.userDataDir = next();
  else if (a === "--root") opts.root = next();
  else if (a === "--base") opts.base = next();
  else if (a === "--file") opts.file = next();
  else if (a === "--timeout") opts.timeoutMs = Number(next());
  else if (a.startsWith("--")) usageError(`未知选项 ${a}`);
  else positional.push(a);
}

/* ───────────────────────── 打印小件 ───────────────────────── */

const truthy = (b) => (b ? "✔" : "✘");
const ms = (n) => (n == null ? "?" : `${n}ms`);
const clock = (t) => (t == null ? "—" : new Date(t).toLocaleTimeString("zh-CN", { hour12: false }) + "." + String(Math.floor(t % 1000)).padStart(3, "0"));

/** 连不上时讲人话 ＋ 给出照抄的启动配方（判据 2：下一个人不用重新摸索） */
const START_HINT = `
起一个**隔离**实例（⛔ 别对着用户正在用的真 profile 重载——重载会丢已挂载视图）：

  # 终端 A：dev 服务（池/壳两文档都从它来）
  node_modules/.bin/vite

  # 终端 B：编译主进程 ＋ 起 Electron（调试端口与真实例错开，profile 用一次性临时目录）
  tsc -p electron/tsconfig.json && node scripts/electron-commonjs-fix.cjs
  electron . --remote-debugging-port=9333 --user-data-dir="$TEMP/linkdesk-driver-$$"

  # 终端 C：把 driver 指到这个实例
  LINKDESK_CDP=http://127.0.0.1:9333 npm run dev:driver -- status

⚠️ 只设 APPDATA **隔离不了** Windows 上的 Electron（app.getPath('appData') 走 SHGetKnownFolderPath）
   ——必须传 --user-data-dir（memory cdp-ui-automation §6 实测补钉）。`;

function human(name, lines) {
  process.stdout.write(`── ${name} ──\n${lines.join("\n")}\n`);
}

/** 汇总出口：`data` 给 `--json`，`text` 给人看，`code` 是退出码 */
function emit(name, { data, text, code = 0 }) {
  if (opts.json) process.stdout.write(JSON.stringify({ command: name, ...data }, null, 2) + "\n");
  else human(name, text);
  return code;
}

/* ───────────────────────── target ───────────────────────── */

const pickDoc = () => (opts.doc === "shell" ? pickShell() : pickPool());

/** 取目标文档 ＋ 先解除后台节流（`await` 型表达式在 hidden 下会被节流到 1s ⇒ 假超时） */
async function target({ activate = true } = {}) {
  const t = await pickDoc();
  if (activate) {
    try {
      await unthrottle(t);
    } catch {
      /* 节流解除失败不致命（同步表达式不受影响） */
    }
  }
  return t;
}

/* ───────────────────────── 命令 ───────────────────────── */

async function cmdStatus() {
  let cdp = null;
  let cdpError = null;
  try {
    cdp = await probeInstance();
  } catch (e) {
    cdpError = e.message;
  }
  let http = null;
  try {
    const res = await fetch(VITE_URL, { signal: AbortSignal.timeout(2500) });
    http = res.status;
  } catch {
    http = null;
  }
  let targets = [];
  if (cdp) {
    try {
      targets = (await resolveTargets()).all.map((t) => ({ doc: labelOf(t.url), url: t.url, id: t.id }));
    } catch (e) {
      cdpError = e.message;
    }
  }
  const text = [
    `CDP   ${CDP_BASE}  ${truthy(!!cdp)} ${cdp ? cdp.Browser : cdpError}`,
    `Vite  ${VITE_URL}  ${truthy(http === 200)} ${http == null ? "连不上" : `HTTP ${http}`}`,
    `targets（${targets.length}）`,
    ...(targets.length ? targets.map((t) => `  ${t.doc.padEnd(7)} ${t.url}\n          id=${t.id}`) : ["  （无——见 README「起一个隔离实例」）"]),
  ];
  const code = cdp && http === 200 ? 0 : 1;
  if (code) text.push("", START_HINT);
  return emit("status", { data: { cdp: { base: CDP_BASE, up: !!cdp, browser: cdp?.Browser ?? null, error: cdpError }, vite: { url: VITE_URL, status: http }, targets }, text, code });
}

async function cmdHandshake() {
  const hs = await buildHandshake({ root: opts.root });
  const verdictLine =
    hs.verdict === "in-sync"
      ? "✔ in-sync（每份文档都加载于磁盘最新改动之后 ⇒ 页面跑的就是磁盘上这份）"
      : hs.verdict === "stale"
        ? "✘ stale（有文档加载早于磁盘改动 ⇒ 这份代码是否已进页面**不确定**——先硬 reload，别急着改代码）"
        : "✘ no-evidence（一条可比对的模块都没有 ⇒ ⛔ 不算通过，先确认 target 选对了）";
  const text = [
    `git   ${hs.git.head ?? "(读不到)"}  ${hs.git.changes.length ? `有 ${hs.git.changes.length} 处未提交改动` : "工作区干净"}`,
    `磁盘最新改动  ${hs.newestDisk ? `${hs.newestDisk.path}  ${clock(hs.newestDisk.mtimeMs)}${hs.globalNewestLateByMs > 0 ? `（比页面加载晚 ${hs.globalNewestLateByMs}ms）` : ""}` : "(读不到)"}`,
    `判定  ${verdictLine}`,
    "",
    "文档          加载于        应用模块  页内  晚于页面  忽略(非源码)",
    ...hs.docs.map((d) =>
      d.error
        ? `  ${d.doc.padEnd(7)} ✘ ${d.error}`
        : `  ${d.doc.padEnd(7)} ${truthy(d.verdict !== "stale")} ${clock(d.loadedAt)}  ${String(d.moduleCount).padStart(5)}  ${String(d.moduleCount - d.newerModules.length - d.skipped).padStart(5)}  ${String(d.newerModules.length).padStart(5)}  ${String(hs.ignored).padStart(5)}`
    ),
  ];
  if (hs.stale.length) {
    text.push("", "晚于页面加载的模块（就是「可能没生效」的那几个）——");
    for (const m of hs.stale.slice(0, 12)) text.push(`  [${m.verdict}] ${m.doc.padEnd(6)} ${m.path}\n          磁盘 ${clock(m.diskMtime)}  比页面加载晚 ${m.lateByMs}ms${m.pageT ? `  版本章 ${clock(m.pageT)}` : "（无版本章——全新加载时 Vite 不挂章，正常）"}`);
    if (hs.stale.length > 12) text.push(`  …另有 ${hs.stale.length - 12} 条（--json 看全量）`);
  }
  if (hs.unknown.length) text.push("", `⚠️ ${hs.unknown.length} 条应用模块映射不到磁盘文件（public/ 静态件之类）——⛔ 不计入通过，见 --json`);
  if (hs.verdict !== "in-sync") text.push("", "下一步：npm run dev:driver -- reload  →  再跑一次 handshake；仍是 stale 才是「我的改动没生效」。");
  return emit("handshake", { data: hs, text, code: hs.verdict === "in-sync" ? 0 : 1 });
}

async function cmdReload() {
  const rows = await reloadAll({ timeoutMs: opts.timeoutMs });
  const bad = rows.filter((r) => !r.ready);
  const text = [`重载 ${rows.length} 份文档：就绪 ${rows.length - bad.length} ／ 未就绪 ${bad.length}`, ...rows.map((r) => `  ${truthy(r.ready)} ${r.doc.padEnd(6)} ${ms(r.ms)}  ${r.url}`)];
  if (bad.length) text.push("", "✘ 有文档没就绪——⛔ 别在没就绪的页面上采读数（读到的会是空 DOM）。");
  else text.push("", "⚠️ 池文档重载会**丢掉已挂载的插件视图**（dev 隔离 profile 不恢复工作区）⇒ 需要的视图用 `open-view <pluginId>` 重开。");
  return emit("reload", { data: { rows }, text, code: bad.length ? 1 : 0 });
}

async function cmdSections() {
  const t = await target();
  const rows = await readSections(t);
  if (!Array.isArray(rows)) {
    return emit("sections", { data: { sections: rows }, text: [`✘ 读数不是数组（实得 ${JSON.stringify(rows)}）——表达式没求值成功（'return' 后换行的 ASI 陷阱？见 selftest）`], code: 1 });
  }
  const text = rows.length
    ? rows.map((r) => `  ${r.expanded == null ? "—" : truthy(r.expanded)} ${String(r.id).padEnd(28)} h=${String(r.height).padStart(4)}  top=${String(r.top).padStart(4)}  ${r.title ?? ""}`)
    : ["（池里一个区段都没有——重载后要先用 `open-view <pluginId>` 把视图开回来）"];
  return emit("sections", { data: { sections: rows }, text });
}

async function cmdLayout() {
  const t = await target();
  const layout = await readLayout(t);
  if (!layout) return emit("layout", { data: { layout: null }, text: ["✘ 读不到（没有 `.ldk-side-panel-content`，或 fiber 上没有 `sidebar` props）"], code: 1 });
  const text = [
    `containerId     ${layout.containerId}`,
    `collapsedViews  ${JSON.stringify(layout.collapsedViews)}`,
    ...layout.containers.flatMap((c) => [`container ${c.containerId}（${c.views.length} 视图）`, ...c.views.map((v) => `  ${truthy(!v.declaredCollapsed)} ${String(v.id).padEnd(28)} ${v.title ?? ""}`)]),
  ];
  return emit("layout", { data: { layout }, text });
}

async function cmdSnapshot() {
  const t = await target();
  const snap = await readPoolSnapshot(t);
  const text = [
    `url    ${snap.url}`,
    `图标栏 ${snap.iconBar.length}：${snap.iconBar.join(", ") || "（空）"}`,
    `区段   ${snap.sections.length}：${snap.sections.map((s) => `${s.id}${s.expanded == null ? "" : s.expanded ? "(开)" : "(合)"}`).join("  ") || "（无）"}`,
    `布局   collapsedViews=${JSON.stringify(snap.layout?.collapsedViews ?? null)}  containers=${snap.layout?.containers.length ?? 0}`,
  ];
  return emit("snapshot", { data: snap, text });
}

async function cmdOpen(id) {
  if (!id) usageError("open 需要 <viewId>");
  const t = await target();
  const r = await openSection(id, { target: t });
  return emit("open", sectionReport(r));
}

async function cmdCollapse(id) {
  if (!id) usageError("collapse 需要 <viewId>");
  const t = await target();
  const r = await collapseSection(id, { target: t });
  return emit("collapse", sectionReport(r));
}

function sectionReport(r) {
  if (!r.ok) return { data: r, text: [`✘ ${r.clicked.reason}：${r.viewId}`, `  现有区段：${(r.clicked.available ?? []).join(", ") || "（无）"}`], code: 1 };
  const text = [
    `${r.viewId}  ${r.before} → ${r.after}  ${r.changed ? "（本次点了）" : "（已是目标态，未点）"}`,
    r.confirmed ? "✔ 复读确认：目标态成立" : `✘ 复读不一致：想 ${r.want}，实得 ${r.after} —— 这就是 04 那次假阴性的形态（点了没落），先跑 handshake`,
  ];
  return { data: r, text, code: r.confirmed ? 0 : 1 };
}

async function cmdOpenView(pluginId) {
  if (!pluginId) usageError("open-view 需要 <pluginId>");
  const t = await target();
  const r = await openView(pluginId, t);
  const text = r.ok ? [`✔ 已点 ${pluginId}`, `  池内区段：${r.sections.join(", ") || "（无——视图可能还在加载）"}`] : [`✘ ${r.reason}：图标栏里没有 ${pluginId}`, `  现有：${(r.iconBar ?? []).join(", ") || "（空）"}`];
  return emit("open-view", { data: r, text, code: r.ok ? 0 : 1 });
}

async function cmdMenu() {
  const t = await target();
  const r = await readViewMenu(t);
  if (!r.ok) return emit("menu", { data: r, text: [`✘ ${r.reason}`, ...(r.top ? [`  顶层项：${r.top.filter(Boolean).join(" ｜ ")}`] : [])], code: 1 });
  const text = [`顶层：${r.top.filter(Boolean).join(" ｜ ")}`, `「视图」子菜单（${r.sub.length}）：`, ...r.sub.map((s) => `  ${s.checked ? "[✓]" : "[ ]"} ${s.label}`)];
  return emit("menu", { data: r, text });
}

async function cmdHover(selector) {
  if (!selector) usageError("hover 需要 <css 选择器>");
  const t = await target();
  const props = opts.props ?? ["background-color", "color", "opacity", "border-color"];
  const mode = opts.mode ?? "mouse";
  if (mode !== "mouse" && mode !== "force") usageError("--mode 只认 mouse / force");
  const r = await hoverFace(selector, props, { target: t, pseudo: opts.pseudo ?? ["hover"], killTransitions: opts.killTransitions, mode });
  const after = mode === "mouse" ? "移到元素上" : "强制后";
  const mech = r.mechanism
    ? `机制自证 ${truthy(r.mechanism.ok)}（${mode === "mouse" ? "鼠标挪到探针" : "强制"}：常态 ${r.mechanism.baseline} → ${r.mechanism.forced}）`
    : "机制自证 ✘（没跑）";
  if (!r.ok) return emit("hover", { data: r, text: [mech, `✘ ${r.reason}：${selector}`], code: 1 });
  const text = [
    `选择器 ${r.selector}   驱动 ${mode === "mouse" ? `真鼠标（移到元素中心）` : `CSS.forcePseudoState 强制 ${r.forcedPseudoClasses.join("+")}`}` +
      (r.matchedCount > 1 ? `   命中 ${r.matchedCount} 个（只读第 1 个——零差异时先用 :not(...) / :nth-* 收窄选择器）` : ""),
    ...r.props.map((p) => `  ${p.padEnd(18)} 常态 ${String(r.baseline[p]).padEnd(22)} → ${after} ${r.forced[p]}`),
    r.differs.length
      ? `✔ 有差异的属性 ${r.differs.length}：${r.differs.join(", ")}`
      : `⚠️ 零差异。变之后 el.matches(':${r.forcedPseudoClasses.join(":') / matches(':")}') = ${JSON.stringify(r.matchesForced)}` +
        (mode === "mouse"
          ? `——true ⇒ 鼠标确实停在该节点上、这些属性本就与 hover 无关（换属性，或该面本来就没写 hover 样式）；false ⇒ 鼠标没落上去（元素被遮挡／尺寸为 0）`
          : `——true ⇒ 强制生效了、这些属性本就与 hover 无关（换属性）；false ⇒ 强制没作用到这个节点（别拿它当证据）`),
    ...(mode === "mouse" ? [] : [`ℹ️ force 模式对**深层既有节点**可能只改 matches()、不改计算值（2026-09-28 实测）⇒ 拿不准时加 --mode mouse`]),
    `零差异 ≠ 通过：加 --props 换属性，或 --kill-transitions 排除过渡/帧冻结`,
    mech,
  ];
  // 零差异仍判红：本命令的用途是「证明 hover 面确实按预期变」，静默算过 = 假证据
  return emit("hover", { data: r, text, code: r.differs.length && r.mechanism?.ok ? 0 : 1 });
}

async function cmdStates() {
  const r = readPersistedStates(opts.userDataDir);
  const text = r.found
    ? [`文件 ${r.file}`, ...(r.parseError ? [`✘ 解析失败：${r.parseError}`] : [`app.collapsedViews = ${JSON.stringify(r.app?.collapsedViews ?? null)}`, `顶级键 ${Object.keys(r.store ?? {}).join(", ") || "（空）"}`])]
    : [`（没有该文件：${r.file}）`, "⚠️ 隔离实例的用户数据目录就是 `--user-data-dir` 那个值——用 `--user-data-dir <路径>` 指给本命令，别默认去猜真 profile。"];
  return emit("states", { data: r, text, code: r.found && !r.parseError ? 0 : 1 });
}

async function cmdEval() {
  const expr = opts.file ? readFileSync(opts.file, "utf8") : positional[1];
  if (!expr) usageError("eval 需要表达式，或用 --file <路径>");
  const t = await target();
  const value = await evaluate(t, expr);
  return emit("eval", { data: { doc: opts.doc, value }, text: [JSON.stringify(value, null, 2) ?? "undefined"] });
}

async function cmdCall() {
  const method = positional[1];
  if (!method) usageError("call 需要 <CDP 方法名> [json 参数]");
  let params = {};
  if (positional[2]) {
    try {
      params = JSON.parse(positional[2]);
    } catch (e) {
      usageError(`参数不是合法 JSON：${e.message}`);
    }
  }
  const t = await pickDoc();
  const session = openSession(t);
  await session.ready;
  try {
    const result = await session.send(method, params, opts.timeoutMs);
    return emit("call", { data: { method, params, result }, text: [JSON.stringify(result, null, 2) ?? "undefined"] });
  } finally {
    session.close();
  }
}

async function cmdWait() {
  const expr = opts.file ? readFileSync(opts.file, "utf8") : positional[1] ?? READY_EXPR;
  const t = await pickDoc();
  const value = await waitFor(t.id, expr, { timeoutMs: opts.timeoutMs });
  const text = value ? [`✔ 在 ${opts.timeoutMs}ms 内成真：${JSON.stringify(value)}`] : [`✘ ${opts.timeoutMs}ms 内没成真（返回 false，⛔ 不是「通过」）`];
  return emit("wait", { data: { expression: expr, value }, text, code: value ? 0 : 1 });
}

async function cmdActivate() {
  const t = await target({ activate: false });
  try {
    await unthrottle(t);
  } catch (e) {
    return emit("activate", { data: { ok: false, error: e.message }, text: [`✘ 解除失败：${e.message}`], code: 1 });
  }
  const v = await evaluate(t, "({ visibility: document.visibilityState, hidden: document.hidden })");
  return emit("activate", { data: { ok: true, ...v }, text: [`✔ 已 Page.bringToFront ＋ focus emulation`, `  visibilityState=${v.visibility}（仍 hidden 时 await 型表达式会假超时）`] });
}

/* ───────────────────────── 判据 3：与主系列解耦 ───────────────────────── */

const PRODUCT_PATHS = ["src", "electron", "packages", "plugins"];
const USERS_HANDS = "docs/04-软件更新/00-README.md";

const gitOut = (args) => {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch (e) {
    return `(git 读不到：${e.message})`;
  }
};

async function cmdDecouple() {
  const dirty = gitOut(["status", "--porcelain", "--", ...PRODUCT_PATHS]);
  const between = opts.base ? gitOut(["diff", "--name-only", `${opts.base}..HEAD`, "--", ...PRODUCT_PATHS]) : null;
  const hands = gitOut(["status", "--porcelain", "--", USERS_HANDS]);
  const verdict = !dirty && between !== null ? true : !dirty && between === null ? true : false;
  const text = [
    `产品路径  ${PRODUCT_PATHS.join(" / ")}`,
    `未提交改动  ${dirty ? `✘\n${dirty.split("\n").map((l) => `  ${l}`).join("\n")}` : "✔ 空（软件侧一行未改）"}`,
    opts.base ? `与 ${opts.base} 之间的提交  ${between ? `✘\n${between.split("\n").map((l) => `  ${l}`).join("\n")}` : "✔ 空"}` : "（没给 --base ⇒ 只查未提交面；查整棒用 --base <本棒起点>）",
    `用户手上的文件 ${USERS_HANDS}  ${hands ? `⚠️ 有改动（${hands.split("\n").length} 条）——确认不是你动的；本命令不据此判红` : "✔ 干净"}`,
  ];
  return emit("decouple", { data: { productPaths: PRODUCT_PATHS, uncommitted: dirty, between, base: opts.base, usersHands: hands }, text, code: verdict ? 0 : 1 });
}

/* ───────────────────────── 自测（纯函数，不需实例） ───────────────────────── */

const eq = (actual, expected, what) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what ?? ""} 期望 ${b} 实得 ${a}`);
};

const has = (text, needle, what) => {
  if (!text.includes(needle)) throw new Error(`${what} 里找不到 ${JSON.stringify(needle)}——契约漂了`);
};

const SELFTESTS = [
  [
    "labelOf：按文档分标签（pool / shell / other）",
    () => {
      eq(labelOf("http://localhost:1420/pool.html"), "pool", "pool.html");
      eq(labelOf("http://localhost:1420/"), "shell", "根路径");
      eq(labelOf("http://localhost:1420/index.html"), "shell", "index.html");
      eq(labelOf("http://localhost:1420/preview.html"), "other:preview.html", "预览页");
      return "4 例";
    },
  ],
  [
    "judgeStamp 正控：容差内判 sync、超出判 stale",
    () => {
      eq(judgeStamp({ pageT: 1000, diskMtime: 1001 }), "sync", "更新 1ms");
      eq(judgeStamp({ pageT: 1000, diskMtime: 2500 }), "sync", "刚好 1500ms 容差");
      eq(judgeStamp({ pageT: 1000, diskMtime: 2600 }), "stale", "超容差 100ms");
      return "容差 1500ms";
    },
  ],
  [
    "judgeStamp 负控：缺章/缺磁盘各有独立判定，不静默算过",
    () => {
      eq(judgeStamp({ pageT: null, diskMtime: 9 }), "no-stamp", "页面没版本章");
      eq(judgeStamp({ pageT: 9, diskMtime: null }), "skipped", "磁盘读不到");
      return "no-stamp / skipped";
    },
  ],
  [
    "diskPathForUrlPath：仓内相对路径 ＋ /@fs 仓外绝对路径（含 %3A 解码）",
    () => {
      eq(diskPathForUrlPath("/src/main.tsx", ROOT), join(ROOT, "src/main.tsx"), "仓内");
      eq(diskPathForUrlPath("/@fs/E%3A/linkdesk/plugins/x/src/a.ts", ROOT), "E:/linkdesk/plugins/x/src/a.ts", "仓外 @fs");
      return "@fs 与相对两种";
    },
  ],
  [
    "仓根真的对得上（映射不是纸上谈兵）",
    () => {
      for (const rel of ["src/main.tsx", "src/pool/pool-main.tsx", "package.json"]) {
        if (!existsSync(join(ROOT, rel))) throw new Error(`仓根 ${ROOT} 下找不到 ${rel}`);
      }
      return `仓根 ${ROOT}`;
    },
  ],
  [
    "newestDiskChange：能给出「磁盘最新改动」的读数",
    () => {
      const n = newestDiskChange([join(ROOT, "src")]);
      if (!n || !(n.mtimeMs > 0)) throw new Error("没读到任何源文件");
      return `${n.path} @ ${new Date(n.mtimeMs).toLocaleTimeString("zh-CN", { hour12: false })}`;
    },
  ],
  [
    "表达式契约 · 侧栏区段（DOM 面）＋ 幂等驱动",
    () => {
      has(exprReadSections, "[data-view-id]", "readSections");
      has(exprReadSections, ".ldk-sidebar-section-header", "readSections");
      has(exprReadSections, "aria-expanded", "readSections");
      const on = exprSetSection("x", true);
      const off = exprSetSection("x", false);
      has(on, "before === true", "setSection(want=true)");
      has(off, "before === false", "setSection(want=false)");
      has(on, "changed: false", "setSection 幂等分支");
      return "4 条契约";
    },
  ],
  [
    "表达式契约 · 持久化面（React fiber 里的 sidebar）",
    () => {
      has(exprReadLayout, "__reactFiber$", "readLayout");
      has(exprReadLayout, "memoizedProps", "readLayout");
      has(exprReadLayout, "collapsedViews", "readLayout");
      return "fiber 走查 3 条";
    },
  ],
  [
    "表达式契约 · 池快照 / 图标栏 / 视图子菜单",
    () => {
      has(exprPoolSnapshot, "data-plugin-id", "readPoolSnapshot");
      has(exprPoolSnapshot, "sections:", "readPoolSnapshot");
      has(exprReadViewMenu, ".ldk-ctx-item-check", "readViewMenu");
      has(exprReadViewMenu, "视图", "readViewMenu");
      has(exprOpenView("file-tree"), '"file-tree"', "openView");
      return "5 条契约";
    },
  ],
  [
    "表达式契约 · 构建握手材料（加载时刻 ＋ 模块版本章）",
    () => {
      has(exprPageClock, "performance.timeOrigin", "pageClock");
      has(exprModuleStamps, "getEntriesByType('resource')", "moduleStamps");
      has(exprModuleStamps, "'t'", "moduleStamps");
      return "加载时刻 + 资源表 + ?t";
    },
  ],
  [
    "就绪判据覆盖两个挂载点",
    () => {
      has(READY_EXPR, "#root", "READY_EXPR");
      has(READY_EXPR, "#pool-root", "READY_EXPR");
      has(READY_EXPR, "childElementCount", "READY_EXPR");
      return "壳 + 池";
    },
  ],
  [
    "ASI 守卫：所有 `return` 都不带换行（真机踩过——`return` ＋ 换行 ⇒ 静默返回 undefined）",
    () => {
      const exprs = {
        exprReadSections,
        exprReadLayout,
        exprPoolSnapshot,
        exprPageClock,
        exprModuleStamps,
        exprSetSection: exprSetSection("x", true),
        exprReadViewMenu,
        exprOpenView: exprOpenView("p"),
        exprComputedAndMatch: exprComputedAndMatch("s", ["color"], ["hover"]),
      };
      const bad = Object.entries(exprs).filter(([, e]) => /return[ \t]*\r?\n/.test(e));
      if (bad.length) throw new Error(`${bad.map(([k]) => k).join(", ")} 的 return 后有换行 ⇒ ASI 会把它变成 \`return;\`，求值得到 undefined`);
      return `${Object.keys(exprs).length} 个表达式全过（⚠️ 字符串契约查不出这条，故单列）`;
    },
  ],
  [
    "表达式契约 · 真鼠标驱动（hover 的 mouse 模式：算元素中心 ＋ 零尺寸不给假坐标）",
    () => {
      has(exprCenterOf(".x"), "getBoundingClientRect", "exprCenterOf");
      has(exprCenterOf(".x"), "Math.round(r.left + r.width / 2)", "exprCenterOf 取中心");
      has(exprCenterOf(".x"), "x: null", "零尺寸时明确给 null（不给 (0,0) 这种看着能用的假坐标）");
      return "3 条契约";
    },
  ],
  [
    "依赖卫生：零第三方依赖 ＋ 零宿主源码 import（⛔ 池层禁 @src/core 的同精神）",
    () => {
      const files = ["lib/cdp.mjs", "lib/linkdesk-driver.mjs", "driver.mjs"];
      const bad = [];
      for (const f of files) {
        const src = readFileSync(join(HERE, f), "utf8");
        // 只认**行首**起头的 import：本自测自身也含 `from "..."` 形状的字面量（正则与模板串），
        // 不锚行首会把自测自己判成违规（第一次跑就是这么红的——留着这条注释防后人又改松）
        for (const m of src.matchAll(/^import\s[\s\S]*?from\s+["']([^"']+)["']/gm)) {
          const spec = m[1];
          if (!spec.startsWith("node:") && !spec.startsWith(".")) bad.push(`${f} → ${spec}`);
        }
        for (const needle of ["@src/", "@/electron", "import.meta.glob"]) {
          const rx = new RegExp("^import[^;]*" + needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "m");
          if (rx.test(src)) bad.push(`${f} → 行首 import 里出现 ${needle}`);
        }
      }
      if (bad.length) throw new Error(`非 node:/相对 的 import：${bad.join(", ")}`);
      return `${files.length} 文件 · 只 import node: 与相对路径`;
    },
  ],
];

function cmdSelftest() {
  const rows = [];
  for (const [name, fn] of SELFTESTS) {
    try {
      rows.push({ name, pass: true, detail: fn() });
    } catch (e) {
      rows.push({ name, pass: false, detail: e.message });
    }
  }
  const bad = rows.filter((r) => !r.pass);
  const text = [...rows.map((r) => `${r.pass ? "✔" : "✘"} ${r.name}${r.pass ? `（${r.detail}）` : `\n    ${r.detail}`}`), "", `自测 ${rows.length - bad.length}/${rows.length} 过（纯函数，不需实例、不碰磁盘产物）`];
  return emit("selftest", { data: { rows, passed: rows.length - bad.length, total: rows.length }, text, code: bad.length ? 1 : 0 });
}

/* ───────────────────────── 帮助 / 分发 ───────────────────────── */

function helpText() {
  return `LinkDesk dev 验收 driver（${CDP_BASE}）

  node scripts/dev/driver.mjs <命令> [选项]

命令
  status                     实例体检：CDP / Vite / target 清单
  reload                     硬 reload **全部** page target 并等就绪（D0#1 第一步）
  handshake                  构建握手：页面跑的代码 vs 磁盘 mtime（D0#1 判据 1）
  snapshot                   池快照：区段 ＋ 持久化面 ＋ 图标栏（一次取齐）
  sections                   侧栏各区段读数（折叠态 / 高度 / 顶坐标）
  layout                     持久化面读数（React fiber 里的 sidebar / collapsedViews）
  open <viewId>              展开区段（幂等：已是目标态就不点）
  collapse <viewId>          收起区段（同上）
  open-view <pluginId>       点图标栏把视图开回来（⛔ 硬 reload 之后要重开）
  menu                       「视图」子菜单读数（项 ＋ 勾选态）
  hover <选择器>             :hover 面样板（真鼠标移到元素上 ＋ 负控对比）
  states                     读 plugin-states.json（--user-data-dir <路径>）
  eval <表达式>              任意页面内求值
  call <Method> [json]       任意 CDP 方法
  wait <表达式>              轮询到成真（缺省用就绪判据）
  activate                   解除后台节流（bringToFront ＋ focus emulation）
  decouple [--base <ref>]    判据 3：软件侧一行未改（git 对账）
  selftest                   纯函数自测（不需实例）

选项
  --json           机器可读输出          --doc pool|shell   读哪个文档（默认 pool）
  --props a,b      hover 读哪些属性      --pseudo hover,focus
  --kill-transitions  hover 时临时关掉 transition/animation（帧冻结时读不到过渡终点值）
  --mode mouse|force  hover 驱动方式：mouse=真鼠标移到元素中心（默认，最忠实）
                      force=CSS.forcePseudoState 强制伪状态（不动物理鼠标）
  --user-data-dir  隔离实例的 profile    --root <路径>      handshake 的仓根
  --base <ref>     decouple 比对起点     --file <路径>      表达式从文件读
  --timeout <ms>   等就绪/轮询超时（默认 30000）

${START_HINT}\n`;
}

const COMMANDS = {
  status: cmdStatus,
  reload: cmdReload,
  handshake: cmdHandshake,
  snapshot: cmdSnapshot,
  sections: cmdSections,
  layout: cmdLayout,
  open: cmdOpen,
  collapse: cmdCollapse,
  "open-view": cmdOpenView,
  menu: cmdMenu,
  hover: cmdHover,
  states: cmdStates,
  eval: cmdEval,
  call: cmdCall,
  wait: cmdWait,
  activate: cmdActivate,
  decouple: cmdDecouple,
  selftest: cmdSelftest,
};

async function main() {
  const name = positional[0] ?? "help";
  if (name === "help") {
    process.stdout.write(helpText());
    return 0;
  }
  const fn = COMMANDS[name];
  if (!fn) usageError(`未知命令 ${name}`);
  return fn(positional[1]);
}

main()
  .then((code) => {
    process.exitCode = code ?? 0;
  })
  .catch((e) => {
    process.stderr.write(`✘ ${e.message}\n`);
    if (e.startupHint || /fetch failed|ECONNREFUSED|HTTP 4\d\d|HTTP 5\d\d/.test(e.message)) process.stderr.write(`${START_HINT}\n`);
    process.exitCode = 1;
  });
