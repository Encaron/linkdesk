/**
 * E5.8#46.19：OS 级拖拽幽灵窗——标签拖出窗口后满屏跟手的透明置顶小窗（对标 VS Code 拖影）。
 *
 * 为什么需要 OS 级窗口：源池用 setPointerCapture 在光标出窗后继续收 mousemove，但 DragOverlays 的
 * 幽灵用 client 视口坐标 + position:fixed——光标出窗 → 幽灵落在视口外被窗口裁剪 → 用户看不到拖影
 * （「只能凭感觉松鼠标」）。VS Code 用 HTML5 原生 DnD + dataTransfer.setDragImage（OS 渲染拖拽影像
 * 满屏跟手）——LinkDesk 的自研 pointer 拖拽（useDragReorder reorder/split 状态机，不重写）没有 OS
 * 影像，用本窗补上等效视觉。
 *
 * 驱动（全主进程内部，零契约/preload/壳改动）：plugin-view-handlers 在 pool:drag-position 处理点直接
 * 驱动本窗——池上报位置（tabId/screenX/screenY/canceled/title）→ show/move。结束信号：canceled
 * （Esc / 窗内松手池补发）+ releaseOutsideWindow tabAction（窗外松手）。窗口鼠标穿透
 * （setIgnoreMouseEvents）——拖拽不被打断，目标窗吸附照常命中。
 *
 * 单例懒建：首次 show 建窗，hide 不销毁（复用；应用退出随 app quit 自然销毁）。多源窗共用——一次一拖。
 */

import { BrowserWindow } from 'electron';

/** 幽灵标签框高——对齐标签栏 TAB_BAR_HEIGHT=35（用户口中「36px 那个框」） */
const GHOST_HEIGHT = 35;
/** 幽灵窗固定宽——框内容自适应（flex 只占内容宽），右侧透明区鼠标穿透无碍 */
const GHOST_MAX_WIDTH = 240;
/** 框左上角相对光标的偏移——光标落在框内左上（对标 VS Code setDragImage offset (-10,-10)，框在光标下不遮视） */
const GHOST_OFFSET_X = 14;
const GHOST_OFFSET_Y = 14;

/**
 * 标签框 HTML——data URL 内联（裸 renderer 无 React/主题/i18n，对标 crash-recovery ERROR_PAGE 例外声明：
 * 硬约束「颜色走主题 token / 文案走 t()」不适用，中文注释直书）。
 * 视觉照抄 VS Code `.monaco-drag-image`——半透明中灰 + 圆角 + 轻阴影（千万用户验证的拖影语言）。
 */
const GHOST_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
  #ghost {
    display: inline-flex;
    align-items: center;
    height: ${GHOST_HEIGHT}px;
    padding: 0 10px;
    max-width: ${GHOST_MAX_WIDTH}px;
    box-sizing: border-box;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 12px;
    color: #ffffff;
    background: rgba(83, 89, 93, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 5px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style></head>
<body><div id="ghost"></div></body>
</html>`)}`;

let _ghost: BrowserWindow | null = null;
let _visible = false;
let _currentTitle = '';
let _loadPromise: Promise<void> | null = null;

function ensureGhost(): BrowserWindow | null {
  if (_ghost && !_ghost.isDestroyed()) return _ghost;
  const win = new BrowserWindow({
    width: GHOST_MAX_WIDTH,
    height: GHOST_HEIGHT,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    show: false,
    // 纯显示窗——无 preload / 禁 node（sandbox 全闭），穿透后不可能被交互
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  // 鼠标穿透 + 事件转发底层——拖拽不被打断，目标窗/桌面交互照常
  win.setIgnoreMouseEvents(true, { forward: true });
  win.on('closed', () => {
    _ghost = null;
    _visible = false;
    _currentTitle = '';
    _loadPromise = null;
  });
  _loadPromise = win.loadURL(GHOST_HTML).then(() => undefined);
  _ghost = win;
  return win;
}

/** 应用标题到幽灵框——loadURL 未完成时挂到 load 完成后执行（catch 静默：标题丢了不致命，下一帧会重试） */
function applyTitle(title: string): void {
  _currentTitle = title;
  const exec = () => {
    if (_ghost && !_ghost.isDestroyed()) {
      _ghost.webContents.executeJavaScript(`document.getElementById('ghost').textContent = ${JSON.stringify(title)};`).catch(() => {});
    }
  };
  if (_loadPromise) _loadPromise.then(exec);
  else exec();
}

/** 显示/移动幽灵——首次显示建窗 + showInactive（不抢焦点），后续只 setPosition 跟随光标 */
export function showDragGhost(screenX: number, screenY: number, title?: string): void {
  const win = ensureGhost();
  if (!win) return;
  const x = Math.round(screenX - GHOST_OFFSET_X);
  const y = Math.round(screenY - GHOST_OFFSET_Y);
  win.setPosition(x, y);
  if (!_visible) {
    _visible = true;
    win.showInactive();
  }
  if (title && title !== _currentTitle) applyTitle(title);
}

/** 隐藏幽灵——拖拽终止（canceled / releaseOutsideWindow） */
export function hideDragGhost(): void {
  if (_ghost && !_ghost.isDestroyed() && _visible) {
    _ghost.hide();
  }
  _visible = false;
}
