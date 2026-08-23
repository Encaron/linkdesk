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
 * 幽灵外观契约——池经 TabDragPositionPayload.ghost 上报（源池 getComputedStyle 读主题 hex + 被拖标签图标）。
 * 主进程只消费（不持 tabState）；主题三色 / 图标渲染全由池侧归一化好再上传。
 */
export interface GhostAppearance {
  theme: { bg: string; border: string; text: string };
  icon: string | null;
  iconKind: "emoji" | "img" | null;
}

/**
 * 标签框 HTML——data URL 内联（裸 renderer 无 React/主题/i18n，对标 crash-recovery ERROR_PAGE 例外声明：
 * 硬约束「颜色走主题 token / 文案走 t()」不适用，中文注释直书）。
 * 视觉照抄 VS Code `.monaco-drag-image`——圆角 + 轻阴影（千万用户验证的拖影语言）。颜色默认中灰
 * （rgba(83,89,93,0.55)）；E5.8#46.19 进化后由池上报主题三色覆盖（bg/border/text），无上报时保持默认。
 * 结构：#ghost 容器 + #ghost-icon（emoji 文本 / img 图标槽位，无图标隐藏）+ #ghost-title（文字，可省略号）。
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
  }
  #ghost-icon { display: none; margin-right: 5px; flex-shrink: 0; line-height: 0; }
  #ghost-icon img { width: 14px; height: 14px; display: block; }
  #ghost-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
</style></head>
<body><div id="ghost"><span id="ghost-icon"></span><span id="ghost-title"></span></div></body>
</html>`)}`;

let _ghost: BrowserWindow | null = null;
let _visible = false;
let _loadPromise: Promise<void> | null = null;
/** 已应用内容指纹——title+ghost 序列化；内容没变就不重跑 executeJavaScript（mousemove 每帧 showDragGhost 都到） */
let _currentKey: string | null = null;

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
    _loadPromise = null;
    _currentKey = null;
  });
  _loadPromise = win.loadURL(GHOST_HTML).then(() => undefined);
  _ghost = win;
  return win;
}

/**
 * 应用外观（主题三色 + 图标 + 标题）到幽灵框——loadURL 未完成时挂到 load 完成后执行（catch 静默：
 * 内容没上不致命，下次内容变化会重试）。值全部 JSON.stringify 进 JS 源码（注入安全：hex/标题/图标 URL
 * 都是字符串字面量，不用字符串拼接拼 HTML——img 用 DOM API 创建）；内容指纹未变（同拖拽每帧同载荷）
 * 直接跳过，不反复 executeJavaScript。
 */
function applyContent(title: string | undefined, ghost?: GhostAppearance): void {
  const key = `${title ?? ""}|${JSON.stringify(ghost ?? null)}`;
  if (key === _currentKey) return;
  _currentKey = key;

  const t = JSON.stringify(title ?? "");
  const bg = JSON.stringify(ghost?.theme.bg ?? "");
  const border = JSON.stringify(ghost?.theme.border ?? "");
  const text = JSON.stringify(ghost?.theme.text ?? "");
  const icon = JSON.stringify(ghost?.icon ?? null);
  const kind = JSON.stringify(ghost?.iconKind ?? null);
  const script = `(() => {
    const g = document.getElementById('ghost');
    const iconEl = document.getElementById('ghost-icon');
    const titleEl = document.getElementById('ghost-title');
    if (${bg}) g.style.background = ${bg};
    if (${border}) g.style.borderColor = ${border};
    if (${text}) g.style.color = ${text};
    if (${kind} === 'emoji') {
      iconEl.style.display = 'inline-block';
      iconEl.textContent = ${icon};
    } else if (${kind} === 'img') {
      iconEl.style.display = 'inline-block';
      iconEl.textContent = '';
      const im = document.createElement('img');
      im.src = ${icon};
      im.alt = '';
      iconEl.appendChild(im);
    } else {
      iconEl.style.display = 'none';
      iconEl.textContent = '';
    }
    titleEl.textContent = ${t};
  })();`;

  const exec = () => {
    if (_ghost && !_ghost.isDestroyed()) {
      _ghost.webContents.executeJavaScript(script).catch(() => {});
    }
  };
  if (_loadPromise) _loadPromise.then(exec);
  else exec();
}

/** 显示/移动幽灵——首次显示建窗 + showInactive（不抢焦点），后续只 setPosition 跟随光标。
 *  ghost 为池上报的幽灵外观（主题三色 + 图标）——无则保持默认中灰无图标（旧池/异常载荷兜底）。 */
export function showDragGhost(screenX: number, screenY: number, title?: string, ghost?: GhostAppearance): void {
  const win = ensureGhost();
  if (!win) return;
  const x = Math.round(screenX - GHOST_OFFSET_X);
  const y = Math.round(screenY - GHOST_OFFSET_Y);
  win.setPosition(x, y);
  if (!_visible) {
    _visible = true;
    win.showInactive();
  }
  applyContent(title, ghost);
}

/** 隐藏幽灵——拖拽终止（canceled / releaseOutsideWindow） */
export function hideDragGhost(): void {
  if (_ghost && !_ghost.isDestroyed() && _visible) {
    _ghost.hide();
  }
  _visible = false;
}
