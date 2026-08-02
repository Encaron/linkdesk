/**
 * E4V#40t1 + E4V#40t6 Monaco VS Code API 全局一次性初始化。
 *
 * ViewsService 模式：注册 workbench command（含 revealDefinition），
 * IEditorService.openEditor() 覆盖 → 壳标签页。
 * F12 / Ctrl+Click 自动走这条通道——所有语言通用，零手动代码。
 *
 * 🔥 模块级守卫——start() 全局只调一次。
 */
import { MonacoVscodeApiWrapper } from "monaco-languageclient/vscodeApiWrapper";
import type { MonacoVscodeApiConfig } from "monaco-languageclient/vscodeApiWrapper";
import { configureDefaultWorkerFactory } from "monaco-languageclient/workerFactory";

let _ready = false;
let _initPromise: Promise<void> | null = null;

/** ViewsService 模式需要 DOM 容器——创建隐藏元素，不污染壳 UI */
function getHiddenContainer(): HTMLDivElement {
  const existing = document.getElementById("linkdesk-vscode-workbench");
  if (existing) return existing as HTMLDivElement;
  const el = document.createElement("div");
  el.id = "linkdesk-vscode-workbench";
  el.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;overflow:hidden;pointer-events:none;z-index:-1";
  document.body.appendChild(el);
  return el;
}

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
      $type: "ViewsService",
      htmlContainer: getHiddenContainer(),
      openEditorFunc,
    },
    monacoWorkerFactory: configureDefaultWorkerFactory,
    advanced: {
      loadThemes: false,
    },
  };

  const wrapper = new MonacoVscodeApiWrapper(config);
  _initPromise = wrapper.start().then(() => { _ready = true; });
  return _initPromise;
}
