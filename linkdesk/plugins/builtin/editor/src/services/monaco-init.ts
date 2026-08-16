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
// E5.7#98：openEditorFunc 契约类型取库正源（OpenEditor）——替代 modelRef: any / Promise<any>
import type { OpenEditor } from "@codingame/monaco-vscode-editor-service-override";
// E5.7#94：别名改名——原函数名 use* 前缀触发 react-hooks/rules-of-hooks 假阳性
// （它是挂 MonacoEnvironment 的普通函数，非 React hook——方案 §2 已读源码取证）。
import { useWorkerFactory as configureWorkerFactory } from "monaco-languageclient/workerFactory";

// E5.5#7 Bug B fix：?url 显式导入 Worker——Vite 一等公民，任何上下文正确解析。
import editorWorkerUrl from '@codingame/monaco-vscode-editor-api/esm/vs/editor/editor.worker.js?url';
import extensionHostUrl from '@codingame/monaco-vscode-api/workers/extensionHost.worker?url';
import textMateUrl from '@codingame/monaco-vscode-textmate-service-override/worker?url';

// E5.5#7 Bug B fix：标准 Monaco Language Worker（?worker）——对标 main.tsx。
// 🔴 历史根因：main.tsx 设置了 MonacoEnvironment.getWorker，插件 WebView 入口
//   （plugin-shell-main.tsx，已随 E5.7#40 删除）没有——Monaco 无法创建任何 Worker →
//   TS/HTML 语言服务全挂、Enter 键失效。本文件即当时的补齐，E5.7 入口合一后仍是唯一装配点。
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';

// 🔥 模块加载时设 MonacoEnvironment——对标 main.tsx，必须早于任何 Monaco import。
// monaco-languageclient 的 useWorkerFactory 会设置 getWorkerUrl/getWorkerOptions，
// 但 Monaco 内置语言服务走 getWorker——必须同时设置。
// E5.7#98：globalThis.MonacoEnvironment 类型由 monaco.d.ts 的 declare global 提供——免 self as any
globalThis.MonacoEnvironment = {
  ...globalThis.MonacoEnvironment,
  getWorker(_workerId: string, label: string): Worker {
    if (label === "typescript" || label === "javascript") return new TsWorker();
    if (label === "json") return new JsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new CssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new HtmlWorker();
    return new EditorWorker();
  },
};

let _ready = false;
let _initPromise: Promise<void> | null = null;

/**
 * E5.5#7 Bug B fix：手动配置 monaco-languageclient VS Code 集成 Worker。
 * 标准 Monaco 语言 Worker 已在模块顶层通过 MonacoEnvironment.getWorker 配置。
 * 此处补充 VS Code 集成层需要的 editorWorkerService / extensionHostWorkerMain / TextMateWorker。
 */
function setupWorkerFactory(_logger?: unknown): void {
  configureWorkerFactory({
    workerLoaders: {
      editorWorkerService: () => ({
        url: editorWorkerUrl,
        options: { type: 'module' as const },
      }),
      extensionHostWorkerMain: () => ({
        url: extensionHostUrl,
        options: { type: 'module' as const },
      }),
      TextMateWorker: () => ({
        url: textMateUrl,
        options: { type: 'module' as const },
      }),
    },
  });
}

/**
 * 确保 Monaco VS Code 服务层已初始化——幂等，多次调用安全。
 * 必须在任何 monaco.editor.create() 之前调用。
 *
 * @param openEditorFunc - IEditorService.openEditor() 回调
 */
export async function initMonacoEnv(
  openEditorFunc: OpenEditor,
): Promise<void> {
  if (_ready) return;
  if (_initPromise) return _initPromise;

  const config: MonacoVscodeApiConfig = {
    $type: "extended",
    viewsConfig: {
      $type: "EditorService",
      openEditorFunc,
    },
    monacoWorkerFactory: setupWorkerFactory,
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
