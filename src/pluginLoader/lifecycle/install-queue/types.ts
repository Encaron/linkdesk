/**
 * install-queue 的常量与类型——**本域唯一的形状登记处**。
 * E6#84（第 3.6 层文件整理）feature-folder 拆分：自 `install-queue.ts` 原样搬出，零行为变更。
 * 依赖：零（叶子）——任何子模块都可 import 本文件。
 */

import type { PluginInstallResult } from "../../../core/api/linkdesk-api/types";

/** 池可达 job 快照事件名——本域是唯一权威登记处（载荷形状登记于 18 档 §五 I.6⑤） */
export const INSTALL_JOBS_EVENT = "plugin:installJobs";

/** 全局在途槽位上限——18 档 §八⑦c 定案「先按 3 做」。可校准数字：首批实机后由用户按体感拍板。 */
export const INSTALL_CONCURRENCY = 3;

/** 落盘快照 key（{userData}/install-jobs.json）——73l「上次有 N 项安装未完成」的 N 唯一生产者 */
export const SNAPSHOT_KEY = "install-jobs";

/** 已完成 job 的内存保留上限——纯内存上界（用户可见的「每段 ≤5 条」是 73d 的展示配额，两回事） */
export const SETTLED_RETENTION = 50;

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
export const SLOT_IDLE_BUDGET_MS = 10 * 60_000;

/** job 出身——行 = 一次**用户动作**（user）；插件自己拖来的依赖（dependency）藏在那一行里面 */
export type InstallJobOrigin = "user" | "dependency";

/**
 * 这条活儿是**装**还是**卸**（E6#73m K1）——两者共用本表与面板同一段「进行中」，但两条腿的能力**不同**：
 *
 * - `install`（含更新）：下载段可中止 ⇒ 挂真中止钩子 ⇒ 行上有 [取消安装]；
 * - `uninstall`：**没挂中止钩子**（`fs` 的删除/改名停不下来，假装能停 = 按钮一点行没了、活还在干，
 *   是最坏的假动作）⇒ 本表**不给**取消能力（`canCancel` 是唯一裁决处）。
 *
 * 也是**跨类去重**的判据：装 X 跑到一半点卸载 X，不能拿安装的结果当卸载的答案（反之亦然）。
 */
export type InstallJobKind = "install" | "uninstall";

/** 排队 / 在跑 / 已出结果 */
type InstallJobState = "queued" | "running" | "settled";

/** 终态三类——`parked` = 已安装但缺依赖（**装上了但不可用，不是成功**，§五 I.6⑦） */
export type InstallJobTerminal = "success" | "failed" | "parked";

/** 池可达的 job 条目——形状 = 18 档 §五 I.6⑤（广播与落盘共用同一形状，无第二份投影） */
export interface InstallJob {
  jobId: string;
  pluginId: string;
  origin: InstallJobOrigin;
  /** E6#73m K1：装 / 卸——行语义 + 跨类去重判据（见 `InstallJobKind`） */
  kind: InstallJobKind;
  displayName: string;
  state: InstallJobState;
  /**
   * E6#73m K1：这条 job 现在能不能被用户真取消——**由本表裁决**（`canCancel`），面板照抄不自行推断。
   * 面板若自己按 `kind` 推，就把「谁停得下来」这条队列知识复制到了视图层，两处迟早说不到一块。
   */
  cancellable: boolean;
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
export interface JobRecord extends InstallJob {
  /**
   * E6#73m K1：**它占着并发槽吗**——安装腿占（`startJob` / `releaseSlot` 交接时置位），
   * 卸载腿不占（`startInstallJobDirect` 直开）。`settleInstallJob` 据此决定还不还槽：
   * 卸载腿从没加过 `_running`，无条件 `releaseSlot()` 会让它**替别人还槽**——`_running` 少计，
   * 并发上限被静默抬高（比排队更糟：闸门自己漏了）。
   */
  holdSlot?: boolean;
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
