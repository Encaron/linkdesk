/**
 * DetailView——插件详情主区渲染面（contributes.views.main["plugin-detail"]，容器 "main" 由壳
 * ShellViewRenderer 在 plugin-detail 标签页消费——E6#30.10b）。
 *
 * E6#30.11 搬迁：布局从壳 PluginDetailPoolView 迁入（header / action bar / navbar / body + info 侧栏），
 * 零 @src/core——数据全走 window.linkdesk.* IPC + 本插件模块级 store。
 * 壳 PluginDetailPoolView 降级为保底宿主（无市场插件/无详情贡献时兜底，不崩）。
 *
 * E6#30.6 富展示：navbar 详情/功能/更改日志 三 tab；详情 = 截图画廊 + README（已装读包 / 未装 readmeUrl /
 * 降级 description）；功能 = contributes 四组渲染（DetailFeaturesTab）；更改日志 = 包内 CHANGELOG / 目录
 * versions（DetailChangelogTab）；元数据侧栏追加大小/来源/仓库/问题/许可证/分类/更新时间/首次发布/依赖/被依赖。
 *
 * 数据源（30.11c）：list()（已装实时状态）→ catalog（marketEntry，未装可显示）+ list() 实时合并。
 *   已装判定 = list()(启用) ∪ getDisabled()(禁用) 两源合并——list() EXCLUDES 禁用插件（实机探针实证），
 *   禁用已装必须经 disabledRaw 才可见，否则禁用瞬间塌成「未安装」。展示数据：启用 = list() 全 manifest
 *   （contributes/requires 随载荷带——实机 30.5e 实证；getDisabled 补 core 旗标透传）；
 *   禁用 = getDisabled 子集（name/description/version/core）。未装 = catalog 目录数据。
 *
 * 动作（30.11d + 30.5b）：enable/disable/uninstall 走 window.linkdesk.pluginManager.*；卸载二次确认走
 *   linkdesk.dialog.confirm。core:true 只藏卸载钮（E6#18a——UI 防误删旗标，命令/接口层可卸，含禁用态）。
 *   执行后本地不翻转状态——lifecycle 事件驱动 useMarketplacePlugins 自动 refreshData，视图随刷新收敛到真值。
 *
 * 30.6 富展示诚实边界（04 §三）：评分/评论/下载数/Star **不做**（无服务器不伪造，下载数 E6#30.8b 域）；
 * 「有更新」两版并排 = E6#33b（更新机制域）不在此行。README/CHANGELOG 本地读包只在包内存在该文件时命中
 * （E6#4a 打包补 README 前多为空 → 已装读包空则远端 readmeUrl 兜底，再空降级 description）。
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PluginIcon, Button, Badge, MarkdownView, OverlayPortal } from "@linkdesk/ui";
import {
  useMarketplacePlugins,
  useMarketplaceCatalog,
  useMarketInstall,
  useOnlineStatus,
  startMarketInstall,
  retryMarketInstall,
  dismissMarketInstallError,
  installFailLabelKey,
  marketInstallStageLabel,
} from "../services/marketplaceShared";
import type { CatalogEntry } from "../services/marketCatalog";
import { compareVersions } from "../services/marketCatalog";
import { categoryText } from "../services/marketCategories";
import { useDownloadCount } from "../services/downloadCounts";
import { readInstalledPackageFile } from "../services/packageFiles";
import DetailFeaturesTab from "./DetailFeaturesTab";
import DetailChangelogTab from "./DetailChangelogTab";
import "../styles/MarketplaceDetail.css";

/** 壳→插件详情贡献 props——结构式本地声明（池侧 PluginDetailViewHost 各执一份，字符串即契约） */
type DetailContributedProps = {
  pluginId?: string;
  pinned?: boolean;
  isActive: boolean;
  marketEntry?: unknown;
};

/** 展示合并对象——list() 全 manifest | getDisabled 子集 | null(未装) */
type DetailInfo = {
  manifest: { name?: string; version?: string; author?: string; description?: string; core?: boolean };
  pendingReason?: string;
};

/** requires/contributes 类型缺位（list 子集类型无 requires，载荷实带）——本地收窄，零 any */
const reqOf = (m?: unknown): string[] =>
  Array.isArray((m as { requires?: unknown })?.requires) ? ((m as { requires: string[] }).requires) : [];

const lk = () => window.linkdesk;
const pm = () => window.linkdesk?.pluginManager;

/** 目录条目 author 兼容 {name,url} / string 两种形态——抽展示名 */
function authorLabel(a: CatalogEntry["author"]): string | undefined {
  if (typeof a === "string") return a || undefined;
  return a?.name || undefined;
}

/** 字节可读化——KB/MB 通用单位零 i18n（诚实：来自目录 size，未装 = 包大小） */
function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 1024 * 10 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** 来源名（owner/repo 或 host/owner/repo）→ 仓库主页 URL——零新字段零服务器（04 §三） */
function repoHomeUrl(sourceName?: string): string | undefined {
  if (!sourceName) return undefined;
  const parts = sourceName.split("/");
  if (parts.length === 2) return `https://github.com/${sourceName}`; // github raw 形态 sourceNameOfUrl
  if (parts.length >= 3) return `https://${sourceName}`; // host/owner/repo（gitee 等）
  return undefined;
}

/** 下载数 → 千分位（作者数据 number 直显零 i18n） */
function fmtCount(n: number): string {
  return n.toLocaleString();
}

/** 元数据侧栏行——warn = 值需强调（E6#30.8c minApp 不足时标红提醒升级） */
function InfoItem({
  label,
  value,
  mono,
  warn,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  warn?: boolean;
}) {
  const cls = mono ? "mpd-info-value mono" : "mpd-info-value";
  return (
    <div className="mpd-info-item">
      <span className="mpd-info-label">{label}</span>
      {typeof value === "string" || typeof value === "number" ? (
        <span className={warn ? `${cls} warn` : cls}>{value}</span>
      ) : (
        <span className={cls}>{value}</span>
      )}
    </div>
  );
}

/** 元数据侧栏「—」空值占位（依赖/被依赖等无数据的诚实显示） */
function Dash() {
  return <span className="mpd-info-value mpd-info-dash">—</span>;
}

type TabId = "overview" | "features" | "changelog";

export default function DetailView({ pluginId }: DetailContributedProps) {
  const { t } = useTranslation();
  const { all, disabledRaw, loading: pluginsLoading } = useMarketplacePlugins();
  const catalog = useMarketplaceCatalog();
  const installSession = useMarketInstall();

  const [tab, setTab] = useState<TabId>("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* E6#30.8a：安装前富确认弹窗开关——mockup 帧 8（来源/发布者/许可证/版本/大小 + 安装即信任） */
  const [confirming, setConfirming] = useState(false);
  /* E6#30.8c：读壳版本号一次（app.getVersion）——minAppVersion 门禁比对基准（缺/读失败 = undefined 放行不拦） */
  const [appVersion, setAppVersion] = useState<string | undefined>(undefined);

  /* 壳版本号拉取（一次性、模块生命周期无关——非 IPC 监听，useEffect 安全） */
  useEffect(() => {
    let alive = true;
    const get = lk()?.app?.getVersion;
    if (!get) return;
    void get()
      .then((v: unknown) => {
        if (alive && typeof v === "string") setAppVersion(v);
      })
      .catch(() => {
        /* 读失败 → 保持 undefined（放行不拦，诚实） */
      });
    return () => {
      alive = false;
    };
  }, []);

  /* ── 已装判定 = list()(启用) ∪ disabledRaw(禁用)（30.11c 实时合并本意；实机回归实证见文件头） ── */
  const enabledEntry = all.find((p) => p.pluginId === pluginId) ?? null;
  const disabledHit = disabledRaw.find((p) => p.pluginId === pluginId) ?? null;
  const disabled = !!disabledHit;
  const installed = !!enabledEntry || !!disabledHit;
  const info: DetailInfo | null = enabledEntry
    ? {
        manifest: {
          name: enabledEntry.manifest.name,
          version: enabledEntry.manifest.version,
          author: enabledEntry.manifest.author,
          description: enabledEntry.manifest.description,
          core: enabledEntry.manifest.core,
        },
        pendingReason: enabledEntry.pendingReason,
      }
    : disabledHit
      ? {
          manifest: {
            name: disabledHit.name,
            version: disabledHit.version,
            description: disabledHit.description,
            core: disabledHit.core,
          },
        }
      : null;
  const entry: CatalogEntry | undefined = catalog.entries.find((e) => e.id === pluginId);

  /* E6#30.8b：下载数（GitHub 资产 read-only 计数）——本地无 marketEntry → hidden 不显示空位（诚实：无数据不造假） */
  const dl = useDownloadCount(!entry ? undefined : entry.downloadUrl);
  /* E6#30.8c：当前壳版本 < 插件 minAppVersion → 拒绝新装 + 元数据「需 LinkDesk」标红 */
  const appBelowMin =
    !!entry?.minAppVersion && !!appVersion && compareVersions(appVersion, entry.minAppVersion) < 0;

  /* 30.5e：挂起·缺依赖——pendingReason 有值 = 已装但依赖未就绪；缺失依赖 = requires − 已加载 */
  const pending = !!enabledEntry?.pendingReason;
  const missingDeps = useMemo(() => {
    if (!pending) return [] as string[];
    const req = reqOf(enabledEntry?.manifest);
    if (req.length === 0) return [];
    const loaded = new Set(all.filter((p) => !p.pendingReason).map((p) => p.pluginId));
    return req.filter((d) => !loaded.has(d));
  }, [pending, all, enabledEntry]);

  /* 缺失依赖展示名——已装名 / 目录名兜底 / 原始 id（缺失依赖未必在目录里，mono id 亦可读） */
  const depLabel = (dep: string): string => {
    const localName = all.find((p) => p.pluginId === dep)?.manifest.name;
    if (localName) return localName;
    return catalog.entries.find((e) => e.id === dep)?.name ?? dep;
  };

  /* ── 已装读包 + 未装远端 README（30.6b）——pkgReadme/pkgChangelog 只对已装读；remote 兜底 ── */
  const [pkgReadme, setPkgReadme] = useState<string | null | undefined>(undefined); // undefined=读取中
  const [pkgChangelog, setPkgChangelog] = useState<string | null | undefined>(undefined);
  const [remoteReadme, setRemoteReadme] = useState<string | null | undefined>(null); // undefined=读取中 / null=无需/不可得

  /* 切插件（宿主复用实例）重置 tab + 本地包文件状态 */
  useEffect(() => {
    setTab("overview");
  }, [pluginId]);

  useEffect(() => {
    let alive = true;
    setPkgReadme(undefined);
    setPkgChangelog(undefined);
    const id = pluginId ?? "";
    if (!id || !installed) {
      return () => {
        alive = false;
      };
    }
    void readInstalledPackageFile(id, "README.md").then((s) => {
      if (alive) setPkgReadme(s);
    });
    void readInstalledPackageFile(id, "CHANGELOG.md").then((s) => {
      if (alive) setPkgChangelog(s);
    });
    return () => {
      alive = false;
    };
  }, [pluginId, installed]);

  /* 远端 README——未装 fetch readmeUrl；已装包内 README 缺失时兜底（文件头 30.6b 三源回落） */
  const remoteReadmeUrl = entry?.readmeUrl ?? null;
  useEffect(() => {
    let alive = true;
    const id = pluginId ?? "";
    const wantRemote = !!id && !!remoteReadmeUrl && (!installed || pkgReadme === null);
    if (!wantRemote) return;
    setRemoteReadme(undefined);
    void fetch(remoteReadmeUrl as string)
      .then(async (r) => (r.ok ? r.text() : null))
      .catch(() => null)
      .then((s) => {
        if (alive) setRemoteReadme(typeof s === "string" && s.trim() ? s : null);
      });
    return () => {
      alive = false;
    };
  }, [pluginId, installed, pkgReadme, remoteReadmeUrl]);

  const handleEnable = useCallback(async () => {
    if (!pluginId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await pm().enable(pluginId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }, [pluginId, busy]);

  const handleDisable = useCallback(async () => {
    if (!pluginId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await pm().disable(pluginId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }, [pluginId, busy]);

  /* 卸载 = 二次确认（dialog.confirm——真实原语，mockup 帧 4「复用现有 confirm」）→ 执行。
   *   core:true 藏钮（#18），但命令层可卸；不确认不卸。 */
  const handleUninstall = useCallback(async () => {
    if (!pluginId || busy) return;
    const confirmApi = lk()?.dialog?.confirm;
    if (!confirmApi) return;
    // 确认文案用当前插件显示名——enabledEntry/disabledHit 是列表元素稳定引用（非每渲染新建对象），可入 deps
    const displayName = enabledEntry?.manifest.name ?? disabledHit?.name ?? pluginId ?? "";
    const ok = await confirmApi(t("确定卸载 {{name}} 吗？", { name: displayName }));
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await pm().uninstall(pluginId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }, [pluginId, busy, enabledEntry, disabledHit, t]);

  /* ── 30.5b 未装行 🟢安装（带进度）+ #30.9 失败/离线 ——单活跃会话 store（marketplaceShared）归因 ── */
  const installSessionHere =
    installSession !== null && installSession.pluginId === pluginId ? installSession : null;
  const installingHere = installSessionHere?.phase === "installing";
  /** #30.9b 本插件失败会话（phase:error）——行内「安装失败」+ [重试]（09 §二 M4 三）；离线不产生会话 */
  const installErrHere = installSessionHere?.phase === "error" ? installSessionHere : null;
  /* #30.9b 离线态（G3）——navigator.onLine false → 安装钮置灰 + 提示「联网后重试」，无 [重试] */
  const online = useOnlineStatus();

  const installLabel = (): string => marketInstallStageLabel(t, installSession?.stage, installSession?.percent);

  /* E6#30.8a/30.8c 安装门禁：缺下载地址 / 无安装面 / minAppVersion 不足 → setError 拦（确认弹窗前后双拦幂等）。
   *  minAppVersion 比对 = 当前壳版本 < 插件要求 → 拒装（未读到壳版本 = undefined 放行不拦——诚实不缺省拦装）。 */
  const installGateError = useCallback((): boolean => {
    // #30.9d：已装同版本/再装 → 提示不静默覆盖（正常 UI 已藏安装钮，此处防竞态——列表/catalog 交错
    //   翻态瞬间点装；禁用态同样已装，装 = 覆盖其目录不可静默）
    if (installed) {
      setError(t(installFailLabelKey("conflict")));
      return true;
    }
    // #30.9b 离线（G3）：离线 ≠ 失败——不发起安装，提示「联网后重试」（重试对断网无意义，无 [重试]）
    if (!online) {
      setError(t("联网后重试"));
      return true;
    }
    if (!entry?.downloadUrl) {
      setError(t("该插件缺少下载地址"));
      return true;
    }
    if (!pm()?.installWithProgress) {
      setError(t("安装失败"));
      return true;
    }
    if (entry?.minAppVersion && appVersion && compareVersions(appVersion, entry.minAppVersion) < 0) {
      setError(t("需升级 LinkDesk 至 {{version}} 才能安装", { version: entry.minAppVersion }));
      return true;
    }
    return false;
  }, [installed, online, entry, appVersion, t]);

  const runInstall = useCallback(async () => {
    if (!pluginId || busy || installingHere) return;
    if (installGateError()) return;
    const url = entry?.downloadUrl;
    if (!url) return; // gate 已保证有地址——双保险供 TS 收窄（闭包随渲染，不跨依赖漂移）
    setError(null);
    // 会话 store 负责归因 + 失败态；成功后 lifecycle 事件驱动列表翻态（30.5c），本视图随 info 收敛
    await startMarketInstall(pluginId, url);
  }, [pluginId, busy, installingHere, installGateError, entry]);

  /* 安装钮点击 = 弹确认（mockup 帧 8——安装即信任：来源/发布者/许可证/版本/大小），确认后 handleInstallConfirmed 执行 */
  const handleInstallClick = useCallback(() => {
    if (!pluginId || busy || installingHere) return;
    if (installGateError()) return;
    setError(null);
    setConfirming(true);
  }, [pluginId, busy, installingHere, installGateError]);

  const handleInstallConfirmed = useCallback(async () => {
    setConfirming(false);
    await runInstall();
  }, [runInstall]);

  /* 依赖行点击 → 跳依赖插件详情页（30.5e/30.6c3「点击跳其详情页」）——E6#30.7b 带 label
   *  （depLabel：已装名/目录名兜底，未装目标壳 viewRegistry 无 manifest 无法自行命名）。
   *  非 useCallback——depLabel 闭包 all/catalog 每渲染可变，memo 无益。 */
  const handleJumpToDep = (dep: string) => {
    lk()?.tabs?.create("plugin-detail", { pluginId: dep, pinned: false, label: depLabel(dep) });
  };

  // ── 数据未齐（本地列表未到 → 误判「未安装」前等一拍；目录只等未装分支，已装不阻塞） ──
  if (!info) {
    if (pluginsLoading || catalog.loading) {
      return <div className="mpd-empty">{t("加载中...")}</div>;
    }
    if (!entry) {
      return (
        <div className="mpd-empty">
          {pluginId ? (
            <p>{t("插件") + ` "${pluginId}" ` + t("未安装")}</p>
          ) : (
            <p>{t("未指定插件 ID")}</p>
          )}
        </div>
      );
    }
  }

  // ── 展示字段合并：已装 = list()/getDisabled manifest 为准（t() 解析插件显示名/描述——E5.8#37.9.1）；
  //    未装 = 目录作者数据原样（catalog 作者数据绝不 t()）。30.5d：目录字段走 JSX 文本渲染（React 默认转义，
  //    零 dangerouslySetInnerHTML）。 ──
  const m = info?.manifest ?? {};
  const isCore = !!m.core;
  const nameText = info ? t(m.name ?? pluginId ?? "") : entry?.name ?? pluginId ?? "";
  const versionText = info ? m.version : entry?.version;
  const authorText = info ? m.author : (entry ? authorLabel(entry.author) : undefined);
  const descText = info ? m.description ?? "" : entry?.description ?? "";
  const showDesc = descText.length > 0;
  const iconManifest = entry?.icon || entry?.iconSource ? { icon: entry?.icon, iconSource: entry?.iconSource } : undefined;

  /* ── 30.6 展示派生 ── */
  const shots = (entry?.screenshots ?? []).filter((s) => typeof s === "string" && s);
  const readme: { mode: "loading" | "content" | "none"; content?: string } = (() => {
    if (installed) {
      if (pkgReadme === undefined) return { mode: "loading" };
      if (pkgReadme && pkgReadme.trim()) return { mode: "content", content: pkgReadme };
      // 包内无 README → 远端 readmeUrl 兜底（未装态一样）
      if (remoteReadmeUrl) {
        if (remoteReadme === undefined) return { mode: "loading" };
        if (remoteReadme) return { mode: "content", content: remoteReadme };
      }
      return { mode: "none" };
    }
    if (remoteReadmeUrl) {
      if (remoteReadme === undefined) return { mode: "loading" };
      if (remoteReadme) return { mode: "content", content: remoteReadme };
    }
    return { mode: "none" };
  })();

  /* 元数据侧栏派生（30.6c2/c3） */
  const requiresList = reqOf(enabledEntry?.manifest);
  const dependents = all.filter(
    (p) => p.pluginId !== pluginId && reqOf(p.manifest).includes(pluginId ?? ""),
  );
  const sourceName = entry?.sourceName;
  const repoUrl = repoHomeUrl(sourceName);
  const issuesUrl = repoUrl ? `${repoUrl}/issues` : undefined;
  const firstRelease = entry?.versions && entry.versions.length > 0
    ? entry.versions[entry.versions.length - 1].publishedAt
    : entry?.publishedAt;
  const lastUpdate = entry?.versions?.[0]?.publishedAt ?? entry?.publishedAt;

  /* E6#32b：分类行文本——legacy `category` + `categories[]` 并集去重、逐 slug 走 category.* i18n
   *  （英文 slug 作身份，zh/en 双值表），多值「 · 」连接；空 → undefined（无分类不显示行）。
   *  零分类导航/筛选（#32b 边界）。 */
  const categoryRowText = entry ? categoryText(t, entry.category, entry.categories) : undefined;

  const depValues = (deps: string[]): ReactNode =>
    deps.length === 0 ? (
      <Dash />
    ) : (
      <span className="mpd-info-deps">
        {deps.map((dep) => {
          const miss = missingDeps.includes(dep);
          return (
            <button
              key={dep}
              className={miss ? "mpd-info-dep warn" : "mpd-info-dep"}
              onClick={() => handleJumpToDep(dep)}
              title={dep}
            >
              {miss && <span className="codicon codicon-close" />}
              {depLabel(dep)}
            </button>
          );
        })}
      </span>
    );

  const dependentValues = (): ReactNode =>
    dependents.length === 0 ? (
      <Dash />
    ) : (
      <span className="mpd-info-deps">
        {dependents.map((d) => (
          <button
            key={d.pluginId}
            className="mpd-info-dep"
            onClick={() => handleJumpToDep(d.pluginId)}
            title={d.pluginId}
          >
            {d.manifest.name ?? d.pluginId}
          </button>
        ))}
      </span>
    );

  return (
    <div className="mpd-detail">
      {/* ═══ Header ═══ */}
      <header className="mpd-header">
        <div className="mpd-icon">
          {iconManifest ? (
            <PluginIcon pluginId={pluginId ?? ""} manifest={iconManifest} alt={nameText} />
          ) : (
            <span className="codicon codicon-symbol-misc mpd-icon-codicon" />
          )}
          {isCore && <span className="mpd-icon-badge codicon codicon-star-full" />}
        </div>
        <div className="mpd-header-details">
          <div className="mpd-title-row">
            <h1 className="mpd-name">{nameText}</h1>
            {versionText && <span className="mpd-version">v{versionText}</span>}
            {isCore && <Badge>{t("内置")}</Badge>}
            {/* E6#30.8f：官方发布徽标——胜出条目来自官方默认源（entry.official 合并注入），第三方源不伪造 */}
            {entry?.official && (
              <Badge title={t("官方发布")}>
                <span className="codicon codicon-verified" /> {t("官方发布")}
              </Badge>
            )}
          </div>
          {authorText && <p className="mpd-subtitle">{authorText}</p>}
          {showDesc && <p className="mpd-short-desc">{descText}</p>}
        </div>
      </header>

      {/* ═══ Action Bar（30.5b 三态 + 30.5e 挂起态） ═══ */}
      {(info || entry) && (
        <div className="mpd-action-bar">
          {disabled ? (
            <>
              <Button variant="success" onClick={handleEnable} disabled={busy}>
                <span className="codicon codicon-play" /> {t("启用")}
              </Button>
              {/* E6#18a：core:true 藏卸载钮——含禁用态（core 经 getDisabled 透传） */}
              {!isCore && (
                <Button variant="danger" onClick={handleUninstall} disabled={busy}>
                  <span className="codicon codicon-trash" /> {t("卸载")}
                </Button>
              )}
            </>
          ) : pending ? (
            <span className="mpd-blocked-chip" title={enabledEntry?.pendingReason} role="status">
              <span className="codicon codicon-circle-slash" />
              {t("安装不可用（缺依赖）")}
            </span>
          ) : info ? (
            <>
              <Button variant="ghost" onClick={handleDisable} disabled={busy}>
                <span className="codicon codicon-circle-slash" /> {t("禁用")}
              </Button>
              {!isCore && (
                <Button variant="danger" onClick={handleUninstall} disabled={busy}>
                  <span className="codicon codicon-trash" /> {t("卸载")}
                </Button>
              )}
            </>
          ) : (
            <Button
              variant="success"
              onClick={handleInstallClick}
              disabled={busy || installingHere || !online}
              title={!online ? t("联网后重试") : undefined}
            >
              <span className="codicon codicon-cloud-download" />
              {installingHere ? installLabel() : t("安装")}
            </Button>
          )}
          {/* #30.9b 离线态（G3）：置灰钮旁提示「联网后重试」（离线 ≠ 失败——无 [重试]，联网自动恢复） */}
          {!online && !info && (
            <span className="mpd-action-error">
              <span className="codicon codicon-warning" /> {t("联网后重试")}
            </span>
          )}
          {error && <span className="mpd-action-error">{error}</span>}
          {/* #30.9b 失败态（M4 三 行内错误态）：归因文案 + [重试]（手动触发无自动风暴）+ ✕ 关闭。
           *   显示归因译文而非错误原文——原文含内部细节，悬停 title 可读原始串。 */}
          {installErrHere && !error && (
            <span className="mpd-action-error mpd-action-error-row">
              <span className="mpd-action-error-text" title={installErrHere.error}>
                {t(installFailLabelKey(installErrHere.reason ?? "unknown"))}
              </span>
              <Button
                variant="ghost"
                onClick={() => {
                  void retryMarketInstall(pluginId ?? "", installErrHere.downloadUrl ?? entry?.downloadUrl ?? "");
                }}
              >
                <span className="codicon codicon-refresh" /> {t("重试")}
              </Button>
              <Button variant="ghost" onClick={() => dismissMarketInstallError()} title={t("关闭")}>
                <span className="codicon codicon-close" />
              </Button>
            </span>
          )}
        </div>
      )}

      {/* ═══ NavBar——详情/功能/更改日志（30.6 三 tab，本地 state，host 换插件实例重置） ═══ */}
      <nav className="mpd-navbar">
        <button className={tab === "overview" ? "mpd-navtab active" : "mpd-navtab"} onClick={() => setTab("overview")}>
          {t("详情")}
        </button>
        <button className={tab === "features" ? "mpd-navtab active" : "mpd-navtab"} onClick={() => setTab("features")}>
          {t("功能")}
        </button>
        <button className={tab === "changelog" ? "mpd-navtab active" : "mpd-navtab"} onClick={() => setTab("changelog")}>
          {t("更改日志")}
        </button>
      </nav>

      {/* ═══ Body = tab 内容(main) + 元数据侧栏(aside，常驻三 tab) ═══ */}
      <div className="mpd-body">
        <div className="mpd-details-layout">
          <div className="mpd-details-main">
            {tab === "overview" && (
              <>
                {/* 30.5e：挂起·缺依赖 → 主区「依赖未满足」块——缺失依赖行标黄 ✕ 点击跳其详情页 */}
                {missingDeps.length > 0 && (
                  <div className="mpd-deps-block">
                    <div className="mpd-deps-title">{t("依赖未满足")}</div>
                    <p className="mpd-deps-lead">
                      {t("此插件声明了依赖但尚未全部安装——补齐缺失依赖后自动解除挂起。")}
                    </p>
                    <div className="mpd-deps-list">
                      {missingDeps.map((dep) => (
                        <button
                          key={dep}
                          className="mpd-dep-item"
                          onClick={() => handleJumpToDep(dep)}
                          title={t("查看依赖")}
                        >
                          <span className="codicon codicon-close mpd-dep-x" />
                          <span className="mpd-dep-name">{depLabel(dep)}</span>
                          <span className="mpd-dep-state">{t("未安装")}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 30.6c1：截图画廊（screenshots[] 横向滚动）——作者自制图以 img 元素直载（同 downloadUrl 信任级） */}
                {shots.length > 0 && (
                  <div className="mpd-gallery" role="region" aria-label={t("截图")}>
                    {shots.map((s, i) => (
                      <img
                        key={i}
                        className="mpd-gallery-shot"
                        src={s}
                        alt={nameText}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          // 远端截图加载失败 → 藏起坏图占位（诚实不显示 broken glyph）
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* 30.6b：README markdown 渲染（已装读包 / 未装 readmeUrl / 降级 description） */}
                {readme.mode === "loading" && <p className="mpd-readme-note">{t("加载中...")}</p>}
                {readme.mode === "content" && readme.content && <MarkdownView markdown={readme.content} className="mpd-readme" />}
                {readme.mode === "none" && showDesc && <p className="mpd-description">{descText}</p>}
              </>
            )}
            {tab === "features" && (
              <DetailFeaturesTab
                pluginId={pluginId ?? ""}
                contributes={enabledEntry?.manifest.contributes}
                hasContribSource={!!enabledEntry}
                installed={installed}
              />
            )}
            {tab === "changelog" && (
              <DetailChangelogTab
                installed={installed}
                localChangelog={pkgChangelog}
                localVersion={versionText}
                versions={entry?.versions}
                latestVersion={entry?.version}
              />
            )}
          </div>

          {/* ═══ 元数据侧栏（30.6c2/c3——mockup 帧 1/7 字段集） ═══ */}
          <aside className="mpd-info-sidebar">
            <InfoItem label={t("标识符")} value={pluginId ?? ""} mono />
            {versionText && <InfoItem label={t("版本")} value={`v${versionText}`} />}
            {/* E6#30.8c：插件最低要求壳版本——当前壳版本不足 → 值标红 warn + 安装门禁拒装 */}
            {entry?.minAppVersion && (
              <InfoItem label={t("需 LinkDesk")} mono warn={!!appBelowMin} value={`v${entry.minAppVersion}`} />
            )}
            {entry?.size != null && <InfoItem label={t("大小")} value={fmtSize(entry.size)} />}
            {sourceName && <InfoItem label={t("来源")} value={sourceName} mono />}
            {/* E6#30.8b：GitHub Releases 资产下载数（read-only 计数，只读 GitHub 现成数据不伪造）——
             *  仅 dl.status==="ready" 显示；无 GitHub API 源/拉取失败/本地插件无 marketEntry → 隐藏不造空位 */}
            {dl.status === "ready" && dl.count !== undefined && (
              <InfoItem label={t("下载")} value={fmtCount(dl.count)} />
            )}
            {repoUrl && (
              <InfoItem
                label={t("仓库")}
                value={
                  <a className="mpd-info-link" href={repoUrl} target="_blank" rel="noopener noreferrer">
                    {t("打开仓库")} <span className="codicon codicon-link-external mpd-info-link-icon" />
                  </a>
                }
              />
            )}
            {issuesUrl && (
              <InfoItem
                label={t("问题")}
                value={
                  <a className="mpd-info-link" href={issuesUrl} target="_blank" rel="noopener noreferrer">
                    {t("报告问题")} <span className="codicon codicon-link-external mpd-info-link-icon" />
                  </a>
                }
              />
            )}
            {entry?.license && <InfoItem label={t("许可证")} value={entry.license} />}
            {categoryRowText && <InfoItem label={t("分类")} value={categoryRowText} />}
            {lastUpdate && <InfoItem label={t("更新时间")} value={lastUpdate.slice(0, 10)} />}
            {firstRelease && <InfoItem label={t("首次发布")} value={firstRelease.slice(0, 10)} />}
            {(installed || !!entry) && (
              <InfoItem label={t("依赖")} value={installed ? depValues(requiresList) : <Dash />} />
            )}
            {installed && <InfoItem label={t("被依赖")} value={dependentValues()} />}
          </aside>
        </div>
      </div>

      {/* ═══ E6#30.8a 安装确认弹窗（mockup 帧 8——安装即信任）═══
       *  市场自绘富内容确认：壳 dialog.confirm 仅 message 无富内容（契约实证），故走 OverlayPortal 居中卡片
       *  （SearchView AddSourcePopup 同款弹层原语）；来源/发布者/许可证/版本/大小 + 官方徽标（30.8f 同源）。 */}
      {confirming && entry && (
        <OverlayPortal onClose={() => setConfirming(false)} trapFocus>
          <div className="mpd-confirm" role="dialog" aria-modal="true" aria-label={t("确认安装")}>
            <div className="mpd-confirm-head">
              <span className="codicon codicon-shield mpd-confirm-shield" />
              <span className="mpd-confirm-title">{t("确认安装")}</span>
            </div>
            <p className="mpd-confirm-plugin">{nameText}</p>
            <p className="mpd-confirm-note">{t("安装即信任——确认前请查看来源与发布者。")}</p>
            <div className="mpd-confirm-rows">
              <InfoItem
                label={t("发布者")}
                value={
                  <span className="mpd-confirm-publisher">
                    {authorText || <Dash />}
                    {entry.official && (
                      <Badge title={t("官方发布")}>
                        <span className="codicon codicon-verified" /> {t("官方发布")}
                      </Badge>
                    )}
                  </span>
                }
              />
              <InfoItem
                label={t("来源仓库")}
                value={
                  repoUrl ? (
                    <a className="mpd-info-link" href={repoUrl} target="_blank" rel="noopener noreferrer">
                      {sourceName ?? ""}
                      <span className="codicon codicon-link-external mpd-info-link-icon" />
                    </a>
                  ) : (
                    (sourceName ?? <Dash />)
                  )
                }
              />
              {descText && <InfoItem label={t("描述")} value={descText} />}
              <InfoItem label={t("版本")} value={`v${entry.version}`} />
              {entry.size != null && <InfoItem label={t("大小")} value={fmtSize(entry.size)} />}
              {entry.license && <InfoItem label={t("许可证")} value={entry.license} />}
            </div>
            <div className="mpd-confirm-actions">
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
                {t("取消")}
              </Button>
              <Button
                variant="success"
                onClick={() => void handleInstallConfirmed()}
                disabled={busy || installingHere}
              >
                <span className="codicon codicon-cloud-download" /> {t("确认安装")}
              </Button>
            </div>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
