/**
 * 插件磁盘落点——「它在哪根」判定 + 卸载时把它搬离安装位置。
 *
 * E6#73m K1 自 `lifecycle-ops.ts` 抽出的**自成一体的一条腿**（体积门禁 800 行；这条腿输入一个
 * 插件 id、输出「它原来在哪根」，不碰 registry / 事件 / 账本）。`isUnderHome` 一并搬来——它是
 * 本腿的判据本身，且 `update.ts` 也消费（由 lifecycle-ops 原样再导出，调用方零改动）。
 *
 * 双根语义（E6#12 1.2-4）：
 *   - **userData 家**（`{userData}/plugins`，`.linkdesk-plugin` 解压处）→ **真删**（无 .disabled
 *     坟场，重装需重新装包）
 *   - **app 树**（dev 源码 / 内置）→ **移 .disabled 坟场**（现语义，可 reinstall）
 * 磁盘位置是事实（硬约束 11），env 双根同源前缀比对。
 */

import type { PluginManifest } from "../../core/api/types";
import { linkdesk, pluginsApi, log, errMsg, cachePluginMetadata } from "../resolution/state";
import { normalizePath } from "../../core/utils/path/pathUtils"; // 跨 IPC 路径归一化唯一正源（no-raw-path-replace）

/** 磁盘落点判定——src（resolvePath 回传）是否在 home（env.userPluginsDir 等）内。
 *  🔴 前缀比对必须走 normalizePath：resolvePath（IPC 回传）是正斜杠，home（主进程 path.join）是反斜杠——
 *  直接 startsWith 恒 false，userData 卸载误走 .disabled 坟场（2026-09-05 实机门禁实证）。uninstall/update 共用。 */
export function isUnderHome(src: string, home: string | undefined): boolean {
  if (!home) return false;
  const s = normalizePath(src);
  const h = normalizePath(home);
  return s === h || s.startsWith(`${h}/`);
}

/**
 * 把插件搬离它的安装位置——卸载的**磁盘腿**。
 *
 * @returns `userDataHome` = 它原本在 userData 家（真删，**不可** in-app 撤销）；
 *          false = app 树（进了 `.disabled` 坟场，`reinstall` 能移回）
 */
export async function relocateForUninstall(
  pluginId: string,
  manifest: PluginManifest,
): Promise<{ userDataHome: boolean }> {
  // E5#32：文件操作走 linkdesk.filesystem——bridge 为唯一入口，不再走 plugins:uninstall 直接 IPC
  const src = await pluginsApi().resolvePath(pluginId);
  const env = await linkdesk().env.get();
  const userDataHome = isUnderHome(src, env.userPluginsDir);

  if (userDataHome) {
    await linkdesk().filesystem.remove(src);
    // E6#18c：userData 卸载 = 墓碑化——目录已真删，账本保留条目置 removed:true（markRemoved，
    // 保 version/installedAt/source 成历史）。随车/市场/手动卸载同款墓碑，零来源分支。永不整条删
    // 账本条目——墓碑被删 = 种子腿把发货插件当「从未装过」重铺 = 二启复活缝。动态 import 非致命。
    try {
      const { markRemoved } = await import("../../core/services/PluginInstallService");
      await markRemoved(pluginId);
    } catch (e) {
      log.appendLine(`⚠️ 账本墓碑写入失败（非致命）: ${errMsg(e)}`);
    }
    // 不 cachePluginMetadata("uninstalled")——.disabled 坟场不含该目录，reinstall 找不到源会报错；
    // 僵尸 "installed" 缓存由 loader 启动步骤 6 差集清理（loadedPluginIds 已无它）。
    return { userDataHome };
  }

  const disabledDir = `${env.appPluginsDir}/.disabled`;
  const dest = `${disabledDir}/${pluginId}`;
  await linkdesk().filesystem.createDir(disabledDir);
  if (await linkdesk().filesystem.exists(dest)) {
    await linkdesk().filesystem.remove(dest);
  }
  // E6#73m K1：**rename 优先，被锁则退回 copy+remove**。
  // 为什么改：`file-service.ts` 的 `copy` 落到 `copyDir` 是逐文件真复制（`fs.copyFile` 循环），
  // 于是同一批字节被写一遍再删一遍，大插件的卸载耗时凭空翻倍（K 域那条「卸载没进度、也说不清
  // 是不是卡死」的病根之一）。`rename` 是同一门面里现成的原语（`fs.rename`），一次系统调用搬完。
  // ⚠️ **回退不是防御性编程，是已知事故的复刻**：Tauri 时代同一操作就栽过（commit `aec1564`
  // —— Windows 上 Vite 握着 plugins/ 内文件的句柄，跨目录 rename 报 EPERM/EBUSY，当时的修法
  // 正是改成 copy+remove）。两条都留着：快路照走，被锁就退回老路，比二选一稳。
  try {
    await linkdesk().filesystem.rename(src, dest);
  } catch (e) {
    log.appendLine(`⚠️ 移入坟场 rename 失败（${errMsg(e)}）——退回 copy+remove`);
    await linkdesk().filesystem.copy(src, dest);
    await linkdesk().filesystem.remove(src);
  }

  // Rust 成功 → 前端更新（仅 app 树移坟场才入 uninstalled 缓存）
  cachePluginMetadata(pluginId, manifest, "uninstalled");
  return { userDataHome };
}
