/**
 * useDetailActions——详情视图的生命周期动作：启用 / 禁用 / 卸载 / 自动更新勾选（+ 动作进行态 busy/updating）。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailView.tsx` 原样搬出，零行为变更。
 *
 * 执行后本地不翻转状态——lifecycle 事件驱动 useMarketplacePlugins 自动 refreshData，视图随刷新收敛到真值
 * （30.11d）。版本升级/降级动作在兄弟模块 `useDetailVersionAction`。
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { notifyError } from "../../../services/marketplaceShared";
import { enableAutoUpdateAndRun } from "../../../services/updateDiscovery";
import { readPluginUpdateMeta, setAutoUpdate } from "../../../services/installedUpdateMeta";
import type { DetailIdentity } from "./useDetailIdentity";

const lk = () => window.linkdesk;
const pm = () => window.linkdesk?.pluginManager;

export function useDetailActions(id: DetailIdentity, o: { localVer?: string }) {
  const { t } = useTranslation();
  const { pluginId, installed, displayName } = id;
  /* localVer 属版本层（useDetailVersions），不属身份层——由门面显式转入 */
  const { localVer } = o;

  const [busy, setBusy] = useState(false);
  /* E6#33b：更新执行进行中（update 无独立会话——单插件动作，busy 局部即可；引擎只发 installProgress + 壳 toast，
   *  无 lifecycle 事件 → 成功需显式 refreshPlugins 收敛版本/徽标） */
  const [updating, setUpdating] = useState(false);
  /* E6#33d 自动更新勾选状态——installedUpdateMeta.autoUpdate（Opt-IN 默认关，只存 true；见下方读 effect） */
  const [autoOn, setAutoOn] = useState(false);
  /* 🔴 E6#83：installedUpdateMeta.pinnedVersion——「停在旧版」这条记录**此前界面零可见面**。2026-09-11
   *  实机报障：用户手动降级（下拉挑旧版）记下这条钉 → 勾「自动更新」→ 关软件重开 → **什么都没发生**，
   *  而勾选框 tooltip 明明写着「勾选后自动更新——有新版本就自动装上」。两条自己下的指令打架、后者静默获胜
   *  且不留痕 ⇒ 本条 state 只为一件事：**把它显示出来**（不知情就不可能有选择）。 */
  const [pinnedVer, setPinnedVer] = useState<string | undefined>(undefined);

  /* #33d 自动更新勾选初值读——切插件/已装态锚变即重读收敛（记账/自动更新兜底）；
   *  G2 只在已装态渲染（autoUpdateToggle），未装/挂起不渲染但 anchor 变仍复位为 false。
   *  🔴 E6#83：同一趟**顺手读 pinnedVersion**（同一条 meta 记录的两个字段，不另开一次 IPC）——它决定
   *  「已停在 vX」那枚说明件显不显示。deps 补 `localVer`：钉随版本动作落地而变（升到最新清钉 / 降级记钉），
   *  版本一动就该重读，否则说明件停在旧值上又是一个「快照遮蔽真值」（[[snapshot-shadows-truth-bug-class]]）。 */
  useEffect(() => {
    let alive = true;
    setAutoOn(false);
    setPinnedVer(undefined);
    const id = pluginId ?? "";
    if (!id || !installed) {
      return () => {
        alive = false;
      };
    }
    void readPluginUpdateMeta(id).then((m) => {
      if (!alive) return;
      setAutoOn(m.autoUpdate === true);
      setPinnedVer(m.pinnedVersion);
    });
    return () => {
      alive = false;
    };
  }, [pluginId, installed, localVer]);

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

  /* 卸载 = 二次确认（dialog.confirm——真实原语，mockup 帧 4「复用现有 confirm」）→ 执行。
   *   core:true 藏钮（#18），但命令层可卸；不确认不卸。 */
  const handleUninstall = useCallback(async () => {
    if (!pluginId || busy) return;
    const confirmApi = lk()?.dialog?.confirm;
    if (!confirmApi) return;
    // 确认文案用当前插件显示名（displayName 已提到身份层——启/禁/卸三处共用）
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
      if (!on) return;
      /* 🔴 E6#83（2026-09-11 用户拍板）——**勾上「自动更新」= 同时撤掉「停在旧版」**。
       *
       *  这两条是**同一条意愿的两个方向**，不可能同时为真：钉 =「别给我升」，开关 =「有新版本就自动装上」
       *  （勾选框自己的 title 原话）。此前只记开关、不动钉 ⇒ 钉**静默**压过开关：用户降级 → 勾上 → 关软件
       *  重开 → 什么都没发生，界面一个字不解释（实机报障，E6#82 修完仍原样复现——那次修的是「检查只跑一趟」，
       *  这次是「检查跑到了却被一条看不见的记录拦住」，两码事）。
       *  判给开关赢的理由：① 它是**更晚、更直白**的那次表态；② 它自己的说明文字就是这么承诺的——软件得说到
       *  做到；③ 钉此前**零可见面**（本轮补上），用户不知道它存在，不该由一条看不见的记录替用户做主。
       *  ⚠️ 只清钉、不绕过 auto 门——`runAutoUpdateIfDue` 仍走 `selectAutoCandidates`（autoUpdate on +
       *  未钉版本）：先把「未钉」这一半做真，再让判定照原样跑，不给现算开第二条后门。 */
      setPinnedVer(undefined); // 乐观——说明件立刻消失（不够时的兜底 = 上面 effect 锚变重读）
      await enableAutoUpdateAndRun(pluginId); // 清钉 + 勾开即跑一趟（真执行；结果由该模块发通知）
    },
    [pluginId, busy, updating],
  );

  return { busy, updating, setUpdating, autoOn, pinnedVer, handleEnable, handleDisable, handleUninstall, handleAutoToggle };
}
