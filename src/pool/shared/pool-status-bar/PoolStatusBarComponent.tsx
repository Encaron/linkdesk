/**
 * PoolStatusBarComponent——E5.7#8。池侧插件状态栏组件懒加载。
 *
 * 壳侧等价物：src/pluginLoader/resolution/state.ts pluginStatusBarModules glob（3 路径，
 * 2026-09-05 塌平后同收单根 plugins/<id>/）——serial-monitor 等插件
 * 提供 statusBar.tsx 自定义组件（TX/RX 计数 + 连接灯，组件内部走 linkdesk.events/
 * configuration/useTranslation，无需壳数据 → 可在池内按原样运行）。
 *
 * 与 PluginComponent 同模式：import.meta.glob 构建时扫描 + 运行时 resolvePath 动态 import
 * fallback（3 路径试错），模块级 _lazyCache 保持 React.lazy 组件类型稳定。
 *
 * 插件 statusBar 组件无 props（壳 renderPluginStatusBar 渲染 <Comp /> 同款）。
 */

import React, { Suspense, useMemo } from "react";
import ErrorBoundary from "../error-boundary/ErrorBoundary"; // E5.7#20：池侧版（不 import 壳 components 目录）

// ── import.meta.glob：Vite 预扫描插件状态栏组件 ──
// 壳 loader.ts pluginStatusBarModules 同款 3 路径（2026-09-05 塌平单根：plugins/<id>/，目录名 = pluginId）
const statusBarModules = {
  ...import.meta.glob("../../plugins/*/statusBar.tsx"),
  ...import.meta.glob("../../plugins/*/src/statusBar.tsx"),
  ...import.meta.glob("../../plugins/*/src/components/statusBar.tsx"),
};

/** 运行时动态 import 试错路径——与 glob 三位置对应 */
const STATUS_BAR_PATHS = ["statusBar.tsx", "src/statusBar.tsx", "src/components/statusBar.tsx"];

// 模块级 lazy 缓存——React.lazy 组件类型稳定，避免每次渲染 new → unmount
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lazy 缓存组件类型（同 PluginComponent _lazyCache 模式）
const _lazyCache = new Map<string, React.ComponentType<any>>();

interface PoolStatusBarComponentProps {
  pluginId: string;
}

export default function PoolStatusBarComponent({ pluginId }: PoolStatusBarComponentProps) {
  const LazyComponent = useMemo(() => {
    const cached = _lazyCache.get(pluginId);
    if (cached) return cached;

    // glob 查找：按 pluginId 匹配路径
    let modulePath: string | undefined;
    for (const path of Object.keys(statusBarModules)) {
      if (path.includes(`/${pluginId}/`)) {
        modulePath = path;
        break;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- glob loader 类型（同 PluginComponent loader 模式）
    let loader: (() => Promise<any>) | undefined = modulePath ? statusBarModules[modulePath] : undefined;

    // 🔥 glob 是构建时扫描——运行时安装的插件不在其中。fallback 到动态 import（3 路径试错）。
    if (!loader) {
      const lk = window.linkdesk;
      const isDev = import.meta.env.DEV;
      // E5.7#97：守卫窄化不进 async 闭包——捕获局部引用（resolvePath 双端 required）
      const resolvePath = lk?.plugins?.resolvePath;
      if (resolvePath) {
        loader = (async () => {
          try {
            const absPath: string = await resolvePath(pluginId);
            for (const p of STATUS_BAR_PATHS) {
              try {
                const url = isDev ? `/@fs/${absPath}/${p}` : `linkdesk://${pluginId}/${p}`;
                return await import(/* @vite-ignore */ url);
              } catch {
                // 该位置不存在——试下一条
              }
            }
            return null;
          } catch (e) {
            console.error(`[PoolStatusBarComponent] 动态加载插件 "${pluginId}" 状态栏组件失败:`, e);
            return null;
          }
        });
      }
    }

    if (!loader) return null;

    const component = React.lazy(() =>
      loader!().then((mod) => ({
        default: mod?.default ?? (() => null),  // 无 default 导出 → 渲染空
      })),
    );
    _lazyCache.set(pluginId, component);
    return component;
  }, [pluginId]);

  if (!LazyComponent) return null;

  return (
    <ErrorBoundary pluginId={pluginId}>
      <Suspense fallback={null}>
        <LazyComponent />
      </Suspense>
    </ErrorBoundary>
  );
}
