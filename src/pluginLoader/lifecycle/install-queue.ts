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
 * 取消（E6#73d）：`cancelInstallJob` 是唯一的取消入口——排队态直接出队，进行中打 `cancelled`
 * 标 + 调真中止钩子；终态结算时**吸收**（行整条撤掉，不留红行）。面板按钮在 StatusBarZone。
 *
 * 铁律：零颜色 / 零文案 / 零插件 ID 硬编码（pluginId 是运行时值，非字面量）/ 零路径字面量。
 *
 * ─────────────────────────────────────────────────────────────
 * E6#84（第 3.6 层文件整理）feature-folder 化——本文件 611 行超「500-800 多职责」人工审区：
 *   **本文件 = 纯 re-export 聚合门面（零逻辑）**，实现按职责落 `install-queue/` 同名夹：
 *     `types.ts`        常量 + 全部形状（本域唯一形状登记处）
 *     `persistence.ts`  磁盘腿（落盘快照 + 启动消费残留）——**不碰 `_jobs`**
 *     `store.ts`        🔴 `_jobs`/`_waiters`/`_seq`/`_running` **唯一属主** + 投影/订阅/落盘
 *     `scheduler.ts`    状态机：槽位编排 + FIFO 交接 + 看门狗 + 终态结算
 *     `job-ops.ts`      用户面动作：入队/身份/进度/取消/等待/开场四步
 *   **依赖单向无环**：types → persistence → store → scheduler → job-ops。
 *   🔴 **`_jobs` / `_waiters` 全仓一处声明**（`grep -rn "const _jobs" src/`）——拆散了 = 队列有两份账，
 *      同一个 job 在 A 表排队在 B 表结算，只在并发时才现形（「装到一半不动了」/「重复装两次」）。
 *   **消费方 import 路径零变更**（startup.ts / notif.ts / useSubscriptions.ts / update.ts / 测试）。
 * ─────────────────────────────────────────────────────────────
 */

export { consumeUnfinishedInstallJobs } from "./install-queue/persistence";

export { onDidChangeInstallJobs, listInstallJobs } from "./install-queue/store";

export {
  startInstallJobDirect,
  acquireInstallSlot,
  settleInstallJob,
  touchInstallJob,
} from "./install-queue/scheduler";

export {
  beginInstallJob,
  identifyInstallJob,
  updateInstallJobProgress,
  setInstallJobCanceller,
  cancelInstallJob,
  isInstallJobCancelled,
  cancelInstallJobByPlugin,
  waitInstallJob,
  openInstallJob,
} from "./install-queue/job-ops";
