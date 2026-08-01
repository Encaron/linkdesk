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
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTabActions } from "@src/core/TabActionsContext";
import { normalizePath } from "@src/core/pathUtils";
import { EditorModel } from "./EditorModel";
import EditorView from "./EditorView";

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

  // 加载文件
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    EditorModel.load(filePath)
      .then((m) => {
        if (cancelled) return;
        setModel(m);
        setValue(m.getValue());
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(`[EditorTab] 加载失败: ${filePath}`, err);
        setError(`无法打开文件: ${(err as Error).message}`);
        setLoading(false);
      });
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
  }, [model, filePath, tabActions]);

  // 保存
  const handleSave = useCallback(async () => {
    if (!model) return;
    try {
      await model.save();
      model.markSaved();
      dirtyRef.current = false;
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
    <EditorView
      value={value}
      language={model.language}
      filePath={model.filePath}
      isActive={isActive}
      onChange={handleChange}
      onSave={handleSave}
    />
  );
};

export default EditorTab;
