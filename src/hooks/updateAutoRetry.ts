/**
 * 检查腿失败的**有限自动重试**——#57.9g 兑现（04 池「更新检查遇匿名限流」A 案后半，2026-09-27）。
 *
 * ## 为什么必须有它
 *
 * 失败文案（`update-http.ts` 的限流 / network 两条）承诺「稍后会自动重试」，但检查腿失败的
 * 自动重试一直未开工——`auto` 档只有 4 小时一轮的周期检查（侥幸对上），`manual` 档一句都不重试
 * ⇒ 文案说的是没做的事。本模块把承诺变成行为。
 *
 * ## 五问的定案（08-调度归属与失败重试 §2.3，2026-09-27 按 04 池 A 案定）
 *
 * | # | 问题 | 定案 |
 * |:-:|:--|:--|
 * | ① | 哪些类别可重试 | **仅 `network` / `rate-limited`**（瞬时类）；`not-found` / `invalid-response` / `asset-missing` / `version-unparsable` 等确定性失败一次都不重试（重试无意义，还掩盖发布侧真错） |
 * | ② | 几次、间隔 | **3 次，退避 1 分钟 → 5 分钟 → 20 分钟**（总跨度 26 分钟，覆盖 GitHub 匿名册的小时窗），到顶停手，等下个周期或手动 |
 * | ③ | 出不出声 | **重试全程静默**（后台语义，与 #57.12d「后台失败不打扰」同向）；原始失败是谁发起的谁已经出过声，重试本身不追加提示条 |
 * | ④ | 与手动怎么互动 | **一切检查的结局都喂给同一台状态机**（`checkForUpdatesAndReport` 是唯一 chokepoint）——手动成功 / 确定性失败 ⇒ 撤链；手动再遇可重试失败 ⇒ **从第一棒重起**（用户接管后重发计）；重试棒自己的连败 ⇒ 按棒数推进 |
 * | ⑤ | 无断点续传的代价 | **不适用**——本模块只重试**检查腿**（一发小 JSON 请求）；下载腿不做自动重试是已定案（08 §2.1：无续传时自动重下 = 悄悄重复下载几十 MB），不在此推翻 |
 *
 * ## 归属与边界
 *
 * - **档位无关**：`app.update.mode: manual` 只退出**周期检查**，不退出**失败恢复**——文案既然承诺了
 *   自动重试，承诺就必须为真；重试链至多 3 次且只在失败之后存在，不构成「后台周期打扰」。
 * - **状态机在壳渲染侧、定时器模块级**：链由「检查的结局」驱动而非由调度器 effect 持有，跨重挂载
 *   （StrictMode 双跑）不断链；链自带终点（3 次封顶），不存在需要 unmount 清理的常驻回调——
 *   与硬约束 19（僵尸 IPC 监听）不冲突，本模块不注册任何事件监听。
 * - **只动检查腿**：重试经 `api.checkForUpdates(false)`（后台语义值，07 §4.1），成功后的「发现」
 *   条目由迁移驱动那条路照常出（`useUpdateNotifications` 的 `onState`），本模块零通知面代码。
 * - **重试结果喂回自己**（`fireRetry` → `noteCheckOutcome`）：`_inFlightRetry` 旗标区分「重试棒的
 *   结局」（推进棒数）与「链外结局」（初始 / 手动失败，重起链条）——两种可重试失败共用一个进料口，
 *   不靠「有无待发定时器」猜来源。与主进程忙态撞车（返回 `checking`）时按「在途」跳过、旗标留在
 *   原位，那一棒不补时——宁可少试一次，不与用户抢并发（08 §2.3④）。
 */

import { getShellUpdateApi } from "./useUpdateState";
import type { UpdateError, UpdateState } from "../core/types/ipc/update";

/** 重试退避表——export 的唯一消费方是单测（复读字面量会让「改表」变成假门禁） */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 20 * 60_000] as const;

/** 可自动重试的失败码——瞬时类全集（08 §2.3① 判定）；确定性失败不在此列（模块私有：判据 2 的负控在测试里逐码点名） */
const RETRYABLE_CHECK_CODES: ReadonlySet<UpdateError["code"]> = new Set(["network", "rate-limited"]);

/** 已排到第几棒（0 起）——`RETRY_DELAYS_MS.length` 封顶 */
let _attempt = 0;
/** 待发的重试定时器——同一时刻至多一棒在途 */
let _timer: ReturnType<typeof setTimeout> | undefined;
/** 重试棒自己的检查是否在途——区分「棒结局」（推进）与「链外结局」（重起）的唯一凭据 */
let _inFlightRetry = false;

/** 撤链——成功、确定性失败、封顶、手动重起前调用（链态三件全部归零） */
function cancelChain(): void {
  if (_timer !== undefined) {
    clearTimeout(_timer);
    _timer = undefined;
  }
  _attempt = 0;
  _inFlightRetry = false;
}

/** 从检查结局里抽出「可重试的失败」——其余结局（成功 / 确定性失败 / 非失败）一律 null */
function retryableErrorOf(next: UpdateState): UpdateError | null {
  if (next.type !== "idle" || !next.lastError) return null;
  return RETRYABLE_CHECK_CODES.has(next.lastError.code) ? next.lastError : null;
}

/**
 * 检查的**结局**进料口——唯一调用方是 `checkForUpdatesAndReport`（chokepoint：后台调度 / 手动命令 /
 * `[重试]` / 下载失败重查四条路全过它，无第二条进料路径）。`null`（非壳环境）忽略。
 */
export function noteCheckOutcome(next: UpdateState | null): void {
  if (next === null) return;
  // 在途态（撞车 / 进度中）不动链——既不撤也不排，等真实结局
  if (next.type === "checking" || next.type === "downloading" || next.type === "updating") return;

  if (retryableErrorOf(next) === null) {
    cancelChain();
    return;
  }

  if (_inFlightRetry) {
    // 这是重试棒自己的连败——棒数已在本棒发出时 +1，到顶即封顶停手
    _inFlightRetry = false;
    if (_attempt >= RETRY_DELAYS_MS.length) {
      console.info("[updateAutoRetry] 检查更新自动重试已达上限，停止——等待下个周期或手动重试");
      _attempt = 0;
      return;
    }
  } else {
    // 链外来源（首次失败 / 用户手动重查又失败）——撤掉可能待发的旧棒，从第一棒重发计
    cancelChain();
  }

  const delay = RETRY_DELAYS_MS[_attempt];
  _attempt += 1;
  _timer = setTimeout(() => {
    _timer = undefined;
    void fireRetry();
  }, delay);
}

/** 发一棒重试（后台语义）→ 结局喂回同一台状态机续链/撤链 */
async function fireRetry(): Promise<void> {
  const api = getShellUpdateApi();
  if (!api) return;
  _inFlightRetry = true;
  let next: UpdateState | null = null;
  try {
    next = await api.checkForUpdates(false); // false = 后台——静默语义值（07 §4.1）
  } catch (err) {
    // 检查腿契约违反（服务收进态内不抛，见 update-service.ts）按「未知结局」处理：撤链不续
    console.error("[updateAutoRetry] 重试棒异常（检查腿契约违反）：", err);
  }
  noteCheckOutcome(next);
}

/** 单测复位——把模块级链态清干净，防跨用例泄漏的定时器串场 */
export function __resetUpdateAutoRetryForTests(): void {
  cancelChain();
}
