import React from "react";
import EditorTab from "./components/EditorTab";
import DiffEditor from "./views/DiffEditor";
import { initHotExit } from "./services/hot-exit";
import "./styles/editor.css"; initHotExit();

const EditorPlugin: React.FC<{ isActive?: boolean; sourceId?: string }> = ({ sourceId: propId }) => {
  // E5#84 → E5.7#98：filePath 单通道——pool 经 props 传入（PluginComponent sourceId）。
  // 原 IPC 优先通道（pluginRequest.handle("openFile")）随 E5.7#43 整删（preload-pool
  // 不再暴露 pluginRequest），死 no-op 代码摘除（serial-monitor 同款）。
  const fp = propId;
  if (!fp) return <div className="editor-container editor-empty">编辑器（双击文件打开）</div>;
  if (fp.includes("|||")) { const [o, m] = fp.split("|||"); return <DiffEditor originalPath={o} modifiedPath={m} isActive />; }
  return <EditorTab filePath={fp} isActive />;
};
export default EditorPlugin;
