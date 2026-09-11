/**
 * install-queue 的**用户面动作**——入队 / 身份回填 / 进度回填 / 取消 / 等待 / 开场四步。
 * E6#84（第 3.6 层文件整理）feature-folder 拆分：自 `install-queue.ts` 原样搬出，零行为变更。
 *
 * 状态本身（`_jobs`/`_waiters`）归 `store.ts`，状态机（槽位/看门狗/结算）归 `scheduler.ts`；
 * 本文件只编排调用，**不持有任何模块级可变状态**。
 * 依赖方向：store → scheduler → **job-ops**（末端）。
 */

import i18n from "../../../i18n"; // 显示文本铁律：壳侧 t() 解析，池哑渲染零自产文本
import type { PluginInstallResult } from "../../../core/api/linkdesk-api/types";
import { allJobs, broadcast, canCancel, dropJob, getJob, mintJobId, persist, putJob, removeWaiter } from "./store";
import { acquireInstallSlot, touchInstallJob } from "./scheduler";
import type { InstallJobKind, InstallJobOrigin } from "./types";

/* ── 队列编排 ── */

/**
 * 入队（不等槽）——返回 jobId；`duplicate: true` = 同插件已在队列/在跑，调用方应 `waitInstallJob` 等它，
 * **不建第二行**（§五 I.3 去重）。
 *
 * `pluginId` 可缺省：包安装流要等解压才知道真 id（zip 内 manifest 才是权威）。缺省时按「未知」入队，
 * 由 `identifyInstallJob` 在解压拿到 id 后回填——回填前不参与去重（调用方传入即全程可去重）。
 */
export function beginInstallJob(spec: {
  pluginId?: string;
  displayName?: string;
  origin?: InstallJobOrigin;
  kind?: InstallJobKind;
}): { jobId: string; duplicate: boolean } {
  const pluginId = spec.pluginId?.trim() ?? "";
  if (pluginId) {
    for (const job of allJobs()) {
      // 去重键是 pluginId，**不看 kind**（E6#73m K1）：同一个插件同时只该有一件活儿在飞——
      // 装一半去卸、卸一半去装，两段操作同一批文件，谁先谁后都说不清。
      if (job.state !== "settled" && job.pluginId === pluginId) {
        return { jobId: job.jobId, duplicate: true };
      }
    }
  }
  const jobId = mintJobId();
  putJob({
    jobId,
    pluginId,
    displayName: spec.displayName?.trim() || pluginId,
    origin: spec.origin ?? "user",
    kind: spec.kind ?? "install",
    cancellable: false, // 由 snapshot() 实时投影（canCancel），此处只是占位初值
    state: "queued",
  });
  persist();
  broadcast();
  return { jobId, duplicate: false };
}

/** 回填身份（解压出真 pluginId 后）——显示名今天只存在于池侧目录 store，壳拿不到，故随请求带入或回填 */
export function identifyInstallJob(jobId: string, ident: { pluginId: string; displayName?: string }): void {
  const job = getJob(jobId);
  if (!job || job.state === "settled") return;
  job.pluginId = ident.pluginId;
  job.displayName = ident.displayName?.trim() || job.pluginId;
  broadcast();
}

/**
 * 阶段/百分比回填（E6#73d）——主进程 `plugin:installProgress` 事件按 `jobId` 落进 job 行，
 * 「进行中」行的阶段短语与 3px 进度条由它派生。
 *
 * ⚠️ **只更新字段、不动状态机、不写盘**（进度对「上次未完成」无意义，写它只是白烧盘——同 `persist` 注释）；
 * ⚠️ 值未变则**不广播**——进度是高频事件，整表快照每 100ms 重推一次会让池无谓重渲染。
 */
export function updateInstallJobProgress(
  jobId: string,
  progress: { stage?: string; percent?: number; message?: string },
): void {
  const job = getJob(jobId);
  if (!job || job.state === "settled") return;
  const nextStage = progress.stage ?? job.stage;
  const nextPercent = progress.percent ?? (progress.stage && progress.stage !== "downloading" ? undefined : job.percent);
  const nextMessage = progress.message ?? job.message;
  if (nextStage === job.stage && nextPercent === job.percent && nextMessage === job.message) return;
  job.stage = nextStage;
  job.percent = nextPercent;
  job.message = nextMessage;
  touchInstallJob(jobId);
  broadcast();
}

/**
 * 注册真中止钩子（E6#73d）——`installPlugin` 把「转主进程 `plugins:cancel` 的 AbortController」
 * 挂上来；排队态没有在途工作，不注册也没关系（取消直接出队）。
 */
export function setInstallJobCanceller(jobId: string, abort: () => void): void {
  const job = getJob(jobId);
  if (job && job.state !== "settled") job.abort = abort;
}

/**
 * 用户取消（E6#73d，18 档 §八⑤「任务行上加不加『取消安装』→ 定案：加」）——**行整条撤掉**。
 *
 * 两态两条路：
 * - **排队中**：没有在途工作，直接从 FIFO 摘掉 + 唤醒等它的调用方，`installPlugin` 那侧的
 *   `acquireInstallSlot` 会因记录已不存在而**立即返回**（见该函数首行守卫）⇒ 下游不跑。
 * - **进行中**：调真中止钩子（主进程 AbortController）并打 `cancelled` 标——在途的
 *   `installPlugin` 收尾调 `settleInstallJob` 时**吸收**掉（见该函数），不留红行。
 *
 * 返回 false = 停不下来 / 这个 job 不存在 / 已出结果。**「停不下来的不能假装停下来了」**（E6#73m K1）：
 * 面板靠同一个 `canCancel` 决定给不给钮，所以这条 false 是竞态兜底（钮按下去的瞬间结算了），
 * 不是用户会撞上的常态。
 */
export function cancelInstallJob(jobId: string): boolean {
  const job = getJob(jobId);
  if (!job || job.state === "settled") return false;
  // 卸载腿没挂中止钩子——`fs` 的删除/改名停不下来。只标 cancelled 会让行当场消失而活照旧在干，
  // 那是本批次要消灭的假动作，故直接拒收。
  if (job.state === "running" && !canCancel(job)) return false;
  if (job.state === "queued") {
    removeWaiter(jobId);
    // 留下「已取消」的终态结果再出队——去重命中的第二个调用方正挂在 `settledWaiters` 上等答案；
    // 只删记录会让它拿到 undefined，下游兜底文案就成了「正在安装中」（真话是「已被取消」）。
    job.cancelled = true;
    job.outcome = cancelledResult();
    const waiters = job.settledWaiters;
    job.settledWaiters = undefined;
    for (const wake of waiters ?? []) wake();
    dropJob(jobId);
    // 唤醒挂在槽位上的 `acquireInstallSlot`——它醒来看记录已不在表里，返回 false ⇒ 调用方收手。
    // 漏这一步 = 该 Promise 永不落地 = `installPlugin` 永久挂起（比装错更糟：连结果都没有）。
    job.grant?.();
    persist();
    broadcast();
    return true;
  }
  job.cancelled = true;
  job.abort?.();
  broadcast();
  return true;
}

/**
 * 该 job 是否已被用户取消（E6#73j）——**记账的查询面**，不是新状态。
 *
 * 取消的真账在 `JobRecord.cancelled`（`cancelInstallJob` 写、`settleInstallJob` 消费后连记录一起删）。
 * 但**调用方**（`installPlugin` / `updatePlugin` 的收尾）也要知道这件事，才能把 `cancelled: true`
 * 放进返回结果里——否则运行中被取消的那条腿只能从下载中止推出一个通用错误，市场侧照 `success:false`
 * 走失败分支：用户刚亲口点了「取消安装」，屏幕立刻回敬一条红字 + [重试]。
 * 记录已删（已结算）→ 返回 false——那时结果早已产出，问它没有意义。
 */
export function isInstallJobCancelled(jobId: string): boolean {
  return getJob(jobId)?.cancelled === true;
}

/** 按 pluginId 取消（面板行只拿得到 pluginId）——去重保证一个插件至多一条未结算 job */
export function cancelInstallJobByPlugin(pluginId: string): boolean {
  for (const job of allJobs()) {
    if (job.state !== "settled" && job.pluginId === pluginId) return cancelInstallJob(job.jobId);
  }
  return false;
}

/**
 * 等一个 job 出结果（去重命中的第二个调用方用）——已 settle 立即返回其 outcome。
 * job 不存在（极端：表被清）返回 undefined，调用方自行兜底文案。
 *
 * ⚠️ 唤醒后**从记录对象取** outcome，不再 `getJob(jobId)`：取消/结算会**删记录**，
 * 而删除发生在同步的唤醒循环里、早于本处的微任务续跑——回查表必然拿到 undefined，
 * 于是「装了一半点取消」的第二个调用方会收到「正在安装中」这种假话。
 */
export async function waitInstallJob(jobId: string): Promise<PluginInstallResult | undefined> {
  const job = getJob(jobId);
  if (!job) return undefined;
  if (job.state === "settled") return job.outcome;
  return await new Promise<PluginInstallResult | undefined>((resolve) => {
    (job.settledWaiters ??= []).push(() => resolve(job.outcome));
  });
}

/** 取消的统一结果对象——队列侧唯一生产者（`cancelled` 标 + 壳侧 t() 文案） */
function cancelledResult(): PluginInstallResult {
  return { success: false, cancelled: true, error: i18n.t("已取消安装") };
}

/**
 * 起手式（E6#73j 抽出）——**安装与更新两条腿共用的开场四步**：建 job → 去重等待 → 挂取消钩子 → 抢槽。
 *
 * 为什么要抽：更新并入同一队列后，这段与 `installPlugin` 的开场逐字同款，**两份拷贝迟早漂移**
 * （还真会——更新那条本就是照抄来的）。jscpd 也把它判成了克隆。
 *
 * `cancelHook` 由调用方给而不是本模块自己摸：真中止要调 `packageOps()` 的壳面 API，本模块**不依赖它**
 * （install-queue 是纯队列，import 反了会成环）。
 *
 * 四态返回，**每一态都必须被调用方区别对待**：
 * - `run`：槽到手，往下干真活；
 * - `duplicate`：同插件已有**同类** job 在跑/在排——已替调用方等出结果（「点两下」不是两件事）；
 * - `busy`：同插件那件活儿是**另一类**（`kind` 不同，E6#73m K1）——**绝不等它的结果**：等到了也是
 *   别人的答案（拿着「卸载成功」当「安装成功」报给用户，是这条腿能出的最大的假话）。调用方回绝用户；
 * - `cancelled`：排队期间被取消/判死——**收手**，不能假装没取消继续往下跑。
 */
export async function openInstallJob(
  spec: { pluginId?: string; displayName?: string; origin?: InstallJobOrigin },
  cancelHook: (jobId: string) => void,
): Promise<
  | { kind: "run"; jobId: string }
  | { kind: "duplicate"; jobId: string; outcome: PluginInstallResult | undefined }
  | { kind: "busy"; jobId: string }
  | { kind: "cancelled"; jobId: string }
> {
  const job = beginInstallJob(spec);
  if (job.duplicate) {
    if (getJob(job.jobId)?.kind !== "install") return { kind: "busy", jobId: job.jobId };
    return { kind: "duplicate", jobId: job.jobId, outcome: await waitInstallJob(job.jobId) };
  }
  setInstallJobCanceller(job.jobId, () => cancelHook(job.jobId));
  // ⚠️ 抢槽失败 = 排队期间被用户取消（或极端竞态下已被判死）——调用方必须收手。
  // 这里的 jobId 仍要带出去：记录多半已不在表里（排队取消 = 直接出队），调用方 settle 是空操作，
  // 但那是对「记录还在但已非 queued」那一支的兜底——漏了就会留个永不结算的僵尸行。
  if (!(await acquireInstallSlot(job.jobId))) return { kind: "cancelled", jobId: job.jobId };
  return { kind: "run", jobId: job.jobId };
}
