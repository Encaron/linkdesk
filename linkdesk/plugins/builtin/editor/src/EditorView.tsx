/**
 * E4V#40b Monaco 编辑器包装器。
 *
 * E4V#40t2：用 monaco-languageclient 的 EditorApp 替代 @monaco-editor/react 的 <Editor>。
 * EditorApp 走 VS Code 服务层（IEditorService/ICommandService/ITextModelService），
 * F12/Ctrl+Click 自动路由到壳标签页（openEditorFunc）。
 *
 * 🔥 保留 setupTypeScriptEnv + scanWorkspaceForTypeScript——TS compilerOptions + 影子 model
 *    仍需要手动设。语法高亮/主题/worker 由 MonacoVscodeApiWrapper.start() 托管。
 */
import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { EditorApp, type EditorAppConfig } from "monaco-languageclient/editorApp";
import { normalizePath } from "@src/core/pathUtils";
import { useTabActions } from "@src/core/TabActionsContext";
import { initMonacoEnv } from "./monaco-init";
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
  { value, language: _language, filePath, isActive, onChange, onSave, readOnly },
  ref,
) {
  const editorAppRef = useRef<EditorApp | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const tabActions = useTabActions();
  const tabActionsRef = useRef(tabActions);
  tabActionsRef.current = tabActions;

  useImperativeHandle(ref, () => ({
    layout: () => editorAppRef.current?.getEditor()?.layout(),
    dispose: () => editorAppRef.current?.dispose(),
  }), []);

  // ── 初始化——每个 filePath 创建一次 editor ──
  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    const container = containerRef.current;

    (async () => {
      // 1. 全局一次性初始化 VS Code 服务层 + 导航桥
      await initMonacoEnv(async (modelRef: any, _options: unknown) => {
        const targetPath = modelRef.object.textEditorModel.uri.fsPath;
        const label = normalizePath(targetPath).split("/").pop() || targetPath;
        tabActionsRef.current?.createTab("editor", {
          filePath: targetPath,
          sourceId: targetPath,
          label,
          pinned: false,
        });
        return undefined;
      });
      if (disposed) return;

      // 2. 动态 import monaco（initMonacoEnv 已配置好 workers）
      const monaco = await import("monaco-editor");

      // 3. TS compilerOptions + 影子 model 扫描
      setupTypeScriptEnv(monaco);
      scanWorkspaceForTypeScript(monaco);

      // 4. 创建 EditorApp（替代 <Editor>）
      const uri = `file:///${normalizePath(filePath)}`;
      const appConfig: EditorAppConfig = {
        codeResources: { modified: { text: value, uri } },
        readOnly,
      };
      const editorApp = new EditorApp(appConfig);
      await editorApp.start(container);
      if (disposed) { editorApp.dispose(); return; }
      editorAppRef.current = editorApp;

      // 5. onChange 接线
      editorApp.registerOnTextChangedCallback((changes: { modified?: string }) => {
        if (changes.modified != null) onChange?.(changes.modified);
      });

      // 6. Ctrl+S
      const editor = editorApp.getEditor();
      if (editor) {
        editor.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
          () => onSaveRef.current?.(),
        );
      }

      // 7. 扫描完成后触发 TS 重分析
      scanWorkspaceForTypeScript(monaco).then(() => {
        if (disposed) return;
        const m = editor?.getModel();
        if (!m || m.isDisposed()) return;
        const lastLine = m.getLineCount();
        const lastCol = m.getLineMaxColumn(lastLine);
        m.applyEdits([{ range: new monaco.Range(lastLine, lastCol, lastLine, lastCol), text: "x" }]);
        m.applyEdits([{ range: new monaco.Range(lastLine, lastCol, lastLine, lastCol + 1), text: "" }]);
      });
    })().catch((err) => {
      console.error("[editor] EditorApp 初始化失败:", err);
    });

    return () => {
      disposed = true;
      editorAppRef.current?.dispose();
    };
  }, [filePath]);

  // ── keep-alive——标签页切换时 layout ──
  useEffect(() => {
    if (!isActive) return;
    const raf = requestAnimationFrame(() => {
      editorAppRef.current?.getEditor()?.layout();
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive]);

  return <div ref={containerRef} style={{ height: "100%" }} />;
});

export default EditorView;
