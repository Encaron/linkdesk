/**
 * E4V#40b Monaco 编辑器包装器 + F12 跳转定义。
 *
 * F12：调 TS worker getDefinitionAtPosition → 拿到文件路径和位置 → 回调 onOpenDefinition
 * EditorTab 消费此回调 → createTab 打开目标文件并跳转到定义位置。
 * 对标 VS Code F12"跳转到定义"。
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
  /** F12 跳转定义回调——EditorTab 消费，createTab 打开目标文件 */
  onOpenDefinition?: (filePath: string, line: number, column: number) => void;
}

export interface EditorViewHandle {
  layout(): void;
  dispose(): void;
}

/** file:///e%3A/_testfiles/utils.ts → E:/_testfiles/utils.ts */
function uriToFilePath(uri: string): string {
  return normalizePath(
    decodeURIComponent(uri.replace(/^file:\/\/\//, ""))
  );
}

const EditorView = forwardRef<EditorViewHandle, EditorViewProps>(function EditorView(
  { value, language, filePath, isActive, onChange, onSave, readOnly, onOpenDefinition },
  ref,
) {
  const editorRef = useRef<any>(null);
  const monacoNsRef = useRef<any>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onOpenDefRef = useRef(onOpenDefinition);
  onOpenDefRef.current = onOpenDefinition;

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

    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => onSaveRef.current?.(),
    );

    // 扫描后触发 TS 重分析（影子 model 创建晚于首次分析）
    scanWorkspaceForTypeScript(monaco).then(() => {
      const m = editor.getModel();
      if (!m || m.isDisposed()) return;
      const lastLine = m.getLineCount();
      const lastCol = m.getLineMaxColumn(lastLine);
      const Range = monaco.Range;
      m.applyEdits([{ range: new Range(lastLine, lastCol, lastLine, lastCol), text: "x" }]);
      m.applyEdits([{ range: new Range(lastLine, lastCol, lastLine, lastCol + 1), text: "" }]);
    });

    // 🔥 跳转到定义（对标 VS Code）——F12、Ctrl+Click 共用
    const goToDefinition = async () => {
      const m = editor.getModel();
      const pos = editor.getPosition();
      if (!m || !pos) return;
      try {
        const worker = await monaco.languages.typescript.getTypeScriptWorker();
        const client = await worker(m.uri);
        const defs = await client.getDefinitionAtPosition(m.uri.toString(), m.getOffsetAt(pos));
        if (!defs || defs.length === 0) return;

        const def = defs[0];
        const targetPath = uriToFilePath(def.fileName);
        const targetPos = m.getPositionAt(def.textSpan.start);
        onOpenDefRef.current?.(targetPath, targetPos.lineNumber, targetPos.column);
      } catch (e) {
        console.error("[editor] 跳转定义失败:", e);
      }
    };
    editor.addCommand(monaco.KeyCode.F12, goToDefinition);

    // Ctrl+Click → 也是跳转定义（Monaco 内置是 peek 窗，这里覆盖）
    editor.onMouseDown((e: any) => {
      if ((e.event.ctrlKey || e.event.metaKey) && e.event.button === 0 && e.target?.position) {
        e.event.preventDefault();
        e.event.stopPropagation();
        goToDefinition();
      }
    });
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

  return (
    <Editor
      height="100%"
      path={`file:///${normalizePath(filePath)}`}
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
