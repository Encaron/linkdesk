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
}

/** 壳崩重建后调用——新窗口已建好，等新池就绪后回放 lastLayout 兜底（壳随后 pushLayout 自然对齐覆盖） */
export function replayAfterShellRebuild(deps: CrashRecoveryDeps): void {
  if (rebuilding) {
    console.error('[E5.7] 已有重建等待进行中——忽略重复兜底回放');
    return;
  }
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
