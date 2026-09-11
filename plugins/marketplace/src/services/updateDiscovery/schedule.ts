/**
 * schedule — 启动发现调度（市场池首载触发，模块级每进程一次）+ 判不了时的重试梯子。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `updateDiscovery.ts` 原样搬出，零行为变更。
 *
 * 本文件是 `_scheduled` / `_retryTimer` 的唯一属主；在途运行态在 `run.ts`。
 */

import { __clearRunningDiscovery, runUpdateDiscovery } from "./run";

const DISCOVERY_DELAY_MS = 10_000;

/** 判不了时的重试间隔（首趟之后；E6#82）——梯子走完为止，之后本会话不再试（下次开软件从头来）。 */
const DISCOVERY_RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 300_000];

let _scheduled = false;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;

/** 排一趟发现；跑完若是「判不了」（返回 null / 抛错）→ 改长一点再排，直到**拿出结论**或梯子走完。
 *  只有「判不了」才重试——「判了，没事做」与「已处理」（含 auto 更新，成败各有通知）都是结论，不打扰。 */
function armDiscoveryAttempt(attempt: number, firstDelayMs: number): void {
  const delay = attempt === 0 ? firstDelayMs : DISCOVERY_RETRY_DELAYS_MS[attempt - 1];
  if (delay === undefined) return; // 梯子走完
  _retryTimer = setTimeout(() => {
    _retryTimer = null;
    void runUpdateDiscovery()
      .then((plan) => {
        if (plan === null) armDiscoveryAttempt(attempt + 1, firstDelayMs);
      })
      .catch(() => armDiscoveryAttempt(attempt + 1, firstDelayMs));
  }, delay);
}

/** 调度启动发现——市场插件池代码首载时调用一次（marketplaceShared 模块底触发）。
 *  池门控：壳进程/预览无 notifications.show → 不调度（发现编排需铃铛能力，池独占；壳零改动）。
 *
 *  🔴 E6#82（2026-09-11）——**为什么不再是「十秒后跑一趟就完」**：
 *    此前是单发 `setTimeout(10s)` + `.catch` 吞错。而那一趟的输入**全是外部状态**（目录要走网络/读缓存、
 *    已装列表要走 IPC）——那一下若恰好判不了（刚开机网络没热、代理没起、IPC 打嗝），`doRunDiscovery` 就
 *    `return null` **静默跳过，且这一整次开机再无第二次机会**。用户实机症状（2026-09-11 报障）：勾了
 *    「自动更新」+ 降级到旧版 + 关软件 + 重开 ⇒ 自动更新一整天不响，界面一个字不说。当日实机取证：引擎、
 *    开关、判定全好（把同一插件降回旧版、手动触发**同一趟**发现，当场自动装回新版）；坏的是「只许一次 +
 *    失败不出声」。
 *    ⇒ 判不了就换时间再试（梯子见上），拿出结论就停。**自动更新是用户勾选那一刻给出的承诺，不该赌开机那十秒。**
 *  代价：每趟读盘 + 读目录（目录有 5min 缓存时零网络），梯子共 5 趟、最长约 8 分钟——可忽略。 */
export function scheduleStartupDiscovery(delayMs: number = DISCOVERY_DELAY_MS): void {
  if (_scheduled) return;
  if (!window.linkdesk?.notifications?.show) return; // 池门控（先判后占位——门控别消耗掉这一次调度）
  _scheduled = true;
  armDiscoveryAttempt(0, delayMs);
}

/** 测试复位调度/并发态（vitest afterEach 用——模块单例跨用例残留；产线不调）。
 *  调度态在本地，运行态在 `run.ts`——两处都要清。 */
export function __resetUpdateDiscovery(): void {
  _scheduled = false;
  if (_retryTimer !== null) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }
  __clearRunningDiscovery();
}
