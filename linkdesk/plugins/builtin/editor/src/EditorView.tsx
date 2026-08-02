/**
 * E4V#40b Monaco 编辑器包装器。
 *
 * E4V#40i2：F12/Ctrl+Click 跳转定义——调 TS worker 拿定义 → 壳 TabActions.createTab()。
 * Ctrl+Click 走 gotoLocation.alternativeDefinitionCommand——Monaco 原生机制。
 *
 * 🔥 不使用 monaco-vscode-api 的 initialize()——standalone action 会丢失。
 *    直接在自定义 action 里 TS worker + tabActions 桥接。
 */
import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import Editor, { type OnMount, type BeforeMount } from "@monaco-editor/react";
import { normalizePath } from "@src/core/pathUtils";
import { useTabActions } from "@src/core/TabActionsContext";
import { registerLanguageMap } from "./language-map";
import { syncMonacoTheme, subscribeThemeSync } from "./theme-sync";
import { setupTypeScriptEnv, scanWorkspaceForTypeScript } from "./ts-intelligence";
import { fileUriToPath } from "./navigation-bridge";

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

  const tabActions = useTabActions();
  const tabActionsRef = useRef(tabActions);
  tabActionsRef.current = tabActions;

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

    // 扫描后 TS 重分析
    scanWorkspaceForTypeScript(monaco).then(() => {
      const m = editor.getModel();
      if (!m || m.isDisposed()) return;
      const lastLine = m.getLineCount();
      const lastCol = m.getLineMaxColumn(lastLine);
      const Range = monaco.Range;
      m.applyEdits([{ range: new Range(lastLine, lastCol, lastLine, lastCol), text: "x" }]);
      m.applyEdits([{ range: new Range(lastLine, lastCol, lastLine, lastCol + 1), text: "" }]);
    });

    // 🔥 跳转定义——F12 + Ctrl+Click 共用（Ctrl+Click 走 gotoLocation.alternativeDefinitionCommand）
    const goToDefinitionAt = async (pos: { lineNumber: number; column: number }) => {
      const m = editor.getModel();
      if (!m) return;
      try {
        const worker = await (monaco.languages.typescript as any).getTypeScriptWorker();
        const client = await worker(m.uri);
        const defs = await client.getDefinitionAtPosition(m.uri.toString(), m.getOffsetAt(pos));
        if (!defs || defs.length === 0) return;

        const def = defs[0];
        const targetPath = fileUriToPath(def.fileName);
        console.log("[editor] 跳转定义 →", targetPath);
        const label = normalizePath(targetPath).split("/").pop() || targetPath;
        tabActionsRef.current?.createTab("editor", {
          filePath: targetPath,
          sourceId: targetPath,
          label,
          pinned: false,
        });
      } catch (e) {
        console.error("[editor] 跳转定义失败:", e);
      }
    };

    editor.addAction({
      id: "linkdesk.goToDefinition",
      label: "Go to Definition",
      keybindings: [monaco.KeyCode.F12],
      run: () => {
        console.log("[editor] goToDefinition action 触发");
        const pos = editor.getPosition();
        if (pos) goToDefinitionAt(pos);
      },
    });
    console.log("[editor] action linkdesk.goToDefinition 已注册");
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
      options={{
        readOnly,
        gotoLocation: { alternativeDefinitionCommand: "linkdesk.goToDefinition" },
      } as any}
    />
  );
});

export default EditorView;
