/**
 * types — 发现域的数据形状。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `updateDiscovery.ts` 原样搬出，零行为变更。
 */

import type { CatalogEntry } from "../marketCatalog";

/** 已装插件本地快照——list()(启用) ∪ getDisabled()(禁用) 两源归一（§一·二；禁用也覆盖——F1 禁用可更新） */
export interface InstalledSnapshot {
  pluginId: string;
  /** plugin.json.version（发现比对基准） */
  localVersion: string;
  /** 展示名（铃铛/徽标文案；manifest.name 缺失回退 pluginId） */
  name: string;
  /** 禁用态——更新不改变禁用状态（§二·十 F1，组装保留供 #33b/update 后翻态） */
  disabled: boolean;
  /** E6#73j（G6）：住所——`false` = 住只读 app 根（随包发货件 / 目录源安装），**不可能被包更新**。
   *  发现编排不得为它产候选（引擎对它会抛「不在用户安装区」）——否则铃铛年年提醒一件永远做不成的事。 */
  updatable?: boolean;
}

/** 可更新候选——稳定 remote > local（#33b 徽标/升级入口、#33d 自动更新共用形态） */
export interface UpdateCandidate {
  pluginId: string;
  localVersion: string;
  /** 远端稳定版最新（marketplace.json 目录比对目标） */
  remoteLatest: string;
  name: string;
  /** 胜出目录条目（#33b 动作取 downloadUrl/versions[]；多源已取高者） */
  entry: CatalogEntry;
}

export interface DiscoveryPlan {
  /** 常驻「可更新」集合（稳定 remote > local）——含已提醒过本版的（徽标常驻到更新完成才消，§一·二） */
  candidates: UpdateCandidate[];
  /** 本趟该推铃铛的——lastNotifiedVersion !== remoteLatest（每版本一次幂等，§二·一） */
  toNotify: UpdateCandidate[];
  /** 已追上曾提醒版本 → 自愈清提醒的插件 id（§二·一「更新成功清」兜底） */
  toClearNotified: string[];
}
