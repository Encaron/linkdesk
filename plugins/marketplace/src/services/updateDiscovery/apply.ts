/**
 * apply — 对**单候选**跑引擎更新（自动更新路径的唯一执行点）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `updateDiscovery.ts` 原样搬出，零行为变更。
 */

import { versionDownloadUrl } from "../marketCatalog";
import type { UpdateCandidate } from "./types";

const pm = () => window.linkdesk?.pluginManager;

/** 对单候选跑引擎更新——url = versionDownloadUrl 取该稳定版资产（§二·四 auto 只看稳定版；顶层兜底同 #33b 寻址）。
 *  无 update 能力（预览 / 非池）/ 无 url / 引擎抛错 → false（无法自动，候选保留作手动可更新）。
 *  needRestart 恒 true 也计成功：文件已原子替换，重启生效（§二·七）。
 *  ⚠️ **不过确认门**——这是自动路径，勾选本身就是授权；确认卡只管手动路径（见文件头 E6#79 推翻经过）。 */
export async function applyEngineAutoUpdate(c: UpdateCandidate): Promise<boolean> {
  const upd = pm()?.update;
  if (!upd) return false;
  const url = versionDownloadUrl(c.entry, c.remoteLatest) ?? c.entry.downloadUrl;
  if (!url) return false;
  try {
    const r = await upd(c.pluginId, { url });
    return !!r && r.success;
  } catch {
    return false; // 引擎抛 / 断网 → 失败；候选保留（下次发现 / 手动重试）
  }
}
