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
import { getWorkspaceFolders } from "@src/core/WorkspaceService";
import { normalizePath } from "@src/core/pathUtils";
import { getLangDef } from "@src/core/LangDefRegistry";
import { useTabActions } from "@src/core/TabActionsContext";
import { initMonacoEnv } from "./monaco-init";
import { fileUriToPath, setPendingReveal, consumePendingReveal } from "./navigation-bridge";
import { getLspClient, startLspClient } from "./lsp-bridge";
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

      // 5. 非 TS 语言——查 LangDefRegistry 自动启动 LSP
      const ext = "." + (normalizePath(filePath).split(".").pop() ?? "");
      const langDef = getLangDef(ext);
      if (langDef?.lsp && !getLspClient(langDef.id)) {
        const workspaceRoot = getWorkspaceFolders()[0]?.uri || normalizePath(filePath).replace(/\/[^/]+$/, "");
        startLspClient(langDef.id, langDef.lsp.command, langDef.lsp.args, workspaceRoot)
          .catch((err) => console.warn(`[editor] ${langDef.id} LSP 启动失败:`, err));
      }

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

      // F12 跳转后滚动到目标位置（编辑器内部通信，不经过壳）
      const pendingReveal = consumePendingReveal(filePath);
      if (pendingReveal) {
        console.log("[editor] revealPositionInCenter → line", pendingReveal.line, "col", pendingReveal.column);
        editor.revealPositionInCenter({ lineNumber: pendingReveal.line, column: pendingReveal.column });
        editor.focus();
      }

      // 5. onChange 接线
      model.onDidChangeContent(() => {
        onChange?.(model!.getValue());
      });

      // 6. Ctrl+S
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => onSaveRef.current?.(),
      );

      // 7. F12 + Ctrl+Click——standalone Monaco 归一化导航通道
      //    语言分派：TS/JS → TS worker / 其他 → LSP client.sendRequest()
      const goToDefinitionAt = async (pos: { lineNumber: number; column: number }) => {
        const m = editor.getModel();
        if (!m) return;
        try {
          const langId = m.getLanguageId();
          let defs: any[] | undefined;
          const isTS = langId === "typescript" || langId === "javascript" || langId === "tsx" || langId === "jsx";

          if (isTS) {
            const worker = await (monaco.languages.typescript as any).getTypeScriptWorker();
            const tsClient = await worker(m.uri);
            defs = await tsClient.getDefinitionAtPosition(m.uri.toString(), m.getOffsetAt(pos));
          } else {
            const lspClient = getLspClient(langId);
            if (lspClient) {
              const result = await lspClient.sendRequest("textDocument/definition", {
                textDocument: { uri: m.uri.toString() },
                position: { line: pos.lineNumber - 1, character: pos.column - 1 },
              });
              defs = result ? (Array.isArray(result) ? result : [result]) : undefined;
            }
          }

          if (!defs || defs.length === 0) return;
          const def = defs[0];

          // 解析定义位置：TS worker 格式 vs LSP 格式
          let targetPath: string;
          let targetLine: number;
          let targetCol: number;
          if (isTS) {
            targetPath = fileUriToPath(def.fileName);
            const targetPos = m.getPositionAt(def.textSpan.start);
            targetLine = targetPos.lineNumber;
            targetCol = targetPos.column;
          } else {
            targetPath = fileUriToPath(def.uri);
            targetLine = def.range.start.line + 1;
            targetCol = def.range.start.character + 1;
          }

          const currentPath = fileUriToPath(m.uri.toString());
          if (targetPath === currentPath) {
            editor.setPosition({ lineNumber: targetLine, column: targetCol });
            editor.revealPositionInCenter({ lineNumber: targetLine, column: targetCol });
            return;
          }
          const label = normalizePath(targetPath).split("/").pop() || targetPath;
          console.log("[editor] 跨文件跳转:", targetPath, "行", targetLine, "列", targetCol);
          setPendingReveal(targetPath, targetLine, targetCol);
          tabActionsRef.current?.createTab("editor", {
            filePath: targetPath, sourceId: targetPath, label, pinned: false,
          });
        } catch { /* 无定义则放行 */ }
      };
      editor.addAction({
        id: "linkdesk.goToDefinition",
        label: "Go to Definition",
        keybindings: [monaco.KeyCode.F12],
        run: () => { const pos = editor.getPosition(); if (pos) goToDefinitionAt(pos); },
      });
      editor.onMouseDown(async (e) => {
        if (!e.event.ctrlKey && !e.event.metaKey) return;
        const pos = e.target.position;
        if (!pos) return;
        e.event.preventDefault();
        goToDefinitionAt(pos);
      });

      // 8. 扫描完成后触发 TS 重分析
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
