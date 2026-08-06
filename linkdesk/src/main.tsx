import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n";
import "./index.css";
import "@vscode/codicons/dist/codicon.css";
// E5#115: 配置在 React mount 前就位——对标 VS Code (Service 在窗口创建前初始化)
import { initStorageService } from "./core/services/StorageService";
import { initConfigurationService } from "./core/services/ConfigurationService";

// 🔥 E4V#40h Monaco 完整配置——照着 @monaco-editor/react 官方 Vite 文档：
//    1. loader.config({ monaco }) → 告诉 @monaco-editor/react 用本地包而非 CDN
//    2. MonacoEnvironment.getWorker → 告诉 Monaco 如何创建 TS/JSON/CSS/HTML worker
//    🔥 必须两条都配——只配一条 TypeScript 智能提示不工作。
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";

loader.config({ monaco });

(self as any).MonacoEnvironment = {
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
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
})();
