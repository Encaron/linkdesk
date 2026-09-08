/**
 * PoolStatusBarComponent——E5.7#8。池侧插件自绘状态栏组件懒加载。
 *
 * 存在性信号 = 壳 statusbar.ts 读 entry.statusBarRenderPath 发 component marker
 * （E6#62d：loader 注册时按 manifest.appearsIn.statusBar 声明 resolveRuntimePluginRoot 拼归一 URL）——
 * 壳不再 import 插件 statusBar JS（硬约束 11）。构建时 3 路径 glob + 运行时 3 路径 resolvePath 试错
 * 兜底（本组件末席 glob——2026-09-05 塌平单根同收 plugins/<id>/）已随本任务整删：声明路径即权威，
 * 无「抄错抽屉的废纸」可兜。
 *
 * 本组件是唯一渲染执行者：按 marker 携带的 componentRenderPath（renderPath prop）直动态 import——
 * dev /@fs 源码 .tsx（Vite 即时编译 + style-inject）、prod linkdesk:// dist 编译表面 statusBar.bundle.js
 * （SDK 打包后 manifest appearsIn.statusBar 改写指向；其 index.bundle.css 由 bundleCss 引用计数
 * <link> 注入——镜像 PluginComponent E6#15，池 = 插件视图挂载文档）。
 * serial-monitor 提供 src/components/statusBar.tsx 自定义组件（连接灯 + 打开口数，E5.8#30.12 后 TX/RX 已
 * 归位接收区工具栏；组件内部走 linkdesk.events/configuration/useTranslation，无需壳数据 → 可在池内原样运行）。
 *
 * 与 PluginComponent 同模式：模块级 _lazyCache 保持 React.lazy 组件类型稳定（_payload._status 持久化）。
 * 插件 statusBar 组件无 props（壳 renderPluginStatusBar 渲染 <Comp /> 同款）。
 */

import React, { Suspense, useEffect, useMemo, useRef } from "react";
import { cssUrlForRenderPath, retainPluginCss, releasePluginCss } from "../plugin-component/bundleCss"; // E6#15：bundle 插件 css <link>（池=挂载文档）
import ErrorBoundary from "../error-boundary/ErrorBoundary"; // E5.7#20：池侧版（不 import 壳 components 目录）

// 模块级 lazy 缓存——React.lazy 组件类型稳定，避免每次渲染 new → unmount
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lazy 缓存组件类型（同 PluginComponent _lazyCache 模式）
const _lazyCache = new Map<string, React.ComponentType<any>>();

interface PoolStatusBarComponentProps {
  pluginId: string;
  /** 自绘状态栏组件归一化 URL（marker componentRenderPath——dev /@fs 源码 .tsx | prod linkdesk:// dist statusBar.bundle.js） */
  renderPath?: string;
}

export default function PoolStatusBarComponent({ pluginId, renderPath }: PoolStatusBarComponentProps) {
  const LazyComponent = useMemo(() => {
    if (!renderPath) return null;
    const cached = _lazyCache.get(renderPath);
    if (cached) return cached;

    // E6#62d：URL 轨直动态 import（dev /@fs 源码由 Vite 即时编译；prod linkdesk:// 协议 root-direct 直解析）。
    // @vite-ignore：运行时拼的 URL，Vite 静态分析扫不到（与 PluginComponent resolvePluginViewLoader URL 轨同款）。
    const component = React.lazy(() =>
      import(/* @vite-ignore */ renderPath)
        .then((mod) => ({
          default: mod?.default ?? (() => null), // 无 default 导出 → 渲染空（状态栏位无 UI 不炸布局）
        }))
        // 🔴 失败不永久缓存 rejected：剔除缓存条目，让下次挂载重试（loader 首错可能是瞬态——镜像
        // PluginComponent；永久缓存=组件砖到重启）。console 上报错误边界同级诊断。
        .catch((err) => {
          _lazyCache.delete(renderPath);
          console.error(`[PoolStatusBarComponent] 插件 "${pluginId}" 状态栏组件加载失败:`, err);
          throw err;
        }),
    );
    _lazyCache.set(renderPath, component);
    return component;
  }, [pluginId, renderPath]);

  // E6#62d（镜像 PluginComponent E6#15）：renderPath 是编译表面（*.bundle.js → 派生根 index.bundle.css）
  // 时注入该插件 css——编译表面无 style-inject（chunk 无 html 消费方），css 只能由挂载方 <link> 载入；
  // 源码 .tsx（/@fs dev 源码轨）由 Vite style-inject 进本文档，不需此处。引用计数防多实例共享一份 link
  // 被提前拆（serial 灯/口数在左区单实例，保险同 PluginComponent 模式）。
  const retainedCss = useRef(false);
  useEffect(() => {
    if (!renderPath) return;
    const syncUrl = cssUrlForRenderPath(renderPath);
    if (!syncUrl) return;
    retainedCss.current = true;
    retainPluginCss(pluginId, syncUrl);
    return () => {
      if (retainedCss.current) {
        retainedCss.current = false;
        releasePluginCss(pluginId);
      }
    };
  }, [pluginId, renderPath]);

  if (!LazyComponent) return null;

  return (
    <ErrorBoundary pluginId={pluginId}>
      <Suspense fallback={null}>
        <LazyComponent />
      </Suspense>
    </ErrorBoundary>
  );
}
