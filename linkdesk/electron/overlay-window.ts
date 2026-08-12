/**
 * OverlayWindow——全屏透明 BrowserWindow，浮在所有 Pool 之上。
 * E5.6#21a。
 *
 * 解决的问题：SidebarPool 和 MainPool 是同级 WebContentsView——任一个 Pool 的
 * DOM 元素超出自身矩形边界后，被另一个 Pool 裁剪。z-index 在 Chromium 渲染进程间无效。
 *
 * OverlayWindow 是独立的透明 BrowserWindow（无 parent——focus/blur 控制显隐），默认鼠标穿透。
 * 浮层 UI（右键菜单/命令面板/Toast/Dialog）渲染在此窗口内——不被任何 Pool 裁剪。
 *
 * 对标 VS Code 的 overlay 层——但 VS Code 是单 WebView，linkDesk 是多 Pool WebContentsView。
 *
 * ── 关键设计 ──
 * - 默认 setIgnoreMouseEvents(true)——鼠标事件穿过透明区域到达下方 Pool
 * - 渲染浮层时 setIgnoreMouseEvents(false)——用户可与浮层交互
 * - 浮层关闭后恢复 setIgnoreMouseEvents(true)
 * - 跟随主窗口 move/resize/DPI 变化
 * - 不经过 IpcBridgeHandler——OverlayWindow IPC 是纯中继
 */

import { BrowserWindow, app } from 'electron';
import * as path from 'path';
import { DEV_SERVER_URL } from '../shared/constants.js';

export class OverlayWindow {
  private window: BrowserWindow | null = null;
  private mainWindow: BrowserWindow;
  private _ready = false;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  /** 创建透明 OverlayWindow——shell ready 后调用 */
  create(): void {
    if (this.window && !this.window.isDestroyed()) return;

    const isDev = !app.isPackaged;

    // 主窗口屏幕坐标——x/y 是屏幕绝对坐标，不是相对父窗口
    const { x, y, width, height } = this.mainWindow.getBounds();

    this.window = new BrowserWindow({
      // ── 透明 + 无框 ──
      // ❌ 不用 parent——Windows 上 owned 子窗口的 setIgnoreMouseEvents 不转发 WM_SETCURSOR，
      //    导致光标在 OverlayWindow 默认箭头和下方 Pool 光标之间闪烁。
      //    改用 focus/blur 显隐控制 z-order——见 main.ts。
      transparent: true,
      frame: false,
      // ── 显式定位到主窗口屏幕坐标 ──
      x,
      y,
      width,
      height,
      // ── 不可聚焦（防止抢主窗口焦点）──
      focusable: false,
      // ── 不在任务栏显示 ──
      skipTaskbar: true,
      // ── 无背景色——透明区域让下方 Pool 透出 ──
      backgroundColor: '#00000000',
      // ── 隐藏窗口菜单 ──
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload-overlay.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
      show: false,
    });

    // ── 默认鼠标穿透——透明区域事件到达下方 Pool ──
    this.window.setIgnoreMouseEvents(true, { forward: true });

    // ── 加载内容：dev 模式从 Vite dev server，prod 模式从 dist/ ──
    if (isDev) {
      this.window.loadURL(`${DEV_SERVER_URL}/overlay.html`);
    } else {
      this.window.loadFile(path.join(__dirname, '../../dist/overlay.html'));
    }

    // ── 加载完成后标记就绪——允许 show()，但不主动 show（由 main.ts focus 控制）──
    this.window.once('ready-to-show', () => {
      this._ready = true;
      // 如果主窗口此时已有焦点——立即显示
      if (this.mainWindow.isFocused()) {
        this.show();
      }
    });

    // ── 崩溃恢复日志——#26.5 实施前先记录 ──
    this.window.webContents.on('render-process-gone', (_event, details) => {
      console.error(`[OverlayWindow] 渲染进程崩溃:`, details.reason);
    });

    this.window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`[OverlayWindow] 加载失败: ${errorDescription} (code ${errorCode}) URL=${validatedURL}`);
    });

    // ── 外部关闭 → 清理引用 ──
    this.window.on('closed', () => {
      this.window = null;
    });

    console.log('[OverlayWindow] 已创建');
  }

  /** 重新创建——崩溃恢复（#26.5b 预埋） */
  recreate(): void {
    this._ready = false;
    this.destroy();
    this.create();
  }

  /** 销毁 OverlayWindow */
  destroy(): void {
    this._ready = false;
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
    }
    this.window = null;
  }

  /** 打开鼠标交互——渲染浮层时调用 */
  enableInteraction(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.setIgnoreMouseEvents(false);
    }
  }

  /** 关闭鼠标交互——浮层关闭后恢复穿透 */
  disableInteraction(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.setIgnoreMouseEvents(true, { forward: true });
    }
  }

  /** 同步尺寸和位置——主窗口 resize/move 时调用。 */
  syncBounds(): void {
    if (!this.window || this.window.isDestroyed()) return;
    const { x, y, width, height } = this.mainWindow.getBounds();
    const [cw, ch] = this.window.getSize();
    const [cx, cy] = this.window.getPosition();
    if (cw === width && ch === height && cx === x && cy === y) return;
    this.window.setBounds({ x, y, width, height });
  }

  /** 显示 OverlayWindow——主窗口获得焦点时调用 */
  show(): void {
    if (!this._ready) return;
    if (this.window && !this.window.isDestroyed() && !this.window.isVisible()) {
      this.syncBounds();
      this.window.show();
    }
  }

  /** 隐藏 OverlayWindow——主窗口失去焦点时调用（防止浮在其他应用之上） */
  hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide();
    }
  }

  /** 获取 WebContents——主进程发 IPC 到 OverlayWindow */
  get webContents() {
    return this.window?.webContents ?? null;
  }

  /** OverlayWindow 是否存活 */
  get isAlive(): boolean {
    return this.window !== null && !this.window.isDestroyed();
  }
}
