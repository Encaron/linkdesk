/**
 * install-queue——E6#73q 壳侧安装队列：job 表 + N 槽限流 + 严格 FIFO + 池可达状态广播。
 *
 * 病根（18 档 §五 I.9 实证）：连点 7 个插件 = **装 1 丢 6**——唯一的闸是 marketplace 的模块级单例
 * `_installSession`，命中即静默 `return false`（不打日志、不弹 toast、不改 UI）；主进程/壳层零互斥。
 * 本模块把「闸」换成「队列」：同插件已在队列/在跑 → 不建第二行（去重，顺带消灭同 id 双开解压到同一
 * 目录的 TOCTOU）；其余按「这一帧安装真的开始了」的先后严格 FIFO 抢 N 个全局槽；超上限者**真停在**
 * 「等待安装中」，不是被丢掉。
 *
 * 为什么槽锁在**壳**（18 档 §五 I.2 定案，推翻「信号量归主进程」）：池崩（crash-recovery 分支 1）只
 * 重建池、壳渲染进程存活 ⇒ 壳持队列能扛过池崩；主进程持则要另开一条跨进程 job 通道。代价：壳崩
 * （分支 2 全窗口重建）连 job 表一起丢——那一支归 73l。
 *
 * 池可达（§五 I.6⑤ 硬前置）：插件禁止 import @src/core（读不到本表），故 job 状态走**公开事件面**——
 * 新增事件名 `plugin:installJobs`，走既有 window.linkdesk.events 广播管道（同族先例
 * plugin:installProgress）。**名与载荷形状的唯一权威登记处 = 18 档 §五 I.6⑤**；作者面说明归 73n L2。
 *
 * 本档不做（有载体才有产物）：子包占槽 + 反饿死护栏（随 E6#73o 依赖腿，无依赖链即无子包）。
 *
 * 取消（E6#73d）：`cancelInstallJob` 是本模块唯一的取消入口——排队态直接出队，进行中打 `cancelled`
 * 标 + 调真中止钩子；终态结算时**吸收**（行整条撤掉，不留红行）。面板按钮在 StatusBarZone。
 *
 * 铁律：零颜色 / 零文案 / 零插件 ID 硬编码（pluginId 是运行时值，非字面量）/ 零路径字面量。
 */

import { write as storageWrite } from "../../core/services/configuration/StorageService";
import i18n from "../../i18n"; // 显示文本铁律：壳侧 t() 解析，池哑渲染零自产文本
import type { PluginInstallResult } from "../../core/api/linkdesk-api/types";

/** 池可达 job 快照事件名——本文件是唯一权威登记处（载荷形状登记于 18 档 §五 I.6⑤） */
const INSTALL_JOBS_EVENT = "plugin:installJobs";

/** 全局在途槽位上限——18 档 §八⑦c 定案「先按 3 做」。可校准数字：首批实机后由用户按体感拍板。 */
const INSTALL_CONCURRENCY = 3;

/** 落盘快照 key（{userData}/install-jobs.json）——73l「上次有 N 项安装未完成」的 N 唯一生产者 */
const SNAPSHOT_KEY = "install-jobs";

/** 已完成 job 的内存保留上限——纯内存上界（用户可见的「每段 ≤5 条」是 73d 的展示配额，两回事） */
const SETTLED_RETENTION = 50;

/**
 * 槽级看门狗预算（§五 I.6①）——「挂死的 job 不许永久占 1/3 槽」。
 *
 * 判据是**空闲**不是总时长（同 73e 下载层：总时长阈值会把健康的大包判死）。心跳 = job 自己的进度广播
 * （见 `touchInstallJob`）。取 10 分钟的理由：下载段的挂死已由 plugin-download 的 30s 空闲超时 + 2 次
 * 重试预算兜住（≤ ~92 秒必出结论），extract/load 都是本地段——**10 分钟零进度只可能是真楔死**。
 *
 * 诚实边界：强判后**不假装已经中止那个任务**——后台那段仍可能跑完（extract 对已存在目录拒绝、load
 * 幂等）。用户可见结果是「行变红 + 槽位归还」，正是本前置要的。
 */
const SLOT_IDLE_BUDGET_MS = 10 * 60_000;

/** job 出身——行 = 一次**用户动作**（user）；插件自己拖来的依赖（dependency）藏在那一行里面 */
type InstallJobOrigin = "user" | "dependency";

/** 排队 / 在跑 / 已出结果 */
type InstallJobState = "queued" | "running" | "settled";

/** 终态三类——`parked` = 已安装但缺依赖（**装上了但不可用，不是成功**，§五 I.6⑦） */
type InstallJobTerminal = "success" | "failed" | "parked";

/** 池可达的 job 条目——形状 = 18 档 §五 I.6⑤（广播与落盘共用同一形状，无第二份投影） */
interface InstallJob {
  jobId: string;
  pluginId: string;
  origin: InstallJobOrigin;
  displayName: string;
  state: InstallJobState;
  terminal?: InstallJobTerminal;
  error?: string;
  /**
   * E6#73d：当前阶段码（`downloading` / `extracting` / `loading` …）——主进程 `plugin:installProgress`
   * 事件按 `jobId` 回填。**面板「进行中」行的阶段短语由它派生**（壳侧 t() 解析，池哑渲染）。
   */
  stage?: string;
  /** E6#73d：下载段百分比 0-100（无 Content-Length 时缺省 = 不定态扫动，同 `NotifItem.percent` 语义）。 */
  percent?: number;
  /** E6#73d：阶段自带文案（如「下载失败，正在重试（1/2）」）——**优先于靠 `stage` 派生的短语**。 */
  message?: string;
}

/** 内部记录——公共 DTO 之外挂队列私有字段（槽位唤醒器 / 终态唤醒器 / 看门狗 / 终态结果），出表前剥掉 */
interface JobRecord extends InstallJob {
  /** 排队态的槽位唤醒器——槽位释放时直接交接（FIFO 队首） */
  grant?: () => void;
  /** 终态唤醒器表——去重命中的第二个调用方在等它（同插件二次点击 = 等第一次装完，同一件事同一个答案） */
  settledWaiters?: Array<() => void>;
  /** 槽级看门狗句柄（仅 running 态持有） */
  watchdog?: ReturnType<typeof setTimeout>;
  /** 终态结果——去重命中的第二个调用方等它 */
  outcome?: PluginInstallResult;
  /**
   * E6#73d：真中止钩子——由 `installPlugin` 注册（转主进程 `plugins:cancel` 的 AbortController）。
   * 排队态没有在途工作，无需钩子。
   */
  abort?: () => void;
  /**
   * E6#73d：已被用户取消——终态结算时**吸收**（行整条撤掉，不留红行）。
   * 理由：取消是用户主动叫停，不是「安装失败」；把它渲染成 ✗ 是替用户下错结论
   * （18 档 §五 I.4 的四类行里没有「已取消」，不加第五类 = 不发明设计外的状态）。
   */
  cancelled?: boolean;
}

const _jobs = new Map<string, JobRecord>();
/** FIFO 等待队列——只存 jobId；槽位释放时**直接交接**给队首（不先减再加，防双计） */
const _waiters: string[] = [];
let _seq = 0;
let _running = 0;

/* ── 身份 / 广播 / 落盘 ── */

/** 公共 DTO 投影——剥掉 grant/settledWaiters/watchdog/outcome/abort/cancelled 等队列私有字段 */
function snapshot(): InstallJob[] {
  return [..._jobs.values()].map((j) => ({
    jobId: j.jobId,
    pluginId: j.pluginId,
    origin: j.origin,
    displayName: j.displayName,
    state: j.state,
    terminal: j.terminal,
    error: j.error,
    stage: j.stage,
    percent: j.percent,
    message: j.message,
  }));
}

/** 壳内订阅者——面板三段式（E6#73d）在**同一个渲染进程**里读本表，走进程内回调而非 IPC 往返 */
const _listeners = new Set<() => void>();

/**
 * 壳内 job 表变化订阅（E6#73d）——`usePoolSync` 用它重推布局。
 * ⚠️ **不是**池可达的那条公开面：插件侧读 job 状态走 `INSTALL_JOBS_EVENT` 广播（下方），
 * 两条消费路径共用同一份 `snapshot()`，不存在第二份投影。
 */
export function onDidChangeInstallJobs(cb: () => void): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

/** 面板三段式的数据源——壳侧直读（避开事件往返；池侧仍走广播，两者同源同形）。 */
export function listInstallJobs(): InstallJob[] {
  return snapshot();
}

/** 事件即快照（§五 I.5.1③：无持久化，池侧每次整表替换）——不做增量协议，消费方无需合并逻辑 */
function broadcast(): void {
  try {
    window.linkdesk?.events?.emit(INSTALL_JOBS_EVENT, { jobs: snapshot() });
  } catch { /* 广播失败不阻断安装 */ }
  for (const cb of _listeners) cb();
}

/**
 * 落盘快照——只写**未出结果**的 job（73l 读它答「上次有 N 项安装未完成」）。
 * 只随状态迁移写（入队/开跑/出结果），不随百分比心跳写：进度对「上次未完成」无意义，写它只是白烧盘。
 * 写失败非致命（快照是辅助面，丢了只影响那条重启提示）。
 */
function persist(): void {
  const open = snapshot().filter((j) => j.state !== "settled");
  void storageWrite(SNAPSHOT_KEY, { updatedAt: new Date().toISOString(), jobs: open }).catch(() => {});
}

/** 已出结果的 job 保留上限——超出按入队序淘汰最老的（内存上界，与展示配额无关） */
function pruneSettled(): void {
  const settled = [..._jobs.values()].filter((j) => j.state === "settled");
  if (settled.length <= SETTLED_RETENTION) return;
  for (const job of settled.slice(0, settled.length - SETTLED_RETENTION)) {
    _jobs.delete(job.jobId);
  }
}

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
}): { jobId: string; duplicate: boolean } {
  const pluginId = spec.pluginId?.trim() ?? "";
  if (pluginId) {
    for (const job of _jobs.values()) {
      if (job.state !== "settled" && job.pluginId === pluginId) {
        return { jobId: job.jobId, duplicate: true };
      }
    }
  }
  const jobId = `job-${(++_seq).toString(36)}-${Date.now().toString(36)}`;
  _jobs.set(jobId, {
    jobId,
    pluginId,
    displayName: spec.displayName?.trim() || pluginId,
    origin: spec.origin ?? "user",
    state: "queued",
  });
  persist();
  broadcast();
  return { jobId, duplicate: false };
}

/** 回填身份（解压出真 pluginId 后）——显示名今天只存在于池侧目录 store，壳拿不到，故随请求带入或回填 */
export function identifyInstallJob(jobId: string, ident: { pluginId: string; displayName?: string }): void {
  const job = _jobs.get(jobId);
  if (!job || job.state === "settled") return;
  job.pluginId = ident.pluginId;
  job.displayName = ident.displayName?.trim() || job.pluginId;
  broadcast();
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
  const job = _jobs.get(jobId);
  if (!job || job.state !== "queued") return false;
  if (_running < INSTALL_CONCURRENCY) {
    startJob(job);
    return true;
  }
  _waiters.push(jobId);
  await new Promise<void>((resolve) => { job.grant = resolve; });
  // 挂起期间被取消（记录已删）或被打成非 queued（releaseSlot 已置 running）——按记录说话
  return _jobs.get(jobId)?.state === "running";
}

/** 出结果——落终态 + 还槽 + 唤醒等待方 + 广播 + 落盘。重复调用幂等（看门狗与正常收尾可能同时到）。 */
export function settleInstallJob(jobId: string, terminal: InstallJobTerminal, outcome?: PluginInstallResult): void {
  const job = _jobs.get(jobId);
  if (!job || job.state === "settled") return;
  const wasRunning = job.state === "running";
  job.state = "settled";
  job.terminal = terminal;
  job.outcome = outcome;
  if (outcome?.error) job.error = outcome.error;
  clearWatchdog(job);
  if (wasRunning) {
    releaseSlot();
  } else {
    // 排队态被结算——从 FIFO 里摘掉，别让 releaseSlot 捞到僵尸
    const idx = _waiters.indexOf(jobId);
    if (idx !== -1) _waiters.splice(idx, 1);
  }
  const waiters = job.settledWaiters;
  job.settledWaiters = undefined;
  for (const wake of waiters ?? []) wake();
  // E6#73d：被用户取消的 job **吸收**——行整条撤掉，不留 ✗（取消不是失败，见 `cancelled` 注释）。
  // 槽位已在上面归还，看门狗已清，等待方已唤醒 ⇒ 撤掉记录不会漏掉任何收尾动作。
  if (job.cancelled) {
    _jobs.delete(jobId);
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
  const job = _jobs.get(jobId);
  if (job?.state === "running") armWatchdog(job);
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
  const job = _jobs.get(jobId);
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
  const job = _jobs.get(jobId);
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
 * 返回 false = 这个 job 不存在 / 已出结果（面板上的行早没了，属竞态，静默）。
 */
export function cancelInstallJob(jobId: string): boolean {
  const job = _jobs.get(jobId);
  if (!job || job.state === "settled") return false;
  if (job.state === "queued") {
    const idx = _waiters.indexOf(jobId);
    if (idx !== -1) _waiters.splice(idx, 1);
    // 留下「已取消」的终态结果再出队——去重命中的第二个调用方正挂在 `settledWaiters` 上等答案；
    // 只删记录会让它拿到 undefined，下游兜底文案就成了「正在安装中」（真话是「已被取消」）。
    job.cancelled = true;
    job.outcome = cancelledResult();
    const waiters = job.settledWaiters;
    job.settledWaiters = undefined;
    for (const wake of waiters ?? []) wake();
    _jobs.delete(jobId);
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
  return _jobs.get(jobId)?.cancelled === true;
}

/** 按 pluginId 取消（面板行只拿得到 pluginId）——去重保证一个插件至多一条未结算 job */
export function cancelInstallJobByPlugin(pluginId: string): boolean {
  for (const job of _jobs.values()) {
    if (job.state !== "settled" && job.pluginId === pluginId) return cancelInstallJob(job.jobId);
  }
  return false;
}

/**
 * 等一个 job 出结果（去重命中的第二个调用方用）——已 settle 立即返回其 outcome。
 * job 不存在（极端：表被清）返回 undefined，调用方自行兜底文案。
 *
 * ⚠️ 唤醒后**从记录对象取** outcome，不再 `_jobs.get(jobId)`：取消/结算会**删记录**，
 * 而删除发生在同步的唤醒循环里、早于本处的微任务续跑——回查表必然拿到 undefined，
 * 于是「装了一半点取消」的第二个调用方会收到「正在安装中」这种假话。
 */
export async function waitInstallJob(jobId: string): Promise<PluginInstallResult | undefined> {
  const job = _jobs.get(jobId);
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
 * 三态返回，**每一态都必须被调用方区别对待**：
 * - `run`：槽到手，往下干真活；
 * - `duplicate`：同插件已有 job 在跑/在排——已替调用方等出结果（「点两下」不是两件事）；
 * - `cancelled`：排队期间被取消/判死——**收手**，不能假装没取消继续往下跑。
 */
export async function openInstallJob(
  spec: { pluginId?: string; displayName?: string; origin?: InstallJobOrigin },
  cancelHook: (jobId: string) => void,
): Promise<
  | { kind: "run"; jobId: string }
  | { kind: "duplicate"; jobId: string; outcome: PluginInstallResult | undefined }
  | { kind: "cancelled"; jobId: string }
> {
  const job = beginInstallJob(spec);
  if (job.duplicate) return { kind: "duplicate", jobId: job.jobId, outcome: await waitInstallJob(job.jobId) };
  setInstallJobCanceller(job.jobId, () => cancelHook(job.jobId));
  // ⚠️ 抢槽失败 = 排队期间被用户取消（或极端竞态下已被判死）——调用方必须收手。
  // 这里的 jobId 仍要带出去：记录多半已不在表里（排队取消 = 直接出队），调用方 settle 是空操作，
  // 但那是对「记录还在但已非 queued」那一支的兜底——漏了就会留个永不结算的僵尸行。
  if (!(await acquireInstallSlot(job.jobId))) return { kind: "cancelled", jobId: job.jobId };
  return { kind: "run", jobId: job.jobId };
}

/* ── 槽位与看门狗（内部） ── */

function startJob(job: JobRecord): void {
  _running += 1;
  job.state = "running";
  armWatchdog(job);
  persist();
  broadcast();
}

/**
 * 还槽——FIFO 队首**直接接手**（`_running` 不减，防「先减后加」中间态被下一个 acquire 抢进双计）；
 * 队列空才真减。队首若是已被结算的僵尸（防御路径）跳过，继续找下一个。
 */
function releaseSlot(): void {
  const nextId = _waiters.shift();
  if (nextId === undefined) {
    _running -= 1;
    return;
  }
  const next = _jobs.get(nextId);
  if (!next || next.state !== "queued") {
    releaseSlot();
    return;
  }
  next.state = "running";
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
      error: i18n.t("安装超时——{{n}} 分钟无进展，已释放队列位", { n: SLOT_IDLE_BUDGET_MS / 60_000 }),
    });
  }, SLOT_IDLE_BUDGET_MS);
}

function clearWatchdog(job: JobRecord): void {
  if (job.watchdog !== undefined) {
    clearTimeout(job.watchdog);
    job.watchdog = undefined;
  }
}
