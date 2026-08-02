/**
 * E4V#40t1 Monaco VS Code API 全局一次性初始化。
 *
 * 用 monaco-languageclient 的 MonacoVscodeApiWrapper 替代 @monaco-editor/react——
 * 拿到完整的 VS Code 服务层（TextMate 语法高亮、主题、IEditorService 覆盖）。
 * 模块级守卫——start() 全局只调一次，多次调用复用已有 Promise。
 *
 * 🔥 做完 E4V#40t 后，E4V#40i2 的手动 TS worker + onMouseDown 代码可删除。
 */
import { MonacoVscodeApiWrapper } from "monaco-languageclient/vscodeApiWrapper";
import type { MonacoVscodeApiConfig } from "monaco-languageclient/vscodeApiWrapper";
import { configureDefaultWorkerFactory } from "monaco-languageclient/workerFactory";

let _ready = false;
let _initPromise: Promise<void> | null = null;

/**
 * 确保 Monaco VS Code 服务层已初始化——幂等，多次调用安全。
 * 必须在任何 monaco.editor.create() 之前调用。
 *
 * @param openEditorFunc - IEditorService.openEditor() 回调
 *   (modelRef, _options, _sideBySide) => Promise<ICodeEditor | undefined>
 */
export async function initMonacoEnv(
  openEditorFunc: (
    modelRef: any,
    _options: unknown,
    _sideBySide?: boolean,
  ) => Promise<any>,
): Promise<void> {
  if (_ready) return;
  if (_initPromise) return _initPromise;

  const config: MonacoVscodeApiConfig = {
    $type: "extended",
    viewsConfig: {
      $type: "EditorService",
      openEditorFunc,
    },
    monacoWorkerFactory: configureDefaultWorkerFactory,
    advanced: {
      loadThemes: false, // 🔥 禁用 VS Code 主题扩展——Vite 不认 extension-file:// 协议
    },
  };

  const wrapper = new MonacoVscodeApiWrapper(config);
  _initPromise = wrapper.start().then(() => { _ready = true; });
  return _initPromise;
}
