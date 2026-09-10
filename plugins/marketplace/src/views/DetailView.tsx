/**
 * DetailView——插件详情主区渲染面（contributes.views.main["plugin-detail"]，容器 "main" 由壳
 * ShellViewRenderer 在 plugin-detail 标签页消费——E6#30.10b）。
 *
 * E6#30.11 搬迁：布局从壳 PluginDetailPoolView 迁入（header / navbar / body + info 侧栏），
 * 零 @src/core——数据全走 window.linkdesk.* IPC + 本插件模块级 store。
 * 壳 PluginDetailPoolView 降级为保底宿主（无市场插件/无详情贡献时兜底，不崩）。
 *
 * E6#63 版式对账（3.5.1 B1-B5）：header = 图标 ｜ 名/副题/简述 ｜ 右上动作列 .mpd-acts（原 header 下方
 * action bar 整行迁入——01 竞标 A .pdva-head 三段一行 L829-853，动作在图标/名右方同头部）；
 * icon 52 位 + header 下 --separator 分隔线（B2）；info 侧栏 = mockup 04 分组（顶部 标识符/作者/版本/大小
 * + 组 市场/类别/资源/依赖·环境、label 左 | value 右 横排 + 项间细分隔、分类每枚 chip 并排）——作者行补齐
 * （manifest author 缺失回退目录 entry.author，禁用态 header 副标题/侧栏作者行同源回填）；
 * 去 880 限宽全宽铺满标签页（B4）。
 *
 * E6#30.6 富展示：navbar 详情/功能/更改日志 三 tab；详情 = 截图画廊 + README（已装读包 / 未装 readmeUrl /
 * 降级 description）；功能 = contributes 四组渲染（DetailFeaturesTab）；更改日志 = 包内 CHANGELOG / 目录
 * versions（DetailChangelogTab）；元数据侧栏分组内字段源同 30.6c2/c3（含 E6#30.8b 下载数 / #30.8c minApp）。
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
import { PluginIcon, Button, Badge, SelectBox, MarkdownView, pickIdentityArt } from "@linkdesk/ui";
import {
  useMarketplacePlugins,
  useMarketplaceCatalog,
  useOnlineStatus,
  startMarketInstall,
  retryMarketInstall,
  settleUpdateFailure,
  updateFailText,
  notifyError,
} from "../services/marketplaceShared";
import { useInstallJob, installJobLabel } from "../services/installJobs";
import type { CatalogEntry } from "../services/marketCatalog";
import {
  compareVersions,
  updateTargetFor,
  versionDownloadUrl,
  selectableVersions,
  pinnedAfterApply,
  pluginRepoUrl,
  // E6#81：版本控件两个值（下拉显示「我手上是哪版」/ 动作目标「点下去变哪版」）——判据在 marketCatalog 单源
  defaultVersionPick,
  versionActionTarget,
} from "../services/marketCatalog";
import { removeDiscoveredCandidate, runAutoUpdateIfDue } from "../services/updateDiscovery";
import { readPluginUpdateMeta, setAutoUpdate, setPinnedVersion } from "../services/installedUpdateMeta";
// E6#69c/#69f：详情展示位 = marketIcon ?? icon ?? 默认彩色块——走共享 pickIdentityArt（@linkdesk/ui 单一实现，
// 列表/详情同裁决，顶替旧 display.ts pickDisplayArt + #66 640 场景默认；恒返有效 descriptor 零分支）
import { categoryListFromEntry, localizeCategory } from "../services/marketCategories";
import { useDownloadCount } from "../services/downloadCounts";
import { readInstalledPackageFile } from "../services/packageFiles";
// E6#78：插件磁盘位置——「大小」行值变链接 + 「数据位置」行的契约类型（池内零路径知识，只吃主进程结果）
import type { PluginDiskLocation, PluginFolderKind } from "@linkdesk/contracts";
// E6#71c：安装确认载荷构造——authorLabel/fmtSize 展示派生抽共享模块（ConfirmInstall 视图
// 独立 surface bundle，不跨引用本文件；侧栏信息行与确认卡同源复用，单一实现零重复）
import { authorLabel, fmtSize } from "../services/installConfirmPayload";
// E6#71k「都问」：安装/更新确认门（恒弹）——载荷构造与弹卡全在该模块，视图只调一次拿 true/false
import { confirmMarketInstall } from "../services/installGate";
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

/** 展示合并对象——list() 全 manifest | getDisabled 子集 | null(未装)
 *  E6#65c：manifest 再挑 icon/iconSource（图标回退链第二环——已装 manifest 无目录条目时详情页头图）
 *  E6#67：manifest 再挑 marketIcon/marketIconSource——已装插件详情展示位读它（list() 投影已带，双图标模型） */
type DetailInfo = {
  manifest: { name?: string; version?: string; author?: string; description?: string; core?: boolean; icon?: string; iconSource?: "codicon" | "svg" | "url" | "lucide"; marketIcon?: string; marketIconSource?: "codicon" | "svg" | "url" | "lucide" };
  pendingReason?: string;
};

/** requires/contributes 类型缺位（list 子集类型无 requires，载荷实带）——本地收窄，零 any */
const reqOf = (m?: unknown): string[] =>
  Array.isArray((m as { requires?: unknown })?.requires) ? ((m as { requires: string[] }).requires) : [];

const lk = () => window.linkdesk;
const pm = () => window.linkdesk?.pluginManager;

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

/** 元数据侧栏分组（#63c B3——mockup 04 定稿：无「信息」总词；节标题 + 组内字段/内容；空组不渲染不占位） */
function InfoGroup({ title, items }: { title?: string; items: ReactNode[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mpd-info-group">
      {title && <h3 className="mpd-info-group-title">{title}</h3>}
      {items}
    </div>
  );
}

type TabId = "overview" | "features" | "changelog";

export default function DetailView({ pluginId }: DetailContributedProps) {
  const { t } = useTranslation();
  const { all, disabledRaw, loading: pluginsLoading, refresh: refreshPlugins } = useMarketplacePlugins();
  const catalog = useMarketplaceCatalog();
  /* E6#73c 第 2 步：本插件的安装 job（壳侧 job 表的只读镜像，经 plugin:installJobs 广播回流）。
   *  排队/在跑/已出结果三态与通知面板同源同一份数据——市场不再自持会话或队列。 */
  const installJob = useInstallJob(pluginId);
  /* #30.9b 离线态（G3）——navigator.onLine false → 安装/更新钮置灰 + 「联网后重试」（不产生失败会话）；
   *  提早在顶声明——doVersionAction/installGateError deps 均读它（TDZ 防御：勿下移，下移即渲染即崩） */
  const online = useOnlineStatus();

  const [tab, setTab] = useState<TabId>("overview");
  const [busy, setBusy] = useState(false);
  /* E6#33b：更新执行进行中（update 无独立会话——单插件动作，busy 局部即可；引擎只发 installProgress + 壳 toast，
   *  无 lifecycle 事件 → 成功需显式 refreshPlugins 收敛版本/徽标） */
  const [updating, setUpdating] = useState(false);
  /* E6#33c：版本下拉选值（版本动作目标——装哪版/升到哪版/降到哪版）——undefined = 未人工介入，
   *  渲染取 defaultPickTarget() 兜底（首帧/锚变化无闪）。锚变化（插件/条目/已装态/默认目标）重置见下 effect。 */
  const [pickedVersion, setPickedVersion] = useState<string | undefined>(undefined);
  /* E6#30.8c：读壳版本号一次（app.getVersion）——minAppVersion 门禁比对基准（缺/读失败 = undefined 放行不拦） */
  const [appVersion, setAppVersion] = useState<string | undefined>(undefined);
  /* E6#33d 自动更新勾选状态——installedUpdateMeta.autoUpdate（Opt-IN 默认关，只存 true；见下方读 effect） */
  const [autoOn, setAutoOn] = useState(false);

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

  /* ── E6#78：已装插件的磁盘位置（「大小」行值变链接 → 开安装目录；「数据位置」行 → 开插件数据目录）──
   *  路径由**主进程**解析（池内零安装路径知识，这里只吃结果）；未装 / 盘上找不到 → null → 值退纯文本，
   *  不画一个点下去必然报错的假链接。dataDir 只在插件真有数据时非 null（判据在主进程，同 VS Code 详情页
   *  「缓存」行「空则整行不显」）。 */
  const [diskLoc, setDiskLoc] = useState<PluginDiskLocation | null>(null);
  useEffect(() => {
    let alive = true;
    setDiskLoc(null);
    const id = pluginId ?? "";
    const read = lk()?.shell?.pluginLocation;
    if (!id || !installed || !read) {
      return () => {
        alive = false;
      };
    }
    void read(id)
      .then((r) => {
        if (alive) setDiskLoc(r ?? null);
      })
      .catch(() => {
        if (alive) setDiskLoc(null); // 读失败 = 不给入口（诚实，不塞一个点了必错的链接）
      });
    return () => {
      alive = false;
    };
  }, [pluginId, installed]);

  /* E6#78：打开插件目录——install / data 两落点同一条链路（主进程解析路径 + shell.openPath 开目录内容）。
   *  失败 fail-loud 发通知：目录被删/权限不足时用户看得见，不静默吞。 */
  const openPluginDir = useCallback(
    (kind: PluginFolderKind) => {
      const id = pluginId ?? "";
      const open = lk()?.shell?.openPluginFolder;
      if (!id || !open) return;
      void open(id, kind).catch((e: unknown) => {
        notifyError(`${t("打开插件目录失败")}：${e instanceof Error ? e.message : String(e)}`);
      });
    },
    [pluginId, t],
  );

  const info: DetailInfo | null = enabledEntry
    ? {
        manifest: {
          name: enabledEntry.manifest.name,
          version: enabledEntry.manifest.version,
          author: enabledEntry.manifest.author,
          description: enabledEntry.manifest.description,
          core: enabledEntry.manifest.core,
          // E6#65c：图标回退链第二环——已装 manifest.icon/iconSource 透传（list() 子集已带，E6#65a）
          icon: enabledEntry.manifest.icon,
          iconSource: enabledEntry.manifest.iconSource,
          // E6#69b：marketIcon = Type-2 身份图（原 #67「封面 art」语义随 #69 改向）——list() 投影带
          // marketIcon/marketIconSource（E6#65a 后），详情展示位 pickIdentityArt 的 marketIcon 优先环读这里
          // （icon-bar 四插件 serial 等的 Type-2 图即此路显形）
          marketIcon: enabledEntry.manifest.marketIcon,
          marketIconSource: enabledEntry.manifest.marketIconSource,
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

  /* ── E6#33b 第四维：可更新判定（04 §二·五 mockup 帧 6/10）——本地已装版本 vs 目录条目 stable-only
   *  （updateTargetFor = planDiscovery 同判据单函数：semver.gt + beta 回落 + 住所闸，杜绝 UI/发现判定分裂）。
   *  仅 installed 有意义（未装无本地可比）；挂起态（缺依赖）不提示更新（blocked chip 占位，入口让位解除后）。
   *  E6#73j（G6）：住所闸——随包发货件 / 目录源安装的插件住只读 app 根，更新流对它必然抛「不在用户安装区」，
   *  故此处根本不渲染「更新到 vX」（此前渲染 = 点下去必失败的死钮）。 */
  const localVer = enabledEntry?.manifest.version ?? disabledHit?.version;
  const updatable = enabledEntry?.updatable ?? disabledHit?.updatable;
  const updateTarget = updateTargetFor(entry, localVer, updatable);
  const hasUpdate = !!updateTarget && !pending;
  /* changelog 两版并排 overlay：远端「最新」块信息（目录 versions[].changelog 为准——远端新包未下载无法读包内文件） */
  const remoteChangelog = useMemo(() => {
    if (!hasUpdate || !updateTarget || !entry) return undefined;
    const hit = entry.versions?.find((v) => compareVersions(v.version, updateTarget) === 0);
    return { version: updateTarget, date: hit?.publishedAt, body: hit?.changelog };
  }, [hasUpdate, updateTarget, entry]);

  /* ── E6#33c 版本下拉（05 §四——装哪个版本/升到哪版/降到哪版） + pinnedVersion 记账（05 §二·九） ── */
  const versionChoices = useMemo(() => selectableVersions(entry), [entry]);
  const hasVersionHistory = versionChoices.length > 1;

  /* 🔴 **E6#81 审视找到的第二处（G6 同类漏网）。** G6（E6#73j）只遮住了「自动冒出来的更新钮」，
   *  **下拉这条手动路径漏了**：随包发货件（住所 = 只读 app 根，`updatable === false`）若目录里有
   *  多版本历史，下拉照样画；用户一旦挑一版 → `pickedVersion` 顶起动作目标 ⇒ 又长出一个点下去必失败
   *  （引擎抛「不在用户安装区」）的死钮。判据与 G6 同一处：`updatable`（住所事实，非插件身份——硬约束 11）。
   *  不可切换版本的插件 = 下拉与版本动作钮**都不画**（不是画了置灰——没有可选的下一步，置灰亦是骗）。 */
  const canSwitchVersion = installed && updatable === true;

  /** 下拉默认显示值（**E6#81，2026-09-11 用户拍板**）——判据在 `defaultVersionPick`（marketCatalog 单源，
   *  vitest 直测）：**已装 → 「我手上是哪个版本」**；未装 → 最新可选。改前的默认取 `updateTarget`（= 可更新
   *  到的版本）⇒ 用户装了 0.1.0 而下拉显示 v0.1.1，**读成「我装的是 0.1.1」**（实机原话：「我明明安装的是
   *  0.1.0，结果那个下拉框就显示的是 0.1.1」）。 */
  const shownFallback = defaultVersionPick(versionChoices, installed, localVer);

  /** 生效版本目标——人工选了用所选，否则默认兜底（首帧/重置后跟随默认） */
  const targetVersion = hasVersionHistory && pickedVersion !== undefined ? pickedVersion : shownFallback;

  /* 安装目标版本/URL——有历史 = 下拉所选（默认最新可选）；无历史 = 顶层（#30.5b 原语义 entry.downloadUrl）。
   *  versionDownloadUrl 选哪版取哪版（05 §四），顶层兜底 entry.downloadUrl（同 #33b 更新寻址）。 */
  const installVer = !entry ? undefined : hasVersionHistory ? (targetVersion ?? entry.version) : entry.version;
  const installUrl = installVer && entry ? versionDownloadUrl(entry, installVer) ?? entry.downloadUrl : undefined;

  /* ── 已装读包 + 未装远端 README（30.6b）——pkgReadme/pkgChangelog 只对已装读；remote 兜底 ── */
  const [pkgReadme, setPkgReadme] = useState<string | null | undefined>(undefined); // undefined=读取中
  const [pkgChangelog, setPkgChangelog] = useState<string | null | undefined>(undefined);
  const [remoteReadme, setRemoteReadme] = useState<string | null | undefined>(null); // undefined=读取中 / null=无需/不可得

  /* 切插件（宿主复用实例）重置 tab + 本地包文件状态 */
  useEffect(() => {
    setTab("overview");
  }, [pluginId]);

  /* E6#33c：下拉选值生命周期——锚（插件/条目/已装态/更新目标/已装版本）变化 → 重置回默认（用户未介入时
   *  跟随最新；更新/降级完成 localVer 变化 → 默认随新版收敛）。用户正选中且锚未动 → effect 不触发，选择保持。 */
  useEffect(() => {
    setPickedVersion(undefined);
  }, [pluginId, entry?.id, installed, updateTarget, localVer]);

  /* #33d 自动更新勾选初值读——切插件/已装态锚变即重读收敛（记账/自动更新兜底）；
   *  G2 只在已装态渲染（autoUpdateToggle），未装/挂起不渲染但 anchor 变仍复位为 false。 */
  useEffect(() => {
    let alive = true;
    setAutoOn(false);
    const id = pluginId ?? "";
    if (!id || !installed) {
      return () => {
        alive = false;
      };
    }
    void readPluginUpdateMeta(id).then((m) => {
      if (alive) setAutoOn(m.autoUpdate === true);
    });
    return () => {
      alive = false;
    };
  }, [pluginId, installed]);

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

  /* 当前插件显示名——启/禁/卸三处失败 toast 共用（enabledEntry/disabledHit 是列表元素稳定引用，
   *  非每渲染新建对象，可入 deps）。E6#73h（D5）：三处原始报错一律加**结论句**前缀——
   *  此前 `notifyError(e.message)` 把桥/引擎原文直接当整句甩出去，用户看到的是
   *  「Error invoking remote method 'plugin:enable'」这类没人话的东西，做的事、成没成、都不在句子里。 */
  const displayName = enabledEntry?.manifest.name ?? disabledHit?.name ?? pluginId ?? "";

  /* #64 A2：enable/disable 抛错 = 事件型失败 → error toast（定案——事件失败浮右下角，零页面红字零 reflow） */
  const handleEnable = useCallback(async () => {
    if (!pluginId || busy) return;
    setBusy(true);
    try {
      await pm().enable(pluginId);
    } catch (e) {
      notifyError(t("启用「{{name}}」失败：{{detail}}", { name: displayName, detail: e instanceof Error ? e.message : String(e) }));
    }
    setBusy(false);
  }, [pluginId, busy, t, displayName]);

  const handleDisable = useCallback(async () => {
    if (!pluginId || busy) return;
    setBusy(true);
    try {
      await pm().disable(pluginId);
    } catch (e) {
      notifyError(t("禁用「{{name}}」失败：{{detail}}", { name: displayName, detail: e instanceof Error ? e.message : String(e) }));
    }
    setBusy(false);
  }, [pluginId, busy, t, displayName]);

  /* ── E6#33d 自动更新开关（mockup 帧 5/6 auto-upd）——setAutoUpdate 记账（开存 true / 关删字段，
   *  installedUpdateMeta 域）。**E6#79 起这个开关是真的**：勾开即立刻跑一趟（runAutoUpdateIfDue
   *  真执行，装完/失败各发一条通知）。⚠️ 自动路径**不过确认卡**——确认卡管的是手动路径（用户点
   *  「安装」/「更新」时问一次）；勾选本身就是自动路径的那次授权。两条路各走各的（E6#79 用户更正
   *  了 #71k 把两者混为一谈的推论，见 updateDiscovery 头注）。 ── */
  const handleAutoToggle = useCallback(
    async (on: boolean) => {
      if (!pluginId || busy || updating) return;
      setAutoOn(on); // 乐观翻转——读/记账失败的兜底由上方 effect（锚变）重读收敛
      await setAutoUpdate(pluginId, on);
      if (on) await runAutoUpdateIfDue(pluginId); // 勾开即跑一趟（真执行；结果由该模块发通知）
    },
    [pluginId, busy, updating],
  );

  /* ── E6#33b/#33c 版本动作执行（升/降一码——版本动作目标 actTarget 驱动；mockup 帧 6 st-update）。
   *  壳引擎 updatePlugin：下载 temp → 校验 → 原子替换 → needRestart 恒 true + 壳 toast「已更新…重启生效」
   *  （本视图不重复 toast 成功）；F1（禁用态更新/降级）= 引擎 wasActive=false 换文件不 reload 保持禁用，照常。
   *  失败（无独立 failure toast 通道）→ 行内归因 + 手动 [重试]（同安装 M4 三，title 悬停原文）；
   *  成功 → 无 lifecycle 事件（引擎只发 installProgress + 壳 toast）→ 显式 refreshPlugins 收敛版本 +
   *  驱逐发现 store 候选（仅升到该稳定候选时——中间版/beta 不算追上，候选留存）+ pinnedVersion 记账
   *  （05 §二·九：落地稳定最新 → 清钉追最新；停旧版/beta/中间版 → 钉住暂停 autoUpdate，供 #33d）。
   *  url = versionDownloadUrl 取所选版本资产（不默认顶层 beta）。 ── */
  const doVersionAction = useCallback(
    async (ver: string) => {
      if (!pluginId || busy || updating) return;
      if (!online) return; // 离线：更新钮已置灰 + title「联网后重试」——状态类静默拦（#64 A2），非失败无 toast
      const url = entry ? versionDownloadUrl(entry, ver) : undefined;
      if (!url) {
        // #64 A2：缺下载地址 = 事件型拦阻 → error toast（定案 5——toast 报一次即可）
        notifyError(t("该插件缺少下载地址"));
        return;
      }
      const upd = pm()?.update;
      if (!upd) {
        // 无更新执行面（老 preload 面）——环境缺面诚实告知（无原文可显 → updateFailText 通用兜底）
        notifyError(updateFailText(t, "unknown", ""));
        return;
      }
      /* E6#71k「都问」：**更新同样每次都弹卡**（官方来源不豁免）——不补这条，「看过来源」只对新装成立，
       *  一次点头之后的每次变码都是静默的。此处 entry 必然存在（url 由 entry 派生，缺 entry 已于上一步
       *  以「缺少下载地址」返回——不会静默跳过本门）。
       *  ⚠️ 这道门只管**手动路径**（用户在场点更新）；自动更新走另一条路、不过门——勾选本身即那次授权
       *  （E6#79 用户更正了 #71k 把两者混为一谈的推论，见 updateDiscovery 头注）。 */
      if (entry) {
        const ok = await confirmMarketInstall(entry, "update", ver);
        if (!ok) return;
      }
      setUpdating(true);
      try {
        // 引擎锚①：目标 < 当前（版本下拉选旧版降级）→ 显式 allowOlder:true 放行；升/同级不发（同版恒拒引擎兜底）
        const isDowngrade = !!localVer && compareVersions(ver, localVer) < 0;
        const r = await upd(pluginId, { url, allowOlder: isDowngrade ? true : undefined });
        if (r && r.success) {
          if (updateTarget && compareVersions(ver, updateTarget) === 0) removeDiscoveredCandidate(pluginId);
          const pin = pinnedAfterApply(entry, ver);
          if (pin !== undefined) void setPinnedVersion(pluginId, pin);
          refreshPlugins();
        } else if (!r?.cancelled) {
          // #64 A2：更新失败 → error toast（原行内红字退役）；重试口 = 原位更新钮仍在，无漂移。
          // E6#73j（G2）：改用更新域失败终局——常驻 + [重试]（此前 8 秒自灭、无按钮，与安装域两套待遇）。
          // E6#73j：用户点「取消安装」叫停的**不是失败**——走 cancelled 分支静默，别拿他自己的决定去吓他。
          settleUpdateFailure(pluginId, displayName, url, r?.error ?? "");
        }
      } catch (e) {
        // E6#71b：catch 兜 rejection（如 10s 桥超时 reject）——原文带进 updateFailText，unknown 时可见
        const raw = e instanceof Error ? e.message : String(e);
        settleUpdateFailure(pluginId, displayName, url, raw);
      } finally {
        setUpdating(false);
      }
    },
    [pluginId, busy, updating, online, entry, updateTarget, localVer, t, refreshPlugins, displayName],
  );

  /* ── E6#33c 降级确认（F2，05 §二·十一——「此版本较旧，配置可能不兼容」。不拦只提示：确认后 allowOlder
   *  放行执行，取消原地不动。纯文字确认 = 壳 dialog.confirm（与卸载同款文字弹层；E6#71c 装/卸/降级三确认
   *  已归一——装 = 壳 DialogHost content 槽富内容视图，卸+降级 = 同容器纯文字模式）。 ── */
  const requestDowngrade = useCallback(
    async (ver: string) => {
      if (!pluginId || busy || updating) return;
      const confirmApi = lk()?.dialog?.confirm;
      if (!confirmApi) return;
      const ok = await confirmApi(
        t("此版本较旧，配置可能不兼容。仍要降级到 {{version}} 吗？", { version: `v${ver}` }),
      );
      if (!ok) return;
      await doVersionAction(ver);
    },
    [pluginId, busy, updating, t, doVersionAction],
  );

  /* 卸载 = 二次确认（dialog.confirm——真实原语，mockup 帧 4「复用现有 confirm」）→ 执行。
   *   core:true 藏钮（#18），但命令层可卸；不确认不卸。 */
  const handleUninstall = useCallback(async () => {
    if (!pluginId || busy) return;
    const confirmApi = lk()?.dialog?.confirm;
    if (!confirmApi) return;
    // 确认文案用当前插件显示名（displayName 已提到上方——启/禁/卸三处共用）
    const ok = await confirmApi(t("确定卸载 {{name}} 吗？", { name: displayName }));
    if (!ok) return;
    setBusy(true);
    try {
      await pm().uninstall(pluginId);
    } catch (e) {
      // #64 A2：卸载抛错 = 事件型失败 → error toast（原行内红字退役）
      // E6#73h（D5）：同启/禁——结论句前缀，原文退居冒号后作细节
      notifyError(t("卸载「{{name}}」失败：{{detail}}", { name: displayName, detail: e instanceof Error ? e.message : String(e) }));
    }
    setBusy(false);
  }, [pluginId, busy, displayName, t]);

  /* ── 30.5b 未装行 🟢安装（带进度）+ #30.9 失败/离线 —— E6#73c 第 2 步起读壳侧 job 行（同通知面板同源） ──
   *  installJob 已按「在跑 > 排队 > 最新一条已出结果」为**本插件**挑好，故这里不再按 pluginId 过滤。 */
  const installingHere = installJob?.state === "running";
  /** #30.9b 本插件失败 job（terminal:"failed"）——#64 A3 消费：安装钮原位变红「重试安装」（09 §二 M4 三）；
   *  离线不发起 ⇒ 不产生 job。用户取消的 job 壳侧整条撤掉（不是失败，不留红行）。 */
  const installErrHere = installJob?.state === "settled" && installJob.terminal === "failed" ? installJob : null;
  /** E6#73c：本插件排在队列里（不在跑）——安装钮原位画「等待安装中」。 */
  const queuedHere = installJob?.state === "queued";
  /** E6#73m K1：本插件的**卸载腿**在跑——卸载钮原位画「卸载中...」。此前只有一个被 `busy` 哑掉的
   *  「卸载」：点了以后按钮灰着、字不变，一个几万文件的插件卸起来界面看不出在动。 */
  const uninstallingHere = installJob?.kind === "uninstall" && installJob.state === "running";

  const installLabel = (): string => installJobLabel(t, installJob);

  /* E6#30.8a/30.8c 安装门禁（确认弹窗前后双拦幂等）。#64 A2 归因区分：
   *  - 已装冲突 / 离线 = 状态类（UI 本已翻转/按钮已置灰 + title）→ 静默拦，无 toast 无红字；
   *  - 缺下载地址 / 无安装面 / minAppVersion = 事件型失败 → error toast（定案 5：toast 报一次即可）。
   *  minAppVersion 比对 = 当前壳版本 < 插件要求 → 拒装（未读到壳版本 = undefined 放行不拦——诚实不缺省拦装）。 */
  const installGateError = useCallback((): boolean => {
    // #30.9d：已装同版本/再装 → 静默拦（防竞态——列表/catalog 交错翻态瞬间点装；禁用态同样已装；
    //   正常 UI 已藏安装钮、已装 = 本已翻转成禁用/卸载，冲突非用户可见失败，红字/ttoast 均噪音）
    if (installed) return true;
    // #30.9b 离线（G3）：离线 ≠ 失败——按钮置灰 + title「联网后重试」已表达，防御路径静默拦（无 [重试]）
    if (!online) return true;
    if (!installUrl) {
      notifyError(t("该插件缺少下载地址"));
      return true;
    }
    if (!pm()?.installWithProgress) {
      notifyError(t("安装失败"));
      return true;
    }
    if (entry?.minAppVersion && appVersion && compareVersions(appVersion, entry.minAppVersion) < 0) {
      notifyError(t("需升级 LinkDesk 至 {{version}} 才能安装", { version: entry.minAppVersion }));
      return true;
    }
    return false;
  }, [installed, online, entry, installUrl, appVersion, t]);

  const runInstall = useCallback(async () => {
    if (!pluginId || busy || installingHere) return;
    if (installGateError()) return;
    const url = installUrl;
    if (!url) return; // gate 已保证有地址——双保险供 TS 收窄（闭包随渲染，不跨依赖漂移）
    // E6#33c：手动装旧版（非目录稳定最新）→ 记 pinnedVersion（05 §二·九 尊重「停在旧版」意图，供 #33d autoUpdate 跳过）
    const ver = installVer;
    if (ver) {
      const pin = pinnedAfterApply(entry, ver);
      if (pin !== undefined) void setPinnedVersion(pluginId, pin);
    }
    // 会话 store 负责归因 + 失败态；成功后 lifecycle 事件驱动列表翻态（30.5c），本视图随 info 收敛
    // E6#73c 第 1 步：带显示名——壳侧 job 行需要它（不传则退化为 id，标题会变成裸 id）
    await startMarketInstall(pluginId, url, entry?.name);
  }, [pluginId, busy, installingHere, installGateError, entry, installUrl, installVer]);

  /* 安装钮点击 = E6#71k 确认门（**恒弹**）→ 富内容确认 → runInstall（安装执行单一入口仍留本视图）。
   *  门（installGate）：没有判序表、没有豁免、没有记忆——一次确认只对这一次安装有效。
   *  弹卡机制 = E6#71c 壳 Dialog（DialogHost content 槽挂 ConfirmInstall 视图）——机制一点没动，
   *  只改「什么时候弹」；视图声明寻址失败 → 壳回落纯文字双钮确认（弹窗仍出不静默死）。 */
  const handleInstallClick = useCallback(async () => {
    if (!pluginId || busy || installingHere) return;
    if (installGateError()) return;
    if (!entry) return;
    const ok = await confirmMarketInstall(entry, "install", installVer);
    if (!ok) return;
    await runInstall();
  }, [pluginId, busy, installingHere, installGateError, entry, installVer, runInstall]);

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
  /* #63c B3：作者行/header 副标题两源归并（禁用态连带坑 2026-09-09——getDisabled 子集无 author/icon：
   *  已装 manifest author 为准 → 缺失回退目录 entry.author（禁用/已装都可经目录补齐副标题 + 侧栏作者行）；
   *  目录也没有 = undefined → header 副标题藏、侧栏作者行 Dash 诚实占位（结构固定不缩行）。 */
  const authorText = (info ? m.author : undefined) || (entry ? authorLabel(entry.author) : undefined);
  const descText = info ? m.description ?? "" : entry?.description ?? "";
  const showDesc = descText.length > 0;
  /* E6#69c/#69f（14 档案批次三）：展示位 = marketIcon ?? icon ?? 默认彩色块——pickIdentityArt 恒返有效
   *  descriptor（零分支，顶替旧 codicon-symbol-misc 兜底 + #66 640 场景默认）。candidates 顺序 =
   *  数据源优先级：已装 manifest（启用态经装配可带 marketIcon → serial Type-2 身份图即此环显形）→
   *  目录条目（未装/禁用态官方艺术兜底）；两环皆无配图 → 统一默认彩色块（市场门面）。 */
  const iconManifest = info ? pickIdentityArt(info.manifest, entry) : pickIdentityArt(entry);

  /* ── 30.6 展示派生 ── */
  const shots = (entry?.screenshots ?? []).filter((s) => typeof s === "string" && s);
  /* E6#70a（15 档案）：已装读包 README 的相对媒体引用解析到「被查看插件包内」→ 注入
   *  linkdesk://{pluginId}/ 基址（linkdesk:// 与读包 resolvePath 同根，README 引用的随包资产即此可达）。
   *  远端 readmeUrl 来源（未装态/包内无 README 兜底）无本地副本 → 不传 assetBase（相对图诚实不显，
   *  纯 https 远程照显——档案 §五.2 定案）。 */
  const localAssetBase = pluginId ? `linkdesk://${pluginId}/` : undefined;
  const readme: { mode: "loading" | "content" | "none"; content?: string; assetBase?: string } = (() => {
    if (installed) {
      if (pkgReadme === undefined) return { mode: "loading" };
      if (pkgReadme && pkgReadme.trim()) return { mode: "content", content: pkgReadme, assetBase: localAssetBase };
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
  /* E6#77：资源组「仓库 / 问题」指向**插件自己的**主页——此前拿 sourceName（目录货架名）拼 URL，
     官方目录里的插件全体跳同一个货架仓库。派生规则见 marketCatalog.pluginRepoUrl：
     乙（作者声明 repository）优先 → 甲（downloadUrl / readmeUrl 推 github owner/repo）→ 推不出不渲染。 */
  const repoUrl = pluginRepoUrl(entry);
  const issuesUrl = repoUrl ? `${repoUrl}/issues` : undefined;
  const firstRelease = entry?.versions && entry.versions.length > 0
    ? entry.versions[entry.versions.length - 1].publishedAt
    : entry?.publishedAt;
  const lastUpdate = entry?.versions?.[0]?.publishedAt ?? entry?.publishedAt;

  /* E6#32b + #63c B3：分类值 = legacy `category` + `categories[]` 并集去重、逐 slug 走 category.* i18n
   *  （英文 slug 作身份，zh/en 双值表）；渲染改**每分类一枚 chip 并排**（VS Code renderCategories 实证——
   *  数据 categories[] 本就数组，纯显示改，非「 · 」粘串）。空 → []（无分类不渲染「类别」组）。 */
  const categoryList = entry ? categoryListFromEntry(entry.category, entry.categories) : [];

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

  /* ── E6#33c 版本动作（升/降）目标与方向——installed 态（未装走安装分支）：有历史 → 下拉选值驱动
   *  （可停旧版/进 beta/降级）；无历史 → #33b 单目标 updateTarget（保持原单钮语义）。
   *  E6#81 起「未介入」也算一个态：下拉停在**已装版**（那是它现在的职责——显示你手上是什么），
   *  动作目标则回落 updateTarget，否则一键更新会消失。 ── */
  /* 🔴 **E6#81：动作目标与下拉显示值已解耦。** 下拉回答「我现在是哪个版本」（= targetVersion，已装即
   *  localVer）；本变量回答「点下去会变成哪个版本」。用户**未介入**（pickedVersion === undefined）→ 取
   *  updateTarget（#33b 原意保住：更新钮首帧即现）；用户一旦手动选值 → 按钮就跟着所选走。不这么分的话，
   *  下拉显示 localVer 会让 actDir 恒为 "same" ⇒ 更新钮消失 = 把 #33b 的一键更新弄丢。
   *  判据在 `versionActionTarget`（marketCatalog 单源，vitest 直测）。 */
  const actTarget = canSwitchVersion && !pending
    ? versionActionTarget({ hasHistory: hasVersionHistory, updateTarget, picked: pickedVersion })
    : undefined;
  const actDir =
    actTarget && localVer
      ? compareVersions(actTarget, localVer) > 0
        ? "up"
        : compareVersions(actTarget, localVer) < 0
          ? "down"
          : "same"
      : undefined;
  const pickerOptions = versionChoices.map((c) => ({ value: c.version, label: `v${c.version}` }));
  /* E6#33c/#30.9a M6：安装/更新进行中 → 版本下拉置灰（M6 锚——装态选择目标无效） */
  const pickerDisabled = busy || updating || installingHere;
  /* 版本选择器（装/升/降目标）——versions.length>1 才有历史才显示：installed 态在动作区首槽（05 §四）。
   * E6#81：`canSwitchVersion`（住所可写）——不可切换版本的插件不画下拉（见其头注）。 */
  const versionPicker = hasVersionHistory && canSwitchVersion && !pending ? (
    <SelectBox
      value={targetVersion ?? ""}
      options={pickerOptions}
      onChange={(v) => setPickedVersion(v)}
      disabled={pickerDisabled}
      title={t("选择版本")}
      className="mpd-version-select"
    />
  ) : null;
  const installPicker = hasVersionHistory && !installed && !!entry ? (
    <SelectBox
      value={targetVersion ?? ""}
      options={pickerOptions}
      onChange={(v) => setPickedVersion(v)}
      disabled={busy || installingHere}
      title={t("选择版本")}
      className="mpd-version-select"
    />
  ) : null;
  /* 版本动作钮（升 = doVersionAction 直行；降 = requestDowngrade 先 F2 确认再放行 allowOlder——05 §二·十一） */
  const actButton =
    canSwitchVersion && !pending && actTarget && actDir && actDir !== "same" ? (
      <Button
        onClick={() =>
          actDir === "down"
            ? void requestDowngrade(actTarget as string)
            : void doVersionAction(actTarget as string)
        }
        disabled={busy || updating || !online}
        title={!online ? t("联网后重试") : undefined}
      >
        <span className={"codicon " + (actDir === "down" ? "codicon-arrow-down" : "codicon-arrow-up")} />
        {updating
          ? t("更新中...")
          : actDir === "down"
            ? t("降级到 {{version}}", { version: `v${actTarget}` })
            : t("更新到 {{version}}", { version: `v${actTarget}` })}
      </Button>
    ) : null;

  /* #33d 自动更新勾选（mockup 帧 5/6/7 .auto-upd——版本偏好副控制，置主动作钮之后尾位）。
   *  G2（05 §五）：autoUpdate 是**已装条目属性**——只在已装且非挂起渲染（下方 disabled/info 两分支同
   *  为 installed&&!pending，插尾即天然守位）；未装/挂起态不显示。控制 disabled while 动作进行
   *  （pickerDisabled = busy/updating/installingHere 同栅——替换期间不可改偏好，mockup 帧 2 auto-disabled）。 */
  const autoUpdateToggle = installed && !pending ? (
    <label
      className={"mpd-auto-upd" + (pickerDisabled ? " disabled" : "")}
      title={t("勾选后自动更新——有新版本就自动装上，装完发通知告诉你")}
    >
      <input
        type="checkbox"
        checked={autoOn}
        disabled={pickerDisabled}
        onChange={(e) => void handleAutoToggle(e.target.checked)}
      />
      {t("自动更新")}
    </label>
  ) : null;

  /* ── #63c B3 元数据侧栏分组内容（mockup 04 定稿——顶部无节题小段 标识符/作者/版本/大小 + 组
   *  市场/类别/资源/依赖·环境；结构全插件固定——行值无数据给 Dash（—）占位不缩结构、空组不渲染；
   *  分类 = 每枚 chip 并排；字段集全保留不精简（用户 2026-09-09 拍板）。IIFE 只为局部变量作用域收拢。 ── */
  const infoGroups = ((): Array<{ title?: string; items: ReactNode[] }> => {
    const groups: Array<{ title?: string; items: ReactNode[] }> = [];

    /* 顶部无节题小段（mockup 04 开首——不落「信息」总词） */
    const top: ReactNode[] = [
      <InfoItem key="id" label={t("标识符")} value={pluginId ?? ""} mono />,
      /* 作者行（#63c 补——与 header 副标题同源 authorText；manifest 缺失回退目录 entry.author；都没有 → Dash） */
      <InfoItem key="author" label={t("作者")} value={authorText || <Dash />} />,
    ];
    if (versionText) top.push(<InfoItem key="ver" label={t("版本")} value={`v${versionText}`} />);
    /* 大小行（B3 拍板「下载体积常显」保持——装不装都显，值 = 实测下载包字节）。
     *  E6#78：已装态该值变**链接**（点开安装目录）——照 VS Code 详情页 Size 行「值可点、class 'link'、
     *  onClick 开 extension.location」；未装 / 盘上找不到 = 纯文本，不画假链接。
     *  纯加字色与光标、文字一字不变 ⇒ 装/未装切换**零布局跳动**（不是多一行、不是换文案）。 */
    if (entry?.size != null) {
      const sizeText = fmtSize(entry.size);
      top.push(
        <InfoItem
          key="size"
          label={t("大小")}
          value={
            diskLoc ? (
              <button
                type="button"
                className="mpd-info-link mpd-info-link-btn"
                title={t("在资源管理器里打开 {{path}}", { path: diskLoc.installDir })}
                onClick={() => openPluginDir("install")}
              >
                {sizeText}
              </button>
            ) : (
              sizeText
            )
          }
        />,
      );
    }
    /* E6#78 数据位置行——插件真写过数据才有主进程给的 dataDir，空/无 = 整行不画（同 VS Code「缓存」行）；
     *  值 = 动作链接（与「资源」组「仓库 → 打开仓库」同一手感：label 说是什么、value 说做什么）。 */
    if (diskLoc?.dataDir) {
      top.push(
        <InfoItem
          key="data"
          label={t("数据位置")}
          value={
            <button
              type="button"
              className="mpd-info-link mpd-info-link-btn"
              title={t("在资源管理器里打开 {{path}}", { path: diskLoc.dataDir })}
              onClick={() => openPluginDir("data")}
            >
              {t("打开数据位置")}
              <span className="codicon codicon-link-external mpd-info-link-icon" />
            </button>
          }
        />,
      );
    }
    groups.push({ items: top });

    /* 组：市场（mockup 04 归组——来源/首次发布/更新时间/下载；「来源」行即目录身份，无外链概念） */
    const market: ReactNode[] = [];
    if (sourceName) market.push(<InfoItem key="src" label={t("来源")} value={sourceName} mono />);
    if (firstRelease)
      market.push(<InfoItem key="first" label={t("首次发布")} value={firstRelease.slice(0, 10)} />);
    if (lastUpdate) market.push(<InfoItem key="last" label={t("更新时间")} value={lastUpdate.slice(0, 10)} />);
    /* E6#30.8b 下载数（read-only GitHub 计数）——仅 ready 显，无数据不造空位 */
    if (dl.status === "ready" && dl.count !== undefined)
      market.push(<InfoItem key="dl" label={t("下载")} value={fmtCount(dl.count)} />);
    groups.push({ title: t("市场"), items: market });

    /* 组：类别——每分类一枚 chip 并排（VS Code renderCategories 实证；空 → 整组不渲染） */
    const cats: ReactNode[] =
      categoryList.length > 0
        ? [
            <div key="cats" className="mpd-info-cats">
              {categoryList.map((slug) => (
                <span key={slug} className="mpd-info-cat">
                  {localizeCategory(t, slug)}
                </span>
              ))}
            </div>,
          ]
        : [];
    groups.push({ title: t("类别"), items: cats });

    /* 组：资源——逐行条件「有才显」（VS Code renderExtensionResources if 同款；仓库/问题/许可证） */
    const resources: ReactNode[] = [];
    if (repoUrl)
      resources.push(
        <InfoItem
          key="repo"
          label={t("仓库")}
          value={
            <a className="mpd-info-link" href={repoUrl} target="_blank" rel="noopener noreferrer">
              {t("打开仓库")} <span className="codicon codicon-link-external mpd-info-link-icon" />
            </a>
          }
        />,
      );
    if (issuesUrl)
      resources.push(
        <InfoItem
          key="issues"
          label={t("问题")}
          value={
            <a className="mpd-info-link" href={issuesUrl} target="_blank" rel="noopener noreferrer">
              {t("报告问题")} <span className="codicon codicon-link-external mpd-info-link-icon" />
            </a>
          }
        />,
      );
    if (entry?.license) resources.push(<InfoItem key="lic" label={t("许可证")} value={entry.license} />);
    groups.push({ title: t("资源"), items: resources });

    /* 组：依赖·环境（mockup 04 末组定名）——需 LinkDesk(minApp)/依赖/被依赖 */
    const depEnv: ReactNode[] = [];
    if (entry?.minAppVersion)
      depEnv.push(
        <InfoItem
          key="minapp"
          label={t("需 LinkDesk")}
          mono
          warn={!!appBelowMin}
          value={`v${entry.minAppVersion}`}
        />,
      );
    /* 依赖行（30.6c3）：未装 → Dash 诚实空（#64e A4 缺依赖门禁前不猜目录 requires——待用户拍板范围） */
    if (installed || !!entry)
      depEnv.push(
        <InfoItem key="deps" label={t("依赖")} value={installed ? depValues(requiresList) : <Dash />} />,
      );
    if (installed) depEnv.push(<InfoItem key="dependents" label={t("被依赖")} value={dependentValues()} />);
    groups.push({ title: t("依赖 · 环境"), items: depEnv });

    return groups;
  })();

  return (
    <div className="mpd-detail">
      {/* ═══ Header（#63a B1：三段一行——icon ｜ id/副题/简述列 ｜ 右上动作列 .mpd-acts；mockup 01 竞标 A
       *  .pdva-head L829-853：动作在图标/名右方同头部，row1 主钮+版本下拉、row2 自动更新勾；窄容器允许换行兜底） ═══ */}
      <header className="mpd-header">
        <div className="mpd-icon">
          {/* E6#69c/#69f：iconManifest 恒有值（pickIdentityArt 默认彩色块兜底）——无条件渲染 PluginIcon，
           *  codicon-symbol-misc 占位分支已删；96px 展示框内 img 型显 Type-2 身份图、codicon/lucide 型显图标 */}
          <PluginIcon pluginId={pluginId ?? ""} manifest={iconManifest} alt={nameText} />
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

        {/* ── 右上动作列 .mpd-acts（#63a：原 header 下方 action-bar 整行收编此列——30.5b 三态 + 30.5e 挂起态；
         *  版本偏好 autoUpdate 副控制落 row2（mockup 01 .pdva-acts）。#64 A2/A3 后本列**零行内红字**：
         *  事件型失败全走右下角 error toast（定案 5 禁 reflow），持久态只剩「安装失败 → 安装钮原位变红重试」 ── */}
        <div className="mpd-acts">
          <div className="mpd-acts-row">
            {disabled ? (
              <>
                {/* E6#33c/#33b 版本动作首槽：版本下拉（versions>1 有历史）+ 升/降钮（降走 requestDowngrade F2 确认 → allowOlder 放行）。
                 *  禁用态也照常——F1（引擎 wasActive=false 换文件不 reload 保持禁用）；accent 语义族零新壳组件 */}
                {versionPicker}
                {actButton}
                <Button variant="success" onClick={handleEnable} disabled={busy || updating}>
                  <span className="codicon codicon-play" /> {t("启用")}
                </Button>
                {/* E6#18a：core:true 藏卸载钮——含禁用态（core 经 getDisabled 透传） */}
                {!isCore && (
                  <Button variant="danger" onClick={handleUninstall} disabled={busy || updating}>
                    <span className="codicon codicon-trash" /> {uninstallingHere ? t("卸载中...") : t("卸载")}
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
                {/* E6#33c/#33b：版本下拉（有历史）+ 升/降钮首槽（「禁用/卸载」旁——点4 第一段） */}
                {versionPicker}
                {actButton}
                <Button variant="ghost" onClick={handleDisable} disabled={busy || updating}>
                  <span className="codicon codicon-circle-slash" /> {t("禁用")}
                </Button>
                {!isCore && (
                  <Button variant="danger" onClick={handleUninstall} disabled={busy || updating}>
                    <span className="codicon codicon-trash" /> {uninstallingHere ? t("卸载中...") : t("卸载")}
                  </Button>
                )}
              </>
            ) : (
              <>
                {/* E6#33c：未装版本下拉（versions>1 选装哪个版本——05 §四场景①，选中即目标，默认最新/升级提示则 target） */}
                {installPicker}
                {installErrHere ? (
                  /* #64 A3（mockup 02 帧 3）：同一失败只留一处重试口——安装钮原位变红「↻ 重试安装」
                   *  （toast [重试] 同 retryMarketInstall、同目录 downloadUrl = 双口零漂移）；
                   *  点击重发同一下载 → 新 job 转在跑，红钮自然消失回进度 */
                  <Button
                    variant="danger"
                    onClick={() => {
                      void retryMarketInstall(pluginId ?? "", installUrl ?? "", entry?.name);
                    }}
                    disabled={busy || !online}
                    title={!online ? t("联网后重试") : undefined}
                  >
                    <span className="codicon codicon-refresh" /> {t("重试安装")}
                  </Button>
                ) : (
                  <Button
                    variant="success"
                    onClick={handleInstallClick}
                    disabled={busy || installingHere || queuedHere || !online}
                    title={!online ? t("联网后重试") : queuedHere ? t("等待安装中") : undefined}
                  >
                    <span className="codicon codicon-cloud-download" />
                    {installingHere ? installLabel() : queuedHere ? t("等待安装中") : t("安装")}
                  </Button>
                )}
              </>
            )}
          </div>

          {/* #33d 自动更新勾选（row2 副控制——mockup 01 .pdva-acts row2 L849-851；G2：已装且非挂起才渲染） */}
          {autoUpdateToggle}
        </div>
      </header>

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
          {/* E6#33b：可更新 → 更改日志 tab 亮 dot（04 §二·五——新内容在 changelog） */}
          {hasUpdate && <span className="mpd-nav-dot" aria-label={t("有新版本可用")} />}
        </button>
      </nav>

      {/* ═══ Body = tab 内容(main) + 元数据侧栏(aside，常驻三 tab) ═══ */}
      <div className="mpd-body">
        <div className="mpd-details-layout">
          <div className="mpd-details-main">
            {tab === "overview" && (
              <>
                {/* E6#33b 第四维「有新版本可用」块（04 §二·五 mockup 帧 6）——主区顶部 accent 信息带：
                 *  当前安装/市场最新两版本 + 引导点「更改日志」tab（dot 同语义）。动作在 action bar 首槽。 */}
                {hasUpdate && updateTarget && (
                  <div className="mpd-update-block" role="status">
                    <span className="codicon codicon-arrow-up mpd-update-block-icon" />
                    <div className="mpd-update-block-body">
                      <div className="mpd-update-block-title">{t("有新版本可用")}</div>
                      <p className="mpd-update-block-lead">
                        {t("当前安装 {{localVersion}}，市场最新 {{remoteVersion}}", {
                          localVersion: localVer ? `v${localVer}` : "—",
                          remoteVersion: `v${updateTarget}`,
                        })}
                      </p>
                      <button className="mpd-update-block-hint" onClick={() => setTab("changelog")}>
                        {t("更新内容见「更改日志」tab")}
                        <span className="codicon codicon-arrow-right" />
                      </button>
                    </div>
                  </div>
                )}
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
                {readme.mode === "content" && readme.content && (
                  <MarkdownView
                    markdown={readme.content}
                    className="mpd-readme"
                    assetBase={readme.assetBase}
                  />
                )}
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
                remote={remoteChangelog}
              />
            )}
          </div>

          {/* ═══ 元数据侧栏（30.6c2/c3 + #63c B3 分组定稿——mockup 04：顶部无节题小段 + 组 市场/类别/资源/依赖·环境；
           *  label 左 | value 右 横排 + 项间细分隔；结构全插件固定；字段集全保留——内容组装见上方 infoGroups IIFE） ═══ */}
          <aside className="mpd-info-sidebar">
            {infoGroups.map((g) => (
              <InfoGroup key={g.title ?? "__top"} title={g.title} items={g.items} />
            ))}
          </aside>
        </div>
      </div>

    </div>
  );
}
