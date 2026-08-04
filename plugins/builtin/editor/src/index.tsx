/**
 * 编辑器插件入口。E5#76d：独立 WebView——模块级 handler + pending queue。
 */
import React, { useState } from "react";
import EditorTab from "./EditorTab";
import DiffEditor from "./DiffEditor";
import { initHotExit } from "./hot-exit";
import "./editor.css";

initHotExit();

// E5#76d：模块级——linkdesk 可能未就绪，重试注册
let _setFilePath: ((v: string | null) => void) | null = null;
let _pending: string | null = null;
(function _register() {
  const api = (window as any).linkdesk?.pluginRequest;
  if (!api) { setTimeout(_register, 10); return; }
  api.handle("openFile", async (payload: any) => {
    const fp = payload?.filePath ?? null;
    if (_setFilePath) { _setFilePath(fp); }
    else { _pending = fp; }
  });
})();

const EditorPlugin: React.FC = () => {
  const [filePath, setFilePath] = useState<string | null>(_pending);
  _setFilePath = setFilePath;
  if (_pending) { _pending = null; if (!filePath) setFilePath(_pending!); }

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
