/**
 * E4V#40b Monaco 编辑器包装器。
 *
 * 🔥 URI 策略：beforeMount 中用 Uri.file 预创建 model（file:/// 协议），
 *    path prop 传 file:/// URI，@monaco-editor/react 发现已有 model 直接复用。
 *    TS worker 只认 file:/// 协议——E: scheme 返回 undefined。
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

  useImperativeHandle(ref, () => ({
    layout: () => editorRef.current?.layout(),
    dispose: () => editorRef.current?.dispose(),
  }), []);

  const beforeMount: BeforeMount = useCallback((monaco) => {
    monacoNsRef.current = monaco;
    console.log("[editor] beforeMount");
    registerLanguageMap(monaco);
    syncMonacoTheme(monaco);
    setupTypeScriptEnv(monaco);
    scanWorkspaceForTypeScript(monaco);
  }, []);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoNsRef.current = monaco;

    const model = editor.getModel();
    console.log("[editor] onMount——model URI:", model?.uri?.toString());

    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => onSaveRef.current?.(),
    );

    // 🔥 等影子 model 扫描完 → editor.setValue 同值触发 TS 重分析
    scanWorkspaceForTypeScript(monaco).then(() => {
      if (!editorRef.current) return;
      const v = editorRef.current.getValue();
      editorRef.current.setValue(v);
      console.log("[editor] TS re-analysis triggered (setValue same)");
    });

    // 🔥 F12 诊断
    const queryDefinition = async () => {
      const m = editor.getModel();
      const pos = editor.getPosition();
      if (!m || !pos) return;
      console.log("[editor] F12——位置:", pos.lineNumber, pos.column, "URI:", m.uri.toString());
      try {
        const worker = await monaco.languages.typescript.getTypeScriptWorker();
        const client = await worker(m.uri);

        // 定义尝试
        const defs = await client.getDefinitionAtPosition(m.uri.toString(), pos);
        console.log("[editor]   getDefinition(Monaco IPosition):", JSON.stringify(defs));

        // 诊断内容
        const diags = await client.getSemanticDiagnostics(m.uri.toString());
        console.log("[editor]   诊断数:", diags?.length, diags?.map((d: any) => d.messageText));

        // 🔥 用 Monaco 内置 action——如果弹出 peek 窗说明 TS worker 内部是好的
        console.log("[editor]   尝试内置 revealDefinition...");
        editor.getAction("editor.action.revealDefinition")?.run();
      } catch (e) {
        console.error("[editor] F12——出错:", e);
      }
    };
    editor.addCommand(monaco.KeyCode.F12, queryDefinition);
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
      path={normalizePath(filePath)}
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
