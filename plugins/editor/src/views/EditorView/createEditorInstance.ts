/**
 * 手写 editor 创建（E6#87c 拆自 EditorView.tsx 的初始化步骤 6）。
 *
 * 不用 EditorApp——它的 buildModelReference() 走 VS Code 的 IFileService.writeFile()，
 * 在 Electron 壳 WebView 里无写文件权限。手写 createModel+createEditor 绕过文件服务。
 *
 * 🔴 只**返回**实例，不写 editorRef——cleanup 要读的那个 ref 必须由 effect 体自己写，
 * 否则 ESLint 的 `exhaustive-deps` 会判「ref 可能在 cleanup 前被换掉」。
 */
import type { MutableRefObject } from "react";
import type { editor as MonacoEditorApi } from "monaco-editor";
import type { Monaco, MonacoEditor } from "./types";

const lk = window.linkdesk;

export function createEditorInstance(args: {
  monaco: Monaco;
  container: HTMLElement;
  filePath: string;
  value: string;
  readOnly?: boolean;
  optionsRef: MutableRefObject<Record<string, unknown> | undefined>;
  onEditorMountRef: MutableRefObject<((opts: { tabSize: number; insertSpaces: boolean; eol: string }) => void) | undefined>;
}): { editor: MonacoEditor; model: MonacoEditorApi.ITextModel } {
  const { monaco, container, filePath, value, readOnly, optionsRef, onEditorMountRef } = args;

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
    ...optionsRef.current,
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

  // E4V#40j——回传编辑器初始选项（缩进/EOL）给 EditorTab → EditorStatusBar
  const modelOpts = model.getOptions();
  onEditorMountRef.current?.({
    tabSize: modelOpts.tabSize,
    insertSpaces: modelOpts.insertSpaces,
    eol: model.getEOL() === "\r\n" ? "CRLF" : "LF",
  });

  return { editor, model };
}
