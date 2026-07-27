/**
 * WindowControls —— 自定义窗口控件（─ □ ×）。
 * E3f #52f：始终渲染，不受 menuStyle 影响。
 *
 * 通过 preload window.* IPC 调用主进程 minimize/maximize/close。
 */

import { useState, useEffect } from "react";
import "./WindowControls.css";

const win = () => (window as any).linkdesk?.window;

function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    win()?.isMaximized().then((m: boolean) => setMaximized(m));
    const unsub = win()?.onMaximizeChange((m: boolean) => setMaximized(m));
    return () => { unsub?.(); };
  }, []);

  return (
    <div className="window-controls">
      <button className="wc-btn" onClick={() => win()?.minimize()} title="最小化">
        <span className="codicon codicon-chrome-minimize" />
      </button>
      <button
        className="wc-btn"
        onClick={() => maximized ? win()?.unmaximize() : win()?.maximize()}
        title={maximized ? "还原" : "最大化"}
      >
        <span className={`codicon ${maximized ? "codicon-chrome-restore" : "codicon-chrome-maximize"}`} />
      </button>
      <button className="wc-btn wc-close" onClick={() => win()?.close()} title="关闭">
        <span className="codicon codicon-chrome-close" />
      </button>
    </div>
  );
}

export default WindowControls;
