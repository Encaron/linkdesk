/**
 * 编辑器插件入口。
 * E5#76：独立 WebView——接收壳 requestToPlugin('openFile') 代替 React props。
 *
 * 壳端调用：requestToPlugin('editor', 'openFile', { filePath, label })
 * 插件端：useEffect → pluginRequest.handle('openFile', handler) → 更新 state
 */
import React, { useState } from "react";
import EditorTab from "./EditorTab";
import DiffEditor from "./DiffEditor";
import { initHotExit } from "./hot-exit";
import "./editor.css";

initHotExit();

// E5#76：模块级 handler——notifyReady 在 render 之后但 useEffect 之前，加队列缓冲
let _setFilePath: ((v: string | null) => void) | null = null;
let _pendingFile: string | null = null;
const api = (window as any).linkdesk?.pluginRequest;
api?.handle("openFile", async (payload: any) => {
  const fp = payload?.filePath ?? null;
  if (_setFilePath) { _setFilePath(fp); } else { _pendingFile = fp; }
});

const EditorPlugin: React.FC = () => {
  const [filePath, setFilePath] = useState<string | null>(_pendingFile);
  _setFilePath = setFilePath;
  if (_pendingFile) _pendingFile = null;

  if (!filePath) {
    return <div className="editor-container editor-empty">编辑器（双击文件树打开文件）</div>;
  }

  if (filePath.includes("|||")) {
    const [orig, mod] = filePath.split("|||");
    return <DiffEditor originalPath={orig} modifiedPath={mod} isActive={true} />;
  }

  return <EditorTab filePath={filePath} isActive={true} />;
};

export default EditorPlugin;
