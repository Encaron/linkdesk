/**
 * E5.7#36：单Pool 崩溃恢复——render-process-gone → 重建 WCV + lastLayout 回放。
 *
 * 设计 → docs/02-Electron架构/E5.7_极简Pool/崩溃恢复/单Pool崩溃恢复设计.md §2。
 *
 * 依赖注入——不 import WindowManager 运行时对象（getter 闭包每次调用时读最新引用，
 * 壳崩重建后指向新实例）；WindowManager 反向 import 本模块的 cacheLayoutSnapshot——单向依赖，无环。
 *
 * 分支模型（E5.7 只有 2 个渲染进程）：
 *   分支 1：Pool WCV 崩——rebuildPool（壳渲染进程存活，tabState 不丢）
 *           → 等 pool:ready → 回放 lastLayout 快照
 *   分支 2：壳渲染进程崩——全窗口重建（rebuildShell 回调）→ 壳从 workspace 持久化恢复
 *           tabState，pushLayout 自然对齐；主进程在新池就绪后回放 lastLayout 兜底
 *
 * 🔴 2026-08-13 审计补 3 条验收：
 *   ① 壳崩重建不可直接复用 createMainWindow——main.ts 全部 ipcMain 注册已 once-guard +
 *      引用刷新（各 register* 重复调用只刷新引用不重注册，IpcBridge 换实例摘旧挂新）
 *   ② details.reason === 'clean-exit' 跳过 + before-quit 守卫——应用退出也触发
 *      render-process-gone，不拦 = 退出过程中建 WCV
 *   ③ pool:ready 等待挂 did-fail-load / 超时 → 重试（单次崩溃事件最多 3 次）；
 *      重试耗尽 → 静态错误页
 *
 * E5.7#39b：连续崩溃防护（设计 §5.1）——10s 内 3 次崩溃 → 停止自动重建 → 静态错误页常驻。
 *   错误页经 loadURL 加载到崩溃的池 wc（loadURL 重生 renderer）；心跳在 rebuildStopped 后停摆
 *   （不再 ping/检查——错误页崩溃不再触发重建链）；壳崩全窗口重建 = 新机会，计数与停止标志重置。
 *
 * E5.7#103：错误页"重试"按钮——裸 renderer（data: URL，无 preload/IPC）点击重试 =
 *   页面导航到 linkdesk-retry:// 当信号，主进程 will-navigate 拦截。重试只清 rebuildStopped
 *   （恢复保护机制），熔断窗口计数不清零——重试后立刻再崩仍落回错误页，不无限循环。
 *
 * E5.7#37：池心跳同在本模块——5s ping / 10s 超时 → forcefullyCrashRenderer → 走分支 1 重建链。
 *   pong 由 preload-pool 模块顶层自动回复（React mount 前即存活——池加载窗口也有 pong，
 *   加载中的池不被误杀）。与 E2a 壳心跳（main.ts app:heartbeat 30s → 原生对话框）并行互不替代。
 */

import { app, ipcMain } from 'electron';
import type { BrowserWindow, IpcMainEvent, WebContents } from 'electron';
import type { WindowManager } from './window-manager.js';
import { IPC } from '../ipc/channels.js';

/** pool:ready 等待超时——超时视为重建失败（pool.html 本地加载正常 < 2s） */
const READY_TIMEOUT_MS = 10_000;
/** render-process-gone 的 reason 固定值——正常退出（窗口关闭/应用退出），非崩溃，跳过重建 */
const EXIT_REASON_CLEAN = 'clean-exit';
/** 单次崩溃事件的重建尝试上限 */
const MAX_REBUILD_ATTEMPTS = 3;

// ── E5.7#39b：连续崩溃防护（设计 §5.1）──
/** 崩溃计数滑动窗口——窗口内崩溃达到上限即停止自动重建 */
const CRASH_WINDOW_MS = 10_000;
/** 窗口内崩溃次数上限 */
const MAX_CRASHES_IN_WINDOW = 3;
/** 两次重建尝试之间的间隔——避免对持续崩溃的池疯狂重建 */
const RETRY_DELAY_MS = 500;

/**
 * 静态错误页——data: URL 内联 HTML（loadURL 到崩溃的池 wc 即重生 renderer，无需磁盘文件）。
 * 紧急页例外声明：此页渲染于裸 renderer（无 React / 主题 / i18n）——
 *   ① 硬约束「颜色走主题 token」不适用：inline 深色写死，任何主题下保证可读；
 *   ② 硬约束「文案走 t()」不适用：renderer 无 i18n，中文文案直书。
 */
const ERROR_PAGE_URL = `data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8" /><title>LinkDesk 遇到问题</title></head>
<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#1e1e1e;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
  <main style="text-align:center">
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#ffffff">LinkDesk 遇到问题</h1>
    <p style="margin:0 0 6px;font-size:14px;color:#9d9d9d">界面渲染进程连续崩溃，已停止自动重建。</p>
    <a href="linkdesk-retry://rebuild" style="display:inline-block;margin:16px 0 0;padding:6px 16px;font-size:13px;font-weight:500;color:#ffffff;background:#0e639c;border:1px solid #007acc;border-radius:2px;text-decoration:none;cursor:pointer">重试</a>
    <p style="margin:16px 0 0;font-size:12px;color:#6f6f6f">重试仍失败：请重启应用以继续。</p>
  </main>
</body>
</html>`)}`;

/** E5.7#103：错误页重试按钮的导航信号前缀——裸 renderer 无 preload/IPC，导航当信号 */
const RETRY_NAV_PREFIX = 'linkdesk-retry://';

// ── E5.7#37：池心跳参数（设计 §2.2）──
/** 主进程每 5s 向池发一次 ping */
const HEARTBEAT_PING_MS = 5_000;
/** 主进程每 3s 检查一次 pong 新鲜度 */
const HEARTBEAT_CHECK_MS = 3_000;
/** 10s 未收到 pong → 判定渲染进程无响应（主线程阻塞/假死） */
const HEARTBEAT_TIMEOUT_MS = 10_000;

export interface CrashRecoveryDeps {
  /** 当前主窗口——重建期间主进程引用会切换，调用时读取 */
  getMainWindow: () => BrowserWindow | null;
  /** 当前 WindowManager——同上，壳崩重建后指向新实例 */
  getWindowManager: () => WindowManager | null;
  /** 壳崩全窗口重建——main.ts 提供（幂等 createWindow + 旧窗销毁） */
  rebuildShell: () => void;
}

/** 每次 pushLayout 时缓存——Pool 崩溃后不依赖壳即时响应即可回放 */
let lastLayout: unknown = null;

/** 最后一次 pong 时间戳。0 = 尚未收到（池加载中）——不判超时（同 E2a 壳心跳语义） */
let lastPoolPong = 0;

/** 池崩溃时间戳（滑动窗口计数） */
const recentPoolCrashes: number[] = [];

/** 已停止自动重建——静态错误页常驻（错误页重试 / 应用重启 / 壳崩全窗口重建才重置） */
let rebuildStopped = false;

/** 应用退出中——render-process-gone 全部忽略（审计②） */
let quitting = false;

/** 重建进行中——新池立即再崩时交给进行中的等待者超时重试接管，防止双重建链 */
let rebuilding = false;

let _setup = false;

export function cacheLayoutSnapshot(layout: unknown): void {
  lastLayout = layout;
}

export function setupCrashRecovery(deps: CrashRecoveryDeps): void {
  if (_setup) return;
  _setup = true;

  // 审计②：before-quit 之后窗口销毁也触发 render-process-gone——
  // 不置守卫 = 退出过程中建 WCV
  app.on('before-quit', () => {
    quitting = true;
  });

  app.on('render-process-gone', (_event, webContents, details) => {
    if (details.reason === EXIT_REASON_CLEAN || quitting) return;

    const wm = deps.getWindowManager();
    const win = deps.getMainWindow();
    if (!wm || !win || win.isDestroyed()) return;

    const poolView = wm.getPoolView();

    // 分支 1：Pool WCV 崩——重建 WCV（壳渲染进程存活，tabState 不丢）
    if (poolView && !poolView.webContents.isDestroyed() && webContents.id === poolView.webContents.id) {
      console.error('[E5.7] MainPool renderer 崩溃:', details.reason, 'exitCode:', details.exitCode);
      lastPoolPong = 0; // 新池首 pong 前保持加载宽限——旧 pong 时间戳对新池无意义
      if (rebuildStopped) return; // 错误页常驻后不再重建（错误页 renderer 崩溃也走到这里）
      // E5.7#39b：10s 内 3 次崩溃 → 停止自动重建 + 静态错误页（设计 §5.1）
      if (recordPoolCrash() >= MAX_CRASHES_IN_WINDOW) {
        showStaticErrorPage(poolView.webContents);
        return;
      }
      rebuildPoolWithRetry(deps, 1);
      return;
    }

    // 分支 2：壳渲染进程崩——全窗口重建（tabState 随壳丢失，靠 workspace 持久化 + lastLayout 兜底）
    if (webContents.id === win.webContents.id) {
      console.error('[E5.7] 壳渲染进程崩溃——全窗口重建');
      deps.rebuildShell();
      return;
    }

    // E5.7 只有 2 个渲染进程——分支到此完备（脱出窗口推迟 v1.3）
  });

  // ── E5.7#37：池心跳——5s ping / 10s 超时 → forcefullyCrashRenderer → 走分支 1 重建链 ──
  // pong 由 preload-pool 模块顶层自动回复（不经 React——池加载窗口也有 pong，加载中的池不被误杀）。

  // Pool→主进程：pong——sender 校验（只认当前池，忽略壳/其他渲染进程）
  ipcMain.on(IPC.pool.pong, (event) => {
    const pool = deps.getWindowManager()?.getPoolView();
    if (pool && !pool.webContents.isDestroyed() && event.sender === pool.webContents) {
      lastPoolPong = Date.now();
    }
  });

  setInterval(() => {
    if (rebuilding || rebuildStopped) return; // 重建期间 waitPoolReady 全权接管；错误页常驻后停摆
    const pool = deps.getWindowManager()?.getPoolView();
    if (!pool || pool.webContents.isDestroyed()) return;
    pool.webContents.send(IPC.pool.ping);
  }, HEARTBEAT_PING_MS);

  setInterval(() => {
    if (rebuilding || rebuildStopped || lastPoolPong === 0) return;
    const pool = deps.getWindowManager()?.getPoolView();
    if (!pool || pool.webContents.isDestroyed()) return;
    if (Date.now() - lastPoolPong > HEARTBEAT_TIMEOUT_MS) {
      console.error('[E5.7] Pool 心跳超时（渲染进程无响应）——强制崩溃触发重建');
      lastPoolPong = 0; // 崩溃事件到达前不重复触发（新池首 pong 前保持加载宽限）
      pool.webContents.forcefullyCrashRenderer();
    }
  }, HEARTBEAT_CHECK_MS);

  // E5.7#103：错误页"重试"按钮——点击 = 导航到 linkdesk-retry:// 当信号。
  // web-contents-created 全局挂一次，覆盖每次 rebuildPool 新建的池 wc（含错误页 loadURL
  // 重生的 renderer）——比在错误页 wc 上挂监听更稳（不随重建丢绑定）。守卫：只认当前池
  // wc + rebuildStopped（重试按钮只在错误页上，但导航事件任何 wc 都可能来）。
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!url.startsWith(RETRY_NAV_PREFIX)) return; // 非重试导航——放行
      event.preventDefault(); // URL 只当信号，不真导航（未注册协议，导航必失败）
      const pool = deps.getWindowManager()?.getPoolView();
      if (!pool || pool.webContents !== contents) return; // 非当前池 wc（壳等）——忽略
      retryFromErrorPage(deps);
    });
  });
}

/** 壳崩重建后调用——新窗口已建好，等新池就绪后回放 lastLayout 兜底（壳随后 pushLayout 自然对齐覆盖） */
export function replayAfterShellRebuild(deps: CrashRecoveryDeps): void {
  if (rebuilding) {
    console.error('[E5.7] 已有重建等待进行中——忽略重复兜底回放');
    return;
  }
  lastPoolPong = 0; // 新池首 pong 前保持加载宽限
  // 壳崩全窗口重建 = 新机会——崩溃计数与停止标志重置（新窗口全新开始）
  recentPoolCrashes.length = 0;
  rebuildStopped = false;
  const wm = deps.getWindowManager();
  const wc = wm?.getPoolView()?.webContents;
  if (!wm || !wc) return;
  waitPoolReady(deps, wc, 1);
}

/** E5.7#39b：记录一次池崩溃，返回滑动窗口内当前次数（窗口外旧记录随记随清） */
function recordPoolCrash(): number {
  const now = Date.now();
  recentPoolCrashes.push(now);
  while (now - recentPoolCrashes[0] > CRASH_WINDOW_MS) {
    recentPoolCrashes.shift();
  }
  return recentPoolCrashes.length;
}

/** E5.7#39b：停止自动重建 + 静态错误页常驻。心跳/重建链此后停摆——恢复途径：错误页重试 / 重启应用 / 壳崩全窗口重建 */
function showStaticErrorPage(wc: WebContents): void {
  rebuildStopped = true;
  console.error('[E5.7] 停止自动重建——静态错误页常驻（错误页重试 / 重启应用 / 壳崩全窗口重建才恢复）');
  try {
    wc.loadURL(ERROR_PAGE_URL);
  } catch (err) {
    console.error('[E5.7] 静态错误页加载失败:', err);
  }
}

/**
 * E5.7#103：错误页"重试"——恢复重建链。只清 rebuildStopped（恢复心跳/崩溃分支保护机制），
 * 熔断窗口计数（recentPoolCrashes）不清零——重试后立刻再崩仍 ≥3 落回错误页，不无限循环。
 * 重建失败路径自带兜底：rebuildPoolWithRetry 重试耗尽 → showStaticErrorPage → rebuildStopped 复位。
 */
function retryFromErrorPage(deps: CrashRecoveryDeps): void {
  if (!rebuildStopped || rebuilding) return;
  rebuildStopped = false;
  lastPoolPong = 0; // 新池首 pong 前保持加载宽限——旧 pong 时间戳对新池无意义
  console.error('[E5.7] 错误页重试——恢复重建链（熔断窗口计数保留）');
  rebuildPoolWithRetry(deps, 1);
}

/** Pool 分支入口——重建 WCV 后等待就绪。rebuilding 守卫：新池立即再崩时由等待者超时重试接管 */
function rebuildPoolWithRetry(deps: CrashRecoveryDeps, attempt: number): void {
  if (rebuilding) {
    console.error('[E5.7] 重建进行中再次崩溃——等待中的超时重试接管');
    return;
  }
  rebuilding = true;
  const wm = deps.getWindowManager();
  const win = deps.getMainWindow();
  if (!wm || !win || win.isDestroyed()) {
    rebuilding = false;
    return;
  }
  let wc: WebContents;
  try {
    wc = wm.rebuildPool().webContents;
  } catch (err) {
    rebuilding = false;
    console.error('[E5.7] Pool 重建异常:', err);
    return;
  }
  waitPoolReady(deps, wc, attempt);
}

/**
 * 审计③：等 pool:ready（sender 校验——排除壳/其他渲染进程的 ready），
 * 挂 did-fail-load + 超时 → 重试（单次崩溃事件最多 MAX_REBUILD_ATTEMPTS 次）。
 */
function waitPoolReady(deps: CrashRecoveryDeps, wc: WebContents, attempt: number): void {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cleanup = (): void => {
    if (timer !== null) clearTimeout(timer);
    wc.removeListener('did-fail-load', onFailLoad);
    ipcMain.removeListener(IPC.pool.ready, onReady);
    rebuilding = false;
  };

  const fail = (why: string): void => {
    if (settled) return;
    settled = true;
    cleanup();
    console.warn(`[E5.7] Pool 重建等待失败（${why}）——尝试 ${attempt}/${MAX_REBUILD_ATTEMPTS}`);
    if (attempt >= MAX_REBUILD_ATTEMPTS) {
      // E5.7#39b：重试耗尽 → 静态错误页常驻（池起不来 = 空白 WCV 无意义）
      console.error('[E5.7] 放弃自动重建——显示静态错误页');
      showStaticErrorPage(wc);
      return;
    }
    setTimeout(() => rebuildPoolWithRetry(deps, attempt + 1), RETRY_DELAY_MS);
  };

  const onReady = (event: IpcMainEvent): void => {
    if (settled || event.sender !== wc) return;
    settled = true;
    cleanup();
    if (lastLayout) {
      deps.getWindowManager()?.pushLayout(lastLayout);
    }
    console.log('[E5.7] Pool 重建完成 + lastLayout 回放');
  };

  const onFailLoad = (): void => {
    fail('did-fail-load');
  };

  ipcMain.on(IPC.pool.ready, onReady);
  wc.on('did-fail-load', onFailLoad);
  timer = setTimeout(() => fail(`pool:ready 超时 ${READY_TIMEOUT_MS}ms`), READY_TIMEOUT_MS);
}
