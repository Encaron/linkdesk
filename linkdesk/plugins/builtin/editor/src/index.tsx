import React, { useState, useEffect } from "react";
import EditorTab from "./EditorTab";
import DiffEditor from "./DiffEditor";
import { initHotExit } from "./hot-exit";
import "./editor.css"; initHotExit();

const EditorPlugin: React.FC = () => {
  const [fp, setFp] = useState<string|null>(null);
  useEffect(() => { (window as any).linkdesk?.pluginRequest?.handle?.("openFile",(p:any)=>setFp(p?.filePath??null)); },[]);
  if(!fp) return <div className="editor-container editor-empty">编辑器（双击文件打开）</div>;
  if(fp.includes("|||")){ const [o,m]=fp.split("|||"); return <DiffEditor originalPath={o} modifiedPath={m} isActive />; }
  return <EditorTab filePath={fp} isActive />;
};
export default EditorPlugin;
