/**
 * PluginDetailViewHost——E6#30.10b。
 *
 * plugin-detail 标签页渲染宿主——主区详情贡献面的三态路由（市场 UI 归市场插件拥有，10-市场UI拥有权.md §三）：
 *   1. 活跃 marketplace 插件贡献详情面（tab.detailViewRenderPath 非空）→ 动态加载贡献 DetailView，
 *      传运行时 props 契约（pluginId=详情目标 / pinned / isActive；marketEntry 由 30.11c 数据管道打通后宿主注入）。
 *   2. 贡献加载失败（import 抛错 / 无 default 导出）→ 壳 PluginDetailPoolView 保底。
 *   3. 无贡献（detailViewRenderPath 空——市场插件删/禁/未激活）→ 壳 PluginDetailPoolView 保底。
 *
 * 渲染期判定天然覆盖「删市场插件→保底」——detailViewRenderPath/detailContributorId 由壳每次 pushLayout
 * 现场解析盖章（usePoolSync/windowLayout.ts resolveActiveMarketDetailContribution），无章即无贡献，
 * 无需壳在推流后另行撤销。
 *
 * 加载链 = resolvePluginViewLoader（PluginComponent 提取的单实现，PluginComponent.tsx 导出）——与侧栏/主区
 * 视图同一条 import 链，glob key / linkdesk:// / /@fs/ 全形态通用。pluginId 传贡献插件 id（detailContributorId，
 *  ≠ 详情目标 detailPluginId——resolvePath 要的是贡献插件根）。
 *
 * 所有数据走 window.linkdesk.* IPC（不 import @src/core value——Path B 合规；type-only 契约导入除外）。
 */

import { useEffect, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { PoolTab } from "../../../core/types/pool/poolLayout"; // type-only —— PoolTab 契约
import { resolvePluginViewLoader } from "../../shared/plugin-component/PluginComponent";
import { cssUrlForRenderPath, retainPluginCss, releasePluginCss } from "../../shared/plugin-component/bundleCss"; // E6#15：bundle 插件 css <link>
import PluginDetailPoolView from "./PluginDetailPoolView";

/** E6#30.10b/c：plugin-detail 主区贡献视图运行时 props 契约——结构式（池宿主与插件视图各自本地声明，
 *  字符串即契约，插件不 import 池类型）。pluginId=详情目标插件 ID（详情页展示谁）；pinned=标签页固定态；
 *  isActive=当前活跃；marketEntry=目录条目（E6#31 数据管道打通后宿主注入——30.11c 起非 undefined）。 */
export interface PluginDetailContributedProps {
  pluginId?: string;
  pinned?: boolean;
  isActive: boolean;
  marketEntry?: unknown;
}

type ContributedModule = { default?: ComponentType<PluginDetailContributedProps> };

interface PluginDetailViewHostProps {
  tab: PoolTab;
  isActive: boolean;
}

export default function PluginDetailViewHost({ tab, isActive }: PluginDetailViewHostProps) {
  const { t } = useTranslation();
  const renderPath = tab.detailViewRenderPath;
  const contributorId = tab.detailContributorId;
  const detailPluginId = tab.detailPluginId;

  const [Contributed, setContributed] = useState<ComponentType<PluginDetailContributedProps> | null>(null);
  const [failed, setFailed] = useState(false);

  // E6#30.10b：贡献视图异步加载——失败/无贡献落壳保底。不缓存 rejected（卸载/重装/换贡献者后
  // detailViewRenderPath/detailContributorId 变化 → effect 重跑 → 全新加载重试；同路径复用 Contributed）。
  useEffect(() => {
    let alive = true;
    // 目标变化先复位——防旧贡献者视图闪现在新目标上（卸载后旧章残留的一帧也不用担心：无章直接保底）
    setContributed(null);
    setFailed(false);
    if (!renderPath || !contributorId) return;
    const loader = resolvePluginViewLoader(contributorId, renderPath);
    if (!loader) {
      setFailed(true);
      return;
    }
    loader()
      .then((mod) => {
        if (!alive) return;
        const m = mod as ContributedModule | null;
        const comp = m?.default;
        if (comp) {
          // 组件类型本身是函数——setState 直传会被当 updater 调用，必须 () => comp 形态（镜像 PluginComponent）
          setContributed(() => comp);
        } else {
          console.error(`[PluginDetailViewHost] 详情贡献无 default 导出，落壳保底: ${renderPath}`);
          setFailed(true);
        }
      })
      .catch((err) => {
        console.error(`[PluginDetailViewHost] 详情贡献加载失败，落壳保底: ${renderPath}`, err);
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [renderPath, contributorId]);

  // E6#15：bundle 插件 css <link> 生命周期（镜像 PluginComponent——池 = 插件视图挂载文档）。
  // 贡献面 renderPath 是编译表面（*.bundle.js）时注入根 index.bundle.css；源码/开发形态由 Vite style-inject 进本文档。
  const retainedCss = useRef(false);
  useEffect(() => {
    const release = () => {
      if (retainedCss.current) {
        retainedCss.current = false;
        if (contributorId) releasePluginCss(contributorId);
      }
    };
    const syncUrl = cssUrlForRenderPath(renderPath);
    if (syncUrl && contributorId) {
      retainedCss.current = true;
      retainPluginCss(contributorId, syncUrl);
      return release;
    }
    return release;
  }, [contributorId, renderPath]);

  const fallback: ReactNode = <PluginDetailPoolView pluginId={detailPluginId} />;

  if (!renderPath || !contributorId || failed) return fallback;
  if (!Contributed) {
    return (
      <div
        className="plugin-loading"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--text-muted)",
          fontSize: "var(--font-size-md)",
          userSelect: "none",
        }}
      >
        {t("加载中...")}
      </div>
    );
  }
  return <Contributed pluginId={detailPluginId} pinned={tab.pinned} isActive={isActive} />;
}
