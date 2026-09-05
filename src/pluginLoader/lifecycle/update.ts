/**
 * 安全更新流（E6#11c/#13b/c，段 B）——check → stage → unload → commit → 账本 → 重载。
 * E6#0.6b 拆夹：self lifecycle-ops.ts 抽出（816 行超 800 体积门禁 E6#0.6a）——feature-folder 聚合器
 * lifecycle-ops 保留安装/卸载/禁用/启用；checkPluginUpdates/updatePlugin 归本文件。
 * 依赖方向：update → lifecycle-ops（emitInstallProgress/packageOps/isUnderHome/revert 族）+ runtime/loadState，
 *   lifecycle-ops 不反向 import 本文件——无环。
 */

import i18n from "../../i18n"; // toast 动作标签壳 t() 解析（显示文本铁律）
import { pushToast } from "../../core/services/ui/NotificationService";
import { unloadPlugin } from "../resolution/loadState"; // E5.8#11：唯一卸载路径状态机（#11c 机械路径）
import { loadPlugin } from "../resolution/runtime"; // 更新后尽力即时重载（失败不阻断——启动发现兜底）
import { linkdesk, pluginsApi, log, errMsg, loadedPluginIds } from "../resolution/state";
import { parseManifestJson } from "../jsonc"; // 作者 plugin.json JSONC——唯一解析入口
// E6#11c/#13b/c（段 B）：更新流结果类型——types.ts 契约面（PluginUpdateResult / PluginUpdateCheckResult）
import type { PluginUpdateResult, PluginUpdateCheckResult } from "../../core/api/linkdesk-api/types";
import {
  emitInstallProgress,
  packageOps,
  isUnderHome,
  revertThemeIfCurrent,
  revertLanguageIfCurrent,
  reapplyThemeAfterUnload,
} from "./lifecycle-ops";

/** 读已安装目录 plugin.json 全 manifest（更新流当前版本/显示名源；读失败 → null——保守按未读到处理） */
async function readInstalledManifest(dir: string): Promise<{ name?: string; version?: string } | null> {
  try {
    const raw = await linkdesk().filesystem.readTextFile(`${dir}/plugin.json`);
    const m = parseManifestJson(raw);
    if (!m || typeof m !== "object") return null;
    return {
      name: typeof (m as { name?: unknown }).name === "string" ? (m as { name: string }).name : undefined,
      version: typeof (m as { version?: unknown }).version === "string" ? (m as { version: string }).version : undefined,
    };
  } catch {
    return null;
  }
}

/** 共享前置：解析插件安装目录 + 校验在 userData 安装家（仅包可更新）+ 读当前版本/显示名——check/update 双入口共用 */
async function installedContext(pluginId: string): Promise<{ currentVersion: string; name: string }> {
  const src = await pluginsApi().resolvePath(pluginId);
  if (!src) throw new Error(`插件 "${pluginId}" 未找到安装目录`);
  const env = await linkdesk().env.get();
  if (!isUnderHome(src, env.userPluginsDir)) {
    throw new Error(`插件 "${pluginId}" 不在用户安装区——仅安装包可更新（app 树插件走重新构建）`);
  }
  const m = await readInstalledManifest(src);
  return { currentVersion: m?.version ?? "0.0.0", name: m?.name ?? pluginId };
}

/**
 * 查更新（#13b 壳面）——pluginManager.checkUpdates：fetch catalog → 版本对比 → 有新版才继续更新。
 *  catalogUrl 由调用方喂（市场层 3.x 真目录源；本轮 dev-fixtures/marketplace.json 入参驱动）。
 *  只读判定不动盘——更新动作走 updatePlugin。
 */
export async function checkPluginUpdates(pluginId: string, catalogUrl: string): Promise<PluginUpdateCheckResult> {
  const api = pluginsApi();
  if (!api.packageUpdateCheck) {
    throw new Error("[pluginLoader] 壳 plugins 面缺少 packageUpdateCheck——loader 只能在壳进程运行");
  }
  const { currentVersion: current } = await installedContext(pluginId);
  return api.packageUpdateCheck(pluginId, catalogUrl, current);
}

/**
 * 更新插件（#11c 原子 + #13b/c）——唯一安全更新入口，🈲 裸 loadPlugin 覆盖旧实例
 * （2026-08-30 立案：不 unload 直接 load = 旧 registeredEffects 残留 → 幽灵注册）。
 * 流程：update-check（有 catalogUrl 时）→ stage（新版落 tmp + 校验：id 一致 + 新版>旧版，不碰旧目录）
 *   → revert theme/lang → unloadPlugin("update") 同一机械路径（旧实例注册全退场）
 *   → commit（主进程同卷原子 rename 替换，失败复原旧版）→ 账本 add（保留 installedAt）
 *   → notify 主进程三表重扫 → loadPlugin 重载新实例 → 立即重启 toast。
 * 边界：仅 userData 安装家（包安装）可更新；core/app 树插件走重新构建。使用中（开着的标签页）
 *  自动更新暂缓（05 §二·六，自动判定属市场层）——update 前调用方应先关相关标签页。
 * 🔥 needRestart 恒 true：入口/视图 bundle 同 URL 已被旧版加载（壳+池双 realm module map）——
 *  模块缓存无法 in-session 破除（照 reinstall「移回后需全页刷新」现成机制；无 cache-bust 查询参数）。
 *  文件 + 账本已原子换新，重启后启动发现加载 v2；loadPlugin 尽力即时注册（失败不阻断）。
 */
export async function updatePlugin(
  pluginId: string,
  opts?: { catalogUrl?: string; url?: string },
): Promise<PluginUpdateResult> {
  try {
    const ops = packageOps();
    if (!ops.packageUpdateCheck || !ops.packageStageUpdate || !ops.packageCommitUpdate) {
      throw new Error("[pluginLoader] 壳 plugins 面缺少 update 三段 handler——loader 只能在壳进程运行");
    }

    // ── 前置：插件须在 userData 安装家（包安装可更新）──
    const { currentVersion, name } = await installedContext(pluginId);

    // ── 更新源：catalogUrl → check 选最新正式版；url 直给（跳过目录）；二者皆无 → 拒 ──
    let downloadUrl = opts?.url;
    if (opts?.catalogUrl) {
      emitInstallProgress("checking", pluginId, `检查 ${name} 更新`);
      const check = await ops.packageUpdateCheck(pluginId, opts.catalogUrl, currentVersion);
      if (!check.update) {
        emitInstallProgress("done", pluginId, `${name} 已是最新（v${currentVersion}）`);
        return { success: true, pluginId, currentVersion, version: currentVersion, upToDate: true };
      }
      downloadUrl = check.downloadUrl ?? downloadUrl;
    }
    if (!downloadUrl) {
      throw new Error(opts?.catalogUrl
        ? `市场目录未提供 "${pluginId}" 的下载地址`
        : `缺少更新包来源（需 url 或 catalogUrl）`);
    }

    // ── stage（主进程：下载→解压到 {userData}/tmp/.stage-<id>；校验 id 一致 + 新版>旧版）──
    emitInstallProgress("staging", pluginId, `准备新版 ${name}`);
    const staged = await ops.packageStageUpdate(pluginId, downloadUrl, currentVersion);

    // ── unload 旧实例（#11c 机械路径——注册全退场后才允许文件被替换）──
    // revert 必须在 onWillUninstall 之前——注销主题/语言后 revert 找不到归属（同 uninstall/disable 序）
    const needsMixReapply = await revertThemeIfCurrent(pluginId);
    await revertLanguageIfCurrent(pluginId);
    const wasActive = loadedPluginIds.has(pluginId);
    if (wasActive) unloadPlugin(pluginId, "update", name);

    // ── commit（主进程同卷原子 rename：target→.bak→staged→target→rm .bak；失败复原旧版→抛）──
    emitInstallProgress("committing", pluginId, `替换旧版 ${name}@${currentVersion}`);
    let committed: { pluginId: string; version: string };
    try {
      committed = await ops.packageCommitUpdate(pluginId, staged.stagedDir);
    } catch (commitErr) {
      // commit 失败——主进程已复原旧版；旧实例若已 unload → 尽力载回（重启后启动发现同样兜底）
      if (wasActive) {
        try { await loadPlugin(pluginId, "update"); } catch { /* 非致命——启动发现接管 */ }
      }
      throw commitErr;
    }
    if (needsMixReapply) await reapplyThemeAfterUnload();

    // ── 账本 add（保留 installedAt；来源沿用既有条目——marketplace 装的仍是 marketplace）──
    try {
      const { add: addLedger, getSource } = await import("../../core/services/PluginInstallService");
      const source = (await getSource(pluginId)) ?? "user";
      await addLedger(pluginId, committed.version, source);
    } catch (ledgerErr) {
      log.appendLine(`⚠️ 账本版本更新失败（非致命）: ${errMsg(ledgerErr)}`);
    }

    // ── 文件已换——通知主进程三表重扫（无论 loadPlugin 成败）──
    window.linkdesk?.pluginManager?.notifyManifestChanged?.();

    // ── loadPlugin 重载新实例（#11c 收尾）——之前 active 才 load（禁用的更新不自动启用）；失败不阻断 ──
    if (wasActive) {
      try {
        await loadPlugin(pluginId, "update");
      } catch (loadErr) {
        log.appendLine(`⚠️ 更新后即时重载失败（文件/账本已新——重启生效）: ${errMsg(loadErr)}`);
      }
    }

    emitInstallProgress("done", pluginId, `已更新 ${name} ${currentVersion} → ${committed.version}`);
    // 🔥 恒 needRestart：bundle 模块缓存（壳+池双 realm）无法 in-session 破除——视图激活走重启（reinstall 同款）
    pushToast({
      message: `已更新：${name} ${currentVersion} → ${committed.version}。点击重启以应用新版。`,
      source: pluginId,
      severity: "info",
      ttl: 0,
      actions: [
        { label: i18n.t("立即重启"), isPrimary: true, onClick: () => window.location.reload() },
      ],
    });
    return { success: true, pluginId, currentVersion, version: committed.version, needRestart: true };
  } catch (e) {
    const msg = errMsg(e);
    emitInstallProgress("error", pluginId, msg);
    return { success: false, error: msg };
  }
}
