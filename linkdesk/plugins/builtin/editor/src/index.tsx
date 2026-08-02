/**
 * 编辑器插件入口。
 * E4 R17：Monaco 编辑器——tabOnly 视图插件。
 *
 * 壳渲染链路：MainContent.tsx L88-94
 *   getViewPlugin("editor") → <plugin.component isActive={isActive} sourceId={tab.sourceId} />
 * 约定：sourceId = filePath（文件树 createTab 时传入）
 */
import React from "react";
import EditorTab from "./EditorTab";
import DiffEditor from "./DiffEditor";
import "./editor.css";

export interface EditorPluginProps {
  isActive: boolean;
  sourceId?: string;
}

const EditorPlugin: React.FC<EditorPluginProps> = ({ isActive, sourceId }) => {
  if (!sourceId) {
    return (
      <div className="editor-container editor-empty">
        编辑器（无打开文件——sourceId 未设置）
      </div>
    );
  }

  // E4V#40m——Diff：sourceId = "originalPath|||modifiedPath"
  if (sourceId.includes("|||")) {
    const [originalPath, modifiedPath] = sourceId.split("|||");
    return <DiffEditor originalPath={originalPath} modifiedPath={modifiedPath} isActive={isActive} />;
  }

  return <EditorTab filePath={sourceId} isActive={isActive} />;
};

export default EditorPlugin;
