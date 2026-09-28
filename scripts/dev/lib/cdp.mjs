/**
 * scripts/dev/lib/cdp.mjs —— CDP **传输层**（零 LinkDesk 业务知识：只负责连、发、读、等）。
 *
 * 归属：**开发期工具**——不进软件产物、零用户可见面、不占版本号（AI 友好化 · 系列外 `D0#2`）。
 * 用法见同目录 `../README.md`；业务语义（侧栏/布局/池快照）在 `linkdesk-driver.mjs`，本文件不碰。
 *
 * ── 连法照抄，别重写 ──────────────────────────────────────────────────
 *   连接形状复制自仓内已服役的两处，⛔ 不再发明第三套：
 *   · `scripts/runtime-style-audit.mjs` 的 `listTargets()` / `evaluateOn()`（带 `labelOf()` 分文档）；
 *   · `scratch/_cdp-eval.mjs` 的「按内容挑 target」与 `scratch/cdp.mjs` 的指令-回执配对。
 *   Node 24 内置 `WebSocket`／`fetch` ⇒ **零依赖**（本仓不装 `ws`）。
 *
 * ── 三条实测纪律（照 memory `cdp-ui-automation`，踩过）────────────────
 *   1. `targetId` 必须用 `/json/list` 给的**完整 ID**（8 字符前缀连不上）。
 *   2. **左键 `Input.dispatchMouseEvent` 打不动 React `onClick`**——触发点击一律 `el.click()`
 *      或 `dispatchEvent(new MouseEvent('click',{bubbles:true}))`；只有右键开菜单走
 *      `Input.dispatchMouseEvent button:'right'`（本文件的 `evaluate(...,{userGesture:true})`
 *      默认带真实手势标记，正是为此）。
 *   3. 后台节流：`document.visibilityState === 'hidden'` 时 `await` 型求值会超时。
 *      `unthrottle()` 是现成的解除包（`Page.bringToFront` ＋ `Emulation.setFocusEmulationEnabled`）。
 *
 * 环境变量 `LINKDESK_CDP` 可改 CDP 地址（默认 `http://127.0.0.1:9222`）——**跑隔离实例时必用**
 * （见 `../README.md`「起一个隔离实例」）。
 */

/** CDP HTTP 端点（`LINKDESK_CDP` 可改；默认 = `npm run electron:dev` 自带的 9222） */
export const CDP_BASE = process.env.LINKDESK_CDP || "http://127.0.0.1:9222";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 文档标签：`pool` ／ `shell` ／ `other:<文件名>`。
 * 判据 = URL 末段——`pool.html` 是池文档、`index.html`（或空）是壳窗口。
 * ⚠️ 同一份 CSS/模块会在两个文档各加载一次 ⇒ **对账必须按文档分组**，跨文档求和是重复计数
 * （`runtime-style-audit.mjs` 的 `--compare-static` 踩过这条）。
 */
export function labelOf(url) {
  try {
    const base = new URL(url).pathname.split("/").pop() || "";
    if (base === "pool.html") return "pool";
    if (base === "" || base === "index.html") return "shell";
    return `other:${base}`;
  } catch {
    return `other:${url ?? "?"}`;
  }
}

/** 实例身份（连不上就抛——调用方负责讲人话） */
export async function probeInstance() {
  const res = await fetch(`${CDP_BASE}/json/version`);
  if (!res.ok) throw new Error(`CDP /json/version HTTP ${res.status}`);
  return res.json();
}

/** 全部 page target（只要有 http(s) url ＋ ws 端点；`/@fs` 与 devtools 页一并回来，由调用方筛） */
export async function listTargets() {
  const res = await fetch(`${CDP_BASE}/json/list`);
  if (!res.ok) throw new Error(`CDP /json/list HTTP ${res.status}`);
  const list = await res.json();
  return list.filter((t) => t.type === "page" && /^https?:/.test(t.url ?? "") && t.webSocketDebuggerUrl);
}

/** 开一条会话（指令-回执配对 ＋ 超时；用完必须 `close()`，或改用 `withTarget()`） */
export function openSession(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let seq = 0;
  let closed = false;

  const send = (method, params = {}, timeoutMs = 30000) =>
    new Promise((resolve, reject) => {
      if (closed) return reject(new Error("会话已关闭"));
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP ${method} 超时（${timeoutMs}ms）`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });

  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject, timer } = pending.get(msg.id);
    clearTimeout(timer);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message ?? JSON.stringify(msg.error))) : resolve(msg.result);
  });

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error("WebSocket 连接失败（target 可能已关闭／已 reload）")), { once: true });
  });

  /** 页面内求值 ⇒ 值（页面抛错时抛 Node 错，带页面侧堆栈） */
  const evaluate = async (expression, { timeoutMs = 30000, userGesture = true } = {}) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture }, timeoutMs);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails);
      throw new Error(`页面内异常：${d}`);
    }
    return r.result?.value;
  };

  const close = () => {
    closed = true;
    for (const [, p] of pending) clearTimeout(p.timer);
    pending.clear();
    try {
      ws.close();
    } catch {
      /* 已关 */
    }
  };

  return { target, ready, send, evaluate, close };
}

/** 开—用—关（`Runtime.enable` 默认开：页面异常能被抓到） */
export async function withTarget(target, fn, { enableRuntime = true } = {}) {
  const session = openSession(target);
  await session.ready;
  try {
    if (enableRuntime) await session.send("Runtime.enable");
    return await fn(session);
  } finally {
    session.close();
  }
}

export const evaluate = (target, expression, opts) => withTarget(target, (s) => s.evaluate(expression, opts));

/** 就绪判据：文档加载完 ＋ 挂载点已有子节点（`index.html` = `#root`，`pool.html` = `#pool-root`） */
export const READY_EXPR = `(function () {
  var root = document.querySelector('#root') || document.querySelector('#pool-root');
  return document.readyState === 'complete' && !!root && root.childElementCount > 0;
})()`;

/**
 * 轮询求值直到真值（每次重连——reload 之后旧 ws 可能已死，重连最稳）。
 * 返回最后一次真值；超时返回 `false`（调用方自己判红，⛔ 别把超时当成功）。
 */
export async function waitFor(targetId, expression, { timeoutMs = 30000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const t = (await listTargets()).find((x) => x.id === targetId);
      if (t) {
        const v = await evaluate(t, expression);
        if (v) return v;
      }
    } catch {
      /* 导航中/上下文重建——下一轮再来 */
    }
    await sleep(intervalMs);
  }
  return false;
}

export const waitReady = (targetId, opts) => waitFor(targetId, READY_EXPR, opts);

/**
 * 硬 reload（`D0#1` 的第二步）。
 * 写法照 `scratch/_04-reload.mjs` 的实测形态：`setTimeout` 让 `evaluate` **先拿到回执**再导航
 * ——直接 `location.reload()` 会把回执掐断（会看到假超时）。
 */
export async function reload(target, { settleMs = 800 } = {}) {
  try {
    await evaluate(target, `(function () { setTimeout(function () { location.reload(); }, 30); return 'reloading ' + location.href; })()`);
  } catch {
    /* 导航掐断回执——不算失败，靠 waitReady 判 */
  }
  await sleep(settleMs);
}

/** 解除后台节流（`visibility:hidden` 会把 setTimeout 节流到 1s ⇒ await 型求值全超时） */
export async function unthrottle(target) {
  return withTarget(
    target,
    async (s) => {
      await s.send("Page.bringToFront");
      await s.send("Emulation.setFocusEmulationEnabled", { enabled: true });
      return true;
    },
    { enableRuntime: false }
  );
}

/**
 * 把**真实鼠标**挪到 (x, y)——`:hover` 面最忠实的驱动方式（页面上是真悬停，不是强制的伪状态）。
 * ⚠️ 与「左键 `Input.dispatchMouseEvent` 打不动 React onClick」不冲突：那条说的是**点击**事件；
 * 移动鼠标只求 `:hover` 命中，不派发 click。
 */
export async function moveMouse(session, x, y) {
  await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0, pointerType: "mouse" });
}

/** 元素中心点（真实悬停用；不存在／尺寸为 0 时 x/y 为 null） */
export const exprCenterOf = (selector) => `(function () {
  var el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  var r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return { w: r.width, h: r.height, x: null, y: null };
  return { w: r.width, h: r.height, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
})()`;

/**
 * 强制伪状态（`:hover` / `:focus` / `:active` / `:focus-visible`）——`AI#47`（验收面自检）的样板件。
 * ⚠️ `nodeId` 是**瞬时**的（重渲染即失效）⇒ 强制、读值、清除**必须在同一会话内一次做完**，
 * 所以对外只暴露 `hoverFace()`（在 `linkdesk-driver.mjs`），不单独给「只强制不读」的口子。
 */
export async function withForcedPseudo(session, selector, pseudoClasses, fn) {
  await session.send("DOM.enable");
  await session.send("CSS.enable");
  // 🔴 `depth: -1`（整棵树）不是随便写的：实测 `depth: 1` 时**深层节点上的 forcePseudoState 静默不生效**
  //    （浅处的探针元素能变色、池里深层的 `.ldk-sidebar-section-header` 死活不变 ⇒ 假零差异）。
  //    整棵树推给客户端后同一选择器立刻有差异——`AI#47` 若踩这条会得出「hover 面无样式」的错误结论。
  const { root } = await session.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await session.send("DOM.querySelector", { nodeId: root.nodeId, selector });
  if (!nodeId) return { ok: false, reason: "no-match", selector };
  await session.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: pseudoClasses });
  try {
    return await fn();
  } finally {
    try {
      await session.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
    } catch {
      /* 节点已失效——清除失败无害 */
    }
  }
}
