/**
 * useCatalogInstall——探索视图的行内安装入口（门禁 → 统一安装链路）。
 * E6#86b（第 3.6.3 轮）feature-folder 拆分：自 `views/ExploreView.tsx` 原样搬出，零行为变更
 * （判断顺序、文案 key、调用参数全保留）。
 *
 * 安装钮 → E6#31 下载安装链路（统一 startMarketInstall 单活跃会话——#30.9a 行进度 + #30.9b
 *   失败态行/toast[重试] 消费同源；成功 lifecycle 事件驱动列表翻态）。
 * E6#71d 归一：行内安装 = 详情页同款富内容确认（installConfirmPayload + ConfirmInstall 视图——
 *   mockup 02 本意两入口都先确认；71c 前侧栏直装是漏做，71d 补齐）。确认卡显示的版本 = 本行将装的
 *   entry.downloadUrl 对应 entry.version（installConfirmPayload 缺省 installVer），行显 v{version} 不撒谎。
 *
 * `online` 由门面透出（视图层已持 useOnlineStatus，勿在行内重复订阅）。
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { notifyError, startMarketInstall } from "../../services/marketplaceShared";
// E6#71k「都问」：安装确认门——行内安装与详情页走同一门（双入口单门，零漂移）
import { confirmMarketInstall } from "../../services/installGate";
import type { CatalogEntry } from "../../services/marketCatalog";

const lk = () => window.linkdesk;

export function useCatalogInstall(online: boolean) {
  const { t } = useTranslation();

  const handleInstall = useCallback(
    async (entry: CatalogEntry) => {
      if (!online) return; // 离线钮置灰（G3）——此处防御不发起（title 已提示「联网后重试」）
      if (!entry.downloadUrl) {
        // #64 A1：阻塞式弹窗 → 事件型 error toast（定案 5——toast 报一次即可，零页面占位）
        notifyError(t("该插件缺少下载地址"));
        return;
      }
      // installWithProgress 契约上选填（老 preload 面无此法）——缺 = 安装链路不可用，别静默
      if (!lk()?.pluginManager?.installWithProgress) {
        notifyError(t("安装失败"));
        return;
      }
      // E6#71k「都问」：行内安装与详情页走同一个门（installGate）——**恒弹卡**，官方来源不豁免。
      // 门在模块里统一弹 ConfirmInstall 富内容卡，本视图只消费布尔结果（零判定逻辑在此）。
      const confirmed = await confirmMarketInstall(entry, "install");
      if (!confirmed) return;
      // 进度/失败/重试全走 startMarketInstall（进等待队列 → settle 归因 + toast[重试]，幂等单发）
      // E6#73c 第 1 步：带显示名——壳侧 job 行需要它（目录未加载时进程内也能兜底解析，不传则退化为 id）
      await startMarketInstall(entry.id, entry.downloadUrl, entry.name);
    },
    [online, t],
  );

  return { handleInstall };
}
