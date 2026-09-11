/**
 * E4V#40f EditorTab——文件打开/保存接线。
 *
 * 这是"编辑器标签页"的 React 组件——index.tsx 中收到 sourceId（filePath）后渲染它。
 *
 * 职责：
 *   - mount 时 EditorModel.load(filePath) → 得到 model
 *   - 渲染 EditorView——传入 value/language/filePath/isActive
 *   - onChange → model.setValue → 检测脏状态 → 更新标签栏标题（● 前缀）
 *   - Ctrl+S → onSave → model.save() → markSaved → 清除 ●
 *   - 保存失败 toast 报错（只读/权限不足/磁盘满）
 *   - E4V#40j——渲染 EditorStatusBar（行:列/编码/语言/缩进/EOL）
 *
 * E6#87c：原 443 行单文件拆为同名夹，本文件 = **门面**（components/ 用夹内门面的形态）。
 * 消费方 import 路径零变更；state → 各管线 hook → 本门面只负责组装与渲染。
 */
import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import EditorView from "../views/EditorView";
import type { EditorViewHandle } from "../views/EditorView";
import EditorStatusBar from "./EditorStatusBar";
import EditorBreadcrumb from "./EditorBreadcrumb";
import type { EditorTabProps } from "./EditorTab/types";
import { useEditorTabState } from "./EditorTab/useEditorTabState";
import { useEditorStatus } from "./EditorTab/useEditorStatus";
import { useMonacoOptions } from "./EditorTab/useMonacoOptions";
import { useEditorLoad } from "./EditorTab/useEditorLoad";
import { useEditorRename } from "./EditorTab/useEditorRename";
import { useEditorSave } from "./EditorTab/useEditorSave";
import { useEditorExternalReload } from "./EditorTab/useEditorExternalReload";
import { useEditorTabFocus } from "./EditorTab/useEditorTabFocus";

export type { EditorTabProps } from "./EditorTab/types";

const EditorTab: React.FC<EditorTabProps> = ({ filePath, isActive, tabId }) => {
  const { t } = useTranslation();
  const state = useEditorTabState(filePath);
  const { editorStatus, patchStatus, handleCursorChange, handleLspStateChange, handleEditorMount } = useEditorStatus();
  // E4V#40q——EditorView ref → 运行时 updateOptions
  const editorViewRef = useRef<EditorViewHandle>(null);
  // E4V#40q——编辑器选项（异步加载配置）
  const editorOptions = useMonacoOptions(editorViewRef);

  useEditorLoad(state, t, patchStatus);
  useEditorRename(state, patchStatus);
  const { markClean, handleSave, handleChange } = useEditorSave(state, t, isActive);
  useEditorExternalReload(state, t, markClean, editorViewRef);
  useEditorTabFocus(editorViewRef, tabId);

  if (state.loading) {
    return <div className="editor-loading">{t("加载中…")}</div>;
  }

  if (state.error) {
    return <div className="editor-error">{state.error}</div>;
  }

  if (!state.model) {
    return <div className="editor-empty">{t("无法打开文件")}</div>;
  }

  // E4V#40q——编辑器选项（异步加载自 lk.configuration）

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <EditorBreadcrumb filePath={state.model.filePath} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <EditorView
          ref={editorViewRef}
          value={state.value}
          language={state.model.language}
          filePath={state.model.filePath}
          isActive={isActive}
          onChange={handleChange}
          onSave={handleSave}
          onCursorChange={handleCursorChange}
          onEditorMount={handleEditorMount}
          onLspStateChange={handleLspStateChange}
          options={editorOptions}
        />
      </div>
      <EditorStatusBar {...editorStatus} />
    </div>
  );
};

export default EditorTab;
