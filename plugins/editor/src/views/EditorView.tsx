/**
 * E4V#40b Monaco 编辑器包装器。
 *
 * E4V#40t2：monaco-languageclient 全量迁移——MonacoVscodeApiWrapper 初始化 VS Code 服务层
 * + 手写 monaco.editor.create() 创建编辑器。不依赖 @monaco-editor/react。
 *
 * 🔥 EditorApp 不能用——它的 buildModelReference() 走 VS Code 的 IFileService.writeFile()，
 *    在 Electron 壳 WebView 里无写文件权限。手写 createModel+createEditor 绕过文件服务。
 *
 * 🔥 bootstrapMonaco() 覆盖 IEditorService.openEditor() → F12/Ctrl+Click 自动走壳标签页。
 *
 * E6#87c：原 431 行单文件拆为同名夹，本文件 = **门面**。🔴 `views/` 的门面必须是**同级同名
 * 文件**（不是夹内 index）——本文件路径就是壳按标签页类型加载的入口，也是 SDK 编译表面 key，
 * 改成夹内 index 会让消费方指向不存在的文件。
 */
import { forwardRef, useImperativeHandle, useRef } from "react";
import { useEditorInit } from "./EditorView/useEditorInit";
import { useEditorKeepAlive } from "./EditorView/useEditorKeepAlive";
import type { EditorViewHandle, EditorViewProps } from "./EditorView/types";

export type { EditorViewHandle, EditorViewProps } from "./EditorView/types";

const EditorView = forwardRef<EditorViewHandle, EditorViewProps>(function EditorView(
  { value, language: _language, filePath, isActive, onChange, onSave, readOnly, onCursorChange, onEditorMount, onLspStateChange, options },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { editorRef } = useEditorInit({
    containerRef, filePath, value, readOnly, options,
    onChange, onSave, onCursorChange, onEditorMount, onLspStateChange,
  });

  useImperativeHandle(ref, () => ({
    layout: () => editorRef.current?.layout(),
    focus: () => editorRef.current?.focus(),
    dispose: () => editorRef.current?.dispose(),
    updateOptions: (opts: Record<string, unknown>) => editorRef.current?.updateOptions(opts),
    setValue: (v: string) => editorRef.current?.getModel()?.setValue(v),
    // editorRef 来自自定义 hook——ESLint 认不出它是稳定 ref，明写进 deps（身份恒定，零行为变化）
  }), [editorRef]);

  useEditorKeepAlive({ editorRef, containerRef, isActive, filePath });

  return <div ref={containerRef} style={{ height: "100%" }} />;
});

export default EditorView;
