/**
 * install-queue 的**状态属主**——🔴 `_jobs` / `_waiters` / `_seq` / `_running` 在本域内**只有这一份**。
 * E6#84（第 3.6 层文件整理）feature-folder 拆分：自 `install-queue.ts` 原样搬出，零行为变更。
 *
 * 🔴 **为什么必须单属主**（照 0d.10-8 KeybindingRegistry 先例「模块级 mutable 状态各归单域属主，
 *    跨域读走公开 accessor」）：拆成两份账 = 同一个 job 在 A 表排队、在 B 表结算——表现为
 *    「装到一半不动了」或「重复装两次」，**且只在并发时才现形**。`scheduler.ts` / `job-ops.ts`
 *    一律经本文件导出的 accessor 读写，**绝不允许出现第二份 `_jobs`**（`grep -rn "const _jobs"` 全仓一处）。
 *
 * 依赖方向：types → persistence → **store** → scheduler → job-ops（单向无环）。
 */

import { persistSnapshot } from "./persistence";
import { INSTALL_JOBS_EVENT, SETTLED_RETENTION, type InstallJob, type JobRecord } from "./types";

const _jobs = new Map<string, JobRecord>();
/** FIFO 等待队列——只存 jobId；槽位释放时**直接交接**给队首（不先减再加，防双计） */
const _waiters: string[] = [];
let _seq = 0;
let _running = 0;

/* ── 记录读写（唯一入口） ── */

/** 取一条记录——调用方**不要**把返回值存起来跨 await；竞态下记录可能已被删除/结算。 */
export function getJob(jobId: string): JobRecord | undefined {
  return _jobs.get(jobId);
}

/** 遍历在途记录（去重扫描 / 按 pluginId 取消用）——每次返回新数组，改它不影响表。 */
export function allJobs(): JobRecord[] {
  return [..._jobs.values()];
}

/** 入表（`beginInstallJob` 用）。 */
export function putJob(job: JobRecord): void {
  _jobs.set(job.jobId, job);
}

/** 出表——结算吸收 / 排队取消用。 */
export function dropJob(jobId: string): void {
  _jobs.delete(jobId);
}

/** 铸一个 jobId——`_seq` 是唯一序号源（同毫秒内不撞）。 */
export function mintJobId(): string {
  return `job-${(++_seq).toString(36)}-${Date.now().toString(36)}`;
}

/* ── FIFO 等待队列 ── */

export function pushWaiter(jobId: string): void {
  _waiters.push(jobId);
}

/** 从 FIFO 摘掉某个 jobId（排队取消 / 排队态被结算的僵尸清理）——不在队列则空操作。 */
export function removeWaiter(jobId: string): void {
  const idx = _waiters.indexOf(jobId);
  if (idx !== -1) _waiters.splice(idx, 1);
}

export function shiftWaiter(): string | undefined {
  return _waiters.shift();
}

/* ── 并发槽计数 ── */

export function runningCount(): number {
  return _running;
}

export function incRunning(): void {
  _running += 1;
}

export function decRunning(): void {
  _running -= 1;
}

/* ── 投影 / 订阅 / 落盘 ── */

/**
 * 能不能真取消（E6#73m K1）——**唯一裁决处**，`snapshot()`（喂面板）与 `cancelInstallJob`（干实事）
 * 共用同一个答案：两处各判一次 = 面板给了钮、点击却被拒（或反过来），用户看到的就是「按钮是假的」。
 *
 * 三态：已出结果 → 没得取消；排队中 → 能（从 FIFO 摘掉即可，没有在途工作）；进行中 → 看有没有
 * 真中止钩子（安装腿在抢槽**之前**就挂好了，所以不存在「刚开跑还没钩子」的空窗）。
 */
export function canCancel(job: JobRecord): boolean {
  if (job.state === "settled") return false;
  if (job.state === "queued") return true;
  return typeof job.abort === "function";
}

/** 公共 DTO 投影——剥掉 grant/settledWaiters/watchdog/outcome/abort/cancelled 等队列私有字段 */
function snapshot(): InstallJob[] {
  return [..._jobs.values()].map((j) => ({
    jobId: j.jobId,
    pluginId: j.pluginId,
    origin: j.origin,
    kind: j.kind,
    cancellable: canCancel(j),
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
export function broadcast(): void {
  try {
    window.linkdesk?.events?.emit(INSTALL_JOBS_EVENT, { jobs: snapshot() });
  } catch { /* 广播失败不阻断安装 */ }
  for (const cb of _listeners) cb();
}

/** 落盘快照——只写未结算的 job（磁盘腿在 `persistence.ts`）。只随状态迁移写，不随百分比心跳写。 */
export function persist(): void {
  persistSnapshot(snapshot().filter((j) => j.state !== "settled"));
}

/** 已出结果的 job 保留上限——超出按入队序淘汰最老的（内存上界，与展示配额无关） */
export function pruneSettled(): void {
  const settled = allJobs().filter((j) => j.state === "settled");
  if (settled.length <= SETTLED_RETENTION) return;
  for (const job of settled.slice(0, settled.length - SETTLED_RETENTION)) {
    dropJob(job.jobId);
  }
}
