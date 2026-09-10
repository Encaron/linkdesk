/**
 * 插件生命周期操作层——安装/卸载/禁用/启用 + 查询 + 主题/语言回退。
 * E5.8#0d.10-1e：自 loader.ts 拆出——Phase 4.3 生命周期 API 独立成模块。
 * 依赖方向：lifecycle-ops → runtime（loadPlugin）→ contributions → state，无反向——防环。
 * 壳 IpcBridgeHandler 的 setPluginAPI 注册在 loader.ts（聚合器），此处只定义操作。
 */

import i18n from "../../i18n"; // E5.8#37.9：通知动作标签壳 t() 解析（显示文本铁律——池哑渲染零自产文本）
import type { PluginManifest } from "../../core/api/types";
import { getAvailableThemes, normalizeThemeValue, isMixSourceOwner } from "../../core/services/ui/ThemeEngine";
import { ThemeRegistry } from "../../core/registry/appearance/ThemeRegistry";
import { LanguageRegistry } from "../../core/registry/languages/LanguageRegistry";
import { pushToast, TOAST_TTL_SUCCESS } from "../../core/services/ui/NotificationService";
import { reportError } from "../../core/services/bootstrap/ErrorService";
// E5.8#11：卸载路径全部收口到状态机 unloadPlugin——lifecycle 事件顺序由迁移图机械保障（L6b）
// E5.8#15.5：getLoadDiagnostics——挂起插件的 pendingReason（list() 数据源合并读取）
import { unloadPlugin, getLoadDiagnostics } from "../resolution/loadState";
import { getConfigurationValue, setConfigurationValue } from "../../core/services/configuration/ConfigurationService";
import {
  linkdesk,
  pluginsApi,
  log,
  errMsg,
  loadedPluginIds,
  getMetadataCache,
  cachePluginMetadata,
  getDisabledList,
  saveDisabledList,
  getLoadedManifest,
  getManifestById,
  getAllManifestEntries,
  _pendingPlugins,
} from "../resolution/state";
import { validateInstallManifest, resolveVersionConflict } from "../discovery/manifest";
import { syncAppThemeEnum, syncAppLanguageEnum, syncIconThemeEnum } from "../contributions/contributions";
import { loadPlugin } from "../resolution/runtime";
import { parseManifestJson } from "../jsonc"; // E6#55：作者 plugin.json JSONC——唯一解析入口
import { normalizePath } from "../../core/utils/path/pathUtils"; // 跨 IPC 路径归一化唯一正源（no-raw-path-replace）
// E6#13b/c（段 B）：packageOps 签名引用 PluginUpdateCheckResult——types.ts 契约面
// E6#73q：PluginInstallRequestOpts——安装请求侧身份（pluginId/displayName/origin）
// E6#73c：PluginInstallJobRef——主进程 fs/net 段的进度事件回填 job 身份（jobId 只在壳侧生成）
import type { PluginInstallRequestOpts, PluginInstallResult, PluginInstallJobRef, PluginUpdateCheckResult } from "../../core/api/linkdesk-api/types";
// E6#73q（18 档 §五 I.2）：壳侧 job 表 + N 槽限流 + FIFO——槽锁下沉到 installPlugin（两条腿共用）
import {
  acquireInstallSlot,
  beginInstallJob,
  identifyInstallJob,
  settleInstallJob,
  touchInstallJob,
  waitInstallJob,
} from "./install-queue";

/* ═══════════════════════════════════════════════════════════
   Phase 4.3 生命周期 API——安装/卸载/禁用/启用
   ═══════════════════════════════════════════════════════════ */

/**
 * 取可变更插件 manifest——未找到抛错（disable/uninstall 共用前置守卫，E5.8#1c 去重）。
 * action 用于错误文案（"禁用"/"卸载"）。
 * E6#18a：**不再因 manifest.core 拒绝**——core:true = 纯 UI 防误删旗标（详情页藏钮），无行为特权，
 * API/命令层可卸可禁（卸完写 removed 墓碑，见 uninstallPlugin userData 分支）。UI 藏钮在
 * PluginDetailPoolView（isCore 不画卸载钮）。
 * E5.8#15：回退 _pendingPlugins——缺依赖挂起（连带卸载等依赖回归）的插件也可禁用/卸载
 * （禁用优先语义在操作层闭环：连带的消费方被显式禁用 → 不被依赖出现事件自动激活）。
 */
function getMutableManifest(pluginId: string): PluginManifest {
  const manifest = getLoadedManifest(pluginId) ?? _pendingPlugins.get(pluginId);
  if (!manifest) {
    throw new Error(`插件 "${pluginId}" 未找到`);
  }
  return manifest;
}

/**
 * 禁用插件：标记到 prefs.disabledPlugins + 从 viewRegistry 移除。
 * 插件文件保留在 plugins/ 目录，下次启动跳过。
 * 对标 VS Code "Disable Extension"。
 */
export async function disablePlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const manifest = getMutableManifest(pluginId);

    const list = getDisabledList();
    if (!list.includes(pluginId)) {
      list.push(pluginId);
      await saveDisabledList(list);
    }
    // Phase 5h 行为归一化：lifecycle 消费端处理 config 清理 + tab 关闭 + iconOrder(保留) + toast
    const displayName = manifest.name;
    // B2 fix: 标记为已禁用（缓存保留——marketplace 仍可浏览详情）
    cachePluginMetadata(pluginId, manifest, "disabled");
    // revert 必须在 onWillUninstall 之前——onWillUninstall 注销主题/语言后 revert 找不到归属
    const needsMixReapply = await revertThemeIfCurrent(pluginId);
    await revertLanguageIfCurrent(pluginId);
    // E5.8#11：唯一卸载路径——unloadPlugin 状态机（unloading → notifyPluginRemoved → fire →
    // 集合清理 → disposed → onDidUninstall），L6b 顺序由迁移图机械保障（设计文档 §3.1）
    unloadPlugin(pluginId, "disable", displayName);
    // E5.8#61 审计#1：混搭来源已摘后才重合并（unload 前源配方仍注册——早合并找不到回退）
    if (needsMixReapply) await reapplyThemeAfterUnload();
    syncAppThemeEnum();
    syncAppLanguageEnum();
    syncIconThemeEnum();
    log.appendLine(`🔒 已禁用 "${pluginId}"`);
    return { success: true };
  } catch (e) {
    return { success: false, error: errMsg(e) };
  }
}

/**
 * 启用插件：从 prefs.disabledPlugins 移除 + 重新加载。
 * 对标 VS Code "Enable Extension"。
 * 注意：.tsx 视图插件启用后需重启生效（无法运行时动态 import）。
 */
export async function enablePlugin(pluginId: string): Promise<{ success: boolean; error?: string; needRestart?: boolean }> {
  try {
    const list = getDisabledList();
    const idx = list.indexOf(pluginId);
    if (idx !== -1) {
      list.splice(idx, 1);
      await saveDisabledList(list);
    }

    // 尝试重新加载——.json 插件（theme/language）即时生效；.tsx 视图插件走 glob chunk 或运行时 URL 导入。
    // E6#9c：manifest 查 manifestIndex（readAllManifests 水合——已发现即已知，无需重启）；
    // 仅索引与 glob 双无（既不在盘也不在源码树）才 needRestart 兜底。
    const manifest = getManifestById(pluginId);

    if (manifest) {
      // .json 插件（theme/language/file）——即时生效
      if ((manifest.themes || manifest.languages || (!manifest.entry && manifest.file))) {
        await loadPlugin(pluginId, "enable");
        log.appendLine(`🔓 已启用 "${pluginId}"`);
        return { success: true };
      }
      // 视图插件——loadPlugin(reason:'enable') → lifecycle 消费端处理 iconOrder(保持原位) + toast
      await loadPlugin(pluginId, "enable");
      log.appendLine(`[OK] 已启用 "${pluginId}"（即时生效）`);
      return { success: true };
    }

    return { success: true, needRestart: true };
  } catch (e) {
    return { success: false, error: errMsg(e) };
  }
}

/**
 * 卸载插件：userData 家 = 目录真删 + 账本 removed 墓碑（E6#18c）；app 树 = 移 .disabled/ →
 * 从 viewRegistry 移除 → 持久化。如果插件之前被禁用，从禁用列表清理（卸载优先级高于禁用）。
 * E6#18a：core:true 不再被硬闸拦（可卸可禁）——UI 藏钮防误删，命令/接口层放行。
 */
export async function uninstallPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const manifest = getMutableManifest(pluginId);

    // Phase 5h 行为归一化：lifecycle 消费端处理 config 清理 + iconOrder(移除) + tab 关闭
    const displayName = manifest.name;

    // E5#32：文件操作走 linkdesk.filesystem——bridge 为唯一入口，不再走 plugins:uninstall 直接 IPC
    const src = await pluginsApi().resolvePath(pluginId);
    const env = await linkdesk().env.get();

    // E6#12（1.2-4）双代码根分支：resolvePath 落在 userData 家（{userData}/plugins，.linkdesk-plugin
    // 解压处）→ 真删（无 .disabled 坟场——重装需重新装包）；否则 app 树（dev 源码/内置）→ 移 .disabled
    // （现语义，可 reinstall）。磁盘位置是事实（硬约束 11），env 双根同源前缀比对。
    //
    // 🔴 前缀比对必须走 normalizePath 归一化：resolvePath（IPC 回传）是正斜杠
    // （"C:/Users/.../plugins/<id>"），而 env.userPluginsDir（主进程 path.join）是反斜杠
    // （"C:\Users\...\plugins"）——直接 startsWith 恒 false，userData 卸载误走 .disabled 坟场
    // （2026-09-05 实机门禁实证：demo-pill/plugin-sdk-example 卸载进了项目 plugins/.disabled/）。
    const userHome = env.userPluginsDir;
    const isUserDataHome = isUnderHome(src, userHome);

    if (isUserDataHome) {
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
    } else {
      const disabledDir = `${env.appPluginsDir}/.disabled`;
      const dest = `${disabledDir}/${pluginId}`;
      await linkdesk().filesystem.createDir(disabledDir);
      if (await linkdesk().filesystem.exists(dest)) {
        await linkdesk().filesystem.remove(dest);
      }
      await linkdesk().filesystem.copy(src, dest);
      await linkdesk().filesystem.remove(src);

      // Rust 成功 → 前端更新（仅 app 树移坟场才入 uninstalled 缓存）
      cachePluginMetadata(pluginId, manifest, "uninstalled");
    }
    // E6#18c：卸载后是否可「撤销」恢复——只有 app 树分支保留了 .disabled/ 坟场副本（reinstall 移回）；
    // userData 家 = 目录真删 + removed 墓碑，真恢复走市场/手装 zip（拍板④）——不可 in-app 撤销。
    const restorable = !isUserDataHome;
    // revert 必须在 onWillUninstall 之前——onWillUninstall 注销主题/语言后 revert 找不到归属
    const needsMixReapply = await revertThemeIfCurrent(pluginId);
    await revertLanguageIfCurrent(pluginId);
    // E5.8#11：唯一卸载路径——unloadPlugin 状态机（unloading → notifyPluginRemoved → fire →
    // 集合清理 → disposed → onDidUninstall），L6b 顺序由迁移图机械保障（设计文档 §3.1）
    unloadPlugin(pluginId, "uninstall", displayName, restorable);
    // E5.8#61 审计#1：混搭来源已摘后才重合并（unload 前源配方仍注册——早合并找不到回退）
    if (needsMixReapply) await reapplyThemeAfterUnload();

    // 如果插件之前被禁用过，清理禁用列表——卸载优先级高于禁用。
    // onDidUninstall 消费端不读 disabledPlugins——移到 unloadPlugin 之后顺序安全
    const list = getDisabledList();
    const idx = list.indexOf(pluginId);
    if (idx !== -1) {
      list.splice(idx, 1);
      await saveDisabledList(list);
    }

    syncAppThemeEnum();
    syncAppLanguageEnum();
    syncIconThemeEnum();
    log.appendLine(`🗑 已卸载 "${pluginId}"`);
    // 「已卸载」toast（含 restorable 时的 撤销 动作）归 lifecycle 消费端 3（initLifecycleConsumers
    // onDidUninstall 单一源）——此处不再自弹（E6#18c 修死「撤销」同时消双 toast：consumer 端已弹
    // 已卸载+撤销，原此处第二颗「已卸载」是收口前遗留）。
    // E5.7#48：主进程静态声明三表（LangDef/Protocol/FileAssociation）重扫——唯一写入方在主进程
    window.linkdesk?.pluginManager?.notifyManifestChanged?.();
    return { success: true };
  } catch (e) {
    const msg = errMsg(e);
    console.error(`[pluginLoader] 卸载 "${pluginId}" 失败:`, msg);
    reportError({ message: `插件 "${pluginId}" 卸载失败: ${msg}`, source: pluginId, error: e });
    return { success: false, error: msg };
  }
}

/* ═══════════════════════════════════════════════════════════
   E6#11/#13（1.2-5）：包安装流——url/.linkdesk-plugin 真安装（单一路径，主进程只做 fs/net）
   ═══════════════════════════════════════════════════════════ */

/** 进度广播单点（#13d 壳段）——壳 events.emit → 主进程 onPluginEmit → broadcast → 池 events.on；
 *  与主进程 download/extract 段（plugin-install-handlers.ts 同通道广播）并流一个 plugin:installProgress。
 *  同一事件循环内 installPlugin 多处 emit——节流交给广播层，调用方逐阶段直呼。 */
export function emitInstallProgress(stage: string, pluginId?: string, message?: string): void {
  try {
    window.linkdesk?.events?.emit("plugin:installProgress", { stage, pluginId, message });
  } catch { /* 广播失败不阻断安装 */ }
}

/** job 内进度广播——E6#73q：同一帧顺带重置该 job 的槽级空闲看门狗（进度即「还活着」的唯一证据）。
 *  两条安装流（包源/目录源）共用，故抽此一处；漏调用 = 慢而健康的安装在 10 分钟后被误判楔死。 */
function jobProgress(jobId: string, stage: string, pluginId?: string, message?: string): void {
  touchInstallJob(jobId);
  emitInstallProgress(stage, pluginId, message);
}

/** 磁盘落点判定——src（resolvePath 回传）是否在 home（env.userPluginsDir 等）内。
 *  🔴 前缀比对必须走 normalizePath：resolvePath（IPC 回传）是正斜杠，home（主进程 path.join）是反斜杠——
 *  直接 startsWith 恒 false，userData 卸载误走 .disabled 坟场（2026-09-05 实机门禁实证）。uninstall/update 共用。 */
export function isUnderHome(src: string, home: string | undefined): boolean {
  if (!home) return false;
  const s = normalizePath(src);
  const h = normalizePath(home);
  return s === h || s.startsWith(`${h}/`);
}

/** 是否包来源（vs 目录）：http(s) 下载源 / .linkdesk-plugin 结尾（磁盘 zip）→ 走包安装流；
 *  其余（既有 SearchView 目录选择等）走下方 installPluginFromDirectory 零回归复制流。 */
function isPackageSource(source: string): boolean {
  const s = source.trim();
  return /^https?:\/\//i.test(s) || /\.linkdesk-plugin$/i.test(s);
}

/** 包面直答主进程（#13a 主进程真 fs/net 段）——壳 plugins 命名空间独有（download/extract handler 只对壳暴露）。
 *  update 三段（#13b/c：packageUpdateCheck/Stage/Commit）选填随 preload 注入——安装流只要 download/extract，
 *  更新流各自判存在再调（段 B 落法）。 */
export function packageOps(): {
  packageDownload: (url: string, job?: PluginInstallJobRef) => Promise<{ zipPath: string; sizeBytes?: number }>;
  packageExtract: (zipPath: string, expectedPluginId?: string, job?: PluginInstallJobRef) => Promise<{ pluginId: string; version: string; targetDir: string }>;
  packageUpdateCheck?: (pluginId: string, catalogUrl: string, currentVersion?: string) => Promise<PluginUpdateCheckResult>;
  packageStageUpdate?: (pluginId: string, source: string, currentVersion?: string, allowOlder?: boolean) => Promise<{ pluginId: string; newVersion: string; stagedDir: string }>;
  packageCommitUpdate?: (pluginId: string, stagedDir: string) => Promise<{ pluginId: string; version: string }>;
} {
  const api = pluginsApi();
  if (!api.packageDownload || !api.packageExtract) {
    throw new Error("[pluginLoader] 壳 plugins 面缺少 packageDownload/packageExtract——loader 只能在壳进程运行");
  }
  return {
    packageDownload: api.packageDownload,
    packageExtract: api.packageExtract,
    packageUpdateCheck: api.packageUpdateCheck,
    packageStageUpdate: api.packageStageUpdate,
    packageCommitUpdate: api.packageCommitUpdate,
  };
}

/**
 * 安装插件（路由入口，E6#11/#13）：目录源 → 既有复制流零回归；url/.linkdesk-plugin 包源 →
 * 主进程 download→extract 落 {userData}/plugins/<id>/（2026-09-05 塌平单根）→ 账本 → loadPlugin → 广播。
 *
 * E6#73q（18 档 §五 I.2）：**全队列唯一入口**——槽锁在本层（不是 installWithProgress 别名上：
 * 目录源走的是 install 这一条腿，只挂别名会漏）。两条腿同一条队列、同一把信号量、同一个数。
 * 同插件已在队列/在跑 → 去重（不建第二行），本调用等它装完返回同一个结果——「点两下」不是两件事。
 */
export async function installPlugin(
  sourcePath: string,
  opts?: PluginInstallRequestOpts,
): Promise<PluginInstallResult> {
  const job = beginInstallJob({
    pluginId: opts?.pluginId,
    displayName: opts?.displayName,
    origin: opts?.origin,
  });
  if (job.duplicate) {
    const outcome = await waitInstallJob(job.jobId);
    return outcome ?? { success: false, error: `插件 "${opts?.pluginId ?? sourcePath}" 正在安装中` };
  }

  await acquireInstallSlot(job.jobId);
  let result: PluginInstallResult;
  try {
    result = isPackageSource(sourcePath)
      ? await installPackageFromSource(sourcePath, opts, job.jobId)
      : await installPluginFromDirectory(sourcePath, job.jobId);
  } catch (e) {
    // 两条流各自 catch（错误文案更具体）；此处是兜底——绝不让 job 停在「在跑」永不出终态
    result = { success: false, error: errMsg(e) };
  }
  settleInstallJob(
    job.jobId,
    !result.success ? "failed" : result.parked ? "parked" : "success",
    result,
  );
  return result;
}

/** 包安装流显式名（#13e 壳面）——同一流水线同一进度广播（installPlugin 已全程 emit stage，等价别名）。 */
export function installWithProgress(
  sourcePath: string,
  opts?: PluginInstallRequestOpts,
): Promise<PluginInstallResult> {
  return installPlugin(sourcePath, opts);
}

/**
 * 安装落账后的加载收尾——loadPlugin("install") 成败两分支 + toast + 进度收尾。
 * 目录源/包源两条安装流共用（duplication 门禁）——版本/提示文案差异由调用方喂全文。
 * 失败不 throw：文件已落盘，toast 提示 reload 生效并返回 needRestart（原语义保留，loadPlugin 不决定安装成败）。
 */
async function loadInstalledPlugin(
  pluginId: string,
  version: string,
  msgs: { success: string; needRestart: string },
  jobId: string,
): Promise<PluginInstallResult> {
  jobProgress(jobId, "loading", pluginId);
  try {
    await loadPlugin(pluginId, "install");
    // E6#73q（§五 I.6⑦）：终态第三类「已安装但缺依赖」——loadPlugin 走 parkForDependencies 提前返回
    // （不发 onDidInstall），文件真落盘但插件**不可用**。这里无条件报「已安装：X v1.0」是撒谎
    // （装了但不可用会渲染成绿色成功行）⇒ 不弹成功 toast，结果带 parked 交队列落第三类终态。
    if (getLoadDiagnostics(pluginId).pendingReason) {
      emitInstallProgress("done", pluginId);
      return { success: true, pluginId, version, parked: true };
    }
    pushToast({ message: msgs.success, source: pluginId, ttl: TOAST_TTL_SUCCESS, severity: "info" });
    emitInstallProgress("done", pluginId);
    return { success: true, pluginId, version };
  } catch {
    pushToast({
      message: msgs.needRestart,
      source: pluginId,
      severity: "info",
      ttl: 0,
      actions: [
        { label: i18n.t("立即重启"), isPrimary: true, onClick: () => window.location.reload() },
      ],
    });
    emitInstallProgress("done", pluginId);
    return { success: true, pluginId, version, needRestart: true };
  }
}

/**
 * url / 磁盘 .linkdesk-plugin 包安装流——主进程真 fs/net 段（download→extract）做落盘，
 * 壳只编排：清 tmp 下载包 → bundle 补标 → 账本 add（#12b 市场安装流消费 add 欠账此刻还清）→
 * loadPlugin → notifyManifestChanged（三表重扫）。目标已存在由 extract handler 拒绝（不静默覆盖，
 * 对齐 #30.9d 确认/通知非静默；更新是 #11c 段 B 职责）。
 */
async function installPackageFromSource(
  sourcePath: string,
  opts: PluginInstallRequestOpts | undefined,
  jobId: string,
): Promise<PluginInstallResult> {
  const source = sourcePath.trim();
  jobProgress(jobId, "validating");
  // E6#73c：主进程 fs/net 段的进度事件随行身份——主进程只知道 jobId（自己按请求透传），
  // pluginId 池侧请求已知时同带（下载段靠它归到具体插件；待解压才知 id 的包流只有 jobId）。
  const jobRef: PluginInstallJobRef = { jobId, pluginId: opts?.pluginId };
  try {
    const ops = packageOps();
    // 1) 包定位：http(s) → 主进程 download 到 {userData}/tmp/<原包名>.<唯一后缀>（E6#73q 并发不撞名）；
    //    磁盘 zip → 原路径直读
    let zipPath: string;
    let downloaded = false;
    if (/^https?:\/\//i.test(source)) {
      jobProgress(jobId, "downloading", opts?.pluginId, "下载插件包");
      const r = await ops.packageDownload(source, jobRef);
      zipPath = r.zipPath;
      downloaded = true;
    } else {
      zipPath = source;
      if (!(await linkdesk().filesystem.exists(zipPath))) {
        throw new Error(`找不到插件安装包: ${zipPath}`);
      }
    }

    // 2) 主进程解压到 {userData}/plugins/<id>/（2026-09-05 塌平单根；zip-slip/pluginId 互验同 boot ingest；已存在拒绝）
    jobProgress(jobId, "extracting", opts?.pluginId, "解压插件包");
    let extracted: { pluginId: string; version: string; targetDir: string };
    try {
      extracted = await ops.packageExtract(zipPath, undefined, jobRef);
    } finally {
      // 下载包落 tmp——解压完（成败皆）清理；磁盘 zip 是用户自有文件，不删
      if (downloaded) {
        try { await linkdesk().filesystem.remove(zipPath); } catch { /* 清理失败非致命 */ }
      }
    }
    const { pluginId, version, targetDir } = extracted;
    const displayName = await manifestNameOf(targetDir, pluginId);

    // E6#73q：真 id 此刻才从包内 manifest 裁决出来——回填 job 身份，池侧行才从「未知」变成真名
    // （调用方传了 pluginId 则此处是同一值的幂等刷新；显示名只有壳读过包才知道）
    identifyInstallJob(jobId, { pluginId, displayName });

    // 3) 账本 add（#12b 欠账还清——安装流消费 add；磁盘事实在 user/ 子目录 → 源默认 user；
    //    market UI 未来可传 marketplace）
    try {
      const { add: addLedger } = await import("../../core/services/PluginInstallService");
      await addLedger(pluginId, version, opts?.ledgerSource ?? "user");
    } catch (e) {
      log.appendLine(`⚠️ 账本写入失败（非致命）: ${errMsg(e)}`);
    }

    // 4) E5.7#48：文件已落盘——通知主进程重扫三表（无论 loadPlugin 是否成功）
    window.linkdesk?.pluginManager?.notifyManifestChanged?.();

    // 5) loadPlugin（安装 reason——onDidInstall 消费端 toast + 图标顺序 + plugin:installed 广播）——收尾块与目录源共用 loadInstalledPlugin
    return loadInstalledPlugin(pluginId, version, {
      success: `已安装：${displayName} v${version}`,
      needRestart: `已安装：${displayName} v${version}。视图刷新后生效。`,
    }, jobId);
  } catch (e) {
    const msg = errMsg(e);
    jobProgress(jobId, "error", undefined, msg);
    return { success: false, error: msg };
  }
}

/** 包内显示名——读已解压 plugin.json（失败回退 pluginId） */
async function manifestNameOf(targetDir: string, pluginId: string): Promise<string> {
  try {
    const raw = await linkdesk().filesystem.readTextFile(`${targetDir}/plugin.json`);
    const m = parseManifestJson(raw);
    return typeof m?.name === "string" && m.name.trim() !== "" ? m.name : pluginId;
  } catch {
    return pluginId;
  }
}

/**
 * 安装插件（目录源）：Electron 端复制到 app 插件树 plugins/ → 热加载。
 * 仅对 theme/language 插件即时生效；view 插件提示重启。
 * 2026-09-05 塌平单根：目标 = <appPluginsDir>/<id>（原 plugins/user/<id> 的 user/ 段取消——平铺树直落）。
 *
 * E5.7#81 包装（校验 / 版本处理 / 进度）：
 *   - 校验前置：manifest 先读先验，不合法在复制前失败（原实现只在消毒时 parse——
 *     malformed JSON 会先复制出半装目录再报错）；安装目录名 = manifest.pluginId
 *     （不再用源目录 basename——目录名 ≠ pluginId 是潜伏错位，resolvePath 按 id 找目录）；
 *   - 版本处理：目标已存在时读盘比对版本——同版/旧版拒绝并给出双方版本号，新版提示
 *     先卸载再装（不覆盖：Windows 文件锁，卸载 cp+rm 教训；真升级流程归 E6 PluginUpdateService）；
 *   - 进度事件：plugin:installProgress { stage: validating/copying/loading/done/error } 广播到池
 *     （marketplace 安装按钮实时阶段文案）。
 * E6#13（1.2-5）：保留为目录源内部实现——SearchView 目录安装唯一真调用方零回归；包源走上方路由。
 */
async function installPluginFromDirectory(sourcePath: string, jobId: string): Promise<PluginInstallResult> {
  jobProgress(jobId, "validating");
  try {
    // E5#32：文件操作走 linkdesk.filesystem——bridge 为唯一入口
    const manifestPath = `${sourcePath}/plugin.json`;
    if (!(await linkdesk().filesystem.exists(manifestPath))) {
      throw new Error(`不是有效插件（缺少 plugin.json）`);
    }
    let parsedManifest: unknown;
    try {
      parsedManifest = parseManifestJson(await linkdesk().filesystem.readTextFile(manifestPath));
    } catch (e) {
      throw new Error(`plugin.json 格式错误: ${errMsg(e)}`);
    }
    const sourceDirName = sourcePath.split(/[\\/]/).pop() || sourcePath;
    const { pluginId, version, name } = validateInstallManifest(parsedManifest, sourceDirName);
    // E6#73q：目录源在复制**之前**就知道真名（manifest 已解析）——job 身份此刻落定
    identifyInstallJob(jobId, { pluginId, displayName: name });

    const env = await linkdesk().env.get();
    const destDir = `${env.appPluginsDir}/${pluginId}`; // 2026-09-05 塌平单根（原 appPluginsDir/user/<id>——目录源 dev 安装落 app 树平铺位）

    // E5.7#81 版本处理：目标已存在 → 读盘比对（未安装则跳过）
    let installed: { version: string | null } | null = null;
    if (await linkdesk().filesystem.exists(destDir)) {
      installed = { version: null };
      try {
        const iv = parseManifestJson(await linkdesk().filesystem.readTextFile(`${destDir}/plugin.json`));
        if (typeof iv?.version === "string") installed = { version: iv.version };
      } catch { /* 读不到版本信息 → 保守拒绝（见 resolveVersionConflict null 分支） */ }
      const conflict = resolveVersionConflict(installed, version);
      if (conflict) throw new Error(`${name}: ${conflict}`);
    }

    jobProgress(jobId, "copying", pluginId);
    await linkdesk().filesystem.copy(sourcePath, destDir);
    // 消毒 manifest——目录源（dev 树安装）强制 distribution=user, core=false（E6#18a：core:true 无行为特权，
    // 只剩 UI 藏钮语义——目录/开发安装不冒充发货件；随车 zip 走包安装流真传 core，见 plugin.json 声明）
    const destManifest = `${destDir}/plugin.json`;
    const raw = await linkdesk().filesystem.readTextFile(destManifest);
    // E6#55：JSONC 读入；distribution 是遗留字段（schema 契约外）——局部宽口视图承接，非 PluginManifest 契约面
    const manifest = parseManifestJson(raw) as PluginManifest & { distribution?: string };
    if (manifest.distribution !== "user" || manifest.core === true) {
      manifest.distribution = "user";
      manifest.core = false;
      await linkdesk().filesystem.writeTextFile(destManifest, JSON.stringify(manifest, null, 2));
    }

    // E5.7#48：文件已落盘——通知主进程重扫三表（无论下方 loadPlugin 是否成功）
    window.linkdesk?.pluginManager?.notifyManifestChanged?.();

    // E5 归一化：loadPlugin 统一处理 glob 内/外——不再分支判断；加载收尾块与包源共用 loadInstalledPlugin
    return loadInstalledPlugin(pluginId, version, {
      success: `已安装：${name} v${version}`,
      // E5.8#24.8.7：原「npm run build:plugins」指向空跑死脚本（build-plugins.mjs E6 前不运行）——
      // 改指准确主构建命令 npm run build（E6#15f 后主 vite.config 不再为插件打 dist/plugins 命名 chunk，
      // 插件产物由各自独立 build 产出；此提示仅为「壳侧源码树安装需重跑构建才生效」语义保留）
      needRestart: `已安装：${name}。运行 npm run build 后生效。`,
    }, jobId);
  } catch (e) {
    const msg = errMsg(e);
    jobProgress(jobId, "error", undefined, msg);
    return { success: false, error: msg };
  }
}

/** 判断插件是否被禁用 */
export function isPluginDisabled(pluginId: string): boolean {
  return getDisabledList().includes(pluginId);
}

/** 获取所有已加载插件的 manifest（含非视图插件 + 运行时加载的插件） */
export function getLoadedPluginManifests(): Array<{ pluginId: string; manifest: PluginManifest }> {
  const result: Array<{ pluginId: string; manifest: PluginManifest }> = [];
  const seen = new Set<string>();

  // 1. manifestIndex 中的插件（E6#9c：readAllManifests IPC 水合——glob 源码树 + 运行时/打包全覆盖）
  for (const [pluginId, manifest] of getAllManifestEntries()) {
    if (loadedPluginIds.has(pluginId)) {
      result.push({ pluginId, manifest });
      seen.add(pluginId);
    }
  }

  // 2. 运行时加载的插件（loadPlugin 缓存了完整 manifest——仅 loadedPluginIds 中有的，防僵尸缓存）
  const cache = getMetadataCache();
  for (const [pluginId, meta] of Object.entries(cache)) {
    if (meta.status === "installed" && meta.manifest && !seen.has(pluginId) && loadedPluginIds.has(pluginId)) {
      result.push({ pluginId, manifest: meta.manifest });
    }
  }

  return result;
}

/**
 * marketplace list() 数据源——已加载 + 缺依赖挂起（pending）插件。
 * 🔥 与 getLoadedPluginManifests 的分工（E5.8#15.5）：后者只含已加载——AppInitializer 的
 *   pluginsLoaded 计数 / ProfileService 插件清单 / FactorySlots 必须只见 active 插件，
 *   挂起插件混入 = 语义回归（pending ≠ loaded）；本函数仅供 IPC list 展示——挂起插件带
 *   pendingReason（"等待依赖: xxx"，读状态机诊断面），marketplace 列表/详情可见。
 *   禁用/未安装插件不进本函数——走 getDisabledPluginInfo / getUninstalledPluginInfo 各自 API。
 *   不变式：_pendingPlugins ∩ loadedPluginIds = ∅（sweep 清僵尸）——防御性 skip 保留。
 */
export function getListPluginManifests(): Array<{ pluginId: string; manifest: PluginManifest; pendingReason?: string }> {
  const result: Array<{ pluginId: string; manifest: PluginManifest; pendingReason?: string }> =
    getLoadedPluginManifests().map((p) => ({ ...p }));
  for (const [pluginId, manifest] of _pendingPlugins) {
    if (loadedPluginIds.has(pluginId)) continue; // 僵尸挂起登记——防御（sweep 已清）
    result.push({ pluginId, manifest, pendingReason: getLoadDiagnostics(pluginId).pendingReason });
  }
  return result;
}

/** 当前语言是否来自此插件——卸载/禁用当前语言时自动回退（对标 revertThemeIfCurrent） */
async function revertLanguageIfCurrent(pluginId: string): Promise<void> {
  try {
    const currentLang = getConfigurationValue<string>("app.language") ?? "zh";
    const lang = LanguageRegistry.get(currentLang);
    if (!lang || lang.pluginId !== pluginId) return;

    // 当前语言来自被卸载/禁用的插件 → 找替代
    const languages = LanguageRegistry.getAll();
    const fallback = languages.length > 0
      ? (languages.find(l => l.id === "zh")?.id ?? languages[0].id)
      : "zh";
    await setConfigurationValue("app.language", fallback, "user");
  } catch { /* 非关键路径 */ }
}

/**
 * 当前主题是否来自此插件——卸载/禁用当前主题时自动回退。
 * E5.8#61 审计#1：返回 true = 本插件是混搭来源（app.mix* 引用其配方/配色）——
 * 调用方必须在 unloadPlugin 之后调 reapplyThemeAfterUnload 重合并（回退时机见该函数注释）。
 */
async function revertThemeIfCurrent(pluginId: string): Promise<boolean> {
  try {
    // E5.8#50.21：读时归一化——legacy "Dark"/"Light" 匹配不到（无 flat 登记）会漏判，先转配方 id
    const currentTheme = normalizeThemeValue(getConfigurationValue<string>("app.theme"));
    const theme = ThemeRegistry.get(currentTheme ?? "");

    // 活动主题来自本插件 → 换替代主题（配方优先，flat 退路；值归一化落配置）
    if (theme?.pluginId === pluginId) {
      const available = [...ThemeRegistry.getRecipes().map((r) => r.id), ...getAvailableThemes()];
      if (available.length > 0) {
        await setConfigurationValue("app.theme", normalizeThemeValue(available[0]) ?? available[0], "user");
      }
      // 无可用主题 → 保持当前 CSS（index.css :root 为兜底），设定下次启动的默认值
    }

    // 混搭来源判定必须在 unloadPlugin 之前（此刻配方仍注册，isMixSourceOwner 才能解析到归属）；
    // 真重应用推迟到 unload 之后（见 reapplyThemeAfterUnload）。
    return isMixSourceOwner(pluginId);
  } catch {
    return false;
  }
}

/**
 * E5.8#61 审计#1：混搭来源插件卸载/禁用后的主题重应用——必须在 unloadPlugin 之后调用。
 * 时机：unload 前源配方仍注册，此刻重合并 resolveDomainSource 能找到来源 → 域不会回退；
 * 配方摘除后再合并，来源缺失走 #58 缺域回退回主题基线——:root 残留颜色/字体才真正清掉。
 * 同值重写 app.theme 触发 applier → applyThemeIfReady 重合并（仅当 revertThemeIfCurrent 返回 true 才调用）。
 */
async function reapplyThemeAfterUnload(): Promise<void> {
  try {
    const cur = normalizeThemeValue(getConfigurationValue<string>("app.theme"));
    if (cur) await setConfigurationValue("app.theme", cur, "user");
  } catch { /* 非关键路径 */ }
}

/** 获取禁用插件的基本信息（在 plugins/.disabled/ 下）
 *  E6#30.5b：带 core 旗标——详情页禁用分支卸载钮守 E6#18「core:true 详情页不画」（缓存 manifest 内含 core） */
export function getDisabledPluginInfo(): Array<{ pluginId: string; name: string; description?: string; version?: string; core?: boolean }> {
  // B2 fix: 优先从缓存读——支持glob 外的插件（glob 中无清单）
  const cache = getMetadataCache();
  const disabled = getDisabledList();
  const result: Array<{ pluginId: string; name: string; description?: string; version?: string; core?: boolean }> = [];
  for (const pluginId of disabled) {
    const cached = cache[pluginId];
    if (cached) {
      result.push({ pluginId, name: cached.name, description: cached.description, version: cached.version, core: cached.manifest?.core });
      continue;
    }
    // 兜底：manifestIndex 中读（E6#9c——readAllManifests 水合 + glob 种子双源；此分支仅用于缓存未就绪的极端情况）
    const m = getManifestById(pluginId);
    if (m) {
      result.push({
        pluginId,
        name: m.name || pluginId,
        description: m.description,
        version: m.version,
        core: m.core,
      });
    }
  }
  return result;
}

/** 获取已卸载插件列表（B2 fix：从元数据缓存读，不依赖文件系统——插件目录已被移走）*/
export async function getUninstalledPluginInfo(): Promise<Array<{ pluginId: string; name: string; description?: string; version?: string }>> {
  // B2 fix: 从缓存读——不依赖 Rust 目录扫描（目录已被移走）也不依赖 globally（glob 外的插件不存在于此）
  const cache = getMetadataCache();
  const result: Array<{ pluginId: string; name: string; description?: string; version?: string }> = [];
  for (const [, meta] of Object.entries(cache)) {
    if (meta.status === "uninstalled") {
      result.push({ pluginId: meta.pluginId, name: meta.name, description: meta.description, version: meta.version });
    }
  }
  return result;
}

/**
 * 从 .disabled/ 坟场移回重新安装——仅 app 树分支卸载（保留副本）可撤销恢复。
 * E6#18c：userData 家卸载 = 目录真删 + removed 墓碑，**无坟场副本**——真恢复走市场/手装 zip
 * （拍板④），本函数对 userData 已卸载插件必然「未找到」失败。卸载 toast 的「撤销」只在
 * restorable（app 树）时展示（lifecycle consumer 端3），与本函数能力对齐。
 * 移回后需全页刷新——Vite dev server 的 import.meta.glob 在启动时扫描，需重扫才能识别移回的插件。
 */
export async function reinstallPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // E5#32：文件操作走 linkdesk.filesystem——bridge 为唯一入口
    const env = await linkdesk().env.get();
    const src = `${env.appPluginsDir}/.disabled/${pluginId}`;
    const dest = `${env.appPluginsDir}/${pluginId}`; // 2026-09-05 塌平单根（原 appPluginsDir/user/<id>）
    if (!(await linkdesk().filesystem.exists(src))) {
      throw new Error(`已卸载的插件 "${pluginId}" 未找到`);
    }
    if (await linkdesk().filesystem.exists(dest)) {
      throw new Error(`插件 "${pluginId}" 已存在`);
    }
    await linkdesk().filesystem.copy(src, dest);
    await linkdesk().filesystem.remove(src);

    // E5 归一化：loadPlugin 统一处理 glob 内/外——不再分支判断
    await loadPlugin(pluginId, "reinstall");
    // E5.7#48：主进程三表重扫
    window.linkdesk?.pluginManager?.notifyManifestChanged?.();
    return { success: true };
  } catch (e) {
    return { success: false, error: errMsg(e) };
  }
}

// 导出供 vitest + loader.ts watcher——防止新增贡献类型时漏加 revert（主题/语言/图标主题…）
export { revertThemeIfCurrent, revertLanguageIfCurrent, reapplyThemeAfterUnload };
