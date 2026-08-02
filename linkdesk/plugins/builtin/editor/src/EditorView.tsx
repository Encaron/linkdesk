/**
 * E4V#40b Monaco 编辑器包装器。
 *
 * E4V#40i2b：去掉 @monaco-editor/react 的 <Editor>，改用 monaco.editor.create() +
 * monaco-vscode-api 的 IEditorService 导航桥。F12 / Ctrl+Click 自动走壳标签页。
 *
 * 🔥 保留 @monaco-editor/react 的 useMonaco()——它管 worker 加载。
 *    只用它的 monaco namespace，不用它的 <Editor>。
 */
import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { useMonaco } from "@monaco-editor/react";
import { normalizePath } from "@src/core/pathUtils";
import { useTabActions } from "@src/core/TabActionsContext";
import { registerLanguageMap } from "./language-map";
import { syncMonacoTheme, subscribeThemeSync } from "./theme-sync";
import { setupTypeScriptEnv, scanWorkspaceForTypeScript } from "./ts-intelligence";
import { ensureNavigationBridge } from "./navigation-bridge";

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
  const monacoRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const tabActions = useTabActions();
  const tabActionsRef = useRef(tabActions);
  tabActionsRef.current = tabActions;

  const monaco = useMonaco();

  useImperativeHandle(ref, () => ({
    layout: () => editorRef.current?.layout(),
    dispose: () => editorRef.current?.dispose(),
  }), []);

  // ── 一次性：monaco services 初始化 + 导航桥 ──
  useEffect(() => {
    if (!monaco) return;
    monacoRef.current = monaco;
    registerLanguageMap(monaco);
    syncMonacoTheme(monaco);
    setupTypeScriptEnv(monaco);
    ensureNavigationBridge((targetPath) => {
      tabActionsRef.current?.createTab("editor", {
        filePath: targetPath,
        pinned: false,
      });
    });
  }, [monaco]);

  // ── 每个 filePath 创建 editor ──
  useEffect(() => {
    if (!monaco || !containerRef.current) return;
    let disposed = false;

    const uri = monaco.Uri.file(normalizePath(filePath));
    // 🔥 复用已有 model（影子 model 扫描可能已创建）
    let model = monaco.editor.getModel(uri);
    if (!model) {
      model = monaco.editor.createModel(value, language, uri);
    } else if (model.getValue() !== value) {
      model.setValue(value);
    }

    const editor = monaco.editor.create(containerRef.current, {
      model,
      theme: "linkdesk",
      readOnly,
    });
    editorRef.current = editor;

    // onChange 接线
    model.onDidChangeContent(() => {
      onChange?.(model!.getValue());
    });

    // Ctrl+S
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => onSaveRef.current?.(),
    );

    // F12 诊断 + 导航（导航桥接管 IEditorService.openEditor → 壳标签页）
    editor.addAction({
      id: "linkdesk.goToDefinition",
      label: "Go to Definition",
      keybindings: [monaco.KeyCode.F12],
      run: async () => {
        const m = editor.getModel();
        const pos = editor.getPosition();
        if (m && pos) {
          try {
            const worker = await (monaco.languages.typescript as any).getTypeScriptWorker();
            const client = await worker(m.uri);
            const defs = await client.getDefinitionAtPosition(m.uri.toString(), m.getOffsetAt(pos));
            console.log("[editor] F12 offset:", m.getOffsetAt(pos), JSON.stringify(defs));
          } catch (e) {
            console.error("[editor] F12 error:", e);
          }
        }
        editor.getAction("editor.action.revealDefinition")?.run();
      },
    });

    // 扫描后触发 TS 重分析（影子 model 创建晚于首次分析）
    scanWorkspaceForTypeScript(monaco).then(() => {
      if (disposed) return;
      const m = editor.getModel();
      if (!m || m.isDisposed()) return;
      const lastLine = m.getLineCount();
      const lastCol = m.getLineMaxColumn(lastLine);
      m.applyEdits([{ range: new monaco.Range(lastLine, lastCol, lastLine, lastCol), text: "x" }]);
      m.applyEdits([{ range: new monaco.Range(lastLine, lastCol, lastLine, lastCol + 1), text: "" }]);
    });

    return () => {
      disposed = true;
      editor.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- value/language/readOnly/onChange 变化不应重建编辑器
  }, [monaco, filePath]);

  useEffect(() => {
    if (!isActive) return;
    const raf = requestAnimationFrame(() => { editorRef.current?.layout(); });
    return () => cancelAnimationFrame(raf);
  }, [isActive]);

  useEffect(() => {
    return subscribeThemeSync(monacoRef);
  }, []);

  return <div ref={containerRef} style={{ height: "100%" }} />;
});

export default EditorView;
