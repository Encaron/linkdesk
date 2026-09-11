/**
 * catalogStore — 市场**目录**共享 store（远端 catalog 的本地投影）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketplaceShared.ts` 原样搬出，零行为变更。
 *
 * 依赖方向：marketSources / marketCatalog → 本文件（叶子方向，本文件不 import 其余子模块）。
 * `_catalogResult` 的**唯一属主就是本文件**——其余子模块要取目录条目（如失败 toast 要显示插件名）
 * 一律经本文件导出的 accessor，不许另存一份（0d.10-8「模块级 mutable 状态各归单域属主」）。
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { loadCatalog, forceRefreshCatalog } from "../marketSources";
import type { CatalogLoadResult } from "../marketSources";
import type { CatalogEntry } from "../marketCatalog";

const lk = () => window.linkdesk;

/* ═══ 市场目录共享 store（E6#30a/30c/30f） ═══
 * 探索插件视图驱动源——marketSources.loadCatalog（官方 + 配置作者源，5min 缓存，多源合并）。
 * 首次 useMarketplaceCatalog mount 触发加载（_catalogPromise 防并发），refresh 走 forceRefreshCatalog。
 * result 暴露 state/errors/usedStale/sourceNames——空态防御 + 来源标注 + 失败诊断展示。 */

let _catalogPromise: Promise<void> | null = null;
/** 是否至少完成过一趟加载——初始默认结果（offline 空目录）只在「从未加载」时是占位；
 *  resolved 后即便 offline 也是真实空态（ExploreView 据此区分加载中 vs 真离线，防闪一帧「无法加载」） */
let _catalogResolvedOnce = false;
let _catalogResult: CatalogLoadResult = {
  entries: [],
  state: "offline",
  errors: [],
  sourceNames: [],
  usedStale: false,
  fetchedAt: 0,
};
const _catalogListeners = new Set<() => void>();

function notifyCatalogListeners(): void {
  _catalogListeners.forEach((fn) => fn());
}

/** 目录条目显示名（失败 toast 文案用）——不在目录 / 目录未加载 = 裸 pluginId 诚实显示 */
export function pluginDisplayNameOf(pluginId: string): string {
  return _catalogResult.entries.find((e) => e.id === pluginId)?.name ?? pluginId;
}

/* E6#30c：配置变更自动刷新——marketplaceSources 增删源后目录即时重拉（免等 5min 缓存/免手动）。
 * 模块级常驻订阅（单一注册守卫）：目录 store 是模块单例——订阅随模块活，不回随组件卸载。
 * 组件级订阅会漏「源列表变更时 ExploreView 未挂载」→ 商店页打开仍旧目录。故本订阅模块级、永不拆。
 * 回调走 forceRefreshCatalog（清缓存 + 强拉全部当前源——getSourceUrls 每次重读配置，新源即在列）。 */
let _configWatchStarted = false;

function ensureCatalogConfigWatch(): void {
  if (_configWatchStarted) return;
  _configWatchStarted = true;
  const cfg = lk()?.configuration;
  const sub = cfg?.onChange?.("marketplace.marketplaceSources", () => {
    forceRefreshCatalog()
      .then((r) => {
        _catalogResult = r;
        notifyCatalogListeners();
      })
      .catch(() => {
        /* 刷新失败保持旧结果——目录防御已降级 */
      });
  });
  if (!sub) _configWatchStarted = false; // onChange 不可用（预览环境）→ 下次 mount 再试
}

export function useMarketplaceCatalog() {
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let active = true;

    // E6#30c：源配置变更自动刷新——挂首个目录消费者即注册模块级 watch（回随模块活，不回随本组件）
    ensureCatalogConfigWatch();

    const init = async () => {
      if (!_catalogPromise) {
        _catalogPromise = loadCatalog().then((r) => {
          _catalogResult = r;
          _catalogResolvedOnce = true;
        });
      }
      await _catalogPromise;
      if (!active) return;
      rerender();
    };

    init();
    _catalogListeners.add(rerender);
    return () => {
      _catalogListeners.delete(rerender);
      active = false;
    };
  }, [rerender]);

  return {
    ..._catalogResult,
    loading: !_catalogResolvedOnce,
    refresh: () =>
      forceRefreshCatalog()
        .then((r) => {
          _catalogResult = r;
          notifyCatalogListeners();
        })
        .catch(() => {
          /* 刷新失败保持旧结果——目录防御已降级 */
        }),
  };
}

/** E6#33b：目录条目 id 索引——已装/内置/禁用列表行「可更新」判定共用（updateToVersion 查目录），
 *  与详情页/发现同源同一把钥匙（目录条目 id = pluginId）。entries 引用变化即重建（目录重拉后徽标自动翻新）。 */
export function useCatalogEntryById(): ReadonlyMap<string, CatalogEntry> {
  const catalog = useMarketplaceCatalog();
  return useMemo(() => {
    const m = new Map<string, CatalogEntry>();
    for (const e of catalog.entries) m.set(e.id, e);
    return m;
  }, [catalog.entries]);
}
