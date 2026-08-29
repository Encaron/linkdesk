import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n";
import "@vscode/codicons/dist/codicon.css";
// E5.8 Phase 12 #183：codicon.css 须在 index.css 之前——index.css 末尾覆盖基类 font-size 走
// var(--font-size-lg)（内容图标随字缩放，1.0=16px 零变化），后加载者赢同特异性 tie。
import "./index.css";
// E5#115: 配置在 React mount 前就位——对标 VS Code (Service 在窗口创建前初始化)
import { initStorageService } from "./core/services/configuration/StorageService";
import { initConfigurationService, initUserSettingsWatcher } from "./core/services/configuration/ConfigurationService";

// 🔥 E5.6#2 MonacoEnvironment——worker 构造器存全局，Monaco import 时读取。
//    monaco-bootstrap.ts（E5.8#24.8）也会设置同名属性（merge 模式），此处冗余无副作用。
//    ⚠️ 禁止在此文件静态 import monaco-editor——会在 @codingame 补丁前初始化
//       原生主题系统，导致 StandaloneWorkbenchThemeService DOM token 颜色错误。
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";

// E5.7#98：MonacoEnvironment 已由 monaco.d.ts declare global 定型——as any 删除
globalThis.MonacoEnvironment = {
  getWorker(_: unknown, label: string): Worker {
    if (label === "typescript" || label === "javascript") return new TsWorker();
    if (label === "json") return new JsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new CssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new HtmlWorker();
    return new EditorWorker();
  },
};

// E5#115: 对标 VS Code——配置服务和存储服务在 mount 前就位
(async () => {
  await initStorageService();
  await initConfigurationService();
  // E5.8#0d.5：挂 settings.json 文件监听——外部编辑保存后即时生效（幂等；非 Electron 环境静默跳过）
  await initUserSettingsWatcher();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
})();
