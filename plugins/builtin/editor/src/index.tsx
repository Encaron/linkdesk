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

// E5#76：模块级 handler——notifyReady 比 useEffect 先发，必须组件函数外注册
let _setFilePath: ((v: string | null) => void) | null = null;
const api = (window as any).linkdesk?.pluginRequest;
api?.handle("openFile", async (payload: any) => {
  _setFilePath?.(payload?.filePath ?? null);
});

const EditorPlugin: React.FC = () => {
  const [filePath, setFilePath] = useState<string | null>(null);
  _setFilePath = setFilePath;

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
