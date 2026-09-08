/**
 * PluginComponent——E5.6#7d。
 *
 * 给定 pluginId（主区 tab）+ 可选 renderPath（侧栏/主区 contributes.views），按 URL 动态 import——
 * React.lazy 懒加载。E6#62b 收单 URL 轨：import.meta.glob 预扫映射表（pluginModules/viewModules）已随
 * 源码 glob 轨退役整删——renderPath 恒归一化 URL（dev /@fs 源码、prod linkdesk:// dist），无第二张映射表。
 * ErrorBoundary 兜底崩溃，Suspense 显示加载态。
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

// ── E6#62b：源码 glob 双表（pluginModules/viewModules）已退役整删 ──
// 池侧两表 mis-root 恒空（../../ 自 src/pool/shared/plugin-component/ 落 src/pool/plugins——不存在），
// 渲染恒走 URL/IPC 回退轨；#62b 代码取证后再删——壳零 import、构建时静态展开本就看
// 不到「运行时才出现的目录」（池加载唯一执行者 = 运行时动态 import）。真 glob 消费（PoolStatusBarComponent）
// 属 #62d 拆——此处只清本文件的空表 + 查找。

// E5.6#11-fix7：模块级 lazy 缓存——React.lazy 内部 _payload._status 持久化在组件类型上。
// 同 renderPath 返回同一组件类型→第二次挂载直接渲染（_status=Resolved），跳过 Suspense。
// E5.7#98：插件视图 props 契约 + 动态 import 模块形状——替代 ComponentType<any> / Promise<any>
type PluginViewProps = { isActive: boolean; tabId?: string; sourceId?: string };
type PluginModule = { default?: React.ComponentType<PluginViewProps> };
const _lazyCache = new Map<string, React.ComponentType<PluginViewProps>>();

/**
 * E6#30.10b + #62b：池侧插件视图 loader 解析单实现——PluginComponent（主区/侧栏视图）与 plugin-detail
 * 主区贡献宿主（PluginDetailViewHost）共用同一条加载链。抽自原 useMemo body，两侧行为必须一致（不同
 * URL 形态判定会静默 404）：
 *   ① renderPath 完整 URL（/@fs | linkdesk://，parseContributions 归一化）→ 直动态 import（唯一 URL 轨）
 *   ② 主区 tab（无 renderPath）：lk.plugins.resolveEntry 拼 URL（index.bundle.js / manifest.entry）兜底
 *   glob 预扫映射表已随 E6#62b 整删——构建时静态展开对「运行时才出现的目录」本就不可见，URL 轨是唯一可靠路径。
 *  pluginId = 待加载模块的归属插件（贡献/宿主插件本身）。⚠️ plugin-detail 详情页里它 ≠ detailPluginId
 *  （被展示的插件）——贡献视图由活跃 marketplace 插件渲染，resolvePath 要的是贡献插件根。
 */
export function resolvePluginViewLoader(pluginId: string, renderPath?: string): (() => Promise<unknown>) | null {
  let loader: (() => Promise<unknown>) | undefined;

  // 🔥 E6#62b：URL 轨直动态 import——renderPath 恒归一化 URL：
  //   1. "/@fs/E:/.../plugins/<id>/<render>"（dev 源码——resolveRuntimePluginRoot = resolvePath IPC 拼）
  //   2. "linkdesk://<id>/<render>"（prod dist——协议 root-direct 直解析）
  // @vite-ignore：运行时拼的 URL，Vite 静态分析扫不到（/@fs 下 dev 源码仍由 Vite 即时编译）。
  if (renderPath && (renderPath.startsWith("/@fs/") || renderPath.startsWith("linkdesk://"))) {
    loader = () => import(/* @vite-ignore */ renderPath);
  }

  if (!loader) {
    const lk = window.linkdesk;
    const isDev = import.meta.env.DEV;
    if (lk?.plugins?.resolvePath) {
      loader = (async () => {
        try {
          const absPath: string = await lk.plugins.resolvePath(pluginId);
          if (renderPath) {
            // 非 URL renderPath 兜底 = repo 相对 mock key（仅 pool/dev/sampleLayout.ts 预览假数据形态
            // "../../plugins/<id>/<rest>"）→ 提取插件内相对路径经 resolvePath 拼 /@fs。真实注册
            // renderPath（parseContributions）恒 URL 走上方直 import——此支不会命中 Electron 运行时。
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

  return loader ?? null;
}

interface PluginComponentProps {
  pluginId: string;
  isActive: boolean;
  tabId?: string;
  sourceId?: string;
  /** E5.6#11e：侧栏/主区 view 的 renderPath——归一化 URL（/@fs | linkdesk://，parseContributions 拼）。提供时直动态 import 此 URL。 */
  renderPath?: string;
}

export default function PluginComponent({ pluginId, isActive, tabId, sourceId, renderPath }: PluginComponentProps) {
  const { t } = useTranslation();
  // React.lazy 必须稳定引用——useMemo 按 pluginId + renderPath 缓存，防止每次渲染 new → unmount → flicker
  // E6#62b：renderPath URL 轨直 import（侧栏/主区 contributes.views）；无 renderPath → resolveEntry 拼入口 URL（主区 tab）
  // E5.6#11-fix7：_lazyCache 跨 mount 持久化 lazy 组件类型——React.lazy _payload._status 不随 unmount 丢失。
  // 切容器回来时同 renderPath 的组件类型直接 Resolved→同步渲染→无 Suspense "加载中..." 闪烁。
  const cacheKey = renderPath || pluginId;
  const LazyComponent = useMemo(() => {
    const cached = _lazyCache.get(cacheKey);
    if (cached) return cached;

    // E6#30.10b：loader 单实现提取 resolvePluginViewLoader——与 PluginDetailViewHost 共用同一条加载链。
    const loader = resolvePluginViewLoader(pluginId, renderPath);
    if (!loader) return null;

    const component = React.lazy<React.ComponentType<PluginViewProps>>(() =>
      loader()
        .then((mod) => {
          // 动态 import 模块命名空间——按 PluginModule 形状窄化（E5.7#98 替代 mod: any）
          const m = mod as PluginModule | null;
          if (!m) throw new Error(i18n.t("插件 {{id}} 加载失败", { id: pluginId }));
          return {
            default: m.default || (() => {
              throw new Error(i18n.t("插件 {{id}} 未导出 default 组件", { id: pluginId }));
            }),
          };
        })
        // 🔴 失败不永久缓存 rejected：剔除缓存条目，让下次挂载重试（loader 首错可能是瞬态——
        // 运行时安装插件在安装广播/registry 落定窗口内被点开即 404；永久缓存=插件砖到重启）。
        // 成功才进缓存复用；rejected 只影响当前挂载实例（ErrorBoundary 兜底），下次全新挂载
        // useMemo 重跑 → _lazyCache 已空 → 重建 lazy 重试。
        .catch((err) => {
          _lazyCache.delete(cacheKey);
          throw err;
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
