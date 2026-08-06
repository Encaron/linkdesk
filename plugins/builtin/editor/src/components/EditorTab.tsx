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
import { useTranslation } from "react-i18next";
import { EditorModel } from "../services/EditorModel";
import EditorView from "../views/EditorView";
import type { EditorViewHandle } from "../views/EditorView";
import EditorStatusBar from "./EditorStatusBar";
import type { EditorStatus } from "./EditorStatusBar";
import EditorBreadcrumb from "./EditorBreadcrumb";
import { trackDirtyFile, clearDirtyFile, hasBackup, getBackupContent } from "../services/hot-exit";

const lk = (window as any).linkdesk;

/**
 * E4V#40q——从 ConfigurationService 读取编辑器配置，构建 Monaco IEditorOptions。
 * 配置键（editor.fontSize 等）→ Monaco 选项（fontSize 等）。
 * 嵌套键（editor.minimap.enabled）→ 嵌套对象（minimap: { enabled }）。
 */
async function buildMonacoOptions(): Promise<Record<string, unknown>> {
  const [
    fontSize, fontFamily, fontWeight, lineHeight, tabSize, insertSpaces, detectIndentation,
    wordWrap, lineNumbers, minimapEnabled, renderWhitespace, cursorStyle, cursorBlinking,
    mouseWheelZoom, smoothScrolling, autoClosingBrackets, bracketPairColorization,
    guidesIndentation, linkedEditing, occurrencesHighlight, selectionHighlight,
    parameterHintsEnabled, quickSuggestions, showWords, showSnippets,
  ] = await Promise.all([
    lk.configuration.get("editor.fontSize"),
    lk.configuration.get("editor.fontFamily"),
    lk.configuration.get("editor.fontWeight"),
    lk.configuration.get("editor.lineHeight"),
    lk.configuration.get("editor.tabSize"),
    lk.configuration.get("editor.insertSpaces"),
    lk.configuration.get("editor.detectIndentation"),
    lk.configuration.get("editor.wordWrap"),
    lk.configuration.get("editor.lineNumbers"),
    lk.configuration.get("editor.minimap.enabled"),
    lk.configuration.get("editor.renderWhitespace"),
    lk.configuration.get("editor.cursorStyle"),
    lk.configuration.get("editor.cursorBlinking"),
    lk.configuration.get("editor.mouseWheelZoom"),
    lk.configuration.get("editor.smoothScrolling"),
    lk.configuration.get("editor.autoClosingBrackets"),
    lk.configuration.get("editor.bracketPairColorization"),
    lk.configuration.get("editor.guides.indentation"),
    lk.configuration.get("editor.linkedEditing"),
    lk.configuration.get("editor.occurrencesHighlight"),
    lk.configuration.get("editor.selectionHighlight"),
    lk.configuration.get("editor.parameterHints.enabled"),
    lk.configuration.get("editor.quickSuggestions"),
    lk.configuration.get("editor.suggest.showWords"),
    lk.configuration.get("editor.suggest.showSnippets"),
  ]);
  return {
    fontSize, fontFamily, fontWeight, lineHeight, tabSize, insertSpaces, detectIndentation,
    wordWrap, lineNumbers, minimap: { enabled: minimapEnabled }, renderWhitespace, cursorStyle, cursorBlinking,
    mouseWheelZoom, smoothScrolling, autoClosingBrackets, bracketPairColorization,
    guides: { indentation: guidesIndentation }, linkedEditing, occurrencesHighlight, selectionHighlight,
    parameterHints: { enabled: parameterHintsEnabled }, quickSuggestions,
    suggest: { showWords, showSnippets },
  };
}

export interface EditorTabProps {
  /** 文件绝对路径——来自 createTab 的 sourceId */
  filePath: string;
  /** 标签页是否活跃 */
  isActive: boolean;
}

const EditorTab: React.FC<EditorTabProps> = ({ filePath, isActive }) => {
  const { t } = useTranslation();
  const tabs = (window as any).linkdesk?.tabs;
  const [model, setModel] = useState<EditorModel | null>(null);
  const [value, setValue] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  // E5#52：baseLabel 只算一次——脏/净切换只加减 ●，不重新取 baseName
  const baseLabelRef = useRef(lk.path.normalize(filePath).split("/").pop() || filePath);
  // E4V#40o——自动保存计时器
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // E4V#40o——onFocusChange 需要前一帧 isActive 判断切换方向
  const prevActiveRef = useRef(isActive);
  // E4V#40q——EditorView ref → 运行时 updateOptions
  const editorViewRef = useRef<EditorViewHandle>(null);
  // E4V#40q——编辑器选项状态（异步加载配置）
  const [editorOptions, setEditorOptions] = useState<Record<string, unknown>>();

  // E4V#40q——加载编辑器配置
  useEffect(() => {
    buildMonacoOptions().then(setEditorOptions);
  }, []);

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

  // 保存——放前面，autoSave 逻辑引用它
  const handleSave = useCallback(async () => {
    if (!model) return;
    try {
      await model.save();
      model.markSaved();
      dirtyRef.current = false;
      clearDirtyFile(filePath);
      tabs?.updateLabelBySourceId?.(filePath, baseLabelRef.current);
    } catch (err) {
      console.error(`[EditorTab] 保存失败: ${filePath}`, err);
      setError(`${t("保存失败：")} ${(err as Error).message}`);
    }
  }, [model, filePath, tabs]);

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
          tabs?.updateLabelBySourceId?.(filePath, `● ${baseLabelRef.current}`);
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
          tabs?.updateLabelBySourceId?.(filePath, `● ${baseLabelRef.current}`);
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
          setError(`${t("无法打开文件")}: ${(err as Error).message}`);
          setLoading(false);
        });
    }
    return () => { cancelled = true; };
  }, [filePath]);

  // E4V#40o——onFocusChange 自动保存：切走标签页时自动保存
  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = isActive;
    lk.configuration.get("files.autoSave").then((autoSave: string) => {
      if ((autoSave ?? "off") === "onFocusChange" && wasActive && !isActive && model && model.isDirty()) {
        handleSave();
      }
    });
  }, [isActive, model, handleSave]);

  // 内容变更
  const handleChange = useCallback(async (newValue: string | undefined) => {
    const v = newValue ?? "";
    setValue(v);
    model?.setValue(v);
    const isDirty = model?.isDirty() ?? false;
    if (dirtyRef.current !== isDirty) {
      dirtyRef.current = isDirty;
      // E5#52：只加减 ●，不重取 baseName——保留标签页去歧义后缀
      const label = isDirty ? `● ${baseLabelRef.current}` : baseLabelRef.current;
      tabs?.updateLabelBySourceId?.(filePath, label);
    }
    // E4V#40n——Hot Exit：每次内容变更都更新备份，不在上面的状态守卫里（否则只保存第一次按键的内容）
    if (isDirty) {
      trackDirtyFile(filePath, v);
    }
    // E4V#40o——afterDelay 自动保存：每次变更重置 1s 计时器
    const autoSave = await lk.configuration.get("files.autoSave") ?? "off";
    if (autoSave === "afterDelay") {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        handleSave();
      }, 1000);
    }
  }, [model, filePath, tabs, handleSave]);

  // E4V#40o——卸载时清理自动保存计时器
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  // E4V#40q——订阅配置变更 → 运行时 updateOptions，无需重建 editor
  useEffect(() => {
    const unsubscribe = lk.configuration.onChange("", async () => {
      const opts = await buildMonacoOptions();
      editorViewRef.current?.updateOptions(opts);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return <div className="editor-loading">{t("加载中…")}</div>;
  }

  if (error) {
    return <div className="editor-error">{error}</div>;
  }

  if (!model) {
    return <div className="editor-empty">{t("无法打开文件")}</div>;
  }

  // E4V#40q——编辑器选项（异步加载自 lk.configuration）

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <EditorBreadcrumb filePath={model.filePath} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <EditorView
          ref={editorViewRef}
          value={value}
          language={model.language}
          filePath={model.filePath}
          isActive={isActive}
          onChange={handleChange}
          onSave={handleSave}
          onCursorChange={handleCursorChange}
          onEditorMount={handleEditorMount}
          options={editorOptions}
        />
      </div>
      <EditorStatusBar {...editorStatus} />
    </div>
  );
};

export default EditorTab;
