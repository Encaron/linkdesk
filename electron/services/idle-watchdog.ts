/**
 * idle-watchdog——「下载**还在动吗**」判据的唯一实现（E6#73e 立，2026-09-12 两腿归一）。
 *
 * **为什么是「空闲」而不是「总时长」**：大包在慢网上正常下载动辄数十秒，总时长阈值会把**健康下载**
 * 判死——那是把 10s 桥超时的老病换个门槛复活的同款错误。判据 = 「还在动吗」，不是「够快吗」。
 *
 * 出处：`plugin-download.ts`（插件包腿，E6#73e 机器一）原有一份内联实现；`update-download.ts`
 * （主软件更新腿，#57.6）需要同一套东西时**不再抄第二份**——两处各写一份 = 将来只改一处，
 * 另一条腿悄悄退化成「永远挂着」（用户既看不到失败也没有 [重试]）。
 *
 * 用法（顺序要紧）：
 * ```ts
 * const wd = createIdleWatchdog(30_000, outerSignal);   // outerSignal 可省
 * wd.bump();                                            // 🔴 **先装表再出网**——服务器「连上了不回头」
 *                                                       //   时出网调用自己会挂到天荒地老
 * const resp = await mainFetch(url, { signal: wd.signal });
 * ...for each chunk: wd.bump();
 * finally: wd.dispose();                                // 🔴 不 dispose = 计时器吊着
 * ```
 *
 * 铁律 19/20：纯资源对象，无模块级 IPC 监听器。
 */

/** 空闲看门狗句柄——取消信号 + 计时重置 + 「谁取消的」归因 */
export interface IdleWatchdog {
  /** 传给出网调用的取消信号（**空闲超时**与**外部取消**都会 abort 它） */
  readonly signal: AbortSignal;
  /** 有字节到达 / 有进展 → 重置计时。**创建后必须先调一次**才开始计时（见头注用法） */
  bump(): void;
  /** 本次 abort 是否由**空闲超时**触发（与 `canceled()` 一起用于归因，不许靠错误类名猜） */
  timedOut(): boolean;
  /** 外部（用户/调度）是否已发出取消（`canceled()` ⇒ 重试是违背意图） */
  canceled(): boolean;
  /** 收摊：清计时器 + 摘掉外部监听。**必须放在 `finally`**（漏掉 = 计时器吊着进程） */
  dispose(): void;
}

/**
 * 造看门狗——`idleMs` 内没有 `bump()` 即 abort；`outer` 被取消时同样 abort（两条取消来源汇到同一个信号）。
 */
export function createIdleWatchdog(idleMs: number, outer?: AbortSignal): IdleWatchdog {
  const ac = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onOuterAbort = (): void => ac.abort();
  outer?.addEventListener('abort', onOuterAbort, { once: true });
  if (outer?.aborted) ac.abort();

  return {
    signal: ac.signal,
    bump(): void {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        ac.abort();
      }, idleMs);
    },
    timedOut: () => timedOut,
    canceled: () => outer?.aborted === true,
    dispose(): void {
      if (timer) clearTimeout(timer);
      timer = undefined;
      outer?.removeEventListener('abort', onOuterAbort);
    },
  };
}
