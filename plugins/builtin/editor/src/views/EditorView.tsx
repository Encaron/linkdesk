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
// E5.7#98：编辑器/monaco ref 具体类型——替代 useRef<any>
import type { editor as MonacoEditorApi } from "monaco-editor";
// E5.6#11.5i：getLangDef → lk.langDef.get，shellEvents → lk.events
const lk = window.linkdesk;
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
  /** E5.7 fix（2026-08-16）：点击标签补焦——EditorTab tab:focusRequested 订阅调用 */
  focus(): void;
  dispose(): void;
  /** E4V#40q——运行时更新编辑器选项，无需重建 editor */
  updateOptions(opts: Record<string, unknown>): void;
  /** E5.8#0d.9——外部文件变更重载：整体替换 Monaco model 内容（setValue 重置 undo 栈，VS Code reload 同款语义）。
   *  React `value` prop 仅 init 读取——重载必须经此通道推给 Monaco。 */
  setValue(v: string): void;
}

const EditorView = forwardRef<EditorViewHandle, EditorViewProps>(function EditorView(
  { value, language: _language, filePath, isActive, onChange, onSave, readOnly, onCursorChange, onEditorMount, options },
  ref,
) {
  const editorRef = useRef<MonacoEditorApi.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const themeSyncUnsubRef = useRef<(() => void) | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onCursorChangeRef = useRef(onCursorChange);
  onCursorChangeRef.current = onCursorChange;
  const onEditorMountRef = useRef(onEditorMount);
  onEditorMountRef.current = onEditorMount;
  // E5.7#99：onChange ref 桥——init effect per filePath 只建一次编辑器，
  // 入 deps 会在回调身份变化时重建编辑器（丢 undo/光标）
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // 🔴 options 异步加载——EditorTab buildMonacoOptions() 返回前 editor 已创建
  // ref 桥接：无论谁先完成，editor 创建后都能拿到最新 options
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const tabs = window.linkdesk?.tabs;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useImperativeHandle(ref, () => ({
    layout: () => editorRef.current?.layout(),
    focus: () => editorRef.current?.focus(),
    dispose: () => editorRef.current?.dispose(),
    updateOptions: (opts: Record<string, unknown>) => editorRef.current?.updateOptions(opts),
    setValue: (v: string) => editorRef.current?.getModel()?.setValue(v),
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
      await initMonacoEnv(async (modelRef, _options) => {
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

      // 3. 主题同步——先设 monacoRef，再注册订阅，确保回调中 ref 已就位
      syncMonacoTheme(monaco);
      monacoRef.current = monaco;
      themeSyncUnsubRef.current = subscribeThemeSync(monacoRef);

      // 4. TS compilerOptions + 影子 model 扫描
      setupTypeScriptEnv(monaco);
      scanWorkspaceForTypeScript(monaco);

      // 5. 非 TS 语言——查 LangDefRegistry 自动启动 LSP
      // LangDefRegistry 在壳侧注册、经 linkdesk.langDef IPC 查询——编辑器无需自己 sync。
      const ext = "." + (lk.path.normalize(filePath).split(".").pop() ?? "");
      const langDef = await lk.langDef.get(ext);
      console.error(`[editor:debug] filePath=${filePath} ext=${ext} langDef=${langDef?.id ?? "null"} hasLsp=${!!langDef?.lsp} hasClient=${!!getLspClient(langDef?.id ?? "")}`);
      if (langDef?.lsp && !getLspClient(langDef.id)) {
        const workspaceRoot = (await lk.workspace.getFolders())[0]?.uri || lk.path.normalize(filePath).replace(/\/[^/]+$/, "");
        startLspClient(langDef.id, langDef.lsp.command, langDef.lsp.args, workspaceRoot)
          .catch((err) => {
            // E5.8#24.6：LSP 启动失败不再静默 console.warn——用户可见 toast
            // （回归 #24：pyright 被删 → 跳转静默消失，用户无感。现在打开 .py 即报错，F12 不灵有因可循）
            const msg = `${langDef.id} 语言支持启动失败: ${(err as Error).message ?? String(err)}`;
            console.error(`[editor] ${msg}`);
            lk.notifications.show(msg, { type: "error" }).catch(() => {});
          });
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
        theme: document.documentElement.getAttribute("data-theme") === "dark" ? "vs-dark" : "vs",
        readOnly,
        ...options,
      });
      // 🔴 options 异步加载 + theme 竞态——双安全网：
      // 1) optionsRef 桥接 EditorTab 的 buildMonacoOptions() 异步结果
      // 2) theme 从 DOM data-theme 直接取，不依赖 StandaloneWorkbenchThemeService 管道
      if (optionsRef.current) {
        editor.updateOptions(optionsRef.current);
      } else {
        editor.updateOptions({
          theme: document.documentElement.getAttribute("data-theme") === "dark" ? "vs-dark" : "vs",
        });
      }
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
        onChangeRef.current?.(model!.getValue());
      });

      // 8b. 光标位置跟踪——E4V#40j EditorStatusBar 消费
      editor.onDidChangeCursorPosition((e) => {
        onCursorChangeRef.current?.(e.position.lineNumber, e.position.column);
      });
      // 初始触发一次
      const initPos = editor.getPosition();
      if (initPos) {
        onCursorChangeRef.current?.(initPos.lineNumber, initPos.column);
      }

      // 9. Ctrl+S——addAction 而非 addCommand（E5.7 fix 2026-08-16）。
      // addCommand 注册的是全局动态键位（when 恒真，standaloneCodeEditor.js:84）——多编辑器
      // 同和弦时 keybindingResolver._findCommand 逆序取最后注册者（keybindingResolver.js:276），
      // 任何编辑器按 Ctrl+S 都触发"最新打开"的编辑器 handler：新开的 test.py 抢走 APP.ts 的
      // Ctrl+S → 保存错文件。且 addCommand 无 dispose 通道（只返回 commandId），已关标签的
      // handler 残留继续劫持该和弦。addAction 带 editorId 前置条件（standaloneCodeEditor
      // .js:108）+ 唯一 commandId（:118）+ 随 editor.dispose() 自动注销（:137）——F12
      // goToDefinition 键位同款，只在焦点编辑器上解析。
      editor.addAction({
        id: "linkdesk.save",
        label: "Save",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => onSaveRef.current?.(),
      });

      // E5.7#79：摘除 Monaco 内置字体缩放键位——全局缩放已由壳 view.zoomIn/Out 接管
      // （快捷键注册表 + 主进程 before-input-event 拦截）。主进程对 autoRepeat 放行，
      // 长按 Ctrl+=/- 的重复帧会到达编辑器——不摘除则全局缩放与编辑器字体缩放双 handler 打架。
      // 同 id 的 addAction 替换原 action（含键位表）——VS Code workbench 同款手法。
      editor.addAction({ id: "editor.action.fontZoomIn", label: "Zoom In", keybindings: [], run: () => {} });
      editor.addAction({ id: "editor.action.fontZoomOut", label: "Zoom Out", keybindings: [], run: () => {} });
      editor.addAction({ id: "editor.action.fontZoomReset", label: "Zoom Reset", keybindings: [], run: () => {} });

      // 10. F12 + Ctrl+Click——standalone Monaco 归一化导航通道
      // E5.7#98：TS worker（fileName/textSpan）与 LSP（uri/range）两套形状——联合类型 + 分支 cast。
      // monaco 0.55 TS 语言服务正源 = 顶层 monaco.typescript 命名空间（languages.typescript 是 deprecated 类型墓碑，
      // 运行时 editor.main.js 仍挂别名——同一对象）。顶层路径有完整类型，免 cast。
      interface TsDef { fileName: string; textSpan: { start: number } }
      interface LspDef { uri: string; range: { start: { line: number; character: number } } }
      const goToDefinitionAt = async (pos: { lineNumber: number; column: number }) => {
        const m = editor.getModel();
        if (!m) return;
        try {
          const langId = m.getLanguageId();
          let defs: (TsDef | LspDef)[] | undefined;
          const isTS = langId === "typescript" || langId === "javascript" || langId === "tsx" || langId === "jsx";

          if (isTS) {
            const worker = await monaco.typescript.getTypeScriptWorker();
            const tsClient = await worker(m.uri);
            // 库签名此处丢失精度（DefinitionInfo 解析成 any）——按 TsDef 结构窄化（E5.7#98）
            defs = (await tsClient.getDefinitionAtPosition(m.uri.toString(), m.getOffsetAt(pos))) as TsDef[] | undefined;
          } else {
            const lspClient = getLspClient(langId);
            if (lspClient) {
              const result = await lspClient.sendRequest("textDocument/definition", {
                textDocument: { uri: m.uri.toString() },
                position: { line: pos.lineNumber - 1, character: pos.column - 1 },
              });
              defs = result ? ((Array.isArray(result) ? result : [result]) as LspDef[]) : undefined;
            }
          }

          if (!defs || defs.length === 0) return;
          const def = defs[0];

          let targetPath: string;
          let targetLine: number;
          let targetCol: number;
          if (isTS) {
            const tsDef = def as TsDef;
            targetPath = fileUriToPath(tsDef.fileName);
            const targetPos = m.getPositionAt(tsDef.textSpan.start);
            targetLine = targetPos.lineNumber;
            targetCol = targetPos.column;
          } else {
            const lspDef = def as LspDef;
            targetPath = fileUriToPath(lspDef.uri);
            targetLine = lspDef.range.start.line + 1;
            targetCol = lspDef.range.start.character + 1;
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
          lk.events.emit("editor:revealRequested", { filePath: targetPath });
        } catch (err) {
          // E5.8#24.6：不再静默吞错（原 `catch {}`）——跳转链路任何异常显性报错：
          // 协议诊断面 console.error + 用户可见 toast。杜绝「跳转没了却毫无动静」。
          // 无定义路径在 defs 空时正常 return（行 253），不落此 catch——此分支只接真异常。
          const msg = `跳转到定义失败: ${(err as Error).message ?? String(err)}`;
          console.error(`[editor] ${msg}`);
          lk.notifications.show(msg, { type: "error" }).catch(() => {});
        }
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
      themeSyncUnsubRef.current?.();
      editorRef.current?.dispose();
    };
    // E5.7#99：编辑器创建即定型——value/readOnly 仅初始创建读取；options 走 optionsRef+updateOptions
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 同步（62/141）。入 deps 会在 options 身份变化时重建编辑器——丢 undo/光标
  }, [filePath]);

  // ── keep-alive——标签页切换时 layout + focus + reveal。双 rAF 防光标被后续渲染覆盖 ──
  // E5.7 fix（2026-08-16）：激活时 focus()——Ctrl+S 是 Monaco 局部键位，只打到持有 DOM 焦点的
  // 实例。切标签页不搬焦点时：分屏下 Ctrl+S 打到另一组的编辑器（保存错文件），单组下焦点
  // 已随 display:none 落到 body（Ctrl+S 失效）。对标 VS Code：点击标签 = 该编辑器获焦。
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
      } else {
        editorRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(raf1);
  }, [isActive, filePath]);

  // ── 跨文件跳转——mount/isActive effect 之外的事件通道（含 ShellEvents buffer 回放）──
  useEffect(() => {
    return lk.events.on<{ filePath: string }>("editor:revealRequested", ({ filePath: fp }) => {
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
