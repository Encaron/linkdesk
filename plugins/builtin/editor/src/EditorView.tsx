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
    const goToDefinitionAt = async (pos: { lineNumber: number; column: number }) => {
      const m = editor.getModel();
      if (!m) return;
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
    // 🔥 F12 + Ctrl+Click：覆盖 Monaco 内置 revealDefinition action 的 run 方法
    //    Monaco 的 onMouseDown 在我们 listener 之前就处理了 Ctrl+Click→revealDefinition
    //    所以我们不拦截事件，而是直接替换 action 的行为
    const revealAction = editor.getAction("editor.action.revealDefinition");
    if (revealAction) {
      (revealAction as any).run = () => {
        const pos = editor.getPosition();
        if (pos) goToDefinitionAt(pos);
        return Promise.resolve();
      };
    }
    // F12 也走覆盖后的 revealDefinition
    editor.addCommand(monaco.KeyCode.F12, () => {
      const pos = editor.getPosition();
      if (pos) goToDefinitionAt(pos);
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
