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
const pluginModules = {
  ...import.meta.glob("../plugins/builtin/*/src/index.tsx"),
  ...import.meta.glob("../plugins/user/*/src/index.tsx"),
};

function bootstrap() {
  const root = document.getElementById("root");
  if (!root) return;

  if (!pluginId) {
    root.textContent = "缺少参数: ?plugin-view=<插件ID>";
    return;
  }

  // E4 #86：插件在 builtin/ 或 user/ 下——遍历 glob keys 查找匹配路径
  let modulePath: string | undefined;
  for (const path of Object.keys(pluginModules)) {
    if (path.includes(`/${pluginId}/`)) {
      modulePath = path;
      break;
    }
  }
  const loader = modulePath ? pluginModules[modulePath] : undefined;

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

    // ErrorBoundary——组件抛错时显示错误信息，不发 ready（React fallback 继续兜底）
    class PluginErrorBoundary extends React.Component<
      { children: React.ReactNode },
      { error: Error | null }
    > {
      constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error: Error) {
        return { error };
      }
      render() {
        if (this.state.error) {
          return React.createElement("div", {
            style: {
              padding: "20px",
              color: "var(--error, #f44747)",
              fontFamily: "monospace",
              fontSize: "13px",
              whiteSpace: "pre-wrap",
            },
          }, `插件 ${pluginId} 渲染失败:\n${this.state.error.message}\n\n${this.state.error.stack ?? ""}`);
        }
        return this.props.children;
      }
    }

    ReactDOM.createRoot(root).render(
      <PluginErrorBoundary>
        <React.StrictMode>
          <I18nextProvider i18n={i18n}>
            <Component isActive={true} />
          </I18nextProvider>
        </React.StrictMode>
      </PluginErrorBoundary>,
    );

    // #58e 修复：渲染完成后通知壳——壳收到后才关 React fallback。
    // 延时一帧确保 React commit 完成（ErrorBoundary 有机会捕获错误）。
    requestAnimationFrame(() => {
      try {
        (window as any).linkdesk?.pluginViews?.notifyReady?.(pluginId);
      } catch { /* preload 未就绪时静默 */ }
    });
  }).catch((err: any) => {
    root.textContent = `插件 ${pluginId} 加载失败:\n${err?.message ?? String(err)}`;
  });
}

bootstrap();
