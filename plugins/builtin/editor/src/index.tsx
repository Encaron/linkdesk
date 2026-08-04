/**
 * 编辑器插件入口。
 * E5#76：独立 WebView——接收壳 requestToPlugin('openFile') 代替 React props。
 *
 * 壳端调用：requestToPlugin('editor', 'openFile', { filePath, label })
 * 插件端：useEffect → pluginRequest.handle('openFile', handler) → 更新 state
 */
import React, { useState } from "react";
import { initHotExit } from "./hot-exit";
import "./editor.css";

initHotExit();

// E5#76 debug
let _setFilePath: ((v: string | null) => void) | null = null;
let _pendingFile: string | null = null;
try {
  const api = (window as any).linkdesk?.pluginRequest;
  console.log("[editor] pluginRequest api:", !!api);
  api?.handle("openFile", async (payload: any) => {
    console.log("[editor] openFile 收到:", payload);
    const fp = payload?.filePath ?? null;
    if (_setFilePath) { _setFilePath(fp); } else { console.log("[editor] _setFilePath null, pending"); _pendingFile = fp; }
  });
} catch (e) { console.error("[editor] pluginRequest 注册失败:", e); }

const EditorPlugin: React.FC = () => {
  const [filePath, setFilePath] = useState<string | null>(_pendingFile);
  _setFilePath = setFilePath;
  if (_pendingFile) { if (!filePath) setFilePath(_pendingFile); _pendingFile = null; }

  // debug: always render something
  return <div style={{padding:20,color:'white',background:'#333'}}>EDITOR PLUGIN LOADED<br/>filePath: {filePath ?? '(none)'}</div>;
  /*
  if (!filePath) {
    return <div className="editor-container editor-empty">编辑器（双击文件树打开文件）</div>;
  }

  if (filePath.includes("|||")) {
    const [orig, mod] = filePath.split("|||");
    return <DiffEditor originalPath={orig} modifiedPath={mod} isActive={true} />;
  }

  return <EditorTab filePath={filePath} isActive={true} />;
  */
};

export default EditorPlugin;
