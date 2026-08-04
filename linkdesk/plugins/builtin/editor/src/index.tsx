/**
 * 编辑器插件入口。
 * E5#76：独立 WebView——接收壳 requestToPlugin('openFile') 代替 React props。
 */
import React, { useState, useEffect } from "react";
import EditorTab from "./EditorTab";
import DiffEditor from "./DiffEditor";
import { initHotExit } from "./hot-exit";
import "./editor.css";

initHotExit();

const EditorPlugin: React.FC = () => {
  const [filePath, setFilePath] = useState<string | null>(null);

  useEffect(() => {
    const api = (window as any).linkdesk?.pluginRequest;
    if (!api) return;
    api.handle("openFile", async (payload: any) => {
      setFilePath(payload?.filePath ?? null);
    });
  }, []);

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
