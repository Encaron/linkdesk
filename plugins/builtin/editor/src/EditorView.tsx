/**
 * E4V#40b Monaco 编辑器包装器。
 *
 * E4V#40t2：monaco-languageclient 全量迁移——MonacoVscodeApiWrapper 初始化 VS Code 服务层
 * + 手写 monaco.editor.create() 创建编辑器。不依赖 @monaco-editor/react。
 *
 * 🔥 EditorApp 不能用——它的 buildModelReference() 走 VS Code 的 IFileService.writeFile()，
 *    在 Electron 壳 WebView 里无写文件权限。手写 createModel+createEditor 绕过文件服务。
 *
 * 🔥 initMonacoEnv() 覆盖 IEditorService.openEditor() → F12/Ctrl+Click 自动走壳标签页。
 */
import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { normalizePath } from "@src/core/pathUtils";
import { useTabActions } from "@src/core/TabActionsContext";
import { initMonacoEnv } from "./monaco-init";
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
  { value, language: _language, filePath, isActive, onChange, onSave, readOnly },
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

  useImperativeHandle(ref, () => ({
    layout: () => editorRef.current?.layout(),
    dispose: () => editorRef.current?.dispose(),
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

      // 3. 主题（用 LinkDesk CSS 变量，不依赖 VS Code 扩展主题）
      syncMonacoTheme(monaco);

      // 4. TS compilerOptions + 影子 model 扫描
      setupTypeScriptEnv(monaco);
      scanWorkspaceForTypeScript(monaco);

      // 4. 手写 editor——绕过 EditorApp 的 IFileService 依赖
      const uri = monaco.Uri.file(normalizePath(filePath));
      let model = monaco.editor.getModel(uri);
      if (!model) {
        model = monaco.editor.createModel(value, undefined, uri);
      } else if (model.getValue() !== value) {
        model.setValue(value);
      }
      const editor = monaco.editor.create(container, {
        model,
        theme: "linkdesk",
        readOnly,
      });
      editorRef.current = editor;
      monacoRef.current = monaco;

      // 5. onChange 接线
      model.onDidChangeContent(() => {
        onChange?.(model!.getValue());
      });

      // 6. Ctrl+S
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => onSaveRef.current?.(),
      );

      // 7. 扫描完成后触发 TS 重分析
      scanWorkspaceForTypeScript(monaco).then(() => {
        if (disposed) return;
        const m = editor.getModel();
        if (!m || m.isDisposed()) return;
        const lastLine = m.getLineCount();
        const lastCol = m.getLineMaxColumn(lastLine);
        m.applyEdits([{ range: new monaco.Range(lastLine, lastCol, lastLine, lastCol), text: "x" }]);
        m.applyEdits([{ range: new monaco.Range(lastLine, lastCol, lastLine, lastCol + 1), text: "" }]);
      });
    })().catch((err) => {
      console.error("[editor] 初始化失败:", err);
    });

    return () => {
      disposed = true;
      editorRef.current?.dispose();
    };
  }, [filePath]);

  // ── keep-alive——标签页切换时 layout ──
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
