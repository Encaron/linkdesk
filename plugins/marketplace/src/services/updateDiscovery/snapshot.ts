/**
 * snapshot — 本地已装快照组装（纯）+ 读盘（IPC）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `updateDiscovery.ts` 原样搬出，零行为变更。
 */

import type { PluginListEntry, PluginInfoEntry } from "@linkdesk/contracts";
import type { InstalledSnapshot } from "./types";

const pm = () => window.linkdesk?.pluginManager;

/** 两源合并为本地版本快照——list() 排除禁用故与 getDisabled() 不重叠；无版本（无法比较）丢弃。
 *  禁用条目覆盖启用条目仅防御（不发生）。缺名回退 pluginId。
 *  E6#73j（G6）：updatable 随行（两源都带——禁用不改住所）。 */
export function assembleInstalled(enabled: PluginListEntry[], disabled: PluginInfoEntry[]): InstalledSnapshot[] {
  const byId = new Map<string, InstalledSnapshot>();
  for (const p of enabled) {
    const v = p.manifest.version;
    if (!v) continue;
    byId.set(p.pluginId, {
      pluginId: p.pluginId,
      localVersion: v,
      name: p.manifest.name || p.pluginId,
      disabled: false,
      updatable: p.updatable,
    });
  }
  for (const p of disabled) {
    if (!p.version) continue;
    byId.set(p.pluginId, { pluginId: p.pluginId, localVersion: p.version, name: p.name || p.pluginId, disabled: true, updatable: p.updatable });
  }
  return [...byId.values()];
}

/** 读已装快照 + 盘上 id 全集 + 「这次读盘可不可信」（IPC 不可用/失败 → 空 + `available:false`——预览环境不崩）。
 *
 *  🔴 E6#81：**id 全集单独回传，不经 `assembleInstalled` 的「无版本条目丢弃」过滤**——销账判据是
 *  「这个插件还在不在盘上」，不是「它有没有可比较的版本」。拿过滤后的快照当判据 ⇒ 一个版本字段缺失的
 *  插件会被误判成「已卸载」而清掉它的记账。
 *
 *  🔴 `available` 是**销账的安全闸**：读盘失败也返回空数组，若调用方拿空数组当「什么都没装」⇒
 *  一次瞬时 IPC 故障就把全机的 pin / 已提醒记账**清光**。故必须区分「真的一台没装」与「没读到」。 */
export async function readInstalledSnapshot(): Promise<{
  snapshot: InstalledSnapshot[];
  installedIds: string[];
  available: boolean;
}> {
  if (!pm()?.list || !pm()?.getDisabled) return { snapshot: [], installedIds: [], available: false };
  try {
    const [enabled, disabled] = await Promise.all([pm()!.list(), pm()!.getDisabled()]);
    return {
      snapshot: assembleInstalled(enabled, disabled),
      installedIds: [...enabled.map((p) => p.pluginId), ...disabled.map((p) => p.pluginId)],
      available: true,
    };
  } catch {
    return { snapshot: [], installedIds: [], available: false };
  }
}
