/**
 * marketplaceShared — 模块级搜索状态 + 共享数据 hook + 市场目录 store。
 * E3.6 E36#7.1：多个 view 各自独立渲染，不共享 React Context，
 * 搜索状态必须是模块级的——setSearch 后所有 view 同步过滤。
 *
 * 🛡️ _loadingPromise 确保多个 view 同时 mount 时只发一次 IPC。
 * 对标 initPluginLoader 的 _loadingPromise 模式（#59c Bug 1 教训）。
 *
 * E6#30d：本地插件「待安装（.disabled 文件扫描）」站退役——探索插件改市场目录驱动，
 * getUninstalled 不再被本插件消费（loader.ts 第 7 步已退役）；目录数据经 marketSources
 * （fetch/5min 缓存/多源合并）拉取，store 落本模块供 useMarketplaceCatalog 消费。
 */

import { useState, useCallback, useEffect, useMemo } from "react";
// E5.7#98：_allPlugins 数据源是 pluginManager.list()（IPC 序列化子集）——消费 PluginListEntry，
// 非 ViewPluginEntry（后者带 component 字段，IPC 不可达）
// E5.8#20-c：契约化——插件列表类型走 @linkdesk/contracts（零 @src/core）
import type { PluginListEntry } from "@linkdesk/contracts";
// #30.9b 失败 toast 文案走 i18n.t——非组件模块 import i18next 默认实例（serial-monitor 先例；
// 插件 i18n 资源已按 ns="translation" 合并进全局实例，t(key) 直取中英）
import i18n from "i18next";
import { loadCatalog, forceRefreshCatalog } from "./marketSources";
import type { CatalogLoadResult } from "./marketSources";
import type { CatalogEntry } from "./marketCatalog";
// E6#71k「都问」：重试也要过确认门——门位在本模块 retryMarketInstall（三入口单点），"不 import 门" 无从豁免
import { confirmMarketInstallById } from "./installGate";
// E6#33a 发现调度（2026-09-08 锚② 重裁：市场池首载调度——本模块被全部市场池面 import，任意面首挂载即触发一趟
// 延迟发现；scheduleStartupDiscovery 内置池门控，壳进程 import 本模块不调度不跑）——见 updateDiscovery 头注
import { scheduleStartupDiscovery } from "./updateDiscovery";
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

/* ═══ #64 A1/A2 事件型失败统一入口（2026-09-09 定案——toast = 操作回执；禁弹大框、禁页面长红字推 UI） ═══
 * marketplace 全视图共用一个失败通道：右下角 error toast（E6#13.5 notifications.show，settle 同源）。
 * 显示文本由调用方 t() 解析成当前语言传入（组件本地译）——与 settle 侧模块 i18n.t 同汇壳层单渲染。 */

/** 发一条 error toast——进程不可用（预览环境/壳进程）静默 no-op，不影响调用方流程 */
/** E6#73g（S5）：市场自己的 source id——机器读的归属键，人类可读名由壳解析（见壳 `notif.ts`）。
 *  **一处定义、全部市场通知引用**：分组键必须同一个字面量，写散 = 同一次操作被劈成两组。 */
export const MARKET_SOURCE = "marketplace";

/** 发一条 error toast——进程不可用（预览环境/壳进程）静默 no-op，不影响调用方流程 */
export function notifyError(message: string): void {
  const show = lk()?.notifications?.show;
  // E6#73g（S5）：市场自报身份——本条与全部安装回执同属一个来源桶（面板一组、常驻配额一份）
  if (show) void show(message, { type: "error", source: MARKET_SOURCE });
}

/* ═══ 本地插件共享数据 hook（已安装/内置/已禁用） ═══ */

let _loadingPromise: Promise<void> | null = null;
let _allPlugins: PluginListEntry[] = [];
let _disabledPlugins: Array<{
  pluginId: string;
  name: string;
  description?: string;
  version?: string;
  core?: boolean; // E6#30.5b：禁用态 core 透传（守 E6#18 详情页藏卸载钮——禁用分支卸载钮需要它）
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

function scheduleDataRefresh(): void {
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

/** #30.9b 失败归因——七种失败全览收敛成五类可重试归因 + conflict（09 §二 表）
 *  E6#73e：+ `http4xx` / `http5xx`（HTTP 状态码族单列，见下方字典注释） */
export type InstallFailReason =
  | "network" | "integrity" | "env" | "package" | "conflict"
  | "http4xx" | "http5xx"
  | "unknown";

/* ═══ #30.9b 失败归因纯函数——主进程错误原文是中文/英文混杂自由文本（installWithProgress settle
 * 契约无 reason 枚举——11-API §一·一 的 reason 字段是设计虚构，实机双证），按子串字典收敛成类别。
 * 字典匹配顺序重要：完整性（checksum/size）窄，环境（磁盘），包损坏，冲突。
 * E6#73e（机器二）：**HTTP 状态码优先于网络桶**，且裸 `HTTP` 已从 NET_RE 摘掉——此前一条 `HTTP`
 *   子串吃掉所有 404/403/500，下载链接失效被报成「网络连接不可用」，用户于是反复查网络反复重试
 *   （真相 = 那个地址已经没了，而重试的其实是另一个插件）。分组判据 = 「可重试 / 需人工」：
 *   5xx（含 408/429）服务端瞬时状态 → 可重试；4xx → 确定性拒绝，重试无用。 */
const HTTP_STATUS_RE = /HTTP[ /]?(\d{3})/i;
const NET_RE = /下载中断|下载失败|下载超时|超时|网络|fetch|ECONN|ENOTFOUND|ENETUNREACH|socket|net::|Failed to fetch|Network Error/i;
const INT_RE = /checksum|校验|哈希|digest|sha|大小不符|文件大小|Content-Length/i;
const ENV_RE = /磁盘|空间不足|ENOSPC|EACCES|EPERM|权限|quota/i;
const PKG_RE = /解压|zip|不是有效|invalid|plugin\.json|ENOENT|无法读取|损坏|corrupt/i;
const CON_RE = /已存在安装目录|已存在|请先卸载|覆盖/i;

export function classifyInstallError(msg: string | undefined): InstallFailReason {
  if (!msg) return "unknown";
  if (CON_RE.test(msg)) return "conflict";
  const http = HTTP_STATUS_RE.exec(msg);
  if (http) {
    const code = Number(http[1]);
    if (code >= 400 && code < 500) return "http4xx";
    if (code >= 500) return "http5xx";
  }
  if (NET_RE.test(msg)) return "network";
  if (INT_RE.test(msg)) return "integrity";
  if (ENV_RE.test(msg)) return "env";
  if (PKG_RE.test(msg)) return "package";
  return "unknown";
}

/** 归因 → i18n key（= 中文原文，硬约束 2）；UI 层 t(key) 取当前语言译文 */
export function installFailLabelKey(reason: InstallFailReason): string {
  switch (reason) {
    case "network":
      return "安装失败：网络连接不可用";
    case "integrity":
      return "安装失败：文件校验未通过";
    case "env":
      return "安装失败：磁盘空间不足";
    case "package":
      return "安装失败：插件包损坏";
    case "conflict":
      return "安装失败：该插件已安装，如需覆盖请先卸载";
    case "http4xx":
      return "安装失败：下载地址无效或已被服务器拒绝";
    case "http5xx":
      return "安装失败：服务器暂时不可用，请稍后重试";
    default:
      // E6#73e：撤「未知错误」谎——认不出时真因由 failText 直显引擎原文（同 E6#71b 更新域先例）
      return "安装失败，请重试";
  }
}

/** 归因 → 更新失败 i18n key（E6#33b——与安装同分类语义；conflict 分支 E6#71b 补上——CON_RE 触发词
 *  已存在/覆盖/请先卸载在更新域罕见但非不可能，防御性给句不落 unknown）。E6#71b：default 撤「未知错误」谎
 *  → 通用重试语（真因由 updateFailText 原文直显，不靠归类猜）。 */
export function updateFailLabelKey(reason: InstallFailReason): string {
  switch (reason) {
    case "network":
      return "更新失败：网络连接不可用";
    case "integrity":
      return "更新失败：文件校验未通过";
    case "env":
      return "更新失败：磁盘空间不足";
    case "package":
      return "更新失败：插件包损坏";
    case "conflict":
      return "更新失败：该插件已安装，如需覆盖请先卸载";
    case "http4xx":
      return "更新失败：下载地址无效或已被服务器拒绝";
    case "http5xx":
      return "更新失败：服务器暂时不可用，请稍后重试";
    default:
      return "更新失败，请重试";
  }
}

/** 失败终局文案的**组合规则**（E6#73e 机器二：参数化抽出，安装/更新两域共用**同一份**实现）。
 *  归因可认 → 归因短语（t 译当前语言）；认不出（unknown）→ **引擎原文直显**（引擎报错本就是完整可读句
 *  ——「不在用户安装区」「无需更新」「未找到安装目录」…——原文比「未知错误」诚实，且免误导归类：
 *  安装域五个类目词对更新域状态/策略错不成立，硬塞会让「不在用户安装区」显示成「插件包损坏」）；
 *  原文为空 → 兜底通用重试语。
 *  `labelKeyFn` 由域决定（安装域 `installFailLabelKey` / 更新域 `updateFailLabelKey`）——**不得再落第二份同构拷贝**。 */
export function failText(
  t: (key: string) => string,
  labelKeyFn: (reason: InstallFailReason) => string,
  reason: InstallFailReason,
  raw?: string,
): string {
  if (reason !== "unknown") return t(labelKeyFn(reason));
  const s = (raw ?? "").trim();
  return s ? s : t(labelKeyFn("unknown"));
}

/** E6#71b：更新失败终局文案——`failText` 的更新域薄包装（零自有逻辑） */
export function updateFailText(t: (key: string) => string, reason: InstallFailReason, raw?: string): string {
  return failText(t, updateFailLabelKey, reason, raw);
}

/** 会话 stage → 安装中进度标签（i18n key + 插值）——详情按钮与探索行共用单实现（归一化） */
export function marketInstallStageLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  stage: string | undefined,
  percent: number | undefined,
): string {
  if (stage === "validating") return t("校验中...");
  if (stage === "downloading") return percent != null ? t("下载中 {{percent}}%", { percent }) : t("下载中...");
  if (stage === "extracting") return t("解压中...");
  if (stage === "loading") return t("加载中...");
  return t("安装中...");
}

/* ═══ E6#73c 第 2 步（18 档 §五 I.7）：并发闸交给壳，本模块只剩「发起 + 终局回执」 ═══
 *
 * 🔴 **已拆的两样东西**（第 1 步的过渡态，本步整段退役）：
 *   ① `_installSession` 模块级单例——它是今天唯一的 N=1 闸，命中即静默丢弃请求（连点 7 个 = 装 1 丢 6）；
 *   ② `_installQueue` 串行泵——第 1 步用它把「静默丢弃」换成「可见等待」，但同一时刻仍只跑一单。
 *   现在并发上限（N=3）、FIFO 顺序、同插件去重、槽级看门狗**全部归壳侧 `install-queue.ts`**——
 *   本模块不再持有任何队列状态，也不再订阅 `plugin:installProgress`（进度经 `plugin:installJobs`
 *   的 job 行表达，见 `installJobs.ts`）。
 *
 * 本模块对安装还剩两件事：
 *   a. **发起**——`startMarketInstall` 直呼 `installWithProgress`（壳侧 `installPlugin` 全队列唯一入口）；
 *   b. **终局回执**——失败时推一条带 [重试] 的 toast（成功由 lifecycle 消费端唯一发声，见 73h D2）。
 *
 * ⚠️ 本模块**不画进度**（73d 起 job 行是进度的唯一出处）——同一面板里再挂一条自己的进度条
 * = 同一次安装两行，用户看到的是「装了两遍」。故也不需要 NotificationHandle 句柄管理。 ═══ */

/** 显示名解析——目录条目名兜底 pluginId（失败 toast 文案用；目录未加载/不在目录 = 裸 id 诚实显示） */
function pluginDisplayNameOf(pluginId: string): string {
  return _catalogResult.entries.find((e) => e.id === pluginId)?.name ?? pluginId;
}

/** 失败终局——归因 + 失败 toast[重试]。返回 false 供调用方直接当结果用。
 *  行内失败态由 job 行表达（壳侧 job 表 terminal:"failed" + error；市场视图经 `useInstallJob` 读），
 *  本函数不再写任何会话状态。 */
async function settleInstallFailure(pluginId: string, downloadUrl: string, error: string | undefined): Promise<boolean> {
  const reason = classifyInstallError(error);
  // 失败 toast = 事件通道（右下角唯一事件反馈，11-API §三）——归因文案 + [重试] 主动作
  // （消费 E6#13.5f actions；command 走既有命令系统，marketplace.retryInstall 注册在 marketplaceShared
  //  模块顶 ensureMarketplaceCommands——本模块被全部市场池面 import，任意视图激活即注册，toast 落点不再
  //  依赖市场落地页 index.tsx 加载；args 带 pluginId+downloadUrl 使 [重试] 不依赖会话残留自给自足）。
  //  行内错误态由消费方从会话读。
  // E6#71j：失败 toast 长驻（persistent:true → 壳 ttl:0 不自动消失）——归因诊断需要时间读、用户决定重试
  //  还是放弃，不该 8s 静默溜走；常驻类互相淘汰（壳侧**按来源分桶各 5 条**，E6#73f S3 起，
  //  超出顶掉同来源最老的并在该组给「另有 N 条已折叠」汇总），不越摞越多。
  const show = lk()?.notifications?.show;
  if (show) {
    // E6#73e：① **带插件名**——此前只报「安装失败：网络连接不可用」，连点几个时用户不知道是哪一个；
    //         ② 归因认不出时**直显引擎原文**（failText，同 E6#71b 更新域先例）——「未知错误」是谎，
    //            用户得拿真因去判断该重试还是该放弃。
    const failName = pluginDisplayNameOf(pluginId);
    const failReasonText = failText((k) => i18n.t(k), installFailLabelKey, reason, error);
    void show(i18n.t("{{name}}：{{reason}}", { name: failName, reason: failReasonText }), {
      type: "error",
      // E6#73g（S5）：归市场来源桶——连装 N 个的失败条同组、共享那 5 条常驻配额（73f S3），
      // 且不会因「来源缺失」被劈进「其他」组跟无关通知混在一起。
      source: MARKET_SOURCE,
      persistent: true,
      actions: [
        {
          id: "retry",
          label: i18n.t("重试"),
          isPrimary: true,
          command: "marketplace.retryInstall",
          args: [{ pluginId, downloadUrl }],
        },
      ],
    });
  }
  return false;
}

/**
 * 单次安装——**直呼** `installWithProgress(downloadUrl, 身份)`，本模块不排队、不限流、不去重。
 *
 * 并发上限（N=3）、FIFO 顺序、同插件去重、排队回执、槽级看门狗全在壳侧 `installPlugin`
 * （全队列唯一入口，两条腿——包源/目录源——同一条队列）。池侧读到的进度/排队态经
 * `plugin:installJobs` 广播回流（见 `installJobs.ts`）。
 *
 * 成功 → 显式 refreshData（30.5e 实机回归：缺依赖的挂起安装 parkForDependencies 后不发任何 lifecycle
 * 事件——onDidInstall 只在成功激活发，挂起不入——事件驱动翻态对 pending 失效；
 * 显式 refresh 统一覆盖 enabled/pending，与事件驱动刷新 microtask 合并幂等）。
 * `installWithProgress` 不 throw（失败 resolve `{success:false, error}`，lifecycle-ops 实证）——
 * 仍留 catch：极端下壳面 reject 也要有终局，不能让调用方的按钮永远转圈。
 */
async function runMarketInstall(pluginId: string, name: string, downloadUrl: string): Promise<boolean> {
  const inst = lk()?.pluginManager?.installWithProgress;
  if (!inst) return false;
  try {
    // E6#73c 第 1 步：请求侧身份随行——壳侧 job 表按 pluginId 去重、job 行取显示名，而两者只有池侧知道
    // （第三个参数见 types.ts PluginInstallRequestOpts；jobId 不在此——它是壳侧 job 表的产物）。
    const r = await inst(downloadUrl, { pluginId, displayName: name, origin: "user" });
    // E6#73d：用户点「取消安装」——**不是失败**。壳侧已把那条 job 整条撤掉（不留红行），本模块也绝不走
    // settleInstallFailure（那会推一条带 [重试] 的错误 toast：用户刚亲口说不要，再问一遍要不要重试
    // = 拿他的决定去烦他）。
    if (r?.cancelled) return false;
    if (r && !r.success) return settleInstallFailure(pluginId, downloadUrl, r.error ?? "");
    scheduleDataRefresh();
    return true;
  } catch (e) {
    return settleInstallFailure(pluginId, downloadUrl, e instanceof Error ? e.message : String(e));
  }
}

/**
 * 在途安装登记——`pluginId → 本单 promise`。**这不是队列**：并发全开（上限在壳），这里只做一件事——
 * 保证「同一个插件的同一次安装只有一个 promise、只走一次终局回执」。
 *
 * 为什么壳侧已按 pluginId 去重了、这里还要一道：两份调用方各自 `await installWithProgress` 会拿到
 * **同一个结果对象**（壳侧去重命中的第二方 `waitInstallJob` 等第一方）⇒ 失败时**两条一模一样的
 * 失败 toast**。壳管的是「装几次」，这里管的是「报几次」。
 */
const _openInstalls = new Map<string, Promise<boolean>>();

/**
 * 发起市场安装——直呼壳侧安装入口，返回**本单**结果。无队列、无 N=1 闸（E6#73c 第 2 步）。
 *
 * 同 pluginId 已在途 → 复用同一 promise（点两下不是两件事，两个调用方等同一结果，只推一条失败回执）。
 * 重试 = 手动触发（行内 [重试]/toast [重试]）无自动风暴。
 */
export function startMarketInstall(
  pluginId: string,
  downloadUrl: string,
  displayName?: string,
): Promise<boolean> {
  if (!lk()?.pluginManager?.installWithProgress) return Promise.resolve(false);
  const open = _openInstalls.get(pluginId);
  if (open) return open;
  const p = runMarketInstall(pluginId, displayName ?? pluginDisplayNameOf(pluginId), downloadUrl).finally(() => {
    _openInstalls.delete(pluginId);
  });
  _openInstalls.set(pluginId, p);
  return p;
}

/**
 * 重试安装（#30.9b [重试] 入口——toast 命令 / 详情页行内钮 / 侧栏行内钮，三入口共用）。
 * 重发同一安装，无自动风暴。
 *
 * E6#71k「都问」：**重试也要过一次确认门**——重试不是「用户刚点过所以免问」的豁免券：失败可能隔了很久、
 * 期间用户早忘了装的什么、从哪来。此处是**单点门位**（三个重试入口全部经本函数，无第二条路），
 * 门内按 pluginId 现查目录条目构造富内容卡；条目查不到（离线/下架）→ 回落纯文字确认，仍要问。
 * `displayName` 只用于回落确认的显示名（有目录条目时忽略）。
 */
export async function retryMarketInstall(
  pluginId: string,
  downloadUrl: string,
  displayName?: string,
): Promise<boolean> {
  if (!pluginId || !downloadUrl) return false;
  if (!(await confirmMarketInstallById(pluginId, displayName))) return false;
  return startMarketInstall(pluginId, downloadUrl, displayName);
}

/* ═══ #30.9b 离线态（G3——navigator.onLine；离线 ≠ 失败：按钮置灰 + 提示，无 [重试]）═══ */

/** 在线状态 hook——online/offline 事件驱动（恢复联网按钮自动回可用，不打扰，09 §二·一） */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/* ═══ E6#71g marketplace 命令组注册（模块级——原 index.tsx 迁入，注册随任一市场视图激活） ═══
 * 背景：marketplace.enable/disable/uninstall/retryInstall + gear 菜单原只在 index.tsx 模块顶注册
 * （市场落地页标签打开才执行）。但安装/卸载失败 toast 在 DetailView/ExploreView 触发（import 本模块，
 * 不经 index.tsx）→ 壳 executeCommand 需壳 CommandRegistry 占位（池 commands:register 同步元数据）——
 * 落地页未打开 = 未注册 = console.warn no-op → toast [重试] 点击无反应（71g 实机 bug 根因）。
 * 本模块被全部市场池面 import（侧栏已装/禁用/内置、探索、详情、落地页）——迁移后注册随任一视图
 * 激活即生效，池侧 handler 进 _poolCommands；壳进程经 glob loader 执行 marketplace entry（index →
 * marketplaceShared）启动即注册 → toast 落点自给自足，不再依赖落地页打开。 */
let _marketplaceCommandsRegistered = false;

function ensureMarketplaceCommands(): void {
  if (_marketplaceCommandsRegistered) return;
  _marketplaceCommandsRegistered = true;

  // E5.7#56：零 @src/core import——插件入口模块双进程执行（壳 glob loader + 池视图渲染）。
  // 注册走 window.linkdesk.commands：壳侧半程 → commands:registerShell → 壳注册表真实条目
  // （handler 存壳 preload 页面世界代理，执行 _executeShellLocal 桥回）；池侧半程 →
  // commands:register → 元数据同步 + 池 _poolCommands 存 handler。两半程幂等汇合
  // （registerShellLocalCommand / registerPoolCommandMetadata 各有已有条目分支）。
  // 菜单 slot ID 用字符串字面量（serial-monitor E5.6#11.5h 同款——MenuId 不再 import）。
  const reg = lk().commands?.registerCommand;
  if (!reg) return; // 双进程执行——壳/池 preload 均含 commands 命名空间（#56 后），守卫防旧环境

  // handler 不声明 _token——两半程 infra 均已剥离 token 占位后才调 handler：
  // 池侧 executeCommand 剥 undefined 占位；壳侧 registerShellLocalCommand 桥剥 _token。
  // handler 直接收 realArgs（file-tree E5.6 池侧注册同款约定）。
  reg(
    "marketplace.enable",
    async (...args: unknown[]) => {
      const ctx = args[0] as { pluginId?: string } | undefined;
      if (ctx?.pluginId) await pm().enable(ctx.pluginId);
    },
    { title: "启用" },
  );

  reg(
    "marketplace.disable",
    async (...args: unknown[]) => {
      const ctx = args[0] as { pluginId?: string } | undefined;
      if (ctx?.pluginId) await pm().disable(ctx.pluginId);
    },
    { title: "禁用" },
  );

  reg(
    "marketplace.uninstall",
    async (...args: unknown[]) => {
      const ctx = args[0] as { pluginId?: string } | undefined;
      if (ctx?.pluginId) await pm().uninstall(ctx.pluginId);
    },
    { title: "卸载" },
  );

  // E6#30.9b：失败 toast [重试] 主动作落点（消费 E6#13.5f actions）——args 带 pluginId+downloadUrl
  // （settleInstallFailure 构造），自给自足。E6#73c 第 2 步起**不再回落会话读取**（会话单例已拆）——
  // 缺任一参数即静默不发（[重试] 的构造点必带两者，缺 = 不是本命令的调用）。
  reg(
    "marketplace.retryInstall",
    async (...args: unknown[]) => {
      const ctx = (args[0] ?? {}) as { pluginId?: string; downloadUrl?: string } | undefined;
      if (ctx?.pluginId && ctx.downloadUrl) await retryMarketInstall(ctx.pluginId, ctx.downloadUrl);
    },
    { title: "重试安装" },
  );

  lk().menu?.registerItems?.("marketplaceItemGear", "marketplace", [
    { command: "core.openSettings", group: "navigation", when: "extensionHasConfiguration" },
    { command: "theme.pick", group: "navigation", when: "extensionHasThemes" }, // E5.8#50.24：theme.pick 归一化命令 id
    { command: "workbench.action.selectLanguage", group: "navigation", when: "extensionHasLanguages" },
    { command: "workbench.action.selectIconTheme", group: "navigation", when: "extensionHasIconThemes" },
    { command: "workbench.action.openExtensionKeybindings", group: "navigation", when: "extensionHasKeybindings" },
    { command: "marketplace.enable", group: "navigation", when: "pluginDisabled" },
    { command: "marketplace.disable", group: "navigation", when: "!pluginDisabled" },
    { command: "marketplace.uninstall", group: "delete" },
  ]);
}

/* ═══ E6#33a 启动发现调度（模块级每进程一次；池门控见 scheduleStartupDiscovery） ═══
 * 任意市场池面首次 import 本模块（侧栏已装/禁用/内置、详情、主区 tab 首挂载都经 marketplaceShared）→
 * 调度一趟 ~10s 延迟发现（05 §一·四）：拉目录比版本 → 有新版推铃铛（每版一次幂等）+ 落 store（#33b 徽标/升级入口
 * + #33d 自动更新数据源）。壳进程也 import 本模块（marketplace entry 双进程执行）→ 无 notifications.show →
 * 调度内置门控返回，壳零改动零新面。 */
/* E6#71g：命令注册随模块加载执行（幂等 guard）——任意市场池面 import 本模块即注册（含壳进程 startup） */
ensureMarketplaceCommands();
scheduleStartupDiscovery();
