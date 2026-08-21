/**
 * marketplaceShared — 模块级搜索状态 + 共享数据 hook。
 * E3.6 E36#7.1：4 个 view 各自独立渲染，不共享 React Context，
 * 搜索状态必须是模块级的——setSearch 后所有 view 同步过滤。
 *
 * 🛡️ _loadingPromise 确保多个 view 同时 mount 时只发一次 IPC。
 * 对标 initPluginLoader 的 _loadingPromise 模式（#59c Bug 1 教训）。
 */

import { useState, useCallback, useEffect } from "react";
// E5.7#98：_allPlugins 数据源是 pluginManager.list()（IPC 序列化子集）——消费 PluginListEntry，
// 非 ViewPluginEntry（后者带 component 字段，IPC 不可达）
// E5.8#20-c：契约化——插件列表类型走 @linkdesk/contracts（零 @src/core）
import type { PluginListEntry } from "@linkdesk/contracts";
// E5.6#11.5e：@src/core 清零——onPluginLifecycleChange/ViewContainerService → lk.events.on
const lk = () => window.linkdesk;

const pm = () => window.linkdesk?.pluginManager;

/* ═══ 模块级搜索状态 ═══ */

let _search = "";
const _searchListeners = new Set<() => void>();

export function getMarketplaceSearch(): string {
  return _search;
}

export function setMarketplaceSearch(v: string): void {
  _search = v;
  _searchListeners.forEach((fn) => fn());
}

export function onMarketplaceSearchChange(fn: () => void): () => void {
  _searchListeners.add(fn);
  return () => {
    _searchListeners.delete(fn);
  };
}

/* ═══ 共享数据 hook ═══ */

let _loadingPromise: Promise<void> | null = null;
let _allPlugins: PluginListEntry[] = [];
let _disabledPlugins: Array<{
  pluginId: string;
  name: string;
  description?: string;
  version?: string;
}> = [];
let _uninstalledPlugins: Array<{
  pluginId: string;
  name: string;
  description?: string;
  version?: string;
}> = [];
const _dataListeners = new Set<() => void>();

function notifyDataListeners(): void {
  _dataListeners.forEach((fn) => fn());
}

async function refreshData(): Promise<void> {
  try {
    const [plugins, disabled, uninstalled] = await Promise.all([
      pm().list(),
      pm().getDisabled(),
      pm().getUninstalled(),
    ]);
    _allPlugins = plugins;
    _disabledPlugins = disabled;
    _uninstalledPlugins = uninstalled;
  } catch (e) {
    console.error("[marketplace] refreshData IPC 失败——插件列表数据可能为空:", e);
  }
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
  emit("marketplace:updateBadge", { ...self, viewId: "uninstalled", count: _uninstalledPlugins.length });
}

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

      /* 订阅插件生命周期变更——安装/卸载/启用/禁用后自动刷新 */
      const unsubLifecycle = lk()?.events?.on("plugin-lifecycle:changed", () => {
        refreshData().then(() => {
          notifyDataListeners();
          updateAllBadges();
        });
      });
      _dataListeners.add(rerender);

      return () => {
        _dataListeners.delete(rerender);
        unsubLifecycle();
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

  /* 过滤辅助——两套数据形状不同：ViewPluginEntry.manifest.name vs { name } */
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
  const disabled = _disabledPlugins.filter(
    (p) => matchSearch(p.name, p.pluginId, p.description),
  );
  const uninstalled = _uninstalledPlugins.filter(
    (p) => matchSearch(p.name, p.pluginId, p.description),
  );

  return {
    loading: _loadingPromise === null,
    installed,
    builtin,
    disabled,
    uninstalled,
    refresh: () => refreshData().then(() => notifyDataListeners()),
  };
}
