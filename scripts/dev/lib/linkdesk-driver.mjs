/**
 * scripts/dev/lib/linkdesk-driver.mjs —— **LinkDesk 语义层**：把「一次性 scratch 脚本里反复重写的那套前戏」
 * 收敛成一组语义助手（`D0#2`），并补上 `D0#1` 的两件（硬 reload 前置 ＋ 构建握手）。
 *
 * 归属：**开发期工具**——不进软件产物、零用户可见面、不占版本号（AI 友好化 · 系列外 `D0#1`–`D0#3`）。
 * 传输层在 `cdp.mjs`；本文件只描述「LinkDesk 的界面长什么样、怎么驱、怎么读」。
 *
 * ── 收敛自哪些一次性脚本（`D0#2` 的病根：17 个 scratch 驱动各写一遍前戏）────────────
 *   `scratch/_04-*.mjs`（12 个）＋ `_cdp-eval.mjs` / `_cdp-eval-all.mjs` / `cdp.mjs` / `_sticky-probe.mjs`
 *   ⇒ 那 17 个脚本里**每个都带**的三段前戏，在这里各成一处：
 *     ① 挑 target（按内容或按 URL）        → `resolveTargets()` / `pickPool()` / `pickShell()`
 *     ② `sleep` ＋「读 sections」           → `readSections()`
 *     ③ 「右键 header → 视图子菜单 → 点一项」→ `readViewMenu()`（读）／`setSection()`（驱）
 *   另有一段**只被写过一次、但显然会再需要**的：`readLayout()` 的 React fiber 走查
 *   （`scratch/_04-read-pool-props.mjs`）——它是「持久化那一侧的读数」，与 DOM 读数是**两个真相源**，
 *   04 那次假阴性正是「一个动了、另一个没动」⇒ 两个读数必须能一键并排取。
 *
 * ── 🔴 两条最容易误判的事（写在这里防下一个人重踩）──────────────────────
 *   1. **重载池文档会丢已挂载视图**（memory `cdp-ui-automation` §「复用上一轮活实例」）：
 *      dev 的隔离 profile 不恢复工作区 ⇒ `reloadAll()` 之后池里只剩「欢迎 ＋ 发行说明」，
 *      插件视图要**重新打开** ⇒ 用 `openView(pluginId)`（AI 可点图标栏；⛔ 图标栏里没有的视图要人开）。
 *   2. **两个文档各加载同一份模块** ⇒ 手写对账一律**按文档分组**（`doc` 字段），别跨文档求和。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { CDP_BASE, evaluate, exprCenterOf, labelOf, listTargets, moveMouse, reload, sleep, waitReady, withForcedPseudo, withTarget } from "./cdp.mjs";

/* ══════════════════════════════════════════════════════════════════════
 * 一、页面侧读数（在页面里跑的表达式；页面代码里 ⛔ 不用反引号——外层是模板串）
 * ══════════════════════════════════════════════════════════════════════ */

/** 侧栏各区段：`[data-view-id]` 外层 ＋ 其内的折叠头 `.ldk-sidebar-section-header[aria-expanded]` */
const READ_SECTIONS_BODY = `
  [...document.querySelectorAll('[data-view-id]')].map(function (el) {
    var head = el.querySelector('.ldk-sidebar-section-header[aria-expanded]');
    var r = el.getBoundingClientRect();
    var titleEl = head ? head.querySelector('.ldk-sidebar-section-title') : null;
    return {
      id: el.getAttribute('data-view-id'),
      collapsible: !!head,
      expanded: head ? head.getAttribute('aria-expanded') === 'true' : null,
      height: Math.round(r.height),
      top: Math.round(r.top),
      title: titleEl ? titleEl.textContent : null,
    };
  })
`;

/**
 * 持久化那一侧的读数：走 React fiber 找 `memoizedProps.sidebar`（＝侧栏快照的来源）。
 * 移植自 `scratch/_04-read-pool-props.mjs`（那段是实测走通过的，⛔ 别改选择器形状）。
 */
const LAYOUT_WALK = `
  (function walkLayout() {
    var anchor = document.querySelector('.ldk-side-panel-content') || document.querySelector('#pool-root') || document.body;
    if (!anchor) return null;
    var key = Object.keys(anchor).find(function (k) {
      return k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0;
    });
    if (!key) return null;
    for (var f = anchor[key]; f; f = f.return) {
      var p = f.memoizedProps;
      if (p && typeof p === 'object' && p.sidebar && typeof p.sidebar === 'object') {
        var sb = p.sidebar;
        return {
          containerId: sb.containerId,
          collapsedViews: sb.collapsedViews == null ? null : sb.collapsedViews,
          containers: (sb.containers || []).map(function (c) {
            return {
              containerId: c.containerId,
              views: (c.views || []).map(function (v) {
                return { id: v.id, title: v.title, declaredCollapsed: v.collapsed === true, role: v.role };
              }),
            };
          }),
        };
      }
    }
    return null;
  })()
`;

export const exprReadSections = `(function () { return (${READ_SECTIONS_BODY}); })()`;
export const exprReadLayout = `(function () { return (${LAYOUT_WALK}); })()`;

/** 池快照 = 「DOM 面 ＋ 持久化面 ＋ 图标栏」一次取齐（并排读数靠它） */
export const exprPoolSnapshot = `(function () {
  return {
    url: location.href,
    title: document.title,
    sections: (${READ_SECTIONS_BODY}),
    layout: (${LAYOUT_WALK}),
    iconBar: [...document.querySelectorAll('[data-plugin-id]')].map(function (el) { return el.getAttribute('data-plugin-id'); }),
  };
})()`;

/**
 * 页面**已加载**的同源模块 ＋ 它们的 `?t=` 版本章。
 * ⚠️ 实测（2026-09-28，全新实例）：**全新加载的页面里一条 `?t=` 都没有**——Vite 只在模块被
 * HMR 失效过之后才往 import 上挂 `?t=`。所以本读数只是**附加证人**，主判据见 `buildHandshake`。
 */
export const exprModuleStamps = `(function () {
  var out = [];
  var origin = location.origin;
  performance.getEntriesByType('resource').forEach(function (e) {
    var u; try { u = new URL(e.name); } catch (err) { return; }
    if (u.origin !== origin) return;
    var t = u.searchParams.get('t');
    out.push({ path: u.pathname, t: t ? Number(t) : null });
  });
  return { url: location.href, title: document.title, entries: out };
})()`;

/** 页面加载时刻（导航起点）—— 磁盘改动晚于它 ⇒ 页面加载时这份代码还不存在 ⇒ 页面必然没有它 */
export const exprPageClock = `(function () {
  return { url: location.href, timeOrigin: performance.timeOrigin, now: Date.now() };
})()`;

const exprComputed = (selector, props) => `(function () {
  var el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  var cs = getComputedStyle(el);
  var out = {};
  ${JSON.stringify(props)}.forEach(function (p) { out[p] = cs.getPropertyValue(p); });
  return out;
})()`;

/**
 * 同上 ＋ 顺带读「这个节点**当下**匹不匹配这些伪状态」（`el.matches(':hover')`）
 * ＋「这个选择器一共命中几个」（`count`）。
 * 为什么需要 `matches`：零差异时，一读就能分开「强制没作用到这个节点」与「这些属性本就与 hover 无关」
 * ——不分开的话零差异是**假证据**（`AI#47` 会据此误判「hover 面无样式」）。
 * 为什么需要 `count`：`querySelector` 只取**第 1 个**命中。若第 1 个是特殊变体，读到的是变体的读数
 * ——实测 `D0#3`：`.ldk-icon-btn` 第 1 个是 `.active`，而 `.ldk-icon-btn.active`（`background: radial-gradient…`）
 * 与 `.ldk-icon-btn:hover` 同权重（都是 2 个 class 级）**且更靠后 ⇒ hover 规则被压掉**，
 * 于是「悬停不变色」看着像 hover 面坏了，其实是被查的那个按钮本来就不该变。`count > 1` 就是这条的警报。
 */
export const exprComputedAndMatch = (selector, props, pseudo) => `(function () {
  var all = document.querySelectorAll(${JSON.stringify(selector)});
  var el = all[0];
  if (!el) return null;
  var cs = getComputedStyle(el);
  var out = { count: all.length, props: {}, matches: {} };
  ${JSON.stringify(props)}.forEach(function (p) { out.props[p] = cs.getPropertyValue(p); });
  ${JSON.stringify(pseudo)}.forEach(function (p) {
    try { out.matches[p] = el.matches(':' + p); } catch (e) { out.matches[p] = 'n/a'; }
  });
  return out;
})()`;

/**
 * 树内某区段的折叠头（读 or 驱）。**幂等**：已到目标态就不点
 * （⚠️ `SidebarSection` 的 header `onClick` 是 toggle ⇒ 无条件点会把上一轮的遗留态翻反，
 *  memory §「共享 SelectBox 驱动三坑」里的 `ensureOpen()` 同款教训）。
 */
export const exprSetSection = (viewId, want) => `(function () {
  var pane = document.querySelector('[data-view-id=' + JSON.stringify(${JSON.stringify(viewId)}) + ']');
  if (!pane) return {
    ok: false, reason: 'no-such-view', viewId: ${JSON.stringify(viewId)},
    available: [...document.querySelectorAll('[data-view-id]')].map(function (el) { return el.getAttribute('data-view-id'); }),
  };
  var head = pane.querySelector('.ldk-sidebar-section-header[aria-expanded]');
  if (!head) return { ok: false, reason: 'not-collapsible', viewId: ${JSON.stringify(viewId)} };
  var before = head.getAttribute('aria-expanded') === 'true';
  if (before === ${want ? "true" : "false"}) return { ok: true, changed: false, expanded: before, viewId: ${JSON.stringify(viewId)} };
  head.click();
  return { ok: true, changed: true, expandedBefore: before, viewId: ${JSON.stringify(viewId)} };
})()`;

/** 侧栏 header 右键 →「视图」子菜单：读出**项与勾选态**（只读；菜单会自己关，跑完顺手 Escape） */
export const exprReadViewMenu = `(async function () {
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var hdr = document.querySelector('.ldk-side-panel-header');
  if (!hdr) return { ok: false, reason: 'no-side-panel-header' };
  hdr.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 240, clientY: 120 }));
  await sleep(200);
  var items = [...document.querySelectorAll('.ldk-ctx-item')];
  var top = items.map(function (el) { var l = el.querySelector('.ldk-ctx-item-label'); return l ? l.textContent : null; });
  var vi = items.find(function (el) { var l = el.querySelector('.ldk-ctx-item-label'); return l && l.textContent.indexOf('视图') >= 0; });
  if (!vi) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return { ok: false, reason: 'no-view-submenu', top: top }; }
  vi.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  await sleep(250);
  var menus = [...document.querySelectorAll('.ldk-ctx-menu')];
  var sub = [...menus[menus.length - 1].querySelectorAll('.ldk-ctx-item')].map(function (el) {
    var l = el.querySelector('.ldk-ctx-item-label');
    var c = el.querySelector('.ldk-ctx-item-check');
    return { label: l ? l.textContent : null, checked: !!(c && c.textContent) };
  });
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(150);
  return { ok: true, top: top, sub: sub };
})()`;

/** 点图标栏打开某插件视图（**硬 reload 之后重开视图**用的；图标栏里没有的视图要人开） */
export const exprOpenView = (pluginId) => `(async function () {
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(150);
  var icon = document.querySelector('[data-plugin-id=' + JSON.stringify(${JSON.stringify(pluginId)}) + ']');
  if (!icon) return {
    ok: false, reason: 'no-icon', pluginId: ${JSON.stringify(pluginId)},
    iconBar: [...document.querySelectorAll('[data-plugin-id]')].map(function (el) { return el.getAttribute('data-plugin-id'); }),
  };
  icon.click();
  await sleep(900);
  return {
    ok: true, pluginId: ${JSON.stringify(pluginId)},
    sections: [...document.querySelectorAll('[data-view-id]')].map(function (el) { return el.getAttribute('data-view-id'); }),
  };
})()`;

/* ══════════════════════════════════════════════════════════════════════
 * 二、目标（target）寻址
 * ══════════════════════════════════════════════════════════════════════ */

/** 按文档分组的全部 target（连不上把原因讲清楚，别甩 fetch 的原始错） */
export async function resolveTargets() {
  let all;
  try {
    all = await listTargets();
  } catch (e) {
    const err = new Error(`连不上 CDP（${CDP_BASE}）：${e.message}`);
    err.startupHint = true;
    throw err;
  }
  return {
    all,
    shell: all.find((t) => labelOf(t.url) === "shell") ?? null,
    pool: all.find((t) => labelOf(t.url) === "pool") ?? null,
  };
}

/** 池文档（侧栏/图标栏/插件视图都在这份文档里；`scratch/_cdp-eval.mjs` 挑的就是它） */
export async function pickPool() {
  const { all, pool } = await resolveTargets();
  if (!pool) throw new Error(`没找到池文档（pool.html）。现有 target：${all.map((t) => `${labelOf(t.url)} <${t.url}>`).join(" ｜ ") || "（无）"}`);
  return pool;
}

/** 壳窗口文档（`index.html`） */
export async function pickShell() {
  const { all, shell } = await resolveTargets();
  if (!shell) throw new Error(`没找到壳窗口（index.html）。现有 target：${all.map((t) => `${labelOf(t.url)} <${t.url}>`).join(" ｜ ") || "（无）"}`);
  return shell;
}

/* ══════════════════════════════════════════════════════════════════════
 * 三、`D0#1` 硬 reload 前置 ＋ 构建握手
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 硬 reload **全部** page target 并等就绪——验收 driver 的第一步（先把 HMR 的不确定性剥掉）。
 * 返回每个文档的 `{ doc, url, ready, ms }`；`ready:false` **就是红灯**（调用方别当成功）。
 */
export async function reloadAll({ timeoutMs = 30000, settleMs = 800 } = {}) {
  const { all } = await resolveTargets();
  const out = [];
  for (const t of all) {
    const started = Date.now();
    await reload(t, { settleMs });
    const ready = await waitReady(t.id, { timeoutMs });
    out.push({ doc: labelOf(t.url), url: t.url, targetId: t.id, ready: Boolean(ready), ms: Date.now() - started });
  }
  return out;
}

/** `?t=` 章 vs 磁盘 mtime 的判定（**纯函数**——自测就是打它，别让判据只活在实机里） */
export function judgeStamp({ pageT, diskMtime, toleranceMs = 1500 }) {
  if (pageT == null) return "no-stamp";
  if (diskMtime == null) return "skipped";
  return diskMtime - pageT > toleranceMs ? "stale" : "sync";
}

/** 页面 URL 路径 → 磁盘路径（`/@fs/<绝对路径>` 是插件仓等仓外文件；其余相对仓根） */
export function diskPathForUrlPath(urlPath, root) {
  const p = decodeURIComponent(urlPath);
  if (p.startsWith("/@fs/")) return p.slice("/@fs/".length);
  return join(root, p.replace(/^\/+/, ""));
}

/** 与应用同源的**源码**前缀——只有这些进逐文件对账；`@vite/client`／预构建 deps／public 静态件不算 */
const APP_PREFIXES = ["/src/", "/plugins/", "/bundled-plugins/"];

const SKIP_DIRS = new Set(["node_modules", "dist", "dist-electron", ".git", ".vite", "release"]);

/** 「磁盘上最新改动的源文件」——现象与代码对不上的时候，第一个该看的读数 */
export function newestDiskChange(roots, { exts = [".ts", ".tsx", ".css", ".json"] } = {}) {
  let best = null;
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (exts.some((x) => e.name.endsWith(x))) {
        try {
          const m = statSync(full).mtimeMs;
          if (!best || m > best.mtimeMs) best = { path: full, mtimeMs: m };
        } catch {
          /* 读不到就跳过 */
        }
      }
    }
  };
  for (const r of roots) walk(r);
  return best;
}

function gitInfo(root) {
  const run = (args) => {
    try {
      return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  };
  const head = run(["rev-parse", "--short", "HEAD"]);
  const porcelain = run(["status", "--porcelain"]);
  return { head, changes: porcelain ? porcelain.split("\n").filter(Boolean) : [] };
}

/**
 * 构建握手：**把「代码是否已生效」变成当场可辨的读数**（`D0#1` 判据 1）。
 *
 * ── 主判据 = 「页面加载时刻 vs 磁盘 mtime」（实测修正 2026-09-28）────────────────
 *   原设想用页面里模块的 `?t=` 章对磁盘 mtime，**实测不成立**：全新加载的页面里 `?t=`
 *   一条都没有（Vite 只在模块被 HMR 失效过之后才挂章）——隔离实例上 326 条资源 0 条带章，
 *   旧实现直接判成 no-evidence。故主判据改成：
 *     ① 页面加载时刻 = `performance.timeOrigin`；
 *     ② 磁盘上任何**晚于它**的源文件改动 ⇒ 页面加载时这份代码还不存在 ⇒ **页面必然没有它**
 *        （HMR 有没有事后塞进来，是**不确定**的——04 那次假阴性就活在这个不确定里）；
 *     ③ `?t=` 章退为**附加证人**：有章且章比磁盘旧 ⇒ 铁证 stale。
 *
 * ── 为什么按文档分别判 ────────────────────────────────────────────────
 *   壳窗口与池文档是两份文档、两条模块图：只改壳侧模块时**池文档的 HMR 不会动**
 *   ⇒ 池的 loadedAt 早于该文件 mtime，正好被这条判据抓住（这正是 04 的病灶）。聚合取最坏。
 *
 * ── 覆盖边界（诚实声明）────────────────────────────────────────────────
 *   ① 只对**应用源码**（`/src/`、`/plugins/`、`/bundled-plugins/`、仓内 `/@fs/`）逐文件对账，
 *      其余（`@vite/client`、预构建 deps、public/ 静态件）计入 `ignored`，⛔ 不混进来充数；
 *   ② 页面**没挂载**的插件视图不在模块表里 ⇒ 逐文件面看不见它，但 ①（全局 newestDisk）仍会红；
 *   ③ `not-on-disk` / 读失败一律进 `unknown` 计数，⛔ 不静默算过（同「门禁找不到产物不许跳过」）。
 */
export async function buildHandshake({ root = process.cwd(), extraRoots = [], toleranceMs = 1500 } = {}) {
  const { all } = await resolveTargets();
  const newestDisk = newestDiskChange([resolve(root, "src"), resolve(root, "electron"), ...extraRoots]);
  const app = (path, disk) => APP_PREFIXES.some((p) => path.startsWith(p)) || (path.startsWith("/@fs/") && resolve(disk).startsWith(resolve(root)));
  const docs = [];
  const modules = [];
  let ignored = 0;

  for (const t of all) {
    const doc = labelOf(t.url);
    let clock;
    let stamps;
    try {
      clock = await evaluate(t, exprPageClock);
      stamps = await evaluate(t, exprModuleStamps);
    } catch (e) {
      docs.push({ doc, url: t.url, error: e.message });
      continue;
    }
    const loadedAt = clock.timeOrigin;
    const seen = new Set();
    const rows = [];
    for (const e of stamps.entries) {
      if (seen.has(e.path)) continue;
      seen.add(e.path);
      const disk = diskPathForUrlPath(e.path, root);
      if (!app(e.path, disk)) {
        ignored++;
        continue;
      }
      const onDisk = existsSync(disk);
      const diskMtime = onDisk ? statSync(disk).mtimeMs : null;
      const verdict = !onDisk
        ? "not-on-disk"
        : diskMtime > loadedAt + toleranceMs
          ? "newer-than-page"
          : e.t != null && judgeStamp({ pageT: e.t, diskMtime, toleranceMs }) === "stale"
            ? "stale-stamp"
            : "in-page";
      rows.push({ doc, path: e.path, disk, pageT: e.t, diskMtime, lateByMs: diskMtime == null ? null : Math.round(diskMtime - loadedAt), verdict });
    }
    modules.push(...rows);
    const bad = rows.filter((r) => r.verdict !== "in-page");
    docs.push({
      doc,
      url: t.url,
      loadedAt,
      moduleCount: rows.length,
      skipped: rows.filter((r) => r.verdict === "not-on-disk").length,
      newerModules: rows.filter((r) => r.verdict === "newer-than-page" || r.verdict === "stale-stamp"),
      verdict: bad.length ? "stale" : rows.length ? "in-sync" : "no-evidence",
    });
  }

  const staleDocs = docs.filter((d) => d.verdict === "stale");
  return {
    git: gitInfo(root),
    newestDisk,
    toleranceMs,
    docs,
    modules,
    stale: modules.filter((m) => m.verdict === "newer-than-page" || m.verdict === "stale-stamp"),
    unknown: modules.filter((m) => m.verdict === "not-on-disk"),
    ignored,
    // 全局也看一眼磁盘最新改动：改了但**页面没加载**的文件逐文件面看不见，全局面能看见
    globalNewestLateByMs: newestDisk ? Math.round(newestDisk.mtimeMs - Math.max(...docs.map((d) => d.loadedAt ?? 0))) : null,
    verdict: staleDocs.length ? "stale" : docs.some((d) => d.verdict === "in-sync") ? "in-sync" : "no-evidence",
  };
}

/* ══════════════════════════════════════════════════════════════════════
 * 四、`D0#2` 语义助手（openSection / collapseSection / readSections / readLayout / readPoolSnapshot
 *     ＋ 从 17 个一次性脚本里提炼出来的 viewMenu / openView / hoverFace）
 * ══════════════════════════════════════════════════════════════════════ */

/** 侧栏各区段读数（DOM 面）：折叠态 ＋ 高度 ＋ 顶坐标 */
export const readSections = async (target) => evaluate(target ?? (await pickPool()), exprReadSections);

/** 持久化面读数：React fiber 里的 `sidebar`（`collapsedViews` / `containers`） */
export const readLayout = async (target) => evaluate(target ?? (await pickPool()), exprReadLayout);

/** 池快照：DOM 面 ＋ 持久化面 ＋ 图标栏，一次取齐（并排读数用） */
export const readPoolSnapshot = async (target) => evaluate(target ?? (await pickPool()), exprPoolSnapshot);

/** 「视图」子菜单（只读）：项与勾选态 */
export const readViewMenu = async (target) => evaluate(target ?? (await pickPool()), exprReadViewMenu);

/** 点图标栏打开视图（重载之后重开用） */
export const openView = async (pluginId, target) => evaluate(target ?? (await pickPool()), exprOpenView(pluginId));

/**
 * 展开/收起某区段——**走真实业务链路**（`header.click()` ⇒ React onClick ⇒ 侧栏快照 ⇒ 持久化），
 * 不绕过 React。`settleMs` 后复读一次，返回 `{ before, after, changed, confirmed }`。
 * ⚠️ `confirmed:false` 是有意义的结果（＝「点了但没落」），别当异常吞掉——04 那次假阴性正是这个形态。
 */
async function setSection(viewId, want, { target, settleMs = 700 } = {}) {
  const t = target ?? (await pickPool());
  const before = await readSections(t);
  const clicked = await evaluate(t, exprSetSection(viewId, want));
  if (!clicked.ok) return { ok: false, viewId, want, clicked, before, after: before, confirmed: false };
  await sleep(settleMs);
  const after = await readSections(t);
  const pick = (snap) => snap.find((s) => s.id === viewId)?.expanded ?? null;
  return { ok: true, viewId, want, changed: clicked.changed, before: pick(before), after: pick(after), confirmed: pick(after) === want, clicked };
}

export const openSection = (viewId, opts) => setSection(viewId, true, opts);
export const collapseSection = (viewId, opts) => setSection(viewId, false, opts);

/**
 * 机制自证：`CSS.forcePseudoState` **到底有没有生效**？
 *
 * 为什么必须有这一件：`hoverFace` 的「零差异」有两种完全不同的含意——①该选择器本就没 hover 样式；
 * ②强制根本没生效（nodeId 过期／选择器命中的是别的节点）。分不开就 = 假证据（`AI#47` 的验收面
 * 自检最怕的就是这个）。做法 = 往页面塞一个**必然有 hover 差异**的探针元素（自建 `<style>`），
 * 强制 hover 读一次：变色 ⇒ 机制通；不变 ⇒ 机制坏，此时**任何 hover 读数都不作数**。跑完拔除探针。
 */
const PROBE_ID = "driver-hover-probe";
const PROBE_STYLE_ID = "__driver_hover_probe_style__";

/**
 * 探针的落点按驱动方式分：
 * · `mouse` —— 必须放在**鼠标真能到**的位置（右下角 8×8，盖在池背景上），跑完拔除；
 * · `force` —— 放到屏幕外（`left:-9999px`），因为强制伪状态不需要它可见。
 */
const PROBE_PAINT = (mode) =>
  `(function () {
     var s = document.createElement('style'); s.id = '${PROBE_STYLE_ID}';
     s.textContent = '.${PROBE_ID}{background-color:rgb(1,2,3);} .${PROBE_ID}:hover{background-color:rgb(9,8,7);}';
     document.head.appendChild(s);
     var d = document.createElement('div'); d.id = '${PROBE_ID}'; d.className = '${PROBE_ID}';
     d.style.cssText = 'position:fixed;width:8px;height:8px;z-index:2147483647;' + (${JSON.stringify(mode)} === 'mouse' ? 'right:0;bottom:0;' : 'left:-9999px;top:0;');
     document.body.appendChild(d);
     return true;
   })()`;
const PROBE_WIPE = `(function () { var s = document.getElementById('${PROBE_STYLE_ID}'); if (s) s.remove(); var d = document.getElementById('${PROBE_ID}'); if (d) d.remove(); return true; })()`;

async function verifyHoverMechanism({ target, mode = "force" } = {}) {
  const t = target ?? (await pickPool());
  return withTarget(t, async (session) => {
    await session.evaluate(PROBE_WIPE);
    await session.evaluate(PROBE_PAINT(mode));
    try {
      const read = () => session.evaluate(exprComputed(`#${PROBE_ID}`, ["background-color"]));
      if (mode === "mouse") {
        const c = await session.evaluate(exprCenterOf(`#${PROBE_ID}`));
        await moveMouse(session, 1, 1);
        const baseline = await read();
        await moveMouse(session, c.x, c.y);
        await sleep(120);
        const hovered = await read();
        await moveMouse(session, 1, 1);
        return { ok: hovered?.["background-color"] === "rgb(9, 8, 7)", mode, baseline: baseline?.["background-color"] ?? null, forced: hovered?.["background-color"] ?? null };
      }
      const baseline = await read();
      const forced = await withForcedPseudo(session, `#${PROBE_ID}`, ["hover"], read);
      return { ok: forced?.["background-color"] === "rgb(9, 8, 7)", mode, baseline: baseline?.["background-color"] ?? null, forced: forced?.["background-color"] ?? null };
    } finally {
      await session.evaluate(PROBE_WIPE);
    }
  });
}

const KILL_TRANSITIONS_ID = "__driver_kill_transitions__";
const KILL_TRANSITIONS_CSS = "*{transition:none !important;animation:none !important;}";

/**
 * `:hover` 面的样板（`D0#3` 顺手件，给 `AI#47` 用）：读常态 → 变 hover → 再读 → 对比。
 * `forced` 与 `baseline` 不同才算真的变过（同值 ⇒ 该属性本就与 hover 无关，别当证据）。
 * `mechanism.ok` = 机制自证；`matchesForced` = 变之后该节点是否真处于伪状态。
 *
 * ── 两种驱动方式（`mode`）──────────────────────────────────────────────
 * · `mouse`（**默认**）：把真实鼠标挪到元素中心。页面上的 hover 是真的，最忠实。
 * · `force`：`CSS.forcePseudoState` 强制伪状态。不动物理鼠标，适合不便移动指针的场合；
 *   但 2026-09-28 在池文档上实测到**它只影响 `matches()`、对深层既有节点的计算值不生效**
 *   （`.ldk-icon-btn` / `.ldk-sidebar-section-header` 都读不出差异，而合成探针能变）
 *   ⇒ 拿不准时用 `mouse`，或先看 `mechanism`/`matchesForced` 两个读数再下结论。
 *
 * 🔴 `settleMs` / `killTransitions`（2026-09-28 实测）：仓里 hover 面普遍带 `transition`
 *   （`SidebarSection.css` = `color 0.1s ease`、`IconBarZone.css` = `background 150ms`），
 *   而过渡由渲染帧驱动：窗口被遮挡时帧不跑 ⇒ 过渡冻在起点值，读到「常态 = hover 后」的假零差异。
 *   故先等 `settleMs`；仍零差异时用 `killTransitions` 把过渡关掉再读一次。
 */
export async function hoverFace(
  selector,
  props = ["background-color", "color", "opacity"],
  { target, pseudo = ["hover"], settleMs = 300, killTransitions = false, mode = "mouse" } = {}
) {
  const t = target ?? (await pickPool());
  const mechanism = await verifyHoverMechanism({ target: t, mode });
  return withTarget(t, async (session) => {
    const read = async () => {
      await sleep(settleMs);
      return session.evaluate(exprComputedAndMatch(selector, props, pseudo));
    };
    const park = async () => moveMouse(session, 1, 1);
    if (killTransitions) {
      await session.evaluate(`(function () { var s = document.getElementById('${KILL_TRANSITIONS_ID}'); if (s) s.remove(); s = document.createElement('style'); s.id = '${KILL_TRANSITIONS_ID}'; s.textContent = '${KILL_TRANSITIONS_CSS}'; document.head.appendChild(s); return true; })()`);
    }
    try {
      if (mode === "mouse") await park();
      const baseline = await read();
      if (baseline === null) return { ok: false, reason: "no-match", selector, mode, forcedPseudoClasses: pseudo, mechanism };

      let forced;
      if (mode === "mouse") {
        const c = await session.evaluate(exprCenterOf(selector));
        if (!c || c.x === null) return { ok: false, reason: "zero-size（元素不可见／尺寸为 0，鼠标挪不上去）", selector, mode, mechanism, baseline: baseline.props };
        await moveMouse(session, c.x, c.y);
        forced = await read();
        await park();
      } else {
        const res = await withForcedPseudo(session, selector, pseudo, read);
        if (res && res.ok === false) return { ok: false, reason: res.reason, selector, mode, forcedPseudoClasses: pseudo, mechanism };
        forced = res;
      }
      const differs = props.filter((p) => forced?.props?.[p] !== baseline.props[p]);
      return {
        ok: true,
        selector,
        mode,
        matchedCount: baseline.count,
        forcedPseudoClasses: pseudo,
        props,
        baseline: baseline.props,
        forced: forced?.props ?? null,
        matchesForced: forced?.matches ?? null,
        differs,
        mechanism,
        settleMs,
        killTransitions,
      };
    } finally {
      if (killTransitions) await session.evaluate(`(function () { var s = document.getElementById('${KILL_TRANSITIONS_ID}'); if (s) s.remove(); return true; })()`);
      await moveMouse(session, 1, 1).catch(() => {});
    }
  });
}

/* ══════════════════════════════════════════════════════════════════════
 * 五、落盘那一侧（`plugin-states.json`）——与界面读数并排的第二侧真相
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 读 `plugin-states.json`（只读、缺文件返回 null）。
 * 形状（`src/core/services/plugins/PluginStateService.ts`）：`{ "<pluginId>": { "<key>": … } }`
 * ——侧栏折叠落在 `app.collapsedViews`（`ViewContainerService/collapsed.ts` 的 `COLLAPSED_KEY`）。
 * `userDataDir` 缺省时按 `%APPDATA%/linkdesk` 猜（⚠️ 隔离实例必须显式传 `--user-data-dir` 那个路径）。
 */
export function readPersistedStates(userDataDir) {
  const dir = userDataDir || join(process.env.APPDATA || "", "linkdesk");
  const file = join(dir, "plugin-states.json");
  if (!existsSync(file)) return { userDataDir: dir, file, found: false, store: null };
  try {
    const store = JSON.parse(readFileSync(file, "utf8"));
    return { userDataDir: dir, file, found: true, store, app: store?.app ?? null };
  } catch (e) {
    return { userDataDir: dir, file, found: true, store: null, parseError: e.message };
  }
}
