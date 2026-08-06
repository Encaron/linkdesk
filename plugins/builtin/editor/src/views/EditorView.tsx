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
import { getLangDef } from "@src/core/registry/LangDefRegistry";
import { shellEvents } from "@src/core/react/ShellEvents";

const lk = (window as any).linkdesk;
import { initMonacoEnv } from "../services/monaco-init";
import { fileUriToPath, setPendingReveal, consumePendingReveal } from "../services/navigation-bridge";
import { getLspClient, startLspClient } from "../services/lsp-bridge";
import { syncMonacoTheme, subscribeThemeSync } from "../services/theme-sync";
import { setupTypeScriptEnv, scanWorkspaceForTypeScript } from "../services/ts-intelligence";

export interface EditorViewProps {
  value: string;
  language: string;
  filePath: string;
  isActive: boolean;
  onChange?: (value: string | undefined) => void;
  onSave?: () => void;
  readOnly?: boolean;
  /** E4V#40q——Monaco 编辑器选项，从 ConfigurationService 读取后合并到 monaco.editor.create() */
  options?: Record<string, unknown>;
  /** E4V#40j——光标位置变更，EditorStatusBar 消费 */
  onCursorChange?: (lineNumber: number, column: number) => void;
  /** E4V#40j——editor 创建完成后回传缩进/EOL 设置 */
  onEditorMount?: (opts: { tabSize: number; insertSpaces: boolean; eol: string }) => void;
}

export interface EditorViewHandle {
  layout(): void;
  dispose(): void;
  /** E4V#40q——运行时更新编辑器选项，无需重建 editor */
  updateOptions(opts: Record<string, unknown>): void;
}

const EditorView = forwardRef<EditorViewHandle, EditorViewProps>(function EditorView(
  { value, language: _language, filePath, isActive, onChange, onSave, readOnly, onCursorChange, onEditorMount, options },
  ref,
) {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onCursorChangeRef = useRef(onCursorChange);
  onCursorChangeRef.current = onCursorChange;
  const onEditorMountRef = useRef(onEditorMount);
  onEditorMountRef.current = onEditorMount;

  const tabs = (window as any).linkdesk?.tabs;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useImperativeHandle(ref, () => ({
    layout: () => editorRef.current?.layout(),
    dispose: () => editorRef.current?.dispose(),
    updateOptions: (opts: Record<string, unknown>) => editorRef.current?.updateOptions(opts),
  }), []);

  // ── 初始化——每个 filePath 创建一次 editor ──
  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    const container = containerRef.current;

    (async () => {
      // E5#11i：WebView 初始 0×0→等 bounds（resize event 触发 layout）
      if (container.clientWidth===0||container.clientHeight===0) {
        await new Promise<void>(r=>{let n=0;const id=setInterval(()=>{if(container.clientWidth>0&&container.clientHeight>0||++n>100){clearInterval(id);r()}},30)});
      }
      if(disposed)return;
      // 1. 全局一次性初始化 VS Code 服务层 + 导航桥
      await initMonacoEnv(async (modelRef: any, _options: unknown) => {
        const targetPath = modelRef.object.textEditorModel.uri.fsPath;
        const label = lk.path.normalize(targetPath).split("/").pop() || targetPath;
        tabsRef.current?.create("editor", {
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
      monacoRef.current = monaco; // subscribeThemeSync 依赖此 ref 在主题变更时重同步

      // 4. TS compilerOptions + 影子 model 扫描
      setupTypeScriptEnv(monaco);
      scanWorkspaceForTypeScript(monaco);

      // 5. 非 TS 语言——查 LangDefRegistry 自动启动 LSP
      const ext = "." + (lk.path.normalize(filePath).split(".").pop() ?? "");
      const langDef = getLangDef(ext);
      if (langDef?.lsp && !getLspClient(langDef.id)) {
        const workspaceRoot = (await lk.workspace.getFolders())[0]?.uri || lk.path.normalize(filePath).replace(/\/[^/]+$/, "");
        startLspClient(langDef.id, langDef.lsp.command, langDef.lsp.args, workspaceRoot)
          .catch((err) => console.warn(`[editor] ${langDef.id} LSP 启动失败:`, err));
      }

      // 6. 手写 editor——绕过 EditorApp 的 IFileService 依赖
      const uri = monaco.Uri.file(lk.path.normalize(filePath));
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
        ...options,
      });
      editorRef.current = editor;
      monacoRef.current = monaco;

      // E4V#40j——回传编辑器初始选项（缩进/EOL）给 EditorTab → EditorStatusBar
      const modelOpts = model.getOptions();
      onEditorMountRef.current?.({
        tabSize: modelOpts.tabSize,
        insertSpaces: modelOpts.insertSpaces,
        eol: model.getEOL() === "\r\n" ? "CRLF" : "LF",
      });

      // 7. F12 跳转后定位——双 rAF + 延迟 consume 防 StrictMode 双重 mount 竞态
      requestAnimationFrame(() => {
        if (disposed) return;
        requestAnimationFrame(() => {
          if (disposed) return;
          const pendingReveal = consumePendingReveal(filePath);
          if (pendingReveal) {
            const pos = { lineNumber: pendingReveal.line, column: pendingReveal.column };
            editor.setPosition(pos);
            editor.revealPositionInCenter(pos);
            editor.focus();
          }
        });
      });

      // 8. onChange 接线
      model.onDidChangeContent(() => {
        onChange?.(model!.getValue());
      });

      // 8b. 光标位置跟踪——E4V#40j EditorStatusBar 消费
      editor.onDidChangeCursorPosition((e: any) => {
        onCursorChangeRef.current?.(e.position.lineNumber, e.position.column);
      });
      // 初始触发一次
      const initPos = editor.getPosition();
      if (initPos) {
        onCursorChangeRef.current?.(initPos.lineNumber, initPos.column);
      }

      // 9. Ctrl+S
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => onSaveRef.current?.(),
      );

      // 10. F12 + Ctrl+Click——standalone Monaco 归一化导航通道
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

          // 跨文件：暂存位置 → createTab → mount/isActive effect consume → reveal
          const label = lk.path.normalize(targetPath).split("/").pop() || targetPath;
          setPendingReveal(targetPath, targetLine, targetCol);
          tabsRef.current?.create("editor", {
            filePath: targetPath, sourceId: targetPath, label, pinned: false,
          });
          // 已 active 的 editor 不会触发 isActive effect → 走事件通道
          shellEvents.emit("editor:revealRequested", { filePath: targetPath });
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

    })().catch((err) => {
      console.error("[editor] 初始化失败:", err);
    });

    return () => {
      disposed = true;
      editorRef.current?.dispose();
    };
  }, [filePath]);

  // ── keep-alive——标签页切换时 layout + reveal。双 rAF 防光标被后续渲染覆盖 ──
  useEffect(() => {
    if (!isActive) return;
    const raf1 = requestAnimationFrame(() => {
      editorRef.current?.layout();
      const pos = consumePendingReveal(filePath);
      if (pos && editorRef.current) {
        requestAnimationFrame(() => {
          const p = { lineNumber: pos.line, column: pos.column };
          editorRef.current?.setPosition(p);
          editorRef.current?.revealPositionInCenter(p);
          editorRef.current?.focus();
        });
      }
    });
    return () => cancelAnimationFrame(raf1);
  }, [isActive, filePath]);

  // ── 跨文件跳转——mount/isActive effect 之外的事件通道（含 ShellEvents buffer 回放）──
  useEffect(() => {
    return shellEvents.on("editor:revealRequested", ({ filePath: fp }) => {
      if (fp !== filePath) return;
      requestAnimationFrame(() => {
        const pos = consumePendingReveal(filePath);
        if (pos && editorRef.current) {
          requestAnimationFrame(() => {
            const p = { lineNumber: pos.line, column: pos.column };
            editorRef.current?.setPosition(p);
            editorRef.current?.revealPositionInCenter(p);
            editorRef.current?.focus();
          });
        }
      });
    });
  }, [filePath]);

  useEffect(() => {
    return subscribeThemeSync(monacoRef);
  }, []);

  // ── 容器 resize（全屏/分屏/窗口缩放）→ Monaco layout() ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      editorRef.current?.layout();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return <div ref={containerRef} style={{ height: "100%" }} />;
});

export default EditorView;
