/**
 * E4V#40b Monaco 编辑器包装器。
 *
 * 参考：plugins/user/serial-monitor/src/index.tsx L1082-1125
 *   - beforeMount：注册常用语言 + 定义 LinkDesk 主题
 *   - onMount：存 editorRef + monacoNsRef + 注册 Ctrl+S
 *   - keep-alive：isActive 切换时 requestAnimationFrame → layout()
 *   - StrictMode：unmount cleanup 中 dispose editor
 *
 * 🔥 E4V#40g1 归一化：useImperativeHandle 暴露 handle，内部 ref 私有。
 *   对标 FileTreeHandle 模式——外部消费方不碰 ref 内部，只调 handle 方法。
 *   预防 Bug R17-1：monacoRef/editorRef stale ref 混淆。
 *
 * Props 由 EditorTab（E4V#40f）传入。
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

/** 🔥 归一化 handle——外部（EditorTab/快捷键/测试）只调方法，不碰内部 ref */
export interface EditorViewHandle {
  /** 刷新 Monaco 布局 */
  layout(): void;
  /** 销毁编辑器 */
  dispose(): void;
}

const EditorView = forwardRef<EditorViewHandle, EditorViewProps>(function EditorView(
  { value, language, filePath, isActive, onChange, onSave, readOnly },
  ref,
) {
  /** Monaco 编辑器实例——layout()/dispose()/addCommand() */
  const editorRef = useRef<any>(null);
  /** Monaco 命名空间——monaco.editor.defineTheme/setTheme */
  const monacoNsRef = useRef<any>(null);
  // 🔥 ref 桥接——handleEditorMount 只跑一次，Ctrl+S 始终读最新 onSave
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // 🔥 归一化 handle——外部不碰 editorRef/monacoNsRef
  useImperativeHandle(ref, () => ({
    layout: () => editorRef.current?.layout(),
    dispose: () => editorRef.current?.dispose(),
  }), []);

  const beforeMount: BeforeMount = useCallback((monaco) => {
    monacoNsRef.current = monaco;
    registerLanguageMap(monaco);
    syncMonacoTheme(monaco);
    setupTypeScriptEnv(monaco);
    scanWorkspaceForTypeScript(monaco); // fire-and-forget——不阻塞渲染
  }, []);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoNsRef.current = monaco;
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => onSaveRef.current?.(),
    );
  }, []);

  // keep-alive：标签页切回时刷新 Monaco 布局
  useEffect(() => {
    if (!isActive) return;
    const raf = requestAnimationFrame(() => {
      editorRef.current?.layout();
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive]);

  // 主题订阅：LinkDesk 切换亮/暗色 → Monaco 自动跟随
  useEffect(() => {
    return subscribeThemeSync(monacoNsRef);
  }, []);

  // StrictMode 防线：unmount 时 dispose editor
  useEffect(() => {
    return () => {
      editorRef.current?.dispose();
    };
  }, []);

  // 🔥 构造 file:/// URI——monaco.Uri.parse 不认 Windows 盘符，必须加 file:/// 前缀
  //   "E:/test/app.ts" → Uri.parse 把 "E:" 当 scheme → E://test/app.ts（错）
  //   "file:///E:/test/app.ts" → Uri.parse 正确解析 → file 协议（和 monaco.Uri.file 一致）
  const fileUri = (() => {
    const n = normalizePath(filePath);
    return n.startsWith("/") ? `file://${n}` : `file:///${n}`;
  })();

  return (
    <Editor
      height="100%"
      path={fileUri}
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
