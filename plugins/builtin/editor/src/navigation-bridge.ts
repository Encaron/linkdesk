/**
 * E4V#40i2a 编辑器导航桥——IEditorService.openEditor → 壳标签页。
 *
 * Standalone Monaco 的 F12/Ctrl+Click 只弹 peek 窗。接线 monaco-vscode-api 的
 * IEditorService.openEditor() → 壳 TabActions.createTab()。
 * 一次接线，F12 / Ctrl+Click / peek 窗点链接——全部自动走壳标签页。
 *
 * 🔥 initialize() 必须在 monaco.editor.create() 之前调用——它是替而非补。
 *    所以 @monaco-editor/react 的 <Editor> 必须换掉（E4V#40i2b）。
 */
import { initialize } from "@codingame/monaco-vscode-api";
import getEditorServiceOverride from "@codingame/monaco-vscode-editor-service-override";

/** initialize() 只能全局调一次——模块级守卫 */
let _navReady = false;
let _navPromise: Promise<void> | null = null;

/**
 * 确保导航桥已初始化——幂等，多次调用只执行一次。
 * Monaco 所有"打开文件"操作（F12/Ctrl+Click/peek 窗）汇到 openFile 回调。
 *
 * @param openFile - 壳标签页打开回调：(filePath: string) => void
 */
export async function ensureNavigationBridge(
  openFile: (filePath: string) => void,
): Promise<void> {
  if (_navReady) return;
  if (_navPromise) return _navPromise; // 进行中复用
  _navPromise = initialize(
    getEditorServiceOverride(async (modelRef, _options, _sideBySide) => {
      const uri = modelRef.object.textEditorModel.uri;
      openFile(uri.fsPath);
      return undefined;
    }),
  ).then(() => { _navReady = true; });
  return _navPromise;
}
