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
 *   ③ pool:ready 等待挂 did-fail-load / 超时 → 重试（单次崩溃事件最多 3 次）
 *      🔴 #39b 在此接续：10s 内 3 次崩溃 → 停止重建 + 静态错误页
 *
 * E5.7#37：池心跳同在本模块——5s ping / 10s 超时 → forcefullyCrashRenderer → 走分支 1 重建链。
 *   pong 由 preload-pool 模块顶层自动回复（React mount 前即存活——池加载窗口也有 pong，
 *   加载中的池不被误杀）。与 E2a 壳心跳（main.ts app:heartbeat 30s → 原生对话框）并行互不替代。
 */

import { app, ipcMain } from 'electron';
import type { BrowserWindow, IpcMainEvent, WebContents } from 'electron';
import type { WindowManager } from './window-manager.js';

/** pool:ready 等待超时——超时视为重建失败（pool.html 本地加载正常 < 2s） */
const READY_TIMEOUT_MS = 10_000;
/** render-process-gone 的 reason 固定值——正常退出（窗口关闭/应用退出），非崩溃，跳过重建 */
const EXIT_REASON_CLEAN = 'clean-exit';
/** 单次崩溃事件的重建尝试上限——#39b 崩溃计数在此接续（10s 内 3 次 → 停止重建） */
const MAX_REBUILD_ATTEMPTS = 3;
/** 两次重建尝试之间的间隔——避免对持续崩溃的池疯狂重建 */
const RETRY_DELAY_MS = 500;

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
  ipcMain.on('pool:pong', (event) => {
    const pool = deps.getWindowManager()?.getPoolView();
    if (pool && !pool.webContents.isDestroyed() && event.sender === pool.webContents) {
      lastPoolPong = Date.now();
    }
  });

  setInterval(() => {
    if (rebuilding) return; // 重建期间 waitPoolReady 全权接管——心跳不干扰
    const pool = deps.getWindowManager()?.getPoolView();
    if (!pool || pool.webContents.isDestroyed()) return;
    pool.webContents.send('pool:ping');
  }, HEARTBEAT_PING_MS);

  setInterval(() => {
    if (rebuilding || lastPoolPong === 0) return;
    const pool = deps.getWindowManager()?.getPoolView();
    if (!pool || pool.webContents.isDestroyed()) return;
    if (Date.now() - lastPoolPong > HEARTBEAT_TIMEOUT_MS) {
      console.error('[E5.7] Pool 心跳超时（渲染进程无响应）——强制崩溃触发重建');
      lastPoolPong = 0; // 崩溃事件到达前不重复触发（新池首 pong 前保持加载宽限）
      pool.webContents.forcefullyCrashRenderer();
    }
  }, HEARTBEAT_CHECK_MS);
}

/** 壳崩重建后调用——新窗口已建好，等新池就绪后回放 lastLayout 兜底（壳随后 pushLayout 自然对齐覆盖） */
export function replayAfterShellRebuild(deps: CrashRecoveryDeps): void {
  if (rebuilding) {
    console.error('[E5.7] 已有重建等待进行中——忽略重复兜底回放');
    return;
  }
  lastPoolPong = 0; // 新池首 pong 前保持加载宽限
  const wm = deps.getWindowManager();
  const wc = wm?.getPoolView()?.webContents;
  if (!wm || !wc) return;
  waitPoolReady(deps, wc, 1);
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
    ipcMain.removeListener('pool:ready', onReady);
    rebuilding = false;
  };

  const fail = (why: string): void => {
    if (settled) return;
    settled = true;
    cleanup();
    console.warn(`[E5.7] Pool 重建等待失败（${why}）——尝试 ${attempt}/${MAX_REBUILD_ATTEMPTS}`);
    if (attempt >= MAX_REBUILD_ATTEMPTS) {
      console.error('[E5.7] 放弃自动重建。🔴 #39b：此处接入 10s 内 3 次崩溃停止重建 + 静态错误页');
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

  ipcMain.on('pool:ready', onReady);
  wc.on('did-fail-load', onFailLoad);
  timer = setTimeout(() => fail(`pool:ready 超时 ${READY_TIMEOUT_MS}ms`), READY_TIMEOUT_MS);
}
