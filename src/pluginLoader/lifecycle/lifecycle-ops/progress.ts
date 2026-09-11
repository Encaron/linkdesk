/**
 * 安装进度广播——壳 → 池 `plugin:installProgress` 的两个出口（裸进度 / 带 job 的进度）。
 * E6#84（第 3.6 层文件整理）feature-folder 拆分：自 `lifecycle-ops.ts` 原样搬出，零行为变更。
 * 依赖方向：progress → install-queue（job 表）——本文件是叶子，域内无人被它反向依赖以外的角色。
 */

/* ═══════════════════════════════════════════════════════════
   E6#11/#13（1.2-5）：包安装流——url/.linkdesk-plugin 真安装（单一路径，主进程只做 fs/net）
   ═══════════════════════════════════════════════════════════ */

import { touchInstallJob, updateInstallJobProgress } from "../install-queue";

/** 进度广播单点（#13d 壳段）——壳 events.emit → 主进程 onPluginEmit → broadcast → 池 events.on；
 *  与主进程 download/extract 段（plugin-install-handlers.ts 同通道广播）并流一个 plugin:installProgress。
 *  同一事件循环内 installPlugin 多处 emit——本层只发**低频状态跃迁**（阶段切换一次一条），逐次直呼即可；
 *  E6#73i 更正：唯一的高频生产点（下载分片）的节流归**源头**（`plugin-download.ts` 的
 *  `PROGRESS_THROTTLE_MS`），广播层从来没有节流——旧注释「节流交给广播层」是假的。
 *
 *  E6#73j：**不再 export**——更新腿原有的一处外部调用已改走 `jobProgress`（那才是带 jobId 的正路），
 *  剩下的调用方全在本域（unload/reinstall 三条收尾腿只发裸进度、无 job）。knip 判过头，收口。 */
export function emitInstallProgress(stage: string, pluginId?: string, message?: string, jobId?: string): void {
  try {
    window.linkdesk?.events?.emit("plugin:installProgress", { stage, pluginId, message, jobId });
  } catch { /* 广播失败不阻断安装 */ }
}

/** job 内进度广播——E6#73q：同一帧顺带重置该 job 的槽级空闲看门狗（进度即「还活着」的唯一证据）。
 *  两条安装流（包源/目录源）共用，故抽此一处；漏调用 = 慢而健康的安装在 10 分钟后被误判楔死。
 *
 *  E6#73d：**顺带把阶段落进 job 表**（同进程直呼，不走 IPC 往返）——面板「进行中」行的阶段短语由它派生。
 *  带 jobId 进广播载荷是给**池**消费方（市场视图的状态徽标）认领身份用。 */
export function jobProgress(jobId: string, stage: string, pluginId?: string, message?: string): void {
  touchInstallJob(jobId);
  updateInstallJobProgress(jobId, { stage, message });
  emitInstallProgress(stage, pluginId, message, jobId);
}
