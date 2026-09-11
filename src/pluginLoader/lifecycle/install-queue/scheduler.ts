/**
 * install-queue 的**状态机**——并发槽编排 + FIFO 交接 + 槽级看门狗 + 终态结算。
 * E6#84（第 3.6 层文件整理）feature-folder 拆分：自 `install-queue.ts` 原样搬出，零行为变更。
 *
 * 🔴 **为什么 settle 和看门狗跟槽位放一起**：看门狗超时要 `settleInstallJob`、而 settle 要还槽
 *    （`releaseSlot`）。若把 settle 拆去 `job-ops.ts`，就成 scheduler ↔ job-ops 双向 import。
 *    「终态 + 槽位 + 看门狗」本就是**同一台状态机**的三面，合成一处即天然无环。
 *    用户面动作（begin/cancel/wait/open）在 `job-ops.ts`，依赖本文件——**单向**。
 *
 * 依赖方向：store → **scheduler** → job-ops。
 */

import i18n from "../../../i18n"; // 显示文本铁律：壳侧 t() 解析，池哑渲染零自产文本
import type { PluginInstallResult } from "../../../core/api/linkdesk-api/types";
import {
  broadcast,
  decRunning,
  dropJob,
  getJob,
  incRunning,
  persist,
  pruneSettled,
  pushWaiter,
  removeWaiter,
  runningCount,
  shiftWaiter,
} from "./store";
import { INSTALL_CONCURRENCY, SLOT_IDLE_BUDGET_MS, type InstallJobTerminal, type JobRecord } from "./types";

/* ── 槽位编排 ── */

/**
 * 无槽直开（E6#73m K1）——卸载腿专用：**不占并发槽、不进 FIFO**，建了就跑。
 *
 * 为什么卸载不该排队：① 它没有下载段，`INSTALL_CONCURRENCY = 3` 限的是下载/解压这类重活，
 * 卸载不跟它们抢同一种资源；② 排队的行在面板上写「等待安装中」——卸载等安装，话说反了；
 * ③ 卸载是用户**收尾**的动作（卸掉不想要的东西），把它压在一串安装后面没有任何好处。
 *
 * 返回 false = 记录已不在 / 已非 queued（取消竞态），调用方**别跑**（同 `acquireInstallSlot` 语义）。
 */
export function startInstallJobDirect(jobId: string): boolean {
  const job = getJob(jobId);
  if (!job || job.state !== "queued") return false;
  job.state = "running";
  job.holdSlot = false; // 从没加过 _running ⇒ 结算时不许还槽（见 JobRecord.holdSlot）
  armWatchdog(job); // 看门狗照挂：空闲 10 分钟没动静同样判死（判据是「还在动吗」，与占不占槽无关）
  persist();
  broadcast();
  return true;
}

/**
 * 抢槽——有空槽立即开跑；满则进 FIFO 等待队列挂起，直到前面某个 job 释放槽位（**直接交接**，见
 * `releaseSlot`）。
 *
 * 返回 `true` = 槽位到手，**可以开始干真活了**；返回 `false` = **别跑**（调用方必须立刻收手）。
 * 两种 false：① 记录不存在（**排队期间被用户取消**——`cancelInstallJob` 把记录删了）；
 * ② 记录已非 queued（跑过/已结算/被看门狗判死——不让调用方卡在永远不来的唤醒上）。
 *
 * ⚠️ 返回布尔而不是 void 是**必需的**：取消排队中的 job 若只删记录，调用方会「立刻拿到槽位」
 * 的错觉直接往下跑——用户点了取消却照样装上，是最坏的假动作。
 */
export async function acquireInstallSlot(jobId: string): Promise<boolean> {
  const job = getJob(jobId);
  if (!job || job.state !== "queued") return false;
  if (runningCount() < INSTALL_CONCURRENCY) {
    startJob(job);
    return true;
  }
  pushWaiter(jobId);
  await new Promise<void>((resolve) => { job.grant = resolve; });
  // 挂起期间被取消（记录已删）或被打成非 queued（releaseSlot 已置 running）——按记录说话
  return getJob(jobId)?.state === "running";
}

/** 出结果——落终态 + 还槽 + 唤醒等待方 + 广播 + 落盘。重复调用幂等（看门狗与正常收尾可能同时到）。 */
export function settleInstallJob(jobId: string, terminal: InstallJobTerminal, outcome?: PluginInstallResult): void {
  const job = getJob(jobId);
  if (!job || job.state === "settled") return;
  const wasRunning = job.state === "running";
  const heldSlot = job.holdSlot === true;
  job.state = "settled";
  job.terminal = terminal;
  job.cancellable = false;
  job.outcome = outcome;
  if (outcome?.error) job.error = outcome.error;
  clearWatchdog(job);
  if (wasRunning && heldSlot) {
    releaseSlot();
  } else if (wasRunning) {
    // 无槽腿（卸载，E6#73m K1）：它从没加过 _running，这里**不能**还槽——还了等于替别人还，
    // 并发上限被静默抬高。看门狗已清、等待方已唤醒，收尾动作一条不漏。
  } else {
    // 排队态被结算——从 FIFO 里摘掉，别让 releaseSlot 捞到僵尸
    removeWaiter(jobId);
  }
  const waiters = job.settledWaiters;
  job.settledWaiters = undefined;
  for (const wake of waiters ?? []) wake();
  // E6#73d：被用户取消的 job **吸收**——行整条撤掉，不留 ✗（取消不是失败，见 `cancelled` 注释）。
  // 槽位已在上面归还，看门狗已清，等待方已唤醒 ⇒ 撤掉记录不会漏掉任何收尾动作。
  if (job.cancelled) {
    dropJob(jobId);
    pruneSettled();
    persist();
    broadcast();
    return;
  }
  pruneSettled();
  persist();
  broadcast();
}

/**
 * 进度心跳——job 每推一次进度就重置它的空闲看门狗（判据「还在动吗」，同 73e 下载层）。
 * 非 running 态无看门狗，调用是空操作。
 */
export function touchInstallJob(jobId: string): void {
  const job = getJob(jobId);
  if (job?.state === "running") armWatchdog(job);
}

/* ── 槽位与看门狗（内部） ── */

function startJob(job: JobRecord): void {
  incRunning();
  job.state = "running";
  job.holdSlot = true; // 占着槽 ⇒ 结算时必须还（`settleInstallJob`）
  armWatchdog(job);
  persist();
  broadcast();
}

/**
 * 还槽——FIFO 队首**直接接手**（`_running` 不减，防「先减后加」中间态被下一个 acquire 抢进双计）；
 * 队列空才真减。队首若是已被结算的僵尸（防御路径）跳过，继续找下一个。
 */
function releaseSlot(): void {
  const nextId = shiftWaiter();
  if (nextId === undefined) {
    decRunning();
    return;
  }
  const next = getJob(nextId);
  if (!next || next.state !== "queued") {
    releaseSlot();
    return;
  }
  next.state = "running";
  next.holdSlot = true; // 槽位直接交接 ⇒ 接手方仍占着那一个槽（`_running` 不减）
  armWatchdog(next);
  const grant = next.grant;
  next.grant = undefined;
  persist();
  broadcast();
  grant?.();
}

function armWatchdog(job: JobRecord): void {
  clearWatchdog(job);
  job.watchdog = setTimeout(() => {
    settleInstallJob(job.jobId, "failed", {
      success: false,
      // 卸载腿不占槽，说「已释放队列位」是假话（E6#73m K1）——两句都是真话，按 kind 挑
      error: job.kind === "uninstall"
        ? i18n.t("卸载超时——{{n}} 分钟无进展", { n: SLOT_IDLE_BUDGET_MS / 60_000 })
        : i18n.t("安装超时——{{n}} 分钟无进展，已释放队列位", { n: SLOT_IDLE_BUDGET_MS / 60_000 }),
    });
  }, SLOT_IDLE_BUDGET_MS);
}

function clearWatchdog(job: JobRecord): void {
  if (job.watchdog !== undefined) {
    clearTimeout(job.watchdog);
    job.watchdog = undefined;
  }
}
