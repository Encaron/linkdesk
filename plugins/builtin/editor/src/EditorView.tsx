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

  // ── 初始化——等 monaco ready → services → 导航桥 → create editor ──
  useEffect(() => {
    if (!monaco || !containerRef.current) return;
    let disposed = false;

    monacoRef.current = monaco;
    console.log("[editor] monaco ready, 开始初始化...");

    (async () => {
      // 1. beforeMount 逻辑
      registerLanguageMap(monaco);
      syncMonacoTheme(monaco);
      setupTypeScriptEnv(monaco);
      console.log("[editor] services 注册完成");

      // 2. 导航桥（await——必须在 create 之前完成）
      await ensureNavigationBridge((targetPath) => {
        console.log("[editor] 导航桥 → createTab:", targetPath);
        tabActionsRef.current?.createTab("editor", {
          filePath: targetPath,
          pinned: false,
        });
      });
      console.log("[editor] 导航桥就绪");
      if (disposed) return;

      // 3. 创建 editor
      const uri = monaco.Uri.file(normalizePath(filePath));
      let model = monaco.editor.getModel(uri);
      if (!model) {
        model = monaco.editor.createModel(value, language, uri);
        console.log("[editor] 创建 model:", uri.toString());
      } else {
        console.log("[editor] 复用已有 model:", uri.toString());
        if (model.getValue() !== value) model.setValue(value);
      }

      const editor = monaco.editor.create(containerRef.current!, {
        model,
        theme: "linkdesk",
        readOnly,
      });
      editorRef.current = editor;
      console.log("[editor] editor 创建完成");

      // 4. onChange
      model.onDidChangeContent(() => {
        onChange?.(model!.getValue());
      });

      // 5. Ctrl+S
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => onSaveRef.current?.(),
      );

      // 6. F12 诊断 + 导航
      editor.addAction({
        id: "linkdesk.goToDefinition",
        label: "Go to Definition",
        keybindings: [monaco.KeyCode.F12],
        run: async () => {
          console.log("[editor] F12 触发");
          const m = editor.getModel();
          const pos = editor.getPosition();
          if (m && pos) {
            try {
              const worker = await (monaco.languages.typescript as any).getTypeScriptWorker();
              const client = await worker(m.uri);
              const defs = await client.getDefinitionAtPosition(m.uri.toString(), m.getOffsetAt(pos));
              console.log("[editor] F12 defs:", JSON.stringify(defs));
            } catch (e) {
              console.error("[editor] F12 worker error:", e);
            }
          }
          const revealAction = editor.getAction("editor.action.revealDefinition");
          console.log("[editor] revealDefinition action:", !!revealAction);
          revealAction?.run();
        },
      });
      console.log("[editor] F12 action 注册完成");

      // 7. TS 重分析
      scanWorkspaceForTypeScript(monaco).then(() => {
        if (disposed) return;
        const m = editor.getModel();
        if (!m || m.isDisposed()) return;
        const lastLine = m.getLineCount();
        const lastCol = m.getLineMaxColumn(lastLine);
        m.applyEdits([{ range: new monaco.Range(lastLine, lastCol, lastLine, lastCol), text: "x" }]);
        m.applyEdits([{ range: new monaco.Range(lastLine, lastCol, lastLine, lastCol + 1), text: "" }]);
        console.log("[editor] TS 重分析完成");
      });
    })().catch((err) => {
      console.error("[editor] 初始化失败:", err);
    });

    return () => {
      disposed = true;
      console.log("[editor] dispose");
      editorRef.current?.dispose();
    };
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
