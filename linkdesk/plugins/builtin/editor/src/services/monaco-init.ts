/**
 * E4V#40t1 Monaco VS Code API 全局一次性初始化。
 *
 * EditorService 模式：覆盖 IEditorService.openEditor() → 壳标签页。
 * F12 / Ctrl+Click 走手动 handler——EditorService + standalone editor 不注册 revealDefinition。
 * 这是 standalone Monaco 的正确归一化路径，不是 V2.6 临时方案。
 *
 * 🔥 模块级守卫——start() 全局只调一次。
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
      /** E5#107 修复：必须 true——否则 VS Code 默认主题未注册，
       *  StandaloneWorkbenchThemeService.setTheme("vs-dark") 找不到主题，
       *  setTimeout 异步竞态致暗色模式下 Monaco 字体渲染为黑色。 */
      loadThemes: true,
    },
  };

  const wrapper = new MonacoVscodeApiWrapper(config);
  _initPromise = wrapper.start().then(() => { _ready = true; });
  return _initPromise;
}
