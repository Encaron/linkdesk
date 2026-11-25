/**
 * 原生确认框的「在等人」登记（AI 门外契约 · Block 1）。
 *
 * 为什么需要一份独立登记：`filesystem-guard` 对工作区外写入弹的是**主进程原生 MessageBox**
 * （不是壳内确认卡）——那条等待不经过 aiBridge 的 inFlight 相位表，AI 侧只能看到 `EPENDING`
 * （「还在跑」），真相却是「弹着框等人点」。误读的后果是 AI 判超时/重试，而动作其实没执行。
 *
 * 本模块零依赖（不 import electron）——guard 写、aiBridge 读，避免两侧互相依赖。
 * 只登记「存在＋在问什么＋起始时刻」，不参与放行判定（判定仍在 guard）。
 */

interface NativeAsk {
  what: string;
  startedAt: number;
}

let pending: NativeAsk | null = null;

export function beginNativeAsk(what: string): void {
  pending = { what, startedAt: Date.now() };
}

export function endNativeAsk(): void {
  pending = null;
}

export function nativeAsk(): NativeAsk | null {
  return pending;
}
