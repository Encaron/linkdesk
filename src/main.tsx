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
