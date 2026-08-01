/**
 * E4V#40b Monaco 编辑器包装器。
 *
 * 参考：plugins/user/serial-monitor/src/index.tsx L1082-1125
 *   - beforeMount：注册常用语言 + 定义 LinkDesk 主题
 *   - onMount：存 editorRef + monacoNsRef + 注册 Ctrl+S
 *   - keep-alive：isActive 切换时 requestAnimationFrame → layout()
 *   - StrictMode：unmount cleanup 中 dispose editor
 *
 * 🔥 E4V#40g1 归一化：useImperativeHandle 暴露 handle，内部 ref 私有。
 *   对标 FileTreeHandle 模式——外部消费方不碰 ref 内部，只调 handle 方法。
 *   预防 Bug R17-1：monacoRef/editorRef stale ref 混淆。
 *
 * Props 由 EditorTab（E4V#40f）传入。
 */
import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import Editor, { type OnMount, type BeforeMount } from "@monaco-editor/react";
import { normalizePath } from "@src/core/pathUtils";
import { registerLanguageMap } from "./language-map";
import { syncMonacoTheme, subscribeThemeSync } from "./theme-sync";
import { setupTypeScriptEnv, scanWorkspaceForTypeScript } from "./ts-intelligence";

export interface EditorViewProps {
  value: string;
  language: string;
  filePath: string;
  isActive: boolean;
  onChange?: (value: string | undefined) => void;
  onSave?: () => void;
  readOnly?: boolean;
}

/** 🔥 归一化 handle——外部（EditorTab/快捷键/测试）只调方法，不碰内部 ref */
export interface EditorViewHandle {
  /** 刷新 Monaco 布局 */
  layout(): void;
  /** 销毁编辑器 */
  dispose(): void;
}

const EditorView = forwardRef<EditorViewHandle, EditorViewProps>(function EditorView(
  { value, language, filePath, isActive, onChange, onSave, readOnly },
  ref,
) {
  /** Monaco 编辑器实例——layout()/dispose()/addCommand() */
  const editorRef = useRef<any>(null);
  /** Monaco 命名空间——monaco.editor.defineTheme/setTheme */
  const monacoNsRef = useRef<any>(null);
  // 🔥 ref 桥接——handleEditorMount 只跑一次，Ctrl+S 始终读最新 onSave
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  // 🔥 value/language/filePath ref——handleEditorMount 创建 model 时需要这些值
  const valueRef = useRef(value);
  valueRef.current = value;
  const langRef = useRef(language);
  langRef.current = language;
  const pathRef = useRef(filePath);
  pathRef.current = filePath;

  // 🔥 归一化 handle——外部不碰 editorRef/monacoNsRef
  useImperativeHandle(ref, () => ({
    layout: () => editorRef.current?.layout(),
    dispose: () => editorRef.current?.dispose(),
  }), []);

  const beforeMount: BeforeMount = useCallback((monaco) => {
    monacoNsRef.current = monaco;
    registerLanguageMap(monaco);
    syncMonacoTheme(monaco);
    setupTypeScriptEnv(monaco);
    scanWorkspaceForTypeScript(monaco);
  }, []);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoNsRef.current = monaco;

    // 🔥 手动创建/复用 model——monaco.Uri.file 保证 URI 格式与影子 model 一致
    const uri = monaco.Uri.file(normalizePath(pathRef.current));
    let model = monaco.editor.getModel(uri);
    if (!model) {
      model = monaco.editor.createModel(valueRef.current, langRef.current, uri);
    }
    editor.setModel(model);

    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => onSaveRef.current?.(),
    );
  }, []);

  // 🔥 value 变更 → 同步到 model（EditorTab 不直接操作 model，走 value prop）
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (model && !model.isDisposed() && model.getValue() !== value) {
      model.setValue(value);
    }
  }, [value]);

  // keep-alive：标签页切回时刷新 Monaco 布局
  useEffect(() => {
    if (!isActive) return;
    const raf = requestAnimationFrame(() => {
      editorRef.current?.layout();
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive]);

  // 主题订阅：LinkDesk 切换亮/暗色 → Monaco 自动跟随
  useEffect(() => {
    return subscribeThemeSync(monacoNsRef);
  }, []);

  // StrictMode 防线：unmount 时 dispose editor
  useEffect(() => {
    return () => {
      editorRef.current?.dispose();
    };
  }, []);

  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      onChange={onChange}
      theme="linkdesk"
      beforeMount={beforeMount}
      onMount={handleEditorMount}
      options={{ readOnly }}
    />
  );
});

export default EditorView;
