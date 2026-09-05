/**
 * E5.8#24.8 Monaco 初始化护栏统一（monacoBootstrap）——替代 monaco-init.ts。
 *
 * 把 Monaco 的 loader→@codingame 补丁→主题→worker→options 初始化顺序收敛进单模块，
 * 4 条竞态 memory 教训固化进护栏（不再逐案打补丁）：
 *
 *   1. [[monaco-dark-font-race-condition]] —— loadThemes: true（vs-dark/vs 必须出现在
 *      getColorThemes()）+ 视图侧 editor.updateOptions({theme}) 实例级双设——绕过
 *      StandaloneWorkbenchThemeService 的异步管道（getColorThemes→setTimeout→Sequencer）。
 *   2. [[e5-6-2-monaco-dark-static-import-race]] —— 禁止静态 import monaco-editor。
 *      static import 在模块解析期就初始化 Monaco 原生主题系统，比 @codingame 补丁早 →
 *      DOM token 颜色错误（暗色字体黑）。getMonaco() 是唯一取 monaco 通道——内部
 *      动态 import，且运行时护栏保证补丁先于加载。
 *   3. [[monaco-editor-options-not-applied]] —— React 竞态：buildMonacoOptions() 异步
 *      返回 vs editor.create() 时间差。防线在视图侧（optionsRef 桥接 + create 后立即
 *      updateOptions 双安全网）——本模块保证 create 前 monaco 已就绪，竞态窗口收敛。
 *   4. 补丁先于静态 import（1+2 的时序本质）——bootstrapMonaco() 未 resolve 前
 *      getMonaco() 拒绝返回。忘了 await bootstrap 就 import monaco = 编译期可拦错误。
 *
 * API 契约（视图 / E6 独立构建只认这两个入口）：
 *   await bootstrapMonaco(openEditorFunc)   // 幂等，全局一次；并发调用共享同一 promise
 *   const monaco = await getMonaco()        // 补丁完成后才加载 monaco-editor（缓存共享）
 *
 * E6 联动：E6#15b 独立构建直接复用本模块——不另起炉灶。
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
// 注意：?worker 只创建 Worker 构造器，不加载 monaco-editor 主模块——模块顶层设 MonacoEnvironment
// 不违反「补丁先于静态 import」（教训 2/4）。
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

let _bootstrapped = false;
let _bootstrapPromise: Promise<void> | null = null;
let _monacoPromise: ReturnType<typeof importMonaco> | null = null;

function importMonaco() {
  // 唯一取 monaco 通道——动态 import。任何视图直接 import("monaco-editor") 都绕过本护栏。
  return import("monaco-editor");
}

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
 * 🔥 Monaco VS Code 服务层补丁——全局一次，幂等，并发安全。
 * 必须在任何 monaco.editor.create() / getMonaco() 之前调用（教训 4：补丁先于加载）。
 *
 * @param openEditorFunc - IEditorService.openEditor() 回调（补丁后 monaco-languageclient 转调壳标签页）
 */
export async function bootstrapMonaco(openEditorFunc: OpenEditor): Promise<void> {
  if (_bootstrapped) return;
  if (_bootstrapPromise) return _bootstrapPromise;

  const config: MonacoVscodeApiConfig = {
    $type: "extended",
    viewsConfig: {
      $type: "EditorService",
      openEditorFunc,
    },
    monacoWorkerFactory: setupWorkerFactory,
    advanced: {
      /** E5#107 修复（教训 1）：必须 true——否则 VS Code 默认主题未注册，
       *  StandaloneWorkbenchThemeService.setTheme("vs-dark") 找不到主题，
       *  setTimeout 异步竞态致暗色模式下 Monaco 字体渲染为黑色。 */
      loadThemes: true,
    },
  };

  const wrapper = new MonacoVscodeApiWrapper(config);
  _bootstrapPromise = wrapper.start().then(() => { _bootstrapped = true; });
  return _bootstrapPromise;
}

/**
 * 取 monaco-editor 命名空间——补丁完成后才加载，结果缓存共享。
 * 未 bootstrap（或 bootstrap 未完成）即调用 → 显式抛错（教训 2/4：禁止补丁前加载）。
 */
export async function getMonaco() {
  if (_bootstrapPromise) await _bootstrapPromise;
  if (!_bootstrapped) {
    throw new Error(
      "[monacoBootstrap] getMonaco() 须在 bootstrapMonaco() 完成后调用——@codingame 补丁先于 monaco-editor 加载（E5.6#2 暗色字体黑竞态）",
    );
  }
  if (!_monacoPromise) _monacoPromise = importMonaco();
  return _monacoPromise;
}
