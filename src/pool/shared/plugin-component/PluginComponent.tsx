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
 *    原生主题系统（E5.6#2 教训）。Monaco 由编辑器插件的 bootstrapMonaco() 首次加载
 *    （E5.8#24.8 护栏统一——取 monaco 只能走 getMonaco()）。
 */

import React, { Suspense, useEffect, useMemo, useRef } from "react";
import { cssUrlForRenderPath, retainPluginCss, releasePluginCss } from "./bundleCss"; // E6#15：bundle 插件 css <link>（池=视图挂载文档）
import { useTranslation } from "react-i18next";
import i18n from "../../../i18n";
import ErrorBoundary from "../error-boundary/ErrorBoundary"; // E5.7#20：池侧版（不 import 壳 components 目录）

// ── import.meta.glob：Vite 预扫描插件入口 ──
// src/pool/ → ../../ = 项目根 → plugins/
const pluginModules = {
  ...import.meta.glob("../../plugins/builtin/*/src/index.tsx"),
  ...import.meta.glob("../../plugins/user/*/src/index.tsx"),
};

// E5.6#11e：view 文件 glob——按 renderPath O(1) 查找侧栏 view 组件。
// loader.ts 用完全相同格式的 key（../../plugins/.../src/views/Xxx.tsx）。
const viewModules = {
  ...import.meta.glob("../../plugins/builtin/*/src/views/**/*.tsx"),
  ...import.meta.glob("../../plugins/user/*/src/views/**/*.tsx"),
};

// E5.6#11-fix7：模块级 lazy 缓存——React.lazy 内部 _payload._status 持久化在组件类型上。
// 同 renderPath 返回同一组件类型→第二次挂载直接渲染（_status=Resolved），跳过 Suspense。
// E5.7#98：插件视图 props 契约 + 动态 import 模块形状——替代 ComponentType<any> / Promise<any>
type PluginViewProps = { isActive: boolean; tabId?: string; sourceId?: string };
type PluginModule = { default?: React.ComponentType<PluginViewProps> };
const _lazyCache = new Map<string, React.ComponentType<PluginViewProps>>();

interface PluginComponentProps {
  pluginId: string;
  isActive: boolean;
  tabId?: string;
  sourceId?: string;
  /** E5.6#11e：侧栏 view 的 renderPath——loader.ts 存的 glob key。提供时优先此路径加载组件。 */
  renderPath?: string;
}

export default function PluginComponent({ pluginId, isActive, tabId, sourceId, renderPath }: PluginComponentProps) {
  const { t } = useTranslation();
  // React.lazy 必须稳定引用——useMemo 按 pluginId + renderPath 缓存，防止每次渲染 new → unmount → flicker
  // E5.6#11e：renderPath 优先——O(1) 直接查找 view 组件；fallback 到 pluginId 匹配 index.tsx（主区用）
  // E5.6#11-fix7：_lazyCache 跨 mount 持久化 lazy 组件类型——React.lazy _payload._status 不随 unmount 丢失。
  // 切容器回来时同 renderPath 的组件类型直接 Resolved→同步渲染→无 Suspense "加载中..." 闪烁。
  const cacheKey = renderPath || pluginId;
  const LazyComponent = useMemo(() => {
    const cached = _lazyCache.get(cacheKey);
    if (cached) return cached;

    let loader: (() => Promise<unknown>) | undefined;

    if (renderPath) {
      // 侧栏 view：按 loader.ts 存的 glob key O(1) 查找
      loader = viewModules[renderPath];
    }

    if (!loader) {
      // 主区 tab / fallback：按 pluginId 匹配 index.tsx
      let modulePath: string | undefined;
      for (const path of Object.keys(pluginModules)) {
        if (path.includes(`/${pluginId}/`)) {
          modulePath = path;
          break;
        }
      }
      loader = modulePath ? pluginModules[modulePath] : undefined;
    }

    // 🔥 E5.6#11.5-fix：import.meta.glob 是构建时扫描——运行时安装的插件不在 glob 中。
    // fallback 到动态 import()。
    // renderPath 可能有两种格式：
    //   1. glob key: "../../plugins/user/<id>/src/views/Xxx.tsx"
    //   2. /@fs/ URL（runtime 插件无 pluginRoot 时）: "/@fs/E:/.../plugins/user/<id>/src/views/Xxx.tsx"
    if (!loader) {
      const lk = window.linkdesk;
      const isDev = import.meta.env.DEV;
      if (renderPath && (renderPath.startsWith("/@fs/") || renderPath.startsWith("linkdesk://"))) {
        // runtime 插件——renderPath 已是完整 URL，直接用
        loader = () => import(/* @vite-ignore */ renderPath);
      } else if (lk?.plugins?.resolvePath) {
        loader = (async () => {
          try {
            const absPath: string = await lk.plugins.resolvePath(pluginId);
            if (renderPath) {
              // glob key 格式：../../plugins/<type>/<id>/<rest> → 提取插件内相对路径
              const idx = renderPath.indexOf(`/${pluginId}/`);
              const rel = idx !== -1
                ? renderPath.slice(idx + pluginId.length + 2)
                : renderPath.split("/").slice(3).join("/");
              const url = isDev ? `/@fs/${absPath}/${rel}` : `linkdesk://${pluginId}/${rel}`;
              const mod = await import(/* @vite-ignore */ url);
              return mod;
            } else {
              // 主区 tab：默认入口。E6#7：.linkdesk-plugin 解压包 JS 入口恒 index.bundle.js
              // （磁盘格式事实），源码/运行时插件 = manifest.entry（缺省 src/index.tsx）——
              // 经 resolveEntry 拿 { root, entry } 拼 URL，不写死 src/index.tsx（index.bundle.js
              // 才是打包入口）。resolveEntry 缺失/无入口（纯贡献插件不该走到组件加载）→
              // 落回 resolvePath + src/index.tsx legacy 兜底。
              if (lk?.plugins?.resolveEntry) {
                const info = await lk.plugins.resolveEntry(pluginId);
                if (info?.root && info?.entry) {
                  const url = isDev
                    ? `/@fs/${info.root}/${info.entry}`
                    : `linkdesk://${pluginId}/${info.entry}`;
                  const mod = await import(/* @vite-ignore */ url);
                  return mod;
                }
              }
              const url = isDev ? `/@fs/${absPath}/src/index.tsx` : `linkdesk://${pluginId}/src/index.tsx`;
              const mod = await import(/* @vite-ignore */ url);
              return mod;
            }
          } catch (e) {
            console.error(`[PluginComponent] 动态加载插件 "${pluginId}" 失败:`, e);
            return null;
          }
        });
      }
    }

    if (!loader) return null;

    const component = React.lazy<React.ComponentType<PluginViewProps>>(() =>
      loader!().then((mod) => {
        // glob/动态 import 模块命名空间——按 PluginModule 形状窄化（E5.7#98 替代 mod: any）
        const m = mod as PluginModule | null;
        if (!m) throw new Error(i18n.t("插件 {{id}} 加载失败", { id: pluginId }));
        return {
          default: m.default || (() => {
            throw new Error(i18n.t("插件 {{id}} 未导出 default 组件", { id: pluginId }));
          }),
        };
      }),
    );
    _lazyCache.set(cacheKey, component);
    return component;
  }, [cacheKey, renderPath, pluginId]);

  // E6#15：bundle 插件 css <link> 生命周期（引用计数，pool 文档）——
  // 视图面 renderPath 同步可判编译表面（*.bundle.js → 派生根 index.bundle.css）；主区 entry
  // 无 renderPath——resolveEntry 异步判 bundle（{bundle, root}）。retain 在首次挂载前注入（本组件
  // effect 先于 Suspense 子视图解析提交——样式就位才首帧），release 在末实例卸载归零移除。
  const retainedCss = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const release = () => {
      if (retainedCss.current) {
        retainedCss.current = false;
        releasePluginCss(pluginId);
      }
    };
    const syncUrl = cssUrlForRenderPath(renderPath);
    if (syncUrl) {
      retainedCss.current = true;
      retainPluginCss(pluginId, syncUrl);
      return release;
    }
    if (!renderPath) {
      void (async () => {
        const lk = window.linkdesk;
        const info = await lk?.plugins?.resolveEntry?.(pluginId);
        if (cancelled || !info?.bundle || !info?.root) return;
        retainedCss.current = true;
        const rootUrl = import.meta.env.DEV ? `/@fs/${info.root}` : `linkdesk://${pluginId}`;
        retainPluginCss(pluginId, `${rootUrl}/index.bundle.css`);
      })();
    }
    return release;
  }, [pluginId, renderPath]);

  if (!LazyComponent) {
    return (
      <div className="plugin-missing-view">
        <p>{t('插件 "{{id}}" 不可用', { id: pluginId })}</p>
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
              fontSize: "var(--font-size-md)", /* E5.8 Phase 12 #171：13→md */
              userSelect: "none",
            }}
          >
            {t("加载中...")}
          </div>
        }
      >
        <LazyComponent isActive={isActive} tabId={tabId} sourceId={sourceId} />
      </Suspense>
    </ErrorBoundary>
  );
}
