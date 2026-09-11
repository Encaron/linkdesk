/**
 * 状态开关——禁用 / 启用 / 卸载三条生命周期变更路径（+ 共用前置守卫 `getMutableManifest`）。
 * E6#84（第 3.6 层文件整理）feature-folder 拆分：自 `lifecycle-ops.ts` 原样搬出，零行为变更。
 * 依赖方向：state-toggles → progress（进度）+ revert（主题/语言回退）+ install-queue（job 表）→ resolution/*，无反向。
 */

import i18n from "../../../i18n"; // E5.8#37.9：通知动作标签壳 t() 解析（显示文本铁律——池哑渲染零自产文本）
import type { PluginManifest } from "../../../core/api/types";
import { reportError } from "../../../core/services/bootstrap/ErrorService";
// E5.8#15：回退 _pendingPlugins——缺依赖挂起（连带卸载等依赖回归）的插件也可禁用/卸载
import { unloadPlugin } from "../../resolution/loadState";
import {
  log,
  errMsg,
  cachePluginMetadata,
  getDisabledList,
  saveDisabledList,
  getLoadedManifest,
  getManifestById,
  _pendingPlugins,
  // E6#80：卸载销账——索引 + 住所一并划掉（不销账 = 重装后仍按启动快照说话）
  forgetPluginIndex,
} from "../../resolution/state";
import { syncAppThemeEnum, syncAppLanguageEnum, syncIconThemeEnum } from "../../contributions/contributions";
import { loadPlugin } from "../../resolution/runtime";
// E6#73q（18 档 §五 I.2）：壳侧 job 表 + N 槽限流 + FIFO——槽锁下沉到 installPlugin（两条腿共用）
import { beginInstallJob, startInstallJobDirect, identifyInstallJob, settleInstallJob } from "../install-queue";
// E6#73m K1：卸载磁盘腿（双根判定 + 搬离）——单独成文件，见该文件头注
import { relocateForUninstall } from "../plugin-disk-location";
import { jobProgress } from "./progress";
import { revertThemeIfCurrent, revertLanguageIfCurrent, reapplyThemeAfterUnload } from "./revert";

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
 *
 * E6#73m K1：**进 job 表**（18 档 §三 K 第 1 行）——此前卸载全程零输出，一个几万文件的插件卸起来
 * 界面一个字都没有，用户只能猜是不是卡死了。现在与安装共用同一张表、面板同一段「进行中」，
 * 但走 `startInstallJobDirect`（**不占并发槽**，见该函数）且**不挂中止钩子**（`fs` 停不下来，
 * 面板照 `canCancel` 不给 [取消安装] 钮）。
 */
export async function uninstallPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
  // 去重：同插件正在装/更新/卸载——同一个插件同时只该有一件活儿在飞（两段操作同一批文件）。
  const job = beginInstallJob({ pluginId, displayName: pluginId, origin: "user", kind: "uninstall" });
  if (job.duplicate) {
    // 拒收也要出声（同下方 catch 的出口）——池侧只看成功与否、不读这条 error 字段，
    // 光 return 就是「按钮弹回来、什么都没发生」的静默失败，正是本批次要消灭的那一类。
    const busyMsg = i18n.t("该插件正在安装或更新中");
    reportError({ message: `插件 "${pluginId}" ${busyMsg}`, source: pluginId });
    return { success: false, error: busyMsg };
  }
  startInstallJobDirect(job.jobId);
  try {
    const manifest = getMutableManifest(pluginId);

    // Phase 5h 行为归一化：lifecycle 消费端处理 config 清理 + iconOrder(移除) + tab 关闭
    const displayName = manifest.name;
    // 真名到手才画得对（建 job 时只有 id）——同 update.ts 的 identifyInstallJob
    identifyInstallJob(job.jobId, { pluginId, displayName });
    // 唯一阶段：卸载没有可量化的段（文件数不预扫，扫一遍本身就是它要干的活），
    // 故只报「在干」不报百分比——不编假进度条（同 §五「排队行不画条」的判据）
    jobProgress(job.jobId, "uninstalling", pluginId);

    // E6#73m K1：磁盘腿（双根判定 + 搬离 + rename/copy 回退）抽到 plugin-disk-location.ts
    // ——本文件体积门禁 800 行，抽的是自成一体的一条腿（输入插件 id、输出「原来在哪根」）。
    const { userDataHome: isUserDataHome } = await relocateForUninstall(pluginId, manifest);
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

    // 🔴 E6#80：卸载销账——索引 + 住所两条跨会话记账一并划掉。此前两者都不清：索引留着卸载前的
    // manifest 当「旧快照」用（重装后读取侧仍可能按它说话），住所留着 userData 让 `isPluginUpdatable`
    // 对一个盘上已不存在的插件判「可更新」。**只划索引与住所**——metadataCache 是故意留的
    // （B2 fix：卸载后市场仍要能浏览详情，状态已改写 uninstalled），别一起删。
    forgetPluginIndex(pluginId);

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
    // E6#73m K1：出结果——行从「进行中」落进面板第三段（计数），成功与否照实报
    settleInstallJob(job.jobId, "success", { success: true, pluginId });
    return { success: true };
  } catch (e) {
    const msg = errMsg(e);
    console.error(`[pluginLoader] 卸载 "${pluginId}" 失败:`, msg);
    // 失败同样要落地：不 settle = 面板那行永远转圈（看门狗 10 分钟后才收），比不显示更坏
    settleInstallJob(job.jobId, "failed", { success: false, pluginId, error: msg });
    reportError({ message: `插件 "${pluginId}" 卸载失败: ${msg}`, source: pluginId, error: e });
    return { success: false, error: msg };
  }
}
