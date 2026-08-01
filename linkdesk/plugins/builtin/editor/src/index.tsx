/**
 * 编辑器插件入口。
 * E4 R17：Monaco 编辑器——tabOnly 视图插件。
 * 骨架阶段——E4V#40a，后续任务逐步填充 EditorView/EditorModel/EditorTab 等。
 *
 * 壳渲染链路：MainContent.tsx L88-94
 *   getViewPlugin("editor") → <plugin.component isActive={isActive} sourceId={tab.sourceId} />
 * 约定：sourceId = filePath（文件树 createTab 时传入）
 */
import React from "react";

export interface EditorPluginProps {
  isActive: boolean;
  sourceId?: string;
}

const EditorPlugin: React.FC<EditorPluginProps> = ({ isActive, sourceId }) => {
  // 骨架占位——E4V#40f EditorTab 接入后替换为完整编辑器
  return (
    <div className="editor-container" data-active={isActive}>
      {sourceId ? `编辑器占位：${sourceId}` : "编辑器（无打开文件）"}
    </div>
  );
};

export default EditorPlugin;
