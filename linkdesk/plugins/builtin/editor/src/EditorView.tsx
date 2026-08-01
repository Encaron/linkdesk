/**
 * E4V#40b Monaco 编辑器包装器。
 *
 * 🔥 URI 策略：beforeMount 中用 Uri.file 预创建 model（file:/// 协议），
 *    path prop 传 file:/// URI，@monaco-editor/react 发现已有 model 直接复用。
 *    TS worker 只认 file:/// 协议——E: scheme 返回 undefined。
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

export interface EditorViewHandle {
  layout(): void;
  dispose(): void;
}

const EditorView = forwardRef<EditorViewHandle, EditorViewProps>(function EditorView(
  { value, language, filePath, isActive, onChange, onSave, readOnly },
  ref,
) {
  const editorRef = useRef<any>(null);
  const monacoNsRef = useRef<any>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const pathRef = useRef(filePath);
  pathRef.current = filePath;
  const valueRef = useRef(value);
  valueRef.current = value;
  const langRef = useRef(language);
  langRef.current = language;

  useImperativeHandle(ref, () => ({
    layout: () => editorRef.current?.layout(),
    dispose: () => editorRef.current?.dispose(),
  }), []);

  const beforeMount: BeforeMount = useCallback((monaco) => {
    monacoNsRef.current = monaco;
    console.log("[editor] beforeMount");

    // 🔥 Uri.parse(file:///...) 预创建 model——Uri.file 把盘符冒号编码成 %3A，TS worker 不认
    const normalized = normalizePath(pathRef.current);
    const uri = monaco.Uri.parse(`file:///${normalized}`);
    const existing = monaco.editor.getModel(uri);
    if (!existing) {
      monaco.editor.createModel(valueRef.current, langRef.current, uri);
      console.log("[editor] 预创建 model:", uri.toString());
    } else {
      console.log("[editor] 复用已有 model:", uri.toString());
    }

    registerLanguageMap(monaco);
    syncMonacoTheme(monaco);
    setupTypeScriptEnv(monaco);
    scanWorkspaceForTypeScript(monaco);
  }, []);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoNsRef.current = monaco;

    const model = editor.getModel();
    console.log("[editor] onMount——model URI:", model?.uri?.toString());

    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => onSaveRef.current?.(),
    );

    // 🔥 F12 诊断——直接问 TS worker
    const queryDefinition = async () => {
      const m = editor.getModel();
      const pos = editor.getPosition();
      if (!m || !pos) return;
      console.log("[editor] F12——查询:", m.uri.toString(), pos.lineNumber, pos.column);
      try {
        const worker = await monaco.languages.typescript.getTypeScriptWorker();
        const client = await worker(m.uri);
        const defs = await client.getDefinitionAtPosition(
          m.uri.toString(),
          { line: pos.lineNumber, offset: pos.column - 1 },
        );
        console.log("[editor] F12——返回:", JSON.stringify(defs));
      } catch (e) {
        console.error("[editor] F12——出错:", e);
      }
    };
    editor.addCommand(monaco.KeyCode.F12, queryDefinition);
  }, []);

  useEffect(() => {
    if (!isActive) return;
    const raf = requestAnimationFrame(() => { editorRef.current?.layout(); });
    return () => cancelAnimationFrame(raf);
  }, [isActive]);

  useEffect(() => {
    return subscribeThemeSync(monacoNsRef);
  }, []);

  useEffect(() => {
    return () => { editorRef.current?.dispose(); };
  }, []);

  // 🔥 构造 file:/// URI 给 path prop——@monaco-editor/react 用 Uri.parse 创建，和预创建的 Uri.file model 匹配
  const fileUri = `file:///${normalizePath(filePath)}`;

  return (
    <Editor
      height="100%"
      path={fileUri}
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
