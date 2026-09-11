/**
 * install-queue 的**磁盘腿**——落盘快照 + 启动消费残留快照。
 * E6#84（第 3.6 层文件整理）feature-folder 拆分：自 `install-queue.ts` 原样搬出，零行为变更。
 *
 * 🔴 **本文件只碰盘，不碰 `_jobs`**——它是 store 的下游（依赖方向 types → persistence → store）。
 *    `_jobs` 的唯一属主是 `store.ts`；此处收的是一份**已投影好的数组**，与表本身无关。
 *    这样切是刻意的：`consumeUnfinishedInstallJobs` 在壳启动最早期被调用，那时表必然是空的，
 *    若它反过来读表就成了「启动逻辑依赖运行期状态」的隐性次序耦合。
 */

import { read as storageRead, write as storageWrite } from "../../../core/services/configuration/StorageService";
import { SNAPSHOT_KEY, type InstallJob } from "./types";

/**
 * 落盘快照——只写**未出结果**的 job（73l 读它答「上次有 N 项安装未完成」）。
 * 只随状态迁移写（入队/开跑/出结果），不随百分比心跳写：进度对「上次未完成」无意义，写它只是白烧盘。
 * 写失败非致命（快照是辅助面，丢了只影响那条重启提示）。
 */
export function persistSnapshot(open: InstallJob[]): void {
  void storageWrite(SNAPSHOT_KEY, { updatedAt: new Date().toISOString(), jobs: open }).catch(() => {});
}

/**
 * 启动消费残留快照（E6#73l，18 档 §八⑮）——返回**上次没干完的 job 数**，并把快照清空。
 *
 * 覆盖两条来路，机制是同一条：**壳渲染进程换了一个**。① 壳崩 → crash-recovery 分支 2 全窗口重建；
 * ② 用户直接关掉软件再打开。本表住在壳渲染进程里（§五 I.2 定案：槽锁归壳才能扛过池崩），进程一没
 * 表就没了 ⇒ 新壳的 `_jobs` 必然是空的。
 *
 * 🔴 **只报数，不恢复条目**——那些任务早已随进程结束，重启后画一条停在 45% 的进度条是把死人当活的。
 * 如实说一句「上次有 N 项安装未完成」才是不撒谎（§八⑮ 原话：不假装还在跑）。
 *
 * **读一次即消费**（读完写回空表）：不消费的话每次启动都重播同一条，那就不是「一条回执」是闹钟了。
 *
 * ⚠️ `_consume` 去重**不是优化**：本函数由壳启动管线调用，StrictMode/HMR 下那条 effect 会跑两次，
 * 第二次若另起一次读就会**弹两条**（第一次大概率还没读完）。故第二次必须拿到**同一个** Promise
 * ——同硬约束 13 的「进行中 Promise 复用」模式。
 */
export function consumeUnfinishedInstallJobs(): Promise<number> {
  _consume ??= doConsumeUnfinishedInstallJobs();
  return _consume;
}

let _consume: Promise<number> | null = null;

async function doConsumeUnfinishedInstallJobs(): Promise<number> {
  let raw: { jobs?: unknown } | null = null;
  try {
    raw = await storageRead<{ jobs?: unknown }>(SNAPSHOT_KEY);
  } catch {
    // 读不出来 = 没有信息，不是「0 项」。此时**什么都不说**（既不报 0，也不编一个 N）。
    return 0;
  }
  const jobs = Array.isArray(raw?.jobs) ? raw.jobs : [];
  // 形状守卫：`persist` 只写未结算的 job 对象（见该函数），所以「是对象且 state 非 settled」= 未完成。
  // 非对象一律**不数**——磁盘上那份可能是旧版本写的、也可能被改坏过；从坏数据里数出一个数，
  // 就是拿编出来的数字当事实（与上面「读不出来就不说」同一条纪律：说不准就闭嘴）。
  const unfinished = jobs.filter((j) => {
    const rec = j as InstallJob | null;
    return typeof rec === "object" && rec !== null && rec.state !== "settled";
  }).length;
  if (unfinished === 0) return 0;
  persistSnapshot([]);
  return unfinished;
}
