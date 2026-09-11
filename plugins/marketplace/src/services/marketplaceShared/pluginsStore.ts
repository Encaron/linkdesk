/**
 * pluginsStore — 本地**已装/内置/已禁用**插件列表 store + 它的 hook + badge 广播。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketplaceShared.ts` 原样搬出，零行为变更。
 *
 * 依赖方向：searchState → 本文件（列表按搜索词过滤）；本文件不 import 目录 store / 通知 / 安装流。
 */

import { useState, useCallback, useEffect } from "react";
// E5.7#98：_allPlugins 数据源是 pluginManager.list()（IPC 序列化子集）——消费 PluginListEntry，
// 非 ViewPluginEntry（后者带 component 字段，IPC 不可达）
// E5.8#20-c：契约化——插件列表类型走 @linkdesk/contracts（零 @src/core）
import type { PluginListEntry } from "@linkdesk/contracts";
import { getMarketplaceSearch, onMarketplaceSearchChange } from "./searchState";

const lk = () => window.linkdesk;

const pm = () => window.linkdesk?.pluginManager;

/* ═══ 本地插件共享数据 hook（已安装/内置/已禁用） ═══ */

let _loadingPromise: Promise<void> | null = null;
let _allPlugins: PluginListEntry[] = [];
let _disabledPlugins: Array<{
  pluginId: string;
  name: string;
  description?: string;
  version?: string;
  core?: boolean; // E6#30.5b：禁用态 core 透传（守 E6#18 详情页藏卸载钮——禁用分支卸载钮需要它）
  updatable?: boolean; // E6#73j（G6）：住所透传——随包发货件（只读 app 根）不画「更新到 vX」死钮
}> = [];
const _dataListeners = new Set<() => void>();

function notifyDataListeners(): void {
  _dataListeners.forEach((fn) => fn());
}

async function refreshData(): Promise<void> {
  try {
    const [plugins, disabled] = await Promise.all([pm().list(), pm().getDisabled()]);
    _allPlugins = plugins;
    _disabledPlugins = disabled;
  } catch (e) {
    console.error("[marketplace] refreshData IPC 失败——插件列表数据可能为空:", e);
  }
}

/* ═══ 生命周期刷新节流（30.5c 实机回归） ═══
 * 两条通道：plugin:installed/plugin:uninstalled = 装卸跨窗广播（壳 loader events.emit → 主进程 → 池，
 * lifecycle.ts 消费端 6 注释「本通道供按插件消费方」）——实机实证 installWithProgress 装新插件只发此通道、
 * 不发 plugin-lifecycle:changed；后者 = 池本地状态切换（启用/禁用）nudge（data.ts 本地发非跨窗）。
 * 一次装卸可能连发多条 plugin:installed（实机 4 条）→ microtask 合并为一次 IPC 重拉。 */

let _refreshQueued = false;

/** 重拉已装列表（microtask 合并）——`useMarketplacePlugins.refresh` 是 React 绑定的同名动作，
 *  E6#73j 起也供**非组件上下文**调用（toast [重试] 命令的成功收敛），故导出。 */
export function scheduleDataRefresh(): void {
  if (_refreshQueued) return;
  _refreshQueued = true;
  queueMicrotask(() => {
    _refreshQueued = false;
    refreshData().then(() => {
      notifyDataListeners();
      updateAllBadges();
    });
  });
}

/* ═══ badge 更新（模块级——数据加载 effect + 生命周期 + onDidChangeViews 三处调用） ═══ */

function updateAllBadges(): void {
  // E5.6#11-fix：池内 ViewContainerService 是空实例，badge 走事件 emit→壳监听→壳 ViewContainerService 写入。
  // 壳 usePoolSync 订阅 "marketplace:updateBadge" → 更新壳侧 ViewContainerService → layoutVersion bump → 重推布局。
  // E5.8#41.9.2：payload 带 pluginId/containerId——插件自持身份（插件独立性），壳侧零硬编码（硬约束 10）
  const emit = lk()?.events?.emit;
  if (!emit) return;
  const self = { pluginId: "marketplace", containerId: "marketplace" };
  emit("marketplace:updateBadge", { ...self, viewId: "installed", count: _allPlugins.filter((p) => !p.manifest.core).length });
  emit("marketplace:updateBadge", { ...self, viewId: "builtin", count: _allPlugins.filter((p) => p.manifest.core).length });
  emit("marketplace:updateBadge", { ...self, viewId: "disabled", count: _disabledPlugins.length });
  // E6#30d：viewId "explore"（探索插件）无 badge——目录浏览是橱窗不是计数列表，语义同 VS Code 无徽标
}

/** 🛡️ `_loadingPromise` 确保多个 view 同时 mount 时只发一次 IPC。
 *  对标 initPluginLoader 的 _loadingPromise 模式（#59c Bug 1 教训）。 */
export function useMarketplacePlugins() {
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  /* 首次加载 + 生命周期订阅 + badge 更新 */
  useEffect(() => {
    let active = true;

    const init = async () => {
      if (!_loadingPromise) {
        _loadingPromise = refreshData();
      }
      await _loadingPromise;
      if (!active) return; // 🔥 Bug 4 防线——组件已卸载时不更新
      rerender();

      // 🔥 数据到了才更新 badge——不在 mount 时空跑
      updateAllBadges();

      /* 订阅插件生命周期变更——安装/卸载/启用/禁用后自动刷新（30.5c auto-flip 数据链）。
       * plugin:installed/plugin:uninstalled = 装卸广播（池必达，带 pluginId）；plugin-lifecycle:changed =
       * 池本地状态切换（启用/禁用）nudge。三通道同汇 scheduleDataRefresh（microtask 合并 burst）。 */
      const unsubs = [
        lk()?.events?.on("plugin:installed", scheduleDataRefresh),
        lk()?.events?.on("plugin:uninstalled", scheduleDataRefresh),
        lk()?.events?.on("plugin-lifecycle:changed", scheduleDataRefresh),
      ].filter(Boolean);
      _dataListeners.add(rerender);

      return () => {
        _dataListeners.delete(rerender);
        unsubs.forEach((u) => u && u());
      };
    };

    init();

    return () => {
      active = false;
    };
  }, [rerender]);

  /* 订阅搜索变化 */
  useEffect(() => {
    return onMarketplaceSearchChange(rerender);
  }, [rerender]);

  /* 🔥 loader 异步 import view 组件后才注册——viewContainer:changed 兜底 */
  useEffect(() => {
    const sub = lk()?.events?.on<{ containerId: string }>("viewContainer:changed", ({ containerId }) => {
      if (containerId === "marketplace") updateAllBadges();
    });
    return () => sub?.();
  }, []);

  const search = getMarketplaceSearch().toLowerCase();

  /* 过滤辅助 */
  const matchSearch = (name: string | undefined, pluginId: string, description?: string): boolean => {
    if (!search) return true;
    return (
      (name ?? "").toLowerCase().includes(search) ||
      pluginId.toLowerCase().includes(search) ||
      (description ?? "").toLowerCase().includes(search)
    );
  };

  const installed = _allPlugins.filter(
    (p) => !p.manifest.core && matchSearch(p.manifest.name, p.pluginId, p.manifest.description),
  );
  const builtin = _allPlugins.filter(
    (p) => p.manifest.core && matchSearch(p.manifest.name, p.pluginId, p.manifest.description),
  );
  const disabled = _disabledPlugins.filter((p) => matchSearch(p.name, p.pluginId, p.description));

  return {
    loading: _loadingPromise === null,
    // 全量未过滤列表——探索视图交叉比对（#30b catalog↔list）须与搜索词无关，不能用下方 filter 后的数组
    all: _allPlugins,
    installed,
    builtin,
    // disabled = 搜索过滤后；disabledRaw = 未过滤原组（详情视图 E6#30.11c 需按 pluginId 精确判禁用——
    //   list() 排除禁用插件，禁用已装 = getDisabled 才可见，不能吃搜索词过滤串扰）
    disabled,
    disabledRaw: _disabledPlugins,
    refresh: () => refreshData().then(() => notifyDataListeners()),
  };
}
