/**
 * E4V#40b Monaco 编辑器包装器。
 *
 * 参考：plugins/user/serial-monitor/src/index.tsx L1082-1125
 *   - beforeMount：注册常用语言 + 定义 LinkDesk 主题
 *   - onMount：存 monacoRef + 注册 Ctrl+S
 *   - keep-alive：isActive 切换时 requestAnimationFrame → layout()
 *   - StrictMode：unmount cleanup 中 dispose editor
 *
 * Props 由 EditorTab（E4V#40f）传入。
 */
import React, { useRef, useEffect, useCallback } from "react";
import Editor, { type OnMount, type BeforeMount } from "@monaco-editor/react";
import { registerLanguageMap } from "./language-map";
import { syncMonacoTheme, subscribeThemeSync } from "./theme-sync";

export interface EditorViewProps {
  /** 文件内容 */
  value: string;
  /** Monaco 语言 ID——"typescript" | "json" | "plaintext" | ... */
  language: string;
  /** 文件绝对路径——决定 Monaco model URI（跨文件解析用） */
  filePath: string;
  /** 标签页是否活跃——用于 keep-alive layout */
  isActive: boolean;
  /** 内容变更回调 */
  onChange?: (value: string | undefined) => void;
  /** 保存回调（Ctrl+S 触发） */
  onSave?: () => void;
  /** 只读模式 */
  readOnly?: boolean;
}

const EditorView: React.FC<EditorViewProps> = ({
  value,
  language,
  filePath,
  isActive,
  onChange,
  onSave,
  readOnly,
}) => {
  const monacoRef = useRef<any>(null);
  // 🔥 ref 桥接——handleEditorMount 只跑一次，Ctrl+S 始终读最新 onSave
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const beforeMount: BeforeMount = useCallback((monaco) => {
    registerLanguageMap(monaco);
    syncMonacoTheme(monaco);
  }, []);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    monacoRef.current = editor;
    // Ctrl+S → onSave（走 ref 避免闭包过期）
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => onSaveRef.current?.(),
    );
  }, []);

  // keep-alive：标签页切回时刷新 Monaco 布局（对标串口监视器 L1118-1125）
  useEffect(() => {
    if (!isActive) return;
    const raf = requestAnimationFrame(() => {
      monacoRef.current?.layout();
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive]);

  // 主题订阅：LinkDesk 切换亮/暗色 → Monaco 自动跟随
  useEffect(() => {
    return subscribeThemeSync(monacoRef);
  }, []);

  // StrictMode 防线：unmount 时 dispose editor
  useEffect(() => {
    return () => {
      monacoRef.current?.dispose();
    };
  }, []);

  return (
    <Editor
      height="100%"
      path={filePath}
      language={language}
      value={value}
      onChange={onChange}
      theme="linkdesk"
      beforeMount={beforeMount}
      onMount={handleEditorMount}
      options={{ readOnly }}
    />
  );
};

export default EditorView;
