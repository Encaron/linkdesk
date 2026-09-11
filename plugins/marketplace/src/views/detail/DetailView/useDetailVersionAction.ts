/**
 * useDetailVersionAction——详情视图的版本动作：升级/降级执行 + 降级确认（E6#33b/#33c）。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailView.tsx` 原样搬出，零行为变更。
 *
 * 与兄弟模块 `useDetailActions` 的分工：那边是「状态型动作」（启/禁/卸/自动更新勾选，执行完靠 lifecycle
 * 事件收敛），这边是「版本型动作」（走引擎 update，无 lifecycle 事件，需显式 refreshPlugins 收敛）。
 * `updating` 状态与它的 setter 由 `useDetailActions` 持有（勾选框也要读它），此处按参传入。
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { compareVersions, pinnedAfterApply, versionDownloadUrl } from "../../../services/marketCatalog";
import { notifyError, settleUpdateFailure, updateFailText } from "../../../services/marketplaceShared";
import { confirmMarketInstall } from "../../../services/installGate";
import { setPinnedVersion } from "../../../services/installedUpdateMeta";
import type { DetailIdentity } from "./useDetailIdentity";

const lk = () => window.linkdesk;
const pm = () => window.linkdesk?.pluginManager;

export function useDetailVersionAction(
  id: DetailIdentity,
  o: {
    busy: boolean;
    updating: boolean;
    setUpdating: (b: boolean) => void;
    online: boolean;
    /** 已装版本——升降判定基准（属版本层 useDetailVersions，由门面显式转入） */
    localVer?: string;
  },
) {
  const { t } = useTranslation();
  const { pluginId, entry, displayName, refreshPlugins } = id;
  const { busy, updating, setUpdating, online, localVer } = o;

  /* ── E6#33b/#33c 版本动作执行（升/降一码——版本动作目标 actTarget 驱动；mockup 帧 6 st-update）。
   *  壳引擎 updatePlugin：下载 temp → 校验 → 原子替换 → needRestart 恒 true + 壳 toast「已更新…重启生效」
   *  （本视图不重复 toast 成功）；F1（禁用态更新/降级）= 引擎 wasActive=false 换文件不 reload 保持禁用，照常。
   *  失败（无独立 failure toast 通道）→ 行内归因 + 手动 [重试]（同安装 M4 三，title 悬停原文）；
   *  成功 → 无 lifecycle 事件（引擎只发 installProgress + 壳 toast）→ 显式 refreshPlugins 收敛版本 +
   *  pinnedVersion 记账（05 §二·九：落地稳定最新 → 清钉追最新；停旧版/beta/中间版 → 钉住暂停 autoUpdate，
   *  供 #33d）。url = versionDownloadUrl 取所选版本资产（不默认顶层 beta）。 ── */
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
    [pluginId, busy, updating, setUpdating, online, entry, localVer, t, refreshPlugins, displayName],
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

  return { doVersionAction, requestDowngrade };
}
