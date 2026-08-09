/**
 * PluginComponent——E5.6#7d。
 *
 * 给定 pluginId，import.meta.glob 查找插件入口 → React.lazy 动态加载。
 * ErrorBoundary 兜底崩溃，Suspense 显示加载态。
 *
 * 🔴 临时方案——import.meta.glob 在构建时静态展开。
 *    E6#8/#9 替换为运行时动态 import（import(entryPath)）。
 *    当前 glob 在 dev + 内置插件全在源码树时够用。
 *
 * ⚠️ 禁止在此文件静态 import monaco-editor——会在 @codingame 补丁前初始化
 *    原生主题系统（E5.6#2 教训）。Monaco 由编辑器插件的 initMonacoEnv() 首次加载。
 */

import React, { Suspense, useMemo } from "react";
import i18n from "../i18n";
import ErrorBoundary from "../components/shared/ErrorBoundary";

// ── import.meta.glob：Vite 预扫描插件入口 ──
// src/pool/ → ../../ = 项目根 → plugins/
const pluginModules = {
  ...import.meta.glob("../../plugins/builtin/*/src/index.tsx"),
  ...import.meta.glob("../../plugins/user/*/src/index.tsx"),
};

interface PluginComponentProps {
  pluginId: string;
  isActive: boolean;
  tabId?: string;
  sourceId?: string;
}

export default function PluginComponent({ pluginId, isActive, tabId, sourceId }: PluginComponentProps) {
  // React.lazy 必须稳定引用——useMemo 按 pluginId 缓存，防止每次渲染 new → unmount → flicker
  // 查找逻辑内聚在 useMemo 内——rules-of-hooks 要求 hook 在 early return 之前
  const LazyComponent = useMemo(() => {
    let modulePath: string | undefined;
    for (const path of Object.keys(pluginModules)) {
      if (path.includes(`/${pluginId}/`)) {
        modulePath = path;
        break;
      }
    }
    const loader = modulePath ? pluginModules[modulePath] : undefined;
    if (!loader) return null;

    return React.lazy<React.ComponentType<{ isActive: boolean; tabId?: string; sourceId?: string }>>(() =>
      loader().then((mod: any) => ({
        default: mod.default || (() => {
          throw new Error(i18n.t("插件 {{id}} 未导出 default 组件", { id: pluginId }));
        }),
      })),
    );
  }, [pluginId]);

  if (!LazyComponent) {
    return (
      <div className="plugin-missing-view">
        <p>{i18n.t('插件 "{{id}}" 不可用', { id: pluginId })}</p>
      </div>
    );
  }

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
        <LazyComponent isActive={isActive} tabId={tabId} sourceId={sourceId} />
      </Suspense>
    </ErrorBoundary>
  );
}
