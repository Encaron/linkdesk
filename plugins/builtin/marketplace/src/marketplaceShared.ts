/**
 * marketplaceShared — 模块级搜索状态 + 共享数据 hook。
 * E3.6 E36#7.1：4 个 view 各自独立渲染，不共享 React Context，
 * 搜索状态必须是模块级的——setSearch 后所有 view 同步过滤。
 *
 * 🛡️ _loadingPromise 确保多个 view 同时 mount 时只发一次 IPC。
 * 对标 initPluginLoader 的 _loadingPromise 模式（#59c Bug 1 教训）。
 */

import { useState, useCallback, useEffect } from "react";
import type { ViewPluginEntry } from "@src/core/api/types";
import { onPluginLifecycleChange } from "@src/pluginLoader/lifecycle";
import { ViewContainerService } from "@src/core/ViewContainerService";

const pm = () => (window as any).linkdesk?.pluginManager;

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
let _allPlugins: ViewPluginEntry[] = [];
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
  } catch {
    /* 静默——IPC 失败时保留旧数据 */
  }
}

/* ═══ badge 更新（模块级——数据加载 effect + 生命周期 + onDidChangeViews 三处调用） ═══ */

function updateAllBadges(): void {
  const setBadge = (viewId: string, count: number) => {
    const existing = ViewContainerService.getView(viewId);
    if (!existing) return;
    // 🔥 防止死循环：registerView 无条件 fire onDidChangeViews，
    // 如果 badge 值没变就跳过——否则事件→更新→事件→更新 无限循环
    if (existing.badge === count) return;
    ViewContainerService.registerView("marketplace", "marketplace", {
      id: viewId,
      title: existing.title,
      render: existing.render,
      badge: count,
    });
  };
  setBadge("installed", _allPlugins.filter((p) => !p.manifest.core).length);
  setBadge("builtin", _allPlugins.filter((p) => p.manifest.core).length);
  setBadge("disabled", _disabledPlugins.length);
  setBadge("uninstalled", _uninstalledPlugins.length);
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
      const unsubLifecycle = onPluginLifecycleChange.event(() => {
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

  /* 🔥 loader 异步 import view 组件后才注册——onDidChangeViews 兜底 */
  useEffect(() => {
    const sub = ViewContainerService.onDidChangeViews.event(({ containerId }) => {
      if (containerId === "marketplace") updateAllBadges();
    });
    return () => sub();
  }, []);

  const search = getMarketplaceSearch().toLowerCase();

  /* 过滤辅助——两套数据形状不同：ViewPluginEntry.manifest.name vs { name } */
  const matchSearch = (name: string, pluginId: string, description?: string): boolean => {
    if (!search) return true;
    return (
      name.toLowerCase().includes(search) ||
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
