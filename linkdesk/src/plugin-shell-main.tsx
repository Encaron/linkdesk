/**
 * 插件 WebView 自举入口。
 *
 * E3f #58b：多 WebView 渲染——每个插件独立 HTML 页面，不在 App.tsx 的 React 树内。
 * 读 URL 参数 ?plugin-view=xxx，动态 import 插件模块，渲染为独立 React 根。
 *
 * dev: http://localhost:1420/plugin-view.html?plugin-view=terminal
 * prod: linkdesk://terminal/plugin-view.html?plugin-view=terminal（#58c）
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import "./index.css";
import "@vscode/codicons/dist/codicon.css";

const params = new URLSearchParams(window.location.search);
const pluginId = params.get("plugin-view");

// import.meta.glob：Vite 预扫描插件入口，返回 { path: () => import(path) } 映射。
// 无需 linkdesk().plugins.resolvePath——Vite 在构建时静态展开 glob。
const pluginModules = import.meta.glob("../plugins/*/src/index.tsx");

function bootstrap() {
  const root = document.getElementById("root");
  if (!root) return;

  if (!pluginId) {
    root.textContent = "缺少参数: ?plugin-view=<插件ID>";
    return;
  }

  const modulePath = `../plugins/${pluginId}/src/index.tsx`;
  const loader = pluginModules[modulePath];

  if (!loader) {
    root.textContent = `未找到插件: ${pluginId}`;
    return;
  }

  loader().then((mod: any) => {
    const Component = mod.default;
    if (!Component) {
      root.textContent = `插件 ${pluginId} 未导出 default 组件`;
      return;
    }

    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <I18nextProvider i18n={i18n}>
          <Component isActive={true} />
        </I18nextProvider>
      </React.StrictMode>,
    );
  });
}

bootstrap();
