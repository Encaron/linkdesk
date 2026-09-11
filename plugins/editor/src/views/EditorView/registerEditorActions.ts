/**
 * 编辑器内建动作：Ctrl+S 保存 + 摘除 Monaco 内置字体缩放键位
 * （E6#87c 拆自 EditorView.tsx 的初始化步骤 9/10/11）。
 */
import type { MutableRefObject } from "react";
import type { Monaco, MonacoEditor } from "./types";

export function registerEditorActions(args: {
  monaco: Monaco;
  editor: MonacoEditor;
  onSaveRef: MutableRefObject<(() => void) | undefined>;
}): void {
  const { monaco, editor, onSaveRef } = args;

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
}
