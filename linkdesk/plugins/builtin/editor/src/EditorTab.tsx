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
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTabActions } from "@src/core/TabActionsContext";
import { normalizePath } from "@src/core/pathUtils";
import { EditorModel } from "./EditorModel";
import EditorView from "./EditorView";
import EditorStatusBar from "./EditorStatusBar";
import type { EditorStatus } from "./EditorStatusBar";
import EditorBreadcrumb from "./EditorBreadcrumb";
import { trackDirtyFile, clearDirtyFile, hasBackup, getBackupContent } from "./hot-exit";

export interface EditorTabProps {
  /** 文件绝对路径——来自 createTab 的 sourceId */
  filePath: string;
  /** 标签页是否活跃 */
  isActive: boolean;
}

const EditorTab: React.FC<EditorTabProps> = ({ filePath, isActive }) => {
  const tabActions = useTabActions();
  const [model, setModel] = useState<EditorModel | null>(null);
  const [value, setValue] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  // E4V#40j——编辑器状态栏数据
  const [editorStatus, setEditorStatus] = useState<EditorStatus>({
    lineNumber: 1,
    column: 1,
    encoding: "",
    language: "",
    tabSize: 2,
    insertSpaces: true,
    eol: "LF",
  });

  const handleCursorChange = useCallback((lineNumber: number, column: number) => {
    setEditorStatus((prev) => ({ ...prev, lineNumber, column }));
  }, []);

  const handleEditorMount = useCallback(
    (opts: { tabSize: number; insertSpaces: boolean; eol: string }) => {
      setEditorStatus((prev) => ({
        ...prev,
        tabSize: opts.tabSize,
        insertSpaces: opts.insertSpaces,
        eol: opts.eol as "LF" | "CRLF",
      }));
    },
    [],
  );

  // 加载文件
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // E4V#40n——Hot Exit：优先使用备份内容
    if (hasBackup(filePath)) {
      const backupContent = getBackupContent(filePath)!;
      // 从磁盘正常加载（取编码/语言），但内容用备份
      EditorModel.load(filePath)
        .then((m) => {
          if (cancelled) return;
          m.setValue(backupContent);
          setModel(m);
          setValue(backupContent);
          setEditorStatus((prev) => ({
            ...prev,
            encoding: m.encoding,
            language: m.language,
          }));
          // 标记为脏——备份内容未保存
          dirtyRef.current = true;
          const baseName = normalizePath(filePath).split("/").pop() || filePath;
          tabActions?.updateTabLabelBySourceId?.(filePath, `● ${baseName}`);
          trackDirtyFile(filePath, backupContent);
          setLoading(false);
        })
        .catch((_err) => {
          if (cancelled) return;
          // 从磁盘加载失败→只用备份内容
          const fallback = EditorModel.fromContent(filePath, backupContent);
          setModel(fallback);
          setValue(backupContent);
          setEditorStatus((prev) => ({
            ...prev,
            encoding: fallback.encoding,
            language: fallback.language,
          }));
          dirtyRef.current = true;
          const baseName = normalizePath(filePath).split("/").pop() || filePath;
          tabActions?.updateTabLabelBySourceId?.(filePath, `● ${baseName}`);
          trackDirtyFile(filePath, backupContent);
          setLoading(false);
        });
    } else {
      EditorModel.load(filePath)
        .then((m) => {
          if (cancelled) return;
          setModel(m);
          setValue(m.getValue());
          setEditorStatus((prev) => ({
            ...prev,
            encoding: m.encoding,
            language: m.language,
          }));
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          console.error(`[EditorTab] 加载失败: ${filePath}`, err);
          setError(`无法打开文件: ${(err as Error).message}`);
          setLoading(false);
        });
    }
    return () => { cancelled = true; };
  }, [filePath]);

  // 内容变更
  const handleChange = useCallback((newValue: string | undefined) => {
    const v = newValue ?? "";
    setValue(v);
    model?.setValue(v);
    const isDirty = model?.isDirty() ?? false;
    if (dirtyRef.current !== isDirty) {
      dirtyRef.current = isDirty;
      const baseName = normalizePath(filePath).split("/").pop() || filePath;
      const label = isDirty ? `● ${baseName}` : baseName;
      tabActions?.updateTabLabelBySourceId?.(filePath, label);
    }
    // E4V#40n——Hot Exit：每次内容变更都更新备份，不在上面的状态守卫里（否则只保存第一次按键的内容）
    if (isDirty) {
      trackDirtyFile(filePath, v);
    }
  }, [model, filePath, tabActions]);

  // 保存
  const handleSave = useCallback(async () => {
    if (!model) return;
    try {
      await model.save();
      model.markSaved();
      dirtyRef.current = false;
      clearDirtyFile(filePath);
      const baseName = normalizePath(filePath).split("/").pop() || filePath;
      tabActions?.updateTabLabelBySourceId?.(filePath, baseName);
    } catch (err) {
      console.error(`[EditorTab] 保存失败: ${filePath}`, err);
      setError(`保存失败: ${(err as Error).message}`);
    }
  }, [model, filePath, tabActions]);

  if (loading) {
    return <div className="editor-loading">加载中…</div>;
  }

  if (error) {
    return <div className="editor-error">{error}</div>;
  }

  if (!model) {
    return <div className="editor-empty">无法打开文件</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <EditorBreadcrumb filePath={model.filePath} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <EditorView
          value={value}
          language={model.language}
          filePath={model.filePath}
          isActive={isActive}
          onChange={handleChange}
          onSave={handleSave}
          onCursorChange={handleCursorChange}
          onEditorMount={handleEditorMount}
        />
      </div>
      <EditorStatusBar {...editorStatus} />
    </div>
  );
};

export default EditorTab;
