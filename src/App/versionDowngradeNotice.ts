/**
 * 应用层降级提示的**启动接线**——E6#42d 判据子项（验收现场 = `#57.16e` 倒测第④步「老包覆盖新版」）。
 *
 * ## 为什么必须有这一格
 *
 * 安装器方向守卫（`#42d`，`0.1.49` 起）**编在安装程序包内部** ⇒ 它只能约束**带着它的包**。
 * 已发出去的旧包（≤ `0.1.48`）身上没有这道守卫，用户双击它照旧静默覆盖新版（2026-09-12 实测：
 * `0.1.49` 被 `0.1.47` 静默覆盖，退出码 0）。**「这台机器被降级了」这个信号只有应用自己看得见**——
 * 因为只有应用在启动时知道自己这一次跑的是哪个版本、以及这台机器曾经跑到过多高。
 *
 * ## 账本（`update-highest-version`）——**只增不减**
 *
 * 记「这台机器上跑过的最高版本」。判据三条：
 *
 * | 情形 | 写账 | 提示 |
 * |:--|:--|:--:|
 * | 无记录（`!exists`） | 写 `current`（播种） | ✗ |
 * | 有记录但**读不出来** | 🔴 **不写、不动** | ✗ |
 * | `current` > 账上 | 写 `current`（抬高） | ✗ |
 * | `current` == 账上 | — | ✗ |
 * | `current` < 账上 | — | **✓ 提示** |
 *
 * 🔴 **本账与 `#57.13d` 的 `lastSeenVersion` 是两个问题，绝不许合成一个变量**（bug 类②「一个变量被
 * 问两个问题」）。`lastSeenVersion` 的语义是「这一版发行说明弹过了」，它**可以变小**（每次升级都重写）；
 * 本账的语义是「这台机器到过的最高点」，它**只能不变或变大**。合成一个的后果是确定的：
 * 一次降级会把那个变量一起写低 ⇒ 降级信号**自己抹掉自己** ⇒ 提示永远不触发，而账面上一切「正常」。
 *
 * ## 🔴 读取失败 ≠ 「没有记录」（本格最大的单点风险）
 *
 * `StorageService.read` **无法**区分「文件不存在」与「读出错」——两者都落到 `return null`
 * （`StorageService.ts` 的两个 catch 连注释都写在一起）。而同仓 `releaseNotesOnLaunch` 的账
 * **正着用**：读失败 ⇒ 当作从没见过 ⇒ 弹出一次（少弹比不弹好，代价有限）。
 * **本账必须反着来**：读不出来时如果当作「没有记录」去播种，就会拿**当前这个低版本**覆盖掉账上
 * 那个高版本 ⇒ 降级信号被永久抹掉，而且恰好是在最该报警的那次启动上。
 * ⇒ 判据用 `exists()`（它能区分：localStorage 或文件有记录即 true），**先问「有没有」，再问「是多少」**；
 * 有记录却读不出来 ⇒ **什么都不做**（不写、不提示）——宁可这一轮不报，也不许抹账、更不许凭空报。
 *
 * ## 提示走通知面（铃铛宽面板）
 *
 * 产出口是 `notifyVersionDowngrade`（`hooks/useUpdateNotifications.ts`，`app.update` 这个 source 的
 * 唯一生产者）——**不新建悬浮层**（E6#72 通知面唯一）。频度：**每次启动都提示**，直到用户点掉 ×
 * （抑制键 = `source::message`，消息里带两个版本号 ⇒ 每个「从哪降到哪」各算一条）或升回去
 * （账被抬高 ⇒ 自然不再命中降级分支）。2026-09-13 用户拍板。
 */
import { exists, read, write } from "../core/services/configuration/StorageService";
import { getShellExposed } from "../core/api/linkdesk-api/surfaces";
import { updateTargetDirection } from "../core/utils/plugin/semverUtils";
import { notifyVersionDowngrade } from "../hooks/useUpdateNotifications";

/**
 * 账本键——**壳侧 `StorageService` 新键，零新 IPC**（2026-09-13 用户拍板）。
 * 这一格是壳自己的问题（壳版本、壳的启动路径），不该为它开一条通道，也不该塞进任何插件的配置。
 */
const HIGHEST_VERSION_KEY = "update-highest-version";

/**
 * 一次启动的结论——**与 IO 分开的纯函数**（`decideVersionLedger`）好让每条分支都能被单独钉住，
 * 也好让测试放一个「旧写法」的对照实现（见单测的负控）。
 */
export type VersionLedgerAction =
  /** 账上空白 ⇒ 播种当前版本（不是提示） */
  | { kind: "seed"; write: string }
  /** 跑得比账上高 ⇒ 抬高（普通升级路径走这一支，**绝不提示**——判据③「不得误报」的全部实现） */
  | { kind: "raise"; write: string }
  /** 与账上持平 ⇒ 什么都不做（绝大多数启动） */
  | { kind: "same" }
  /** 🔴 跑得比账上低 ⇒ **提示**（唯一会说话的出口） */
  | { kind: "downgrade"; highest: string }
  /** 有记录但读不出来 ⇒ 什么都不做（见文件头「读取失败 ≠ 没有记录」） */
  | { kind: "skip" };

/**
 * 纯判定——给定「当前版本 / 账上有没有记录 / 读到的是什么」，该干什么。
 *
 * 方向判定**一律走 `updateTargetDirection`**（`semverUtils.ts`）——全仓版本方向的唯一实现，
 * 不许在这里手写字符串比较或自己拆版本号。
 */
export function decideVersionLedger(
  current: string,
  hasRecord: boolean,
  stored: string | null,
): VersionLedgerAction {
  // 无记录 = 真·第一次（或账本被清）⇒ 播种。此时机器上不存在「曾经更高」的历史，无降级可言。
  if (!hasRecord) return { kind: "seed", write: current };

  // 🔴 有记录却读不出（空串 / null）⇒ 不写不提示。**不许**在这里回落到 `seed`：那正是「抹账」。
  if (typeof stored !== "string" || stored === "") return { kind: "skip" };

  const direction = updateTargetDirection(current, stored);
  if (direction === "upgrade") return { kind: "raise", write: current };
  if (direction === "downgrade") return { kind: "downgrade", highest: stored };
  return { kind: "same" };
}

/**
 * 读账 → 判定 → 落账 / 提示。返回判定结果给调用方（测试要能断言「升级路径上通知器零调用」）。
 *
 * 落账失败**只告警不抛**：这一格是启动路径上的旁支，最坏后果 = 下次启动重判一遍（播种/抬高都是
 * 幂等的），绝不构成启动错误。提示那一支不需要落账（账上已经是对的），故写盘失败不影响报警。
 */
export async function runVersionDowngradeCheck(current: string): Promise<VersionLedgerAction> {
  // 先问「有没有」再问「是多少」——顺序不能反（见文件头 🔴）。
  const hasRecord = await exists(HIGHEST_VERSION_KEY);
  const stored = hasRecord ? await read<string>(HIGHEST_VERSION_KEY) : null;

  const action = decideVersionLedger(current, hasRecord, stored);

  if (action.kind === "seed" || action.kind === "raise") {
    try {
      await write(HIGHEST_VERSION_KEY, action.write);
    } catch (e) {
      console.warn("[downgrade] 记录最高版本失败（下次启动重判一遍）:", e);
    }
  }

  if (action.kind === "downgrade") notifyVersionDowngrade(current, action.highest);

  return action;
}

/**
 * 一次启动只跑一遍——**存 Promise 而不是布尔**（硬约束 13，同 `releaseNotesOnLaunch` 的先例）。
 * `useAppStartup` 的 effect 在 StrictMode / HMR 下会双跑，而本函数中途 await 了版本号与两次存储读，
 * 布尔守卫挡不住「第二次调用发生在第一次还在飞的时候」——那会让提示出两条。
 */
let _launch: Promise<void> | null = null;

async function _run(): Promise<void> {
  // 版本号取不到（非壳环境 / preload 未就绪）⇒ 什么都不做。**尤其不许拿一个占位值去落账**：
  // 账上写一个假版本 = 下一次真启动被自己判成「降级」（凭空报警）或被判成「持平」（信号丢失）。
  const version = await getShellExposed()?.app.getVersion();
  if (typeof version !== "string" || !version) return;

  await runVersionDowngradeCheck(version);
}

/**
 * 启动接线入口——`useAppStartup` 的 post-init 段调用一次（**不 await**）。
 *
 * 🔴 **返回的 Promise 永不 reject**：调用方是浮动 Promise（`void initVersionDowngradeNotice()`），
 * 漏出去就是一条无人认领的 unhandled rejection。失败只有一条后果：本次不判，下次启动再来。
 */
export function initVersionDowngradeNotice(): Promise<void> {
  _launch ??= _run().catch((e) => {
    console.error("[downgrade] 启动接线失败（本次不判，下次启动再来）:", e);
  });
  return _launch;
}

/** 测试辅助：复位「一次启动只跑一遍」的守卫（同 `__resetReleaseNotesLaunchForTest` 的既有先例） */
export function __resetVersionDowngradeNoticeForTest(): void {
  _launch = null;
}
