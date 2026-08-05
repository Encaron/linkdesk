import React, { useState, useEffect } from "react";
import EditorTab from "./components/EditorTab";
import DiffEditor from "./views/DiffEditor";
import { initHotExit } from "./services/hot-exit";
import "./styles/editor.css"; initHotExit();

const EditorPlugin: React.FC<{ isActive?: boolean; sourceId?: string }> = ({ sourceId: propId }) => {
  const [ipcId, setIpcId] = useState<string | null>(null);
  useEffect(() => {
    (window as any).linkdesk?.pluginRequest?.handle?.("openFile", (p: any) => setIpcId(p?.filePath ?? null));
  }, []);
  const fp = ipcId ?? propId;
  if (!fp) return <div className="editor-container editor-empty">编辑器（双击文件打开）</div>;
  if (fp.includes("|||")) { const [o, m] = fp.split("|||"); return <DiffEditor originalPath={o} modifiedPath={m} isActive />; }
  return <EditorTab filePath={fp} isActive />;
};
export default EditorPlugin;
