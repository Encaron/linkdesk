/**
 * OverlayWindow——全屏透明 BrowserWindow，浮在壳窗口与 Pool WCV 之上。
 * E5.6#21a。
 *
 * 解决的问题（E5.6 起源）：SidebarPool 和 MainPool 曾是同级 WebContentsView——任一个 Pool 的
 * DOM 元素超出自身矩形边界后，被另一个 Pool 裁剪。z-index 在 Chromium 渲染进程间无效。
 * E5.7（#12 提前后）：双Pool已合并为唯一 WCV，同类问题仍在——Pool WCV 永远压在壳渲染
 * 进程 DOM 之上，壳侧浮层会被盖住。浮层最终归宿是池内 FloatingLayerHost（#25，Phase 4），
 * 到位前 OverlayWindow 继续承载 QuickPick/右键菜单/Toast/Dialog。
 *
 * OverlayWindow 是独立的透明 BrowserWindow（parent: mainWindow），默认鼠标穿透。
 * 浮层 UI（右键菜单/命令面板/Toast/Dialog）渲染在此窗口内——不被任何 Pool 裁剪。
 *
 * 对标 VS Code 的 overlay 层——VS Code 是单 WebView 同进程 z-index；linkDesk 池 WCV 与壳
 * 是不同渲染进程，z-index 不通，故需独立窗口承载浮层。
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
      // ── 透明 + 无框 + 父子关系（随父最小化/恢复，不浮在其他应用之上）──
      transparent: true,
      frame: false,
      parent: this.mainWindow,
      // ── 显式定位到主窗口屏幕坐标——parent 只管 z-order 不管位置 ──
      x,
      y,
      width,
      height,
      // ── 可聚焦——浮层内的输入框/键盘导航/Escape 需要键盘事件 ──
      //   parent: mainWindow 保证作为子窗口不出现在 Alt+Tab 中
      //   默认 setIgnoreMouseEvents(true) + 不聚焦——只有 enableInteraction() 时接管焦点
      focusable: true,
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
    this.window.setIgnoreMouseEvents(true);

    // ── 加载内容：dev 模式从 Vite dev server，prod 模式从 dist/ ──
    if (isDev) {
      this.window.loadURL(`${DEV_SERVER_URL}/overlay.html`);
    } else {
      this.window.loadFile(path.join(__dirname, '../../dist/overlay.html'));
    }

    // ── ready-to-show 后显示（跟随主窗口——透明无感）──
    this.window.once('ready-to-show', () => {
      this.window?.show();
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
    this.destroy();
    this.create();
  }

  /** 销毁 OverlayWindow */
  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
    }
    this.window = null;
  }

  // E5.6#23h：5s watchdog——防止交互结束后忘记 disableInteraction 导致永久锁死
  private _interactionWatchdog: ReturnType<typeof setTimeout> | null = null;

  /** 打开鼠标交互 + 键盘焦点——渲染浮层时调用 */
  enableInteraction(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.setIgnoreMouseEvents(false);
      // 🔥 聚焦 OverlayWindow——否则浮层内的 <input>/键盘导航/Escape 收不到事件
      //    parent: mainWindow 子窗口聚焦不会令父窗口变灰——实测验证
      this.window.webContents.focus();
      // 启动 5s watchdog——mouseup/blur/ESC 任一触发则清除
      this._clearWatchdog();
      this._interactionWatchdog = setTimeout(() => {
        console.warn('[OverlayWindow] watchdog 触发——5s 无 mouseup/blur/ESC，强制恢复穿透');
        this.disableInteraction();
      }, 5000);
    }
  }

  /** 关闭鼠标交互 + 归还焦点给主窗口——浮层关闭后恢复穿透 */
  disableInteraction(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.setIgnoreMouseEvents(true);
      // 归还焦点给主窗口——浮层消失后主窗口恢复正常交互
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.focus();
      }
      this._clearWatchdog();
    }
  }

  private _clearWatchdog(): void {
    if (this._interactionWatchdog !== null) {
      clearTimeout(this._interactionWatchdog);
      this._interactionWatchdog = null;
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

  /** 获取 WebContents——主进程发 IPC 到 OverlayWindow */
  get webContents() {
    return this.window?.webContents ?? null;
  }

  /** OverlayWindow 是否存活 */
  get isAlive(): boolean {
    return this.window !== null && !this.window.isDestroyed();
  }
}
