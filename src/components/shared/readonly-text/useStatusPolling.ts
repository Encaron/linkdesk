/**
 * statusCommand 轮询器——设置只读状态行的「值活起来」能力（M4 `AI#38.12` 起住在设置插件，
 * 「设置控件-词表正典与共享化」3.2 上移共享层）。
 *
 * 行为 = 原设置插件本地件的**逐条平移**（02 E7：不顺手"改进"）：
 * · 挂载即取一次 → 定期轮询 → 卸载清理；`alive` 守卫（StrictMode 双挂载安全）；
 * · 命令抛错 / 返回非字符串 ⇒ **静默保持现值**（首次即空 ⇒ 空值不占位）；
 * · 空串照收（显示层负责「空值不占位」）。
 *
 * ── 三条护栏（本案新加，规模答案）──
 * ① **同命令去重**：模块级 registry 以 `commandId` 为键，多实例共享**一个**定时器，
 *    最后一个订阅者退订才真停（E5）。间隔/执行句柄取**首个**创建者的声明
 *    （E8：同一 `statusCommand` 全仓建议同间隔；要每实例不同间隔 = 等于没去重，不做）。
 * ② **可见才轮询**：`document.visibilitychange` 隐藏即停表，回可见**立即刷一次**再续节奏（E6）。
 * ③ **registry 随空而收**：最后一个订阅者退订时连 `visibilitychange` 监听一并摘掉
 *    （模块级监听不留僵尸——硬约束 19 的同款纪律，绑/解对称）。
 *
 * 🔴 执行句柄由使用方**注入**：共享件不引宿主内核（与 `FontFamilySelect` 的
 * 「不得引 @src/core」同款纪律）。设置插件传 `window.linkdesk.commands.executeCommand`。
 */
import { useEffect, useRef, useState } from "react";

/** 命令执行句柄——返回状态字符串；`null` / 非字符串一律按「没读到」处理（保持现值）。 */
export type RunStatusCommand = (commandId: string) => Promise<string | null>;

/** 订阅者回调——收到本次轮询的字符串值（空串是合法值，由显示层决定占不占位） */
type Subscriber = (value: string | null) => void;

interface PollerEntry {
  commandId: string;
  intervalMs: number;
  /** 执行句柄持有者 = **首个**创建者（E8 同款口径；后到的订阅者只订阅，不夺权） */
  runRef: { current?: RunStatusCommand };
  subscribers: Set<Subscriber>;
  timer: ReturnType<typeof setInterval> | null;
}

/** 模块级 registry——每 renderer 进程一份（主窗/脱出窗天然隔离，无需跨窗协调；E5） */
const pollers = new Map<string, PollerEntry>();
let visibilityBound = false;

function isHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/** 跑一次：成功才广播（抛错/非字符串 = 保持现值，连广播都不发） */
async function poll(entry: PollerEntry): Promise<void> {
  const run = entry.runRef.current;
  if (!run) return;
  let next: string | null;
  try {
    const r = await run(entry.commandId);
    if (typeof r !== "string") return; // 非字符串 = 没读到（原设置插件同款判定）
    next = r;
  } catch {
    return; // 命令不在 / 执行失败 = 保持现状——不猜、不写死
  }
  for (const s of entry.subscribers) s(next);
}

function startTimer(entry: PollerEntry): void {
  if (entry.timer !== null || isHidden()) return; // 隐藏时休止——等回到可见由 onVisibilityChange 起表
  entry.timer = setInterval(() => {
    void poll(entry);
  }, entry.intervalMs);
}

function stopTimer(entry: PollerEntry): void {
  if (entry.timer === null) return;
  clearInterval(entry.timer);
  entry.timer = null;
}

function onVisibilityChange(): void {
  const hidden = isHidden();
  for (const entry of pollers.values()) {
    if (hidden) {
      stopTimer(entry);
    } else {
      void poll(entry); // 回可见立即刷一次（E6 明示的行为差异）
      startTimer(entry);
    }
  }
}

function bindVisibility(): void {
  if (visibilityBound || typeof document === "undefined") return;
  document.addEventListener("visibilitychange", onVisibilityChange);
  visibilityBound = true;
}

function unbindVisibility(): void {
  if (!visibilityBound || typeof document === "undefined") return;
  document.removeEventListener("visibilitychange", onVisibilityChange);
  visibilityBound = false;
}

/**
 * 轮询 `statusCommand` 指向的壳命令，返回最近一次读数。
 *
 * @param statusCommand 命令 id；缺省/空 ⇒ 不轮询（返回 null，一条定时器都不建）
 * @param runCommand    命令执行句柄（使用方注入）
 * @param intervalMs    轮询间隔，缺省 3000（仅 `statusCommand` 存在时生效）
 */
export function useStatusPolling(
  statusCommand: string | undefined,
  runCommand: RunStatusCommand | undefined,
  intervalMs = 3000,
): string | null {
  const [value, setValue] = useState<string | null>(null);
  // 句柄/间隔走 ref：避免调用方每次渲染给新函数/新数字就把订阅重来一遍（重来 = 定时器抖动 + 多余读取）
  const runRef = useRef(runCommand);
  runRef.current = runCommand;
  const intervalRef = useRef(intervalMs);
  intervalRef.current = intervalMs;

  useEffect(() => {
    if (!statusCommand) {
      setValue(null);
      return;
    }
    let alive = true;
    const subscriber: Subscriber = (v) => {
      if (alive) setValue(v); // alive 守卫：StrictMode / 卸载后到达的结果一律丢弃
    };

    let entry = pollers.get(statusCommand);
    if (!entry) {
      entry = {
        commandId: statusCommand,
        intervalMs: intervalRef.current,
        runRef,
        subscribers: new Set(),
        timer: null,
      };
      pollers.set(statusCommand, entry);
      bindVisibility();
    }
    entry.subscribers.add(subscriber);
    void poll(entry); // 挂载即取一次（每个实例各读一次，与升级前逐行行为一致）
    startTimer(entry);

    return () => {
      alive = false;
      const e = pollers.get(statusCommand);
      if (!e) return;
      e.subscribers.delete(subscriber);
      if (e.subscribers.size > 0) return;
      // 最后一个订阅者走了 ⇒ 真停 + 腾出 registry + 摘监听（泄漏形态见 E5 负控）
      stopTimer(e);
      pollers.delete(statusCommand);
      if (pollers.size === 0) unbindVisibility();
    };
  }, [statusCommand]);

  return value;
}
