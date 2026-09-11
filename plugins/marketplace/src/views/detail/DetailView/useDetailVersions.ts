/**
 * useDetailVersions——详情视图的版本层：可更新判定 + 版本下拉（显示值/动作目标）+ 安装寻址 + 下载数。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailView.tsx` 原样搬出，零行为变更。
 *
 * 三条判据全在 `marketCatalog` 单源（`updateTargetFor` / `defaultVersionPick` / `versionActionTarget`），
 * 本层只做组合——UI 与发现编排不各写一份「算不算有更新」（E6#81 的教训）。
 */

import { useEffect, useMemo, useState } from "react";
import {
  compareVersions,
  defaultVersionPick,
  selectableVersions,
  updateTargetFor,
  versionActionTarget,
  versionDownloadUrl,
} from "../../../services/marketCatalog";
import { useDownloadCount } from "../../../services/downloadCounts";
import type { DetailIdentity } from "./useDetailIdentity";

const lk = () => window.linkdesk;

export function useDetailVersions(id: DetailIdentity) {
  const { pluginId, enabledEntry, disabledHit, entry, installed, pending } = id;

  /* E6#30.8c：读壳版本号一次（app.getVersion）——minAppVersion 门禁比对基准（缺/读失败 = undefined 放行不拦） */
  const [appVersion, setAppVersion] = useState<string | undefined>(undefined);
  /* E6#33c：版本下拉选值（版本动作目标——装哪版/升到哪版/降到哪版）——undefined = 未人工介入，
   *  渲染取 defaultPickTarget() 兜底（首帧/锚变化无闪）。锚变化（插件/条目/已装态/默认目标）重置见下 effect。 */
  const [pickedVersion, setPickedVersion] = useState<string | undefined>(undefined);

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

  /* E6#30.8b：下载数（GitHub 资产 read-only 计数）——本地无 marketEntry → hidden 不显示空位（诚实：无数据不造假） */
  const dl = useDownloadCount(!entry ? undefined : entry.downloadUrl);
  /* E6#30.8c：当前壳版本 < 插件 minAppVersion → 拒绝新装 + 元数据「需 LinkDesk」标红 */
  const appBelowMin =
    !!entry?.minAppVersion && !!appVersion && compareVersions(appVersion, entry.minAppVersion) < 0;

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

  /* E6#33c：下拉选值生命周期——锚（插件/条目/已装态/更新目标/已装版本）变化 → 重置回默认（用户未介入时
   *  跟随最新；更新/降级完成 localVer 变化 → 默认随新版收敛）。用户正选中且锚未动 → effect 不触发，选择保持。 */
  useEffect(() => {
    setPickedVersion(undefined);
  }, [pluginId, entry?.id, installed, updateTarget, localVer]);

  /* ── E6#33c 版本动作（升/降）目标与方向——installed 态（未装走安装分支）：有历史 → 下拉选值驱动
   *  （可停旧版/进 beta/降级）；无历史 → #33b 单目标 updateTarget（保持原单钮语义）。
   *  E6#81 起「未介入」也算一个态：下拉停在**已装版**（那是它现在的职责——显示你手上是什么），
   *  动作目标则回落 updateTarget，否则一键更新会消失。
   *  🔴 **动作目标与下拉显示值已解耦。** 下拉回答「我现在是哪个版本」（= targetVersion，已装即 localVer）；
   *  本变量回答「点下去会变成哪个版本」。用户**未介入**（pickedVersion === undefined）→ 取 updateTarget
   *  （#33b 原意保住：更新钮首帧即现）；用户一旦手动选值 → 按钮就跟着所选走。不这么分的话，下拉显示
   *  localVer 会让 actDir 恒为 "same" ⇒ 更新钮消失 = 把 #33b 的一键更新弄丢。 */
  const actTarget = canSwitchVersion && !pending
    ? versionActionTarget({ hasHistory: hasVersionHistory, updateTarget, picked: pickedVersion })
    : undefined;
  /* 显式标注（不靠推导）：本 hook 的返回值供 `ReturnType<typeof ...>` 取型，而**返回位置的字符串字面量会被
   *  拓宽成 `string`**——不标死，`actionBits.versionActButton` 的 `dir: "up" | "down"` 就接不上。 */
  const actDir: "up" | "down" | "same" | undefined =
    actTarget && localVer
      ? compareVersions(actTarget, localVer) > 0
        ? "up"
        : compareVersions(actTarget, localVer) < 0
          ? "down"
          : "same"
      : undefined;
  const pickerOptions = versionChoices.map((c) => ({ value: c.version, label: `v${c.version}` }));

  return {
    appVersion,
    dl,
    appBelowMin,
    localVer,
    updatable,
    updateTarget,
    hasUpdate,
    remoteChangelog,
    versionChoices,
    hasVersionHistory,
    canSwitchVersion,
    shownFallback,
    targetVersion,
    pickedVersion,
    setPickedVersion,
    installVer,
    installUrl,
    actTarget,
    actDir,
    pickerOptions,
  };
}
