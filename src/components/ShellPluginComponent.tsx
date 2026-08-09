/**
 * ShellPluginComponent — E5.6 Pool 模型：插件回壳 React 树渲染。
 *
 * E5.5 时代每个插件标签页打开独立 WebContentsView（O(N) 进程），
 * E5.6 Phase 1 回退到单 WebView——插件直接渲染在壳的 React 树内。
 *
 * import.meta.glob 在构建时静态展开，Vite 为每个插件生成独立 chunk；
 * React.lazy 按需加载——只在标签页首次激活时才下载插件 JS。
 *
 * 不区分 builtin/user——glob 覆盖两个目录，路径匹配时动态解析。
 */
import React, { Suspense, useMemo } from "react";
import i18n from "../i18n";
import ErrorBoundary from "./shared/ErrorBoundary";

// ── import.meta.glob：Vite 预扫描插件入口 ──
// 返回 { path: () => import(path) } 映射，构建时静态展开。
// 路径从 src/components/ → ../../ = 项目根 → plugins/
const pluginModules = {
  ...import.meta.glob("../../plugins/builtin/*/src/index.tsx"),
  ...import.meta.glob("../../plugins/user/*/src/index.tsx"),
};

interface ShellPluginComponentProps {
  pluginId: string;
  isActive: boolean;
  /** E5.6#2 过渡期：直接传 props——Phase 5 建好 IPC 后切 PoolLayout 协议 */
  filePath?: string;
  sourceId?: string;
}

/**
 * E5.6#2b：插件 React 组件渲染器。
 *
 * 给定 pluginId，在 glob 中查找匹配入口，React.lazy 动态加载，
 * ErrorBoundary 兜底崩溃，Suspense 显示加载态。
 */
export default function ShellPluginComponent({ pluginId, isActive, filePath, sourceId }: ShellPluginComponentProps) {
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
    return (
      <div className="plugin-missing-view">
        <p>{i18n.t('插件 "{{id}}" 不可用', { id: pluginId })}</p>
      </div>
    );
  }

  // 🔥 React.lazy 必须稳定引用——在组件函数体内每次渲染 new 会导致
  //    React 卸载旧组件 → Suspense fallback 闪烁。用 useMemo 按 pluginId 缓存。
  const LazyComponent = useMemo(
    () =>
      React.lazy<React.ComponentType<{ isActive: boolean; filePath?: string; sourceId?: string }>>(() =>
        loader().then((mod: any) => ({
          default: mod.default || (() => {
            throw new Error(i18n.t("插件 {{id}} 未导出 default 组件", { id: pluginId }));
          }),
        })),
      ),
    // loader 从 pluginModules[modulePath] 取值——module scope 下 stable，pluginId 不变时引用不变
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pluginId],
  );

  return (
    <ErrorBoundary pluginId={pluginId}>
      <Suspense
        fallback={
          <div
            className="plugin-loading"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--text-muted)",
              fontSize: 13,
              userSelect: "none",
            }}
          >
            {i18n.t("加载中...")}
          </div>
        }
      >
        <LazyComponent isActive={isActive} filePath={filePath} sourceId={sourceId} />
      </Suspense>
    </ErrorBoundary>
  );
}
