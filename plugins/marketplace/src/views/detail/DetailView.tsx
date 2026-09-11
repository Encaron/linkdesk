/**
 * DetailView——插件详情主区渲染面（contributes.views.main["plugin-detail"]，容器 "main" 由壳
 * ShellViewRenderer 在 plugin-detail 标签页消费——E6#30.10b）。
 *
 * E6#86a（第 3.6.3 轮）feature-folder 化：**本文件是门面**——原 1258 行按职责拆进同名夹 `DetailView/`
 * （身份/版本/数据/包文件/动作/安装腿六个 hook + 头/动作列/侧栏/概览/功能/更改日志六个展示件 +
 *  `info-bits` / `info-groups` 两组原子件 + `actionBits` 五枚小件构造器）。
 * **零行为变更、零消费方改动**（SDK bundle key = basename，不随目录移动而变）。
 * E6#86e（第 3.6.6 轮）views 分组：本文件随「详情容器」整体移入 `views/detail/`（视图源码路径由
 * `views/DetailView.tsx` 变为 `views/detail/DetailView.tsx`；SDK bundle 名 `views/DetailView.bundle.js`
 * 不变——surface key = render basename，故已装插件的引用零影响）。
 * 拆法逐段对照见 docs/02-Electron架构/E6_插件生态与发布/文件整理层/03-市场插件整理.md §二。
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
 * 降级 description）；功能 = contributes 四组渲染（FeaturesTab）；更改日志 = 包内 CHANGELOG / 目录
 * versions（ChangelogTab）；元数据侧栏分组内字段源同 30.6c2/c3（含 E6#30.8b 下载数 / #30.8c minApp）。
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

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pickIdentityArt } from "@linkdesk/ui";
import { useOnlineStatus } from "../../services/marketplaceShared";
import { authorLabel } from "../../services/installConfirmPayload";
import type { DetailContributedProps, TabId } from "./DetailView/types";
import { useDetailIdentity } from "./DetailView/useDetailIdentity";
import { useDetailVersions } from "./DetailView/useDetailVersions";
import { useDetailData } from "./DetailView/useDetailData";
import { useDetailPackage } from "./DetailView/useDetailPackage";
import { useDetailActions } from "./DetailView/useDetailActions";
import { useDetailVersionAction } from "./DetailView/useDetailVersionAction";
import { useInstallAction } from "./DetailView/useInstallAction";
import { useActionBits } from "./DetailView/useActionBits";
import DetailHeader from "./DetailView/DetailHeader";
import DetailActionBar from "./DetailView/DetailActionBar";
import DetailInfoSidebar from "./DetailView/DetailInfoSidebar";
import DetailOverviewTab from "./DetailView/DetailOverviewTab";
import FeaturesTab from "./DetailView/FeaturesTab";
import ChangelogTab from "./DetailView/ChangelogTab";
/* E6#86d：详情样式已按实测分节拆为 6 件（原 MarketplaceDetail.css 861 行）——**本处按原文档顺序
 *  全量 import**，理由与「不用谁用谁 import」的判据见 detail-shell.css 头注。 */
import "../../styles/detail-shell.css";
import "../../styles/detail-header.css";
import "../../styles/detail-actions.css";
import "../../styles/detail-body.css";
import "../../styles/detail-features.css";
import "../../styles/detail-changelog.css";

const lk = () => window.linkdesk;

export default function DetailView({ pluginId }: DetailContributedProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabId>("overview");
  /* #30.9b 离线态（G3）——navigator.onLine false → 安装/更新钮置灰 + 「联网后重试」（不产生失败会话）；
   *  提早在顶声明——版本动作/安装门禁 deps 均读它（TDZ 防御：勿下移，下移即渲染即崩） */
  const online = useOnlineStatus();

  const id = useDetailIdentity(pluginId);
  const ver = useDetailVersions(id);
  const data = useDetailData(id);
  const pkg = useDetailPackage(id);
  const act = useDetailActions(id, { localVer: ver.localVer });
  const vAct = useDetailVersionAction(id, {
    busy: act.busy,
    updating: act.updating,
    setUpdating: act.setUpdating,
    online,
    localVer: ver.localVer,
  });
  const inst = useInstallAction(id, {
    busy: act.busy,
    online,
    installUrl: ver.installUrl,
    installVer: ver.installVer,
    appVersion: ver.appVersion,
  });
  const { info, entry, disabled, pending, installed, enabledEntry, pluginsLoading, catalog } = id;
  /* 右上动作列五枚小件（版本/安装下拉 · 版本动作钮 · 自动更新勾 · 已停在 vX）——判据全在 useActionBits，
   *  本处只把结果转交 DetailActionBar（null = 该槽不出画） */
  const bits = useActionBits({ ver, act, inst, vAct, online, pending, installed, hasEntry: !!entry, t });

  /* 切插件（宿主复用实例）重置 tab（本地包文件状态的重置在 useDetailPackage，锚同 pluginId） */
  useEffect(() => {
    setTab("overview");
  }, [pluginId]);

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

  /* 元数据侧栏数据（E6#30.8b 下载数仅 ready 显；被依赖列表带显示名） */
  const dlCount = ver.dl.status === "ready" ? ver.dl.count : undefined;
  const dependents = data.dependents.map((d) => ({ pluginId: d.pluginId, name: d.manifest.name ?? d.pluginId }));

  /* 依赖行点击 → 跳依赖插件详情页（30.5e/30.6c3「点击跳其详情页」）——E6#30.7b 带 label
   *  （depLabel：已装名/目录名兜底，未装目标壳 viewRegistry 无 manifest 无法自行命名）。 */
  const handleJumpToDep = (dep: string) => {
    lk()?.tabs?.create("plugin-detail", { pluginId: dep, pinned: false, label: data.depLabel(dep) });
  };

  return (
    <div className="mpd-detail">
      {/* ═══ Header（#63a B1：三段一行——icon ｜ id/副题/简述列 ｜ 右上动作列 .mpd-acts） ═══ */}
      <DetailHeader
        pluginId={pluginId}
        iconManifest={iconManifest}
        nameText={nameText}
        versionText={versionText}
        authorText={authorText}
        showDesc={showDesc}
        descText={descText}
        isCore={isCore}
        official={entry?.official}
        actions={
          <DetailActionBar
            disabledRow={disabled}
            pending={pending}
            pendingReason={enabledEntry?.pendingReason}
            hasInfo={!!info}
            isCore={isCore}
            online={online}
            busy={act.busy}
            updating={act.updating}
            installingHere={inst.installingHere}
            queuedHere={inst.queuedHere}
            uninstallingHere={inst.uninstallingHere}
            installFailed={!!inst.installErrHere}
            installLabel={inst.installLabel()}
            versionPicker={bits.versionPicker}
            installPicker={bits.installPicker}
            actButton={bits.actButton}
            autoUpdateToggle={bits.autoUpdateToggle}
            pinnedNote={bits.pinnedNote}
            onEnable={() => void act.handleEnable()}
            onDisable={() => void act.handleDisable()}
            onUninstall={() => void act.handleUninstall()}
            onInstallClick={() => void inst.handleInstallClick()}
            onRetryInstall={inst.retryInstall}
          />
        }
      />

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
          {ver.hasUpdate && <span className="mpd-nav-dot" aria-label={t("有新版本可用")} />}
        </button>
      </nav>

      {/* ═══ Body = tab 内容(main) + 元数据侧栏(aside，常驻三 tab) ═══ */}
      <div className="mpd-body">
        <div className="mpd-details-layout">
          <div className="mpd-details-main">
            {tab === "overview" && (
              <DetailOverviewTab
                hasUpdate={ver.hasUpdate}
                updateTarget={ver.updateTarget}
                localVer={ver.localVer}
                missingDeps={data.missingDeps}
                depLabel={data.depLabel}
                shots={pkg.shots}
                readme={pkg.readme}
                showDesc={showDesc}
                descText={descText}
                nameText={nameText}
                onJumpToDep={handleJumpToDep}
                onGotoChangelog={() => setTab("changelog")}
              />
            )}
            {tab === "features" && (
              <FeaturesTab
                pluginId={pluginId ?? ""}
                contributes={enabledEntry?.manifest.contributes}
                hasContribSource={!!enabledEntry}
                installed={installed}
              />
            )}
            {tab === "changelog" && (
              <ChangelogTab
                installed={installed}
                localChangelog={pkg.pkgChangelog}
                localVersion={versionText}
                versions={entry?.versions}
                latestVersion={entry?.version}
                remote={ver.remoteChangelog}
              />
            )}
          </div>

          {/* ═══ 元数据侧栏（30.6c2/c3 + #63c B3 分组定稿——mockup 04：顶部无节题小段 + 组 市场/类别/资源/依赖·环境；
           *  label 左 | value 右 横排 + 项间细分隔；结构全插件固定；字段集全保留） ═══ */}
          <DetailInfoSidebar
            pluginId={pluginId}
            installed={installed}
            entry={entry}
            authorText={authorText}
            versionText={versionText}
            diskLoc={id.diskLoc}
            appBelowMin={ver.appBelowMin}
            dlCount={dlCount}
            sourceName={data.sourceName}
            repoUrl={data.repoUrl}
            issuesUrl={data.issuesUrl}
            firstRelease={data.firstRelease}
            lastUpdate={data.lastUpdate}
            categoryList={data.categoryList}
            requiresList={data.requiresList}
            missingDeps={data.missingDeps}
            dependents={dependents}
            depLabel={data.depLabel}
            onOpenDir={id.openPluginDir}
            onJumpToDep={handleJumpToDep}
          />
        </div>
      </div>
    </div>
  );
}
