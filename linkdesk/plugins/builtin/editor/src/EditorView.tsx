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

    // 🔥 等影子 model 扫描完 → 末尾插入再删除一个字符触发 TS 重分析
    //    pushEditOperations 批量执行——只触发一次 onChange，最终值不变
    scanWorkspaceForTypeScript(monaco).then(() => {
      const m = editor.getModel();
      if (!m || m.isDisposed()) return;
      const lastLine = m.getLineCount();
      const lastCol = m.getLineMaxColumn(lastLine);
      const Range = monaco.Range;
      m.pushEditOperations(
        [],
        [
          { range: new Range(lastLine, lastCol, lastLine, lastCol), text: "x" },
          { range: new Range(lastLine, lastCol, lastLine, lastCol + 1), text: "" },
        ],
        () => null,
      );
      console.log("[editor] TS re-analysis triggered (pushEdit no-op)");
    });

    // 🔥 F12 诊断——TS worker 的 getDefinitionAtPosition 要 number 偏移量，不是 IPosition 对象
    const queryDefinition = async () => {
      const m = editor.getModel();
      const pos = editor.getPosition();
      if (!m || !pos) return;
      const offset = m.getOffsetAt(pos); // 🔥 0-based 字符偏移量
      console.log("[editor] F12——位置:", pos.lineNumber, pos.column, "offset:", offset, "URI:", m.uri.toString());
      try {
        const worker = await monaco.languages.typescript.getTypeScriptWorker();
        const client = await worker(m.uri);

        const defs = await client.getDefinitionAtPosition(m.uri.toString(), offset);
        console.log("[editor]   getDefinition(offset):", JSON.stringify(defs));

        const diags = await client.getSemanticDiagnostics(m.uri.toString());
        console.log("[editor]   诊断数:", diags?.length, diags?.[0]?.messageText);

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
