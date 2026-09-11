/**
 * useInstallAction——详情视图的安装腿：壳侧 job 行镜像 + 安装门禁 + runInstall + 三个点击入口。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailView.tsx` 原样搬出，零行为变更。
 *
 * E6#73c 第 2 步起「在跑/排队/已出结果」读壳侧 job 表（`plugin:installJobs` 广播回流，与通知面板同源
 * 同一份数据）——市场不再自持会话或队列。安装执行单一入口仍留本模块（`runInstall`）。
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { compareVersions, pinnedAfterApply } from "../../../services/marketCatalog";
import { notifyError, startMarketInstall, retryMarketInstall } from "../../../services/marketplaceShared";
import { confirmMarketInstall } from "../../../services/installGate";
import { installJobLabel, useInstallJob } from "../../../services/installJobs";
import { setPinnedVersion } from "../../../services/installedUpdateMeta";
import type { DetailIdentity } from "./useDetailIdentity";

const pm = () => window.linkdesk?.pluginManager;

export function useInstallAction(
  id: DetailIdentity,
  o: {
    busy: boolean;
    online: boolean;
    installUrl?: string;
    installVer?: string;
    appVersion?: string;
  },
) {
  const { t } = useTranslation();
  const { pluginId, entry, installed } = id;
  const { busy, online, installUrl, installVer, appVersion } = o;

  /* E6#73c 第 2 步：本插件的安装 job（壳侧 job 表的只读镜像，经 plugin:installJobs 广播回流）。
   *  排队/在跑/已出结果三态与通知面板同源同一份数据——市场不再自持会话或队列。
   *  useInstallJob 已按「在跑 > 排队 > 最新一条已出结果」为**本插件**挑好，故这里不再按 pluginId 过滤。 */
  const installJob = useInstallJob(pluginId);
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
    // 🔴 E6#81：**装 = 一次新的落地，压过以前那次**——故 `pin === undefined`（目录无稳定版可比，`pinnedAfterApply`
    //   的「不写空钉」语义）在这里要写成 **清钉**（`?? null`），不能「不写」。不写的后果：上一轮安装留下的
    //   钉继续生效 ⇒ 用户刚装的这一版被一个他早就不记得的旧版本钉着，自动更新静默不跑。
    //   （「不写空钉」的原始理由是「没有可防的目标就别造一条记录」——那是**不新建**，不是**不清旧**。）
    const ver = installVer;
    if (ver) {
      const pin = pinnedAfterApply(entry, ver);
      void setPinnedVersion(pluginId, pin ?? null);
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

  /** #64 A3（mockup 02 帧 3）：同一失败只留一处重试口——安装钮原位变红「↻ 重试安装」
   *  （toast [重试] 同 retryMarketInstall、同目录 downloadUrl = 双口零漂移）；
   *  点击重发同一下载 → 新 job 转在跑，红钮自然消失回进度。 */
  const retryInstall = useCallback(() => {
    void retryMarketInstall(pluginId ?? "", installUrl ?? "", entry?.name);
  }, [pluginId, installUrl, entry]);

  return {
    installingHere,
    installErrHere,
    queuedHere,
    uninstallingHere,
    installLabel,
    installGateError,
    runInstall,
    handleInstallClick,
    retryInstall,
  };
}
