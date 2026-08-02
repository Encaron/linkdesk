/**
 * 编辑器插件入口。
 * E4 R17：Monaco 编辑器——tabOnly 视图插件。
 *
 * 壳渲染链路：MainContent.tsx L88-94
 *   getViewPlugin("editor") → <plugin.component isActive={isActive} sourceId={tab.sourceId} />
 * 约定：sourceId = filePath（文件树 createTab 时传入）
 */
import React, { useEffect } from "react";
import EditorTab from "./EditorTab";
import DiffEditor from "./DiffEditor";
import { initHotExit } from "./hot-exit";
import { popClosedEditorTab } from "./closed-tabs";
import { registerCommand } from "@src/core/CommandRegistry";
import { useTabActions } from "@src/core/TabActionsContext";
import "./editor.css";

// E4V#40n——模块加载时初始化 Hot Exit
initHotExit();

/* ── E4V#40p：createTab 桥——命令 handler 调 createTab ── */
let _createEditorTabFn: ((filePath: string, label: string) => void) | null = null;

// E4V#40p——Ctrl+Shift+T 恢复最近关闭的编辑器标签页
registerCommand("editor", {
  id: "editor.reopenClosedEditor",
  title: "重新打开已关闭的编辑器",
  handler: async () => {
    const entry = popClosedEditorTab();
    if (entry && _createEditorTabFn) {
      _createEditorTabFn(entry.filePath, entry.label);
    }
  },
});

export interface EditorPluginProps {
  isActive: boolean;
  sourceId?: string;
}

const EditorPlugin: React.FC<EditorPluginProps> = ({ isActive, sourceId }) => {
  const tabActions = useTabActions();

  // E4V#40p——注入 createTab 桥，供命令 handler 调
  useEffect(() => {
    _createEditorTabFn = (filePath: string, label: string) => {
      tabActions?.createTab("editor", { label, sourceId: filePath });
    };
    return () => { _createEditorTabFn = null; };
  }, [tabActions]);

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
