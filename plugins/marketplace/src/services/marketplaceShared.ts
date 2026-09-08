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

/* ═══ 市场安装会话 store（E6#30.5b 首建——详情页未装行🟢安装带进度；#30.9a 侧栏行徽标消费同源） ═══
 * 安装进度 = 单活跃会话模型。installProgress 事件两源并流（主进程 download/extract 段 + 池 lifecycle
 * validating/downloading/loading/done 段）——除 loading/done 外全阶段**不带 pluginId**（lifecycle-ops
 * installPackageFromSource 实证），无法按插件归因。故发起动作 startMarketInstall(id, url) 先占会话，
 * 事件无 id 一律归活跃会话；done → 清会话（lifecycle:changed 已驱动列表翻态），error → 会话转失败态
 * （phase:"error"，消费方画「安装失败」+ [重试]，30.9b 消费）。
 * 铁律 19：installProgress 是 IPC 通道——订阅走引用计数（≥1 消费方挂载才注册 events.on，0 卸载）。
 *   events.on 返回退订函数；done/error 由事件或 settle 兜底双写（幂等）。 */
export type MarketInstallSession = {
  pluginId: string;
  phase: "installing" | "error";
  /** 原始 stage——validating/downloading/extracting/loading/done/error（UI 层映射 i18n 标签） */
  stage?: string;
  /** 下载百分比（Content-Length 可得时 downloading 段带） */
  percent?: number;
  /** 失败原文（phase:"error"）——来自 installWithProgress settle 或 installProgress error 事件 */
  error?: string;
  /** #30.9b：失败原文归因（installFailLabelKey → toast/行文案）；非 error 态无 */
  reason?: InstallFailReason;
  /** #30.9b：发起安装的下载地址——失败态保留供 [重试]（command args 或会话自读） */
  downloadUrl?: string;
};

/** #30.9b 失败归因——七种失败全览收敛成五类可重试归因 + conflict（09 §二 表） */
export type InstallFailReason = "network" | "integrity" | "env" | "package" | "conflict" | "unknown";

/* ═══ #30.9b 失败归因纯函数——主进程错误原文是中文/英文混杂自由文本（installWithProgress settle
 * 契约无 reason 枚举——11-API §一·一 的 reason 字段是设计虚构，实机双证），按子串字典收敛成类别。
 * 字典匹配顺序重要：网络最宽（HTTP/fetch/超时），完整性（checksum/size）窄，环境（磁盘），包损坏，冲突。 */
const NET_RE = /下载中断|下载失败|HTTP|超时|网络|fetch|ECONN|ENOTFOUND|ENETUNREACH|socket|net::|Failed to fetch|Network Error/i;
const INT_RE = /checksum|校验|哈希|digest|sha|大小不符|文件大小|Content-Length/i;
const ENV_RE = /磁盘|空间不足|ENOSPC|EACCES|EPERM|权限|quota/i;
const PKG_RE = /解压|zip|不是有效|invalid|plugin\.json|ENOENT|无法读取|损坏|corrupt/i;
const CON_RE = /已存在安装目录|已存在|请先卸载|覆盖/i;

export function classifyInstallError(msg: string | undefined): InstallFailReason {
  if (!msg) return "unknown";
  if (CON_RE.test(msg)) return "conflict";
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
    default:
      return "安装失败：未知错误，请重试";
  }
}

/** 归因 → 更新失败 i18n key（E6#33b——与安装同分类语义；conflict 对更新不适用 → 归 unknown 兜底）。
 *  update 失败走行内归因 + 手动 [重试]（同安装 M4 三），原文进 title 悬停。 */
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
    default:
      return "更新失败：未知错误，请重试";
  }
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

let _installSession: MarketInstallSession | null = null;
const _installListeners = new Set<() => void>();
let _installSub: (() => void) | null = null;
let _installSubUsers = 0;

type InstallProgressPayload = { stage?: string; pluginId?: string; message?: string; percent?: number };

function notifyMarketInstall(): void {
  _installListeners.forEach((fn) => fn());
}

/** installProgress 事件摄入——done 清会话 / error 转失败态 / 其余并入阶段。事件无 pluginId 归活跃会话。 */
function ingestInstallProgress(p: InstallProgressPayload): void {
  if (!_installSession) return;
  const { stage, message, percent, pluginId } = p ?? {};
  if (pluginId && pluginId !== _installSession.pluginId) return; // 他人安装的 loading/done 不干扰本会话
  if (stage === "done") {
    _installSession = null;
  } else if (stage === "error") {
    const err = message ?? _installSession.error;
    _installSession = { ..._installSession, phase: "error", error: err, reason: classifyInstallError(err) };
  } else if (stage) {
    _installSession = {
      ..._installSession,
      phase: "installing",
      stage,
      percent: percent ?? (stage === "downloading" ? _installSession.percent : undefined),
    };
  }
  notifyMarketInstall();
}

function mountInstallProgressSub(): void {
  _installSubUsers += 1;
  if (_installSubUsers > 1 || _installSub) return;
  _installSub = lk()?.events?.on<InstallProgressPayload>("plugin:installProgress", ingestInstallProgress) ?? null;
}

function unmountInstallProgressSub(): void {
  _installSubUsers -= 1;
  if (_installSubUsers > 0) return;
  _installSub?.();
  _installSub = null;
}

/** 订阅当前安装会话——空 = 无进行中/失败安装。mount 即注册 progress 订阅（引用计数，最后一个卸载撤） */
export function useMarketInstall(): MarketInstallSession | null {
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    mountInstallProgressSub();
    _installListeners.add(rerender);
    return () => {
      _installListeners.delete(rerender);
      unmountInstallProgressSub();
    };
  }, [rerender]);
  return _installSession;
}

/**
 * 发起市场安装——占会话 + installWithProgress(downloadUrl)。成功 → 清会话 + 显式 refreshData
 * （30.5e 实机回归：依赖缺失的挂起安装 parkForDependencies 后不发任何 lifecycle 事件——onDidInstall 只在
 * 成功激活发，挂起不入——lifecycle 事件驱动翻态对 pending 失效；显式 refresh 统一覆盖 enabled/pending，
 * 与事件驱动刷新 microtask 合并幂等）。失败 → 会话转 phase:"error" + 归因 + 失败 toast[重试]
 * （#30.9b：error 文案双源——installProgress error 事件 / settle 兜底，幂等；错误原文归因成 reason，
 *  安装地址保留供重试）。返回 bool。重试 = 手动触发（行内 [重试]/toast [重试]）无自动风暴。
 */
async function settleInstallFailure(pluginId: string, downloadUrl: string, error: string | undefined): Promise<boolean> {
  const reason = classifyInstallError(error);
  _installSession = { pluginId, phase: "error", error, reason, downloadUrl };
  notifyMarketInstall();
  // 失败 toast = 事件通道（右下角唯一事件反馈，11-API §三）——归因文案 + [重试] 主动作
  // （消费 E6#13.5f actions；command 走既有命令系统，index.tsx 注册 marketplace.retryInstall，
  //  args 带 pluginId+downloadUrl 使 [重试] 不依赖会话残留自给自足）。行内错误态由消费方从会话读。
  const show = lk()?.notifications?.show;
  if (show) {
    void show(i18n.t(installFailLabelKey(reason)), {
      type: "error",
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

export async function startMarketInstall(pluginId: string, downloadUrl: string): Promise<boolean> {
  const inst = lk()?.pluginManager?.installWithProgress;
  if (!inst) return false;
  // 单活跃会话模型（进度事件多段不带 pluginId，无法归因）——另一插件进行中不并发，防进度串扰
  if (_installSession && _installSession.phase === "installing" && _installSession.pluginId !== pluginId) {
    return false;
  }
  _installSession = { pluginId, phase: "installing", stage: "validating", downloadUrl };
  notifyMarketInstall();
  try {
    // installWithProgress 不 throw——失败 resolve { success:false, error }（lifecycle-ops 实证）
    const r = await inst(downloadUrl);
    if (r && !r.success) return settleInstallFailure(pluginId, downloadUrl, r.error ?? "");
    _installSession = null;
    notifyMarketInstall();
    scheduleDataRefresh();
    return true;
  } catch (e) {
    return settleInstallFailure(pluginId, downloadUrl, e instanceof Error ? e.message : String(e));
  }
}

/** 重试安装（#30.9b [重试] 入口——toast command / 行内重试钮共用）——重发同一安装，无自动风暴 */
export function retryMarketInstall(pluginId: string, downloadUrl: string): Promise<boolean> {
  if (!pluginId || !downloadUrl) return Promise.resolve(false);
  return startMarketInstall(pluginId, downloadUrl);
}

/** 读当前会话——command handler 等非组件入口（retry command 无 hook，模块级直读） */
export function getMarketInstallSession(): MarketInstallSession | null {
  return _installSession;
}

/** 关掉失败会话（行内错误态关闭后清——#30.9b 手动，无自动清） */
export function dismissMarketInstallError(): void {
  if (_installSession?.phase === "error") {
    _installSession = null;
    notifyMarketInstall();
  }
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

/* ═══ E6#33a 启动发现调度（模块级每进程一次；池门控见 scheduleStartupDiscovery） ═══
 * 任意市场池面首次 import 本模块（侧栏已装/禁用/内置、详情、主区 tab 首挂载都经 marketplaceShared）→
 * 调度一趟 ~10s 延迟发现（05 §一·四）：拉目录比版本 → 有新版推铃铛（每版一次幂等）+ 落 store（#33b 徽标/升级入口
 * + #33d 自动更新数据源）。壳进程也 import 本模块（marketplace entry 双进程执行）→ 无 notifications.show →
 * 调度内置门控返回，壳零改动零新面。 */
scheduleStartupDiscovery();
