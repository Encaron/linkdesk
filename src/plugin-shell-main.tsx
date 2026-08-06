/**
 * 插件 WebView 自举入口——双模式。
 *
 * 模式 1：多 WebView 渲染（?plugin-view=xxx）
 *   E3f #58b：每个插件独立 HTML 页面，不在 App.tsx 的 React 树内。
 *   读 URL 参数 ?plugin-view=xxx，动态 import 插件模块，渲染为独立 React 根。
 *   dev: http://localhost:1420/plugin-view.html?plugin-view=terminal
 *   prod: linkdesk://terminal/plugin-view.html?plugin-view=terminal（#58c）
 *
 * 模式 2：轻量插件开发（?pluginId=xxx）
 *   E5#110：插件开发者只加载一个插件——不启动完整 Electron，纯 Vite HMR。
 *   注入 mock window.linkdesk.* API（返回空值/默认值），防止插件 IPC 调用崩溃。
 *   用法：npm run dev:plugin file-tree
 *   → http://localhost:1420/plugin-shell.html?pluginId=file-tree
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import "./index.css";
import "@vscode/codicons/dist/codicon.css";

const params = new URLSearchParams(window.location.search);
const pluginId = params.get("pluginId") ?? params.get("plugin-view");
const isDevMode = params.get("pluginId") !== null;

// import.meta.glob：Vite 预扫描插件入口，返回 { path: () => import(path) } 映射。
// 无需 linkdesk().plugins.resolvePath——Vite 在构建时静态展开 glob。
// E5#35c: 子目录约定见 pluginPaths.ts（PLUGIN_SUBDIRS），basePrefix="../"
const pluginModules = {
  ...import.meta.glob("../plugins/builtin/*/src/index.tsx"),
  ...import.meta.glob("../plugins/user/*/src/index.tsx"),
};

// E5#110：轻量插件开发模式——注入 mock window.linkdesk.* API。
// 纯 Vite dev server 没有 Electron 主进程，IPC 调用全部失败。
// Mock 返回空值/默认值/no-op，插件 UI 能渲染不崩溃。
// 如需真实文件系统/串口，仍需启动完整 Electron（npm run electron:dev）。
function injectMockApi() {
  if (window.linkdesk) return; // 已有真实 API（多 WebView 模式），不覆盖

  const noop = () => {};
  const emptyArr = () => [];
  const emptyObj = () => ({});
  const nullVal = () => null;
  const falseVal = () => false;

  (window as any).linkdesk = {
    // 配置
    configuration: {
      get: () => undefined,
      getAll: emptyObj,
      set: noop,
      onChange: noop,
    },
    // 文件系统
    filesystem: {
      listDir: emptyArr,
      readTextFile: nullVal,
      writeTextFile: noop,
      exists: falseVal,
      createDir: noop,
      remove: noop,
      copy: noop,
      watch: noop,
      getChildren: emptyArr,
    },
    // 路径
    path: {
      normalize: (p: string) => p,
      join: (...parts: string[]) => parts.join("/"),
      basename: (p: string) => p.split("/").pop() ?? p,
      dirname: (p: string) => p.split("/").slice(0, -1).join("/") || ".",
      extname: (p: string) => { const m = p.match(/\.[^./]+$/); return m ? m[0] : ""; },
    },
    // 工作区
    workspace: {
      getFolders: emptyArr,
      getActive: nullVal,
    },
    // 标签页
    tabs: {
      create: noop,
      openOrFocus: noop,
      focus: noop,
      close: noop,
    },
    // 菜单
    menu: {
      registerItems: noop,
      getItems: emptyArr,
    },
    // 对话框
    dialog: {
      alert: noop,
      confirm: noop,
      showConfirm: (_msg: string, cb: (ok: boolean) => void) => cb(false),
      open: noop,
    },
    // 上下文键
    contextKey: {
      set: noop,
      get: nullVal,
      _getValue: falseVal,
    },
    // 事件
    events: {
      emit: noop,
      on: noop,
      off: noop,
    },
    // P2P
    p2p: {
      send: noop,
      on: noop,
    },
    // 插件视图（多 WebView）
    pluginViews: {
      notifyReady: noop,
      getAllIds: emptyArr,
      setVisible: noop,
      setBounds: noop,
      destroy: noop,
      toggleDevTools: noop,
    },
    // 插件管理
    plugins: {
      getAll: emptyArr,
      get: nullVal,
    },
    pluginManager: {
      install: noop,
      uninstall: noop,
      reinstall: noop,
    },
    // 状态
    pluginState: {
      get: nullVal,
      set: noop,
    },
    // 语言
    language: {
      getCurrent: () => "zh-CN",
    },
    // 环境
    env: {
      isDev: true,
      pluginsRootDir: "",
      appPluginsDir: "",
    },
    // 剪贴板
    clipboard: {
      readText: () => Promise.resolve(""),
      writeText: noop,
      writeFileList: noop,
    },
    // Shell
    shell: {
      startDrag: noop,
    },
    // 命令
    commands: {
      executeCommand: noop,
    },
    // 窗口
    window: {
      minimize: noop,
      maximize: noop,
      close: noop,
    },
  };
}

function bootstrap() {
  // E5#10：全局错误捕获——WebView 内任何未捕获异常都记录
  window.addEventListener("error", (e) => {
    console.error(`[plugin-shell] global error:`, e.message, e.filename, e.lineno);
  });
  window.addEventListener("unhandledrejection", (e) => {
    console.error(`[plugin-shell] unhandled rejection:`, e.reason);
  });

  const root = document.getElementById("root");
  if (!root) return;

  // E5#110：轻量插件开发模式——注入 mock API 防 IPC 崩溃
  if (isDevMode) {
    injectMockApi();
    console.log(`[plugin-shell] dev mode: pluginId=${pluginId} — mock linkdesk.* injected`);
  }

  if (!pluginId) {
    root.textContent = i18n.t("缺少参数: ?pluginId=<插件ID> 或 ?plugin-view=<插件ID>");
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
    root.textContent = i18n.t("未找到插件: {{id}}", { id: pluginId });
    return;
  }

  loader().then((mod: any) => {
    const Component = mod.default;
    if (!Component) {
      root.textContent = i18n.t("插件 {{id}} 未导出 default 组件", { id: pluginId });
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
          }, i18n.t("插件 {{id}} 渲染失败", { id: pluginId }) + ":\n" + this.state.error.message + "\n\n" + (this.state.error.stack ?? ""));
        }
        return this.props.children;
      }
    }

    // E5#110：轻量开发模式——全屏最小壳（无图标栏/侧栏/状态栏/布局引擎）
    if (isDevMode) {
      ReactDOM.createRoot(root).render(
        <PluginErrorBoundary>
          <React.StrictMode>
            <I18nextProvider i18n={i18n}>
              <div style={{
                width: "100vw",
                height: "100vh",
                background: "var(--bg-primary, #1e1e1e)",
                color: "var(--text-primary, #cccccc)",
                overflow: "auto",
              }}>
                <Component isActive={true} />
              </div>
            </I18nextProvider>
          </React.StrictMode>
        </PluginErrorBoundary>,
      );
      return;
    }

    // 模式 1：多 WebView 渲染（原有逻辑）
    ReactDOM.createRoot(root).render(
      <PluginErrorBoundary>
        <React.StrictMode>
          <I18nextProvider i18n={i18n}>
            <Component isActive={true} />
          </I18nextProvider>
        </React.StrictMode>
      </PluginErrorBoundary>,
    );

    // #58e 修复：渲染完成后通知壳。
    try { window.linkdesk?.pluginViews?.notifyReady?.(pluginId); } catch {} // 非关键操作——多 WebView 已回退，pluginViews 可能不存在
  }).catch((err: any) => {
    root.textContent = i18n.t("插件 {{id}} 加载失败", { id: pluginId }) + ":\n" + (err?.message ?? String(err));
  });
}

bootstrap();
