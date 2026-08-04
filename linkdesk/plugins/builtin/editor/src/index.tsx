import React, { useState, useEffect } from "react";
import EditorTab from "./EditorTab";
import DiffEditor from "./DiffEditor";
import { initHotExit } from "./hot-exit";
import "./editor.css";
initHotExit();

const EditorPlugin: React.FC = () => {
  const [fp, setFp] = useState<string | null>(null);

  useEffect(() => {
    console.log("[E5#76d] editor mount, pluginRequest:", !!(window as any).linkdesk?.pluginRequest);
    (window as any).linkdesk?.pluginRequest?.handle?.("openFile", (p: any) => {
      console.log("[E5#76d] openFile:", p?.filePath);
      setFp(p?.filePath ?? null);
    });
  }, []);

  if (!fp) return <div style={{padding:20,color:"#fff"}}>等待打开文件...</div>;
  if (fp.includes("|||")) { const [o,m]=fp.split("|||"); return <DiffEditor originalPath={o} modifiedPath={m} isActive />; }
  return <EditorTab filePath={fp} isActive />;
};
export default EditorPlugin;
